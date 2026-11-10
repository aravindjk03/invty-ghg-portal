import crypto from 'crypto';
import { dbService, AuditBlockRow } from '../db/database';
import { env } from '../config/env';

/**
 * A tamper-evident change log, one chain per account.
 *
 * What this replaces. The previous ledger was a module-level array that died
 * with the process, shared between every signed-in user, and started life
 * with five invented entries — a plant engineer, an ESG director, and an
 * "External Auditor (DNV)" approving a freight factor — none of which ever
 * happened. Anyone could append a block under any name, because the actor was
 * read from the request body. The "hash" was a bare SHA-256 with no key, so
 * whoever could write the store could recompute a consistent chain, and the
 * verifier then stamped the result "ISO 14064-3:2019" with a recalculation
 * delta of exactly zero that nothing had calculated.
 *
 * What it is now. Blocks are stored in the database. The actor is the
 * signed-in account, taken from the session, never from the caller. Each
 * block's MAC is HMAC-SHA256 under a key only the server holds, so a row
 * edited in the database no longer verifies. Verification reports what it
 * checked — linkage and MACs — and claims nothing else.
 */

export interface AuditLedgerBlock {
  blockIndex: number;
  timestamp: string;
  action: 'GENESIS' | 'CREATE_ENTRY' | 'UPDATE_ENTRY' | 'DELETE_ENTRY' | 'FACTOR_OVERRIDE' | 'SUPPLIER_OVERRIDE';
  entityId: string;
  actor: string;
  payloadSummary: string;
  previousBlockHash: string;
  blockHash: string;
}

const ZERO_HASH = '0'.repeat(64);

/** Domain-separated so this key use can never collide with another. */
const macKey = crypto.createHmac('sha256', env.API_SECRET_KEY).update('audit-chain-v1').digest();

function mac(ownerId: string, b: Omit<AuditLedgerBlock, 'blockHash'>): string {
  // JSON of a fixed-order array: unambiguous, unlike joining with a separator
  // that the fields themselves may contain.
  const data = JSON.stringify([
    ownerId, b.blockIndex, b.timestamp, b.action, b.entityId, b.actor, b.payloadSummary, b.previousBlockHash,
  ]);
  return crypto.createHmac('sha256', macKey).update(data).digest('hex');
}

const toBlock = (row: AuditBlockRow): AuditLedgerBlock => ({
  blockIndex: row.block_index,
  timestamp: row.timestamp,
  action: row.action as AuditLedgerBlock['action'],
  entityId: row.entity_id,
  actor: row.actor,
  payloadSummary: row.payload_summary,
  previousBlockHash: row.previous_block_hash,
  blockHash: row.block_hash,
});

export const auditService = {
  /** Appends a block to the caller's own chain. `actor` comes from the session. */
  recordBlock(
    ownerId: string,
    actor: string,
    action: AuditLedgerBlock['action'],
    entityId: string,
    payloadSummary: string,
  ): AuditLedgerBlock {
    const chain = dbService.auditBlocks(ownerId);
    const previous = chain[chain.length - 1];
    const body = {
      blockIndex: chain.length,
      timestamp: new Date().toISOString(),
      action,
      entityId,
      actor,
      payloadSummary,
      previousBlockHash: previous ? previous.block_hash : ZERO_HASH,
    };
    const block: AuditLedgerBlock = { ...body, blockHash: mac(ownerId, body) };

    dbService.appendAuditBlock({
      owner_id: ownerId,
      block_index: block.blockIndex,
      timestamp: block.timestamp,
      action: block.action,
      entity_id: block.entityId,
      actor: block.actor,
      payload_summary: block.payloadSummary,
      previous_block_hash: block.previousBlockHash,
      block_hash: block.blockHash,
    });
    return block;
  },

  getLedger(ownerId: string): AuditLedgerBlock[] {
    return dbService.auditBlocks(ownerId).map(toBlock);
  },

  /**
   * Checks that every block links to the one before it and still carries the
   * MAC the server gave it. That is all it checks, and all it reports.
   */
  verifyChainIntegrity(ownerId: string) {
    const chain = dbService.auditBlocks(ownerId).map(toBlock);
    const checked = ['Each block links to the block before it', 'Each block carries the server\'s MAC'];

    for (let i = 0; i < chain.length; i++) {
      const current = chain[i];
      const expectedPrevious = i === 0 ? ZERO_HASH : chain[i - 1].blockHash;

      if (current.blockIndex !== i || current.previousBlockHash !== expectedPrevious) {
        return { isChainValid: false, tamperedBlockIndex: i, reason: `Block #${i} does not link to the block before it.`, checked };
      }
      const { blockHash, ...body } = current;
      const expected = mac(ownerId, body);
      const same = expected.length === blockHash.length
        && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(blockHash));
      if (!same) {
        return { isChainValid: false, tamperedBlockIndex: i, reason: `Block #${i} has been altered since it was recorded.`, checked };
      }
    }

    return {
      isChainValid: true,
      totalBlocks: chain.length,
      firstBlockTimestamp: chain[0]?.timestamp ?? null,
      lastBlockTimestamp: chain[chain.length - 1]?.timestamp ?? null,
      lastBlockHash: chain[chain.length - 1]?.blockHash ?? null,
      checked,
      verifiedAt: new Date().toISOString(),
    };
  },
};
