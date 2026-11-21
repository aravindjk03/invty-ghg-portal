/**
 * The admin site's own session, separate from the customer app's.
 *
 * Kept in sessionStorage under its own key: it ends when the tab closes, and a
 * staff member signed in to the console is not thereby signed in to the
 * customer portal (or the other way round).
 */
const TOKEN_KEY = 'iinvty_admin_token';
const USER_KEY = 'iinvty_admin_user';

export interface AdminUser { id: string; email: string; name: string; role: string }

function store(): Storage | null {
  try { return window.sessionStorage; } catch { return null; }
}

export const adminSession = {
  token: (): string | null => store()?.getItem(TOKEN_KEY) ?? null,
  user: (): AdminUser | null => {
    try { return JSON.parse(store()?.getItem(USER_KEY) || 'null'); } catch { return null; }
  },
  set(token: string, user: AdminUser): void {
    store()?.setItem(TOKEN_KEY, token);
    store()?.setItem(USER_KEY, JSON.stringify(user));
  },
  clear(): void {
    store()?.removeItem(TOKEN_KEY);
    store()?.removeItem(USER_KEY);
  },
};
