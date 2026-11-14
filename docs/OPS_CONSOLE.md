# Operations console

An internal console for the developer and cyber-security team to watch the
portal in operation: accounts, usage and traffic, the security log, alerts,
and a tamper-evident record of every action taken in the console.

It is **not** for customers. It is a separate website with its own address
and its own staff-only sign-in, like a CMS admin. The customer site contains
none of its code, pages or links, so customers have no way to learn it exists.
Every endpoint behind it also checks the caller's role on the server.

## Turning it on

The console reads from the backend, so it needs the backend deployed.

1. Deploy the backend with `render.yaml` (see `DEPLOY.md`). Use a paid instance
   with the persistent disk, or the accounts and logs reset on every restart.
2. Set `ADMIN_EMAIL` on the backend. On first boot it creates that ADMIN
   account and prints a one-time password to the log.
3. Build the admin site against that backend:
   `cd frontend && VITE_API_BASE_URL=https://<your-backend>/api/v1 npm run build:admin`
   This writes `frontend/dist-admin` (with `robots.txt` and a `_headers` file
   that keep it out of search engines and out of frames).
4. Host `dist-admin` on its own, hard-to-guess address, for example
   `ops-<random>.yourdomain.com` on Cloudflare Pages. Put it behind
   **Cloudflare Access** (or Netlify password protection) so only your team
   can load it at all. Do not put it on GitHub Pages: that is public.
5. On the backend set `ADMIN_ORIGIN=https://ops-<random>.yourdomain.com`, and
   optionally `OPS_ALLOWED_IPS` to your office or VPN range (IPs or CIDR,
   comma-separated). From any other site or network the console API answers
   with the same 404 as an unknown route, and the attempt is logged.
6. Open the admin address, sign in as the ADMIN and change the password.
7. In **Users**, give team members their staff role. They sign in at the same
   admin address.

To try it locally: run the backend, then `cd frontend && npm run dev:admin`
(port 5174).

The admin site keeps its own session (closed with the tab), separate from the
customer portal. A customer account that signs in there is signed straight out
and told it has no access.

## Roles

| Role | For | Sees | Can do |
|---|---|---|---|
| `OPERATOR` | Developers | Overview, Users, Usage & traffic | Read only |
| `SECURITY` | Cyber team | Everything above, plus the Security log, Alerts and Console actions | Suspend or reactivate accounts, sign out everywhere, force a password reset, resolve alerts, export the log (but not on ADMIN accounts) |
| `ADMIN` | Owners | Everything | All of the above, plus change roles and delete accounts |

Safeguards:
- The last active ADMIN cannot be demoted, suspended or deleted.
- Only an ADMIN can act on an ADMIN account, so a SECURITY account cannot
  lock out the owners.
- **Force password reset** shows the staff member a one-time temporary
  password, once, to hand over through a trusted channel (not email). The old
  password and all sessions stop working at once, and the temporary password is
  never stored in clear or logged. Google and mobile accounts have no password,
  so a reset just ends their sessions.
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
  rate-limit hits, refused CORS origins, and console requests from the wrong
  site or network.
- Console actions: every suspend, reactivate, sign-out, reset, role change,
  delete, alert resolution and log export. These are also chained with a keyed
  hash; editing or removing a row shows "Chain broken" on the Console actions
  tab. **Console actions are the permanent audit record and are not deleted
  after 90 days** (deleting old rows would break the chain). They hold staff
  and account emails, so state this in your privacy notice.
- Refused requests are recorded at most once every 5 seconds per kind and
  network, with a count of the ones skipped. This stops a flood of requests from
  filling the database, and the burst alert still fires.

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
