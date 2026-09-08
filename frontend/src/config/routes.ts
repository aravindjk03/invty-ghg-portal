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
  | 'cbam'
  | 'brsr'
  | 'cems'
  | 'suppliers'
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
  'cbam',
  'brsr',
  'cems',
  'suppliers',
  'audit-trail',
  'settings',
  'showcase',
];

export const DEFAULT_PAGE: PageKey = 'scope-hub';

export function isPageKey(value: string | null | undefined): value is PageKey {
  return !!value && (PAGE_KEYS as string[]).includes(value);
}

/** Resolves an untrusted page key (URL param, stored draft) to a real route. */
export function resolvePage(value: string | null | undefined): PageKey {
  return isPageKey(value) ? value : DEFAULT_PAGE;
}
