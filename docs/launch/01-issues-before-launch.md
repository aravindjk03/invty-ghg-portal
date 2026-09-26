# Issues to fix before launch

Ordered by what would hurt most on launch day. "Effort" is my estimate of focused
working time, not calendar time.

## P0 — do not launch without these

### 1. The demo admin password is on the public login page
`frontend/src/pages/LoginPage.tsx` shows the seeded accounts, including
`IINVTY@2026`, to every visitor. Anyone could sign in as an administrator.

**Fix:** hide the demo panel unless a development flag is set, and change the
seeded password to a value generated at first start and printed only in the
server log. **Effort: 1 hour.**

### 2. Known-vulnerable packages in the website
`npm audit` in `frontend/` reports 3 problems: 1 critical, 1 high, 1 moderate.
The high one is `xlsx` (SheetJS prototype pollution and a denial-of-service
pattern) and it has **no fixed version available** on npm; SheetJS moved to its
own distribution. `dompurify` (via the PDF export path) is also flagged. The
backend has 3 moderate issues in `express`/`qs`, all fixable by updating.

**Fix:** update the backend packages; for the website, either take SheetJS from
its official source or replace the Excel export with CSV, which the app can
produce without any library. **Effort: 3–4 hours.**

### 3. No backups
The user database is a SQLite file on the server's disk. On Render's free tier
that disk is wiped on every deploy. There is no backup and no restore procedure.

**Fix:** move to managed Postgres with automatic backups, or keep SQLite on a
persistent disk with a nightly encrypted copy to object storage. Then actually
restore one, before launch. **Effort: half a day, including the restore test.**

### 4. No privacy notice or terms
The app collects work e-mail, company name and sector (the lead-capture modal
writes `INVTY_LEAD_PROFILE`), and sends product descriptions to an AI provider
outside India. Under India's DPDP Act 2023 you need a clear notice of what you
collect, why, and how someone withdraws consent. You also need to disclose that
text typed into Product Carbon is sent to a third-party AI provider.

**Fix:** a privacy notice, terms of use, a cookie/storage note, and one line on
the Product Carbon page. Have a lawyer read them. **Effort: 2 hours of drafting,
plus review time.**

### 5. Secrets hygiene
The Gemini, Mistral and Anthropic keys were pasted into a chat and must be
treated as exposed. None are in Git (verified before every commit), but they
have to be replaced before the tool is public.

**Fix:** generate new keys, put them only in the host's environment settings, and
delete the old ones at the provider. **Effort: 30 minutes.**

## P1 — strongly recommended before launch

### 6. Zero verified emission factors
`/health` reports `verified_factors: 0`. Every number on the Product Carbon page
comes from the AI. The page says so honestly, but the product is much weaker
than it needs to be, and 190 catalogue rows are still marked `TO_INGEST`.

**Fix:** ingest the 30–50 factors that cover most searches: Indian grid
electricity (CEA), cement, steel, aluminium, common plastics, diesel and freight
(IPCC and national inventories), plus a handful of published EPDs. Each needs
value, unit, year, region, source and licence. **Effort: 2–3 days**, mostly
reading and data entry — the code path already exists and upgrades cached
estimates automatically.

### 7. No evaluation set
Nothing detects a quality drop when a provider or model changes. Estimates vary
between runs and no one would notice a regression.

**Fix:** 30–50 products with an expected range from a public source, run as a
script that reports how many land inside their range. **Effort: 1 day.**

### 8. Rate limiting behind a proxy
The Python service now trusts forwarded headers (set in `render.yaml`), but the
Express backend does not set `trust proxy`, so its rate limiter may see every
request as coming from one address.

**Fix:** enable `trust proxy` for the backend and confirm the limits apply per
visitor. **Effort: 1 hour.**

### 9. Cost and abuse ceiling for the AI
The free Gemini quota is per day and shared by all visitors; a single enthusiastic
user (or a bot) can exhaust it, and if a paid key is added they can spend real
money.

**Fix:** a daily spend and call ceiling in the service, a CAPTCHA or e-mail
verification before the first estimate, and an alert when the ceiling is hit.
**Effort: half a day.**

### 10. The website has two calculation engines
`frontend/src/engine/` (TypeScript: calculator, factorResolver, unitConverter,
scopeRouter) duplicates logic that `ghg_core` owns in Python. Two engines drift,
and an auditor will find the difference.

**Fix:** decide which is authoritative (it should be `ghg_core`), and make the
other call it or be deleted. **Effort: 1–2 days** — schedule after launch unless
the numbers already disagree.

## P2 — after launch

- Monitoring and error alerts (uptime check, error reporting).
- Accessibility pass: keyboard navigation and contrast.
- Mobile layout review of the Product Carbon results.
- A staging environment, so changes are not tested in production.
- Chemical safety data on the Product Carbon page (design discussed 2026-09-17,
  not started).
- Merge the long-running feature branch into `main` and keep branches short.
