/**
 * Counts one use of a feature that runs in the browser, so the operators can
 * see how much the product is used. Counts only - never content or figures -
 * and only for accounts on the server; the browser-only trial is never sent.
 * Fire-and-forget: a lost count never interrupts the person using the app.
 */
import { env } from '../config/env';
import { authService } from './authService';

export function reportUsage(metric: 'calculation' | 'method_calculation' | 'rows_saved' | 'report_export', count = 1): void {
  const token = authService.getToken();
  if (!token || authService.isTrialSession()) return;
  fetch(`${env.API_BASE_URL}/usage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ metric, count }),
    keepalive: true,
  }).catch(() => { /* counts are best effort */ });
}
