/**
 * Keeps the console API out of sight of everyone but the admin site.
 *
 *   ADMIN_ORIGIN     browser requests to /v1/ops must come from these origins
 *   OPS_ALLOWED_IPS  and, if set, from these addresses or CIDR ranges
 *
 * Both are optional. A refused request gets the same 404 as any unknown route,
 * so the customer site (or a curious visitor) cannot tell the console exists.
 * The refusal is still written to the security log.
 */
import { BlockList, isIP } from 'node:net';
import { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { recordEvent } from '../services/ops.service';

const list = (value?: string) => (value ?? '').split(',').map((v) => v.trim()).filter(Boolean);

export const adminOrigins = (): string[] => list(env.ADMIN_ORIGIN).map((o) => o.replace(/\/+$/, ''));

function buildIpList(): BlockList | null {
  const entries = list(env.OPS_ALLOWED_IPS);
  if (entries.length === 0) return null;
  const blocks = new BlockList();
  for (const entry of entries) {
    const [address, bits] = entry.split('/');
    const family = isIP(address) === 6 ? 'ipv6' : isIP(address) === 4 ? 'ipv4' : null;
    if (!family) {
      console.error(`[ops] OPS_ALLOWED_IPS: ignoring "${entry}", not an IP address or CIDR range.`);
      continue;
    }
    if (bits !== undefined) blocks.addSubnet(address, Number(bits), family);
    else blocks.addAddress(address, family);
  }
  return blocks;
}

const allowedIps = buildIpList();

function ipAllowed(raw: string | undefined): boolean {
  if (!allowedIps) return true;
  if (!raw) return false;
  const ip = raw.startsWith('::ffff:') && isIP(raw.slice(7)) === 4 ? raw.slice(7) : raw;
  const family = isIP(ip) === 6 ? 'ipv6' : isIP(ip) === 4 ? 'ipv4' : null;
  return family !== null && allowedIps.check(ip, family);
}

const notFound = (res: Response) => res.status(404).json({
  success: false,
  error: { code: 'ROUTE_NOT_FOUND', message: 'The requested API endpoint does not exist.' },
  timestamp: new Date().toISOString(),
});

export function opsGate(req: Request, res: Response, next: NextFunction) {
  const origins = adminOrigins();
  const origin = req.headers.origin;
  if (origins.length > 0 && origin && !origins.includes(origin)) {
    recordEvent({ type: 'access.ops_wrong_origin', severity: 'warning', subject: origin.slice(0, 200), req });
    return notFound(res);
  }
  if (!ipAllowed(req.ip)) {
    recordEvent({ type: 'access.ops_wrong_network', severity: 'warning', req });
    return notFound(res);
  }
  return next();
}
