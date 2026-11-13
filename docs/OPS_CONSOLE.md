# Operations console

An internal console for the developer and cyber-security team to watch the
portal in operation: accounts, usage and traffic, the security log, alerts,
and a tamper-evident record of every action taken in the console.

It is **not** for customers. It appears in no menu and every endpoint behind
it checks the caller's role on the server.

## Turning it on

The console reads from the backend. The static GitHub Pages site has no server
(accounts there live in each visitor's browser), so on that site the console
says it needs the backend and shows nothing else.

1. Deploy the backend with `render.yaml` (see `DEPLOY.md`). Use a paid instance
   with the persistent disk, or the accounts and logs reset on every restart.
2. Set `ADMIN_EMAIL` on the backend. On first boot it creates that ADMIN
   account and prints a one-time password to the log. Sign in and change it.
3. Publish the site pointing at the backend:
   `IINVTY_BACKEND_URL=https://<your-backend>/api/v1 npm run deploy:pages`
4. Sign in as the ADMIN and open **`<site>/?page=ops`**.
5. In **Users**, give team members their staff role. They sign in again and
   open the same address.

## Roles

| Role | For | Sees | Can do |
|---|---|---|---|
| `OPERATOR` | Developers | Overview, Users, Usage & traffic | Read only |
| `SECURITY` | Cyber team | Everything above, plus the Security log, Alerts and Console actions | Suspend or reactivate accounts, sign out everywhere, force a password reset, resolve alerts, export the log |
| `ADMIN` | Owners | Everything | All of the above, plus change roles and delete accounts |

Safeguards:
- The last active ADMIN cannot be demoted, suspended or deleted.
- Staff cannot suspend or delete themselves.
- A role change signs the person out.
- A suspended account is refused at every sign-in method and on every request.

## What is recorded

**Security events** (kept for 90 days, IP addresses masked to `a.b.c.x`):

- Sign-in activity: success, failure, lockout, OTP failure, Google failure,
  sign-out, sign-up, and a suspended account trying to sign in.
- Account changes: profile edits, password changes (and refused attempts),
  sign out everywhere, and self-deletion.
- Blocked requests: invalid or expired token, role refused, suspended account,
  rate-limit hits, and refused CORS origins.
- Console actions: every suspend, reactivate, sign-out, reset, role change,
  delete, alert resolution and log export. These are also chained with a keyed
  hash; editing or removing a row shows "Chain broken" on the Console actions
  tab.

**Usage counts** (per account per day, never content or figures):
- sign-ins
- calculations
- method calculations
- report exports
- AI estimates
- audit entries

**Alerts** (shown in the console):
- 10 or more failed or locked sign-in attempts on one account, or from one
  network, within 15 minutes.
- 20 or more refused requests from one network within 5 minutes.
- A staff account signing in from a network it has not used before.
- Any staff role being granted.

## Feature backlog (not built yet)

Ordered by value for an enterprise rollout:

1. **Email or Slack alerts.** Send the console's alerts to a security mailbox
   or channel. Needs an email or Slack key.
2. **MFA for staff accounts.** Authenticator-app codes for ADMIN, SECURITY and
   OPERATOR.
3. **Organisation (tenant) management.** Companies as first-class records with
   their own admins; users belong to an organisation; data scoped per
   organisation.
4. **SSO (SAML / OIDC)** for enterprise customers (Azure AD, Okta, Google
   Workspace).
5. **Plans and limits.** Per-organisation plan, seats, AI-estimate quotas, and
   billing hooks.
6. **Self-service password reset by email.** Completes "force password reset".
7. **Error monitoring.** Client errors and engine start-up failures reported to
   the console (or to Sentry).
8. **Performance monitoring.** Engine start-up time, calculation time and API
   latency per day.
9. **Maintenance mode and announcement banner**, switched from the console.
10. **Feature flags**, to turn modules on per organisation without a deploy.
11. **Data requests queue (DPDP/GDPR).** Export-my-data and delete-my-data
    requests with an audit trail.
12. **Factor-library releases.** Publish, preview and roll back factor table
    versions from the console.
13. **Read-only support view.** See a customer's inventory as they do, every
    view logged.
14. **API keys for integrations** (CRM, ERP), with per-key usage and
    revocation.
15. **CRM sync of leads** to the in-house CRM.
16. **Device list for users**, so customers can see and end their own sessions.
17. **Scheduled weekly ops report** emailed to the team.
18. **Geo view of suspicious activity**, on country-level data only.
