# Which cloud: cheap and secure

Prices are approximate monthly figures for the smallest useful plan, from public
pricing pages. **Check the current price before you commit** — they change, and
Indian GST is added on top.

## What you have to run

1. **The website** — static files. Costs nothing anywhere.
2. **The login and inventory backend** — Node, small memory needs.
3. **INSITY EDGE AI** — Python, mostly waiting on the AI provider.
4. **A database** — tiny, but it must survive restarts and be backed up.

Parts 2 and 3 fit comfortably on **one small server with 2 GB of memory**.

## The options

| Provider | Plan | Price/month | India region | Notes |
|---|---|---|---|---|
| **Oracle Cloud Always Free** | 4 ARM cores, 24 GB RAM, 200 GB disk | **₹0** | Mumbai, Hyderabad | Genuinely free and by far the most capacity. ARM capacity can be hard to get in busy regions, and idle free accounts have been reclaimed in the past — keep backups elsewhere |
| **Hetzner** | CX22: 2 cores, 4 GB | ~€4 (₹400) | No | Cheapest reliable paid option. Germany, Finland, Singapore, US |
| **DigitalOcean** | Basic: 1 core, 2 GB | ~$12 (₹1,050) | **Bangalore** | Simple, good documentation, managed Postgres available |
| **AWS Lightsail** | 1 core, 2 GB | ~$12 (₹1,050) | **Mumbai** | Easiest path if you later need the rest of AWS |
| **Render** | Starter web service | $7 per service (so ~$14) | Singapore | No server administration at all; the free tier sleeps when idle |
| **Railway / Fly.io** | usage based | ~$5–10 | Singapore / Mumbai (Fly) | Pay for what you use; watch the bill |
| **Cloudflare Pages + Workers** | free tier | ₹0 | global | Great for the website; your Python and Node services do not fit Workers as they are |
| **Neon / Supabase** | free Postgres | ₹0 (0.5 GB) | Singapore / Mumbai (paid) | Managed database with backups, no server to patch |

## My recommendation

**If Indian data residency or Indian customers matter — and for an ESG tool sold
in India, they will:**

- Website: **Cloudflare Pages** (free, fast in India, free TLS and DDoS
  protection). GitHub Pages also works and is already set up.
- Both services: **one DigitalOcean Bangalore or AWS Lightsail Mumbai server**,
  2 GB, running Docker with Caddy in front for automatic HTTPS.
- Database: **managed Postgres** from the same provider when budget allows,
  otherwise Postgres on the same server with nightly encrypted backups to
  Backblaze B2 (10 GB free).
- **Total: about ₹1,000–1,600 (US$12–19) a month.**

**If cost is the deciding factor:** Oracle Cloud Always Free in Mumbai, same
layout, **₹0**. Accept that free tiers carry no support and can be reclaimed —
so keep backups with a different provider, and be ready to move.

**If you would rather not administer a server at all:** Render Starter, about
US$14 a month, using the `render.yaml` already in this repository. You give up
some control and pay a little more; you never patch an operating system.

**What I would avoid for now:** Kubernetes anywhere, AWS ECS/Fargate, and
anything with a complicated bill. They cost more in your attention than in money,
and you have ten days.

## Security checklist

Not theory — this is what a customer's IT reviewer will ask about.

**Access and secrets**
- [ ] New API keys, old ones deleted at the provider (the current ones are exposed)
- [ ] Keys only in the host's environment settings; never in Git (already enforced)
- [ ] SSH by key only, password login disabled, root login disabled
- [ ] Two-factor authentication on GitHub, the cloud account and the AI providers
- [ ] A separate, non-personal account owns the production systems

**Network**
- [ ] Only ports 80 and 443 open; the database not reachable from the internet
- [ ] HTTPS everywhere, HTTP redirected (Caddy or the provider does this)
- [ ] CORS limited to your own domain (already set in `render.yaml`)
- [ ] Cloudflare in front for DDoS protection and a basic firewall (free)

**Application**
- [ ] Demo credentials removed from the login page
- [ ] Rate limits per visitor, verified behind the proxy
- [ ] Account lockout or delay after repeated failed logins
- [ ] Passwords hashed with scrypt (already done) and a minimum length enforced
- [ ] Session tokens expire, and logout invalidates them server-side
- [ ] Security headers: HSTS, X-Content-Type-Options, a Content-Security-Policy
- [ ] `/admin/status` stays behind its token; keep the API docs disabled

**Data**
- [ ] Nightly encrypted backups, kept 30 days, stored with a different provider
- [ ] A restore tested before launch, and the time it took written down
- [ ] Disk encryption enabled (most providers do this by default — confirm)
- [ ] Personal data limited to what you need: e-mail, name, company
- [ ] A deletion route for a user who asks

**Operations**
- [ ] Uptime monitoring with an alert to your phone
- [ ] Error reporting (Sentry's free tier is enough)
- [ ] Dependency updates checked monthly; security advisories subscribed
- [ ] A written incident plan: who to call, how to take the site offline

**Compliance (India)**
- [ ] Privacy notice covering the DPDP Act 2023: what, why, how to withdraw
- [ ] Disclosure that product descriptions go to an AI provider abroad
- [ ] A named contact for data questions
- [ ] Terms of use stating the figures are screening estimates, not an audited
      footprint, and are not a substitute for a Safety Data Sheet

The last point protects you commercially as well as legally: the page already
labels every AI figure, and the terms should repeat it.
