import { LeadSubmissionPayload } from '../types/leads.types';
import { env } from '../config/env';

/**
 * Lead capture that does not lose leads.
 *
 * What this replaces: the sign-up form POSTed straight to `/api/v1/leads`
 * with no `Content-Type` header, so `express.json()` saw an empty body and the
 * validator rejected it even when a server was running. On the published
 * static site there is no server at all, so the request reached GitHub's 404
 * page — and the form called `onSuccess` regardless. The visitor got their
 * download, the screen showed no error, and the lead was gone.
 *
 * Now: a lead that cannot be delivered is kept in this browser and sent the
 * next time the app loads with a reachable server. The caller is told which of
 * the two happened and never told "sent" when nothing was.
 */

const QUEUE_KEY = 'invty_pending_leads';
const PROFILE_KEY = 'INVTY_LEAD_PROFILE';

/** Keep the queue small: this is a safety net, not a database. */
const MAX_QUEUED = 25;

export interface LeadResult {
  /** The server accepted it. */
  delivered: boolean;
  /** It is held in this browser and will be retried. */
  queued: boolean;
}

interface QueuedLead {
  payload: LeadSubmissionPayload;
  capturedAt: string;
}

/**
 * Storage can throw rather than return null: a private window, a blocked
 * origin, or a full quota. Every access here is total, because the previous
 * code threw out of its own catch block and left the form stuck on
 * "Verifying..." for ever.
 */
function readQueue(): QueuedLead[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedLead[]): boolean {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUED)));
    return true;
  } catch {
    return false;
  }
}

export function rememberProfile(payload: LeadSubmissionPayload): void {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(payload));
  } catch {
    // The form is asked for again next time; that is all this costs.
  }
}

export function hasProfile(): boolean {
  try {
    return Boolean(localStorage.getItem(PROFILE_KEY));
  } catch {
    return false;
  }
}

/** Posts one lead. Returns false for anything that is not an accepted store. */
async function postLead(payload: LeadSubmissionPayload): Promise<boolean> {
  try {
    const res = await fetch(`${env.API_BASE_URL}/leads`, {
      method: 'POST',
      // Without this header the body never reaches the route's validator.
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return false;
    // A static host answers 200 with an HTML page. That is not a store.
    const body = await res.json().catch(() => null);
    return Boolean(body && body.success);
  } catch {
    return false;
  }
}

export const leadService = {
  /**
   * Sends a lead, or keeps it for later. Never reports a delivery that did
   * not happen.
   */
  async submit(payload: LeadSubmissionPayload): Promise<LeadResult> {
    rememberProfile(payload);

    if (await postLead(payload)) {
      return { delivered: true, queued: false };
    }

    const queued = writeQueue([
      ...readQueue(),
      { payload, capturedAt: new Date().toISOString() },
    ]);
    return { delivered: false, queued };
  },

  /** How many leads are waiting in this browser. */
  pendingCount(): number {
    return readQueue().length;
  },

  /**
   * Retries everything held here. Called on start-up; a no-op with an empty
   * queue, so it costs nothing on the usual path.
   */
  async flush(): Promise<number> {
    const queue = readQueue();
    if (queue.length === 0) return 0;

    const stillPending: QueuedLead[] = [];
    let sent = 0;
    for (const item of queue) {
      if (await postLead(item.payload)) sent += 1;
      else stillPending.push(item);
    }
    writeQueue(stillPending);
    return sent;
  },
};
