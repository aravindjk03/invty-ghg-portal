/**
 * Single source of truth for in-app page routing.
 *
 * The portal navigates by page key (held in App state) rather than by URL path,
 * so this registry is what keeps the TopBar, the `?page=` deep link and the
 * page switch in App.tsx from drifting apart.
 */
export type PageKey =
  | 'scope-hub'
  | 'scope-1'
  | 'scope-2'
  | 'scope-3'
  | 'dashboard'
  | 'report'
  | 'audit-trail'
  | 'settings'
  | 'showcase';

export const PAGE_KEYS: PageKey[] = [
  'scope-hub',
  'scope-1',
  'scope-2',
  'scope-3',
  'dashboard',
  'report',
  'audit-trail',
  'settings',
  'showcase',
];

export const DEFAULT_PAGE: PageKey = 'scope-hub';

/**
 * Built but not currently exposed in the UI.
 *
 * CBAM, BRSR Core, CEMS Monitor and the Supplier Portal are complete and their
 * backend routes still work; they are disconnected from routing and navigation
 * rather than deleted, so re-enabling one is a matter of adding its key back to
 * PageKey/PAGE_KEYS and restoring its case in App.tsx.
 */
export const PARKED_PAGES = ['cbam', 'brsr', 'cems', 'suppliers'] as const;

export function isPageKey(value: string | null | undefined): value is PageKey {
  return !!value && (PAGE_KEYS as string[]).includes(value);
}

/** Resolves an untrusted page key (URL param, stored draft) to a real route. */
export function resolvePage(value: string | null | undefined): PageKey {
  return isPageKey(value) ? value : DEFAULT_PAGE;
}
