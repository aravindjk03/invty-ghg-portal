# How much storage the tool needs

All the per-item figures below are measured from this repository on 2026-09-23,
not estimated.

## Measured sizes

| What | Measured | Where |
|---|---|---|
| One cached AI estimate | 513 B smallest, **3.95 KB average**, 5.5 KB largest | `service/data/estimate_cache.db`, 19 real estimates |
| One user account | about 1 KB | `backend/data/invty_portal.db` |
| Product catalogue | 37 KB (190 rows) | `data/product_carbon_catalogue.csv` |
| Emission source catalogue | 43 KB | `data/emission_source_catalogue.csv` |
| Built website | 2.3 MB (590 KB compressed) | `frontend/dist` |
| Application code and history | about 40 MB | the Git repository |

An inventory entry (one fuel or electricity line) is a few hundred bytes. Today
these live in the visitor's own browser, not on your server, which is why the
server database is nearly empty.

## What a year looks like

Assumptions: each user creates 40 inventory entries a year, and the tool answers
20,000 product searches in the year, of which 60% are repeats served from cache.

| Item | Amount | Size |
|---|---|---|
| 1,000 users | 1 KB each | 1 MB |
| 40,000 inventory entries | 0.5 KB each | 20 MB |
| 8,000 unique cached estimates | 4 KB each | 32 MB |
| Audit and session records | — | about 20 MB |
| Application logs (90 days) | — | 1–3 GB |
| Database backups (30 daily copies) | — | about 2 GB |
| **Total** | | **under 6 GB** |

Even at ten times that load — 10,000 users and 200,000 searches — the data itself
is roughly 800 MB. Logs and backups dominate, and both are controlled by how long
you keep them.

## What to provision

| Component | Size to buy | Why |
|---|---|---|
| Database | **1 GB to start** (free tiers give 0.5 GB) | Real data is measured in tens of MB |
| Server disk | **10 GB** (the smallest VM usually includes 20–40 GB) | Application, logs, room to grow |
| Object storage for backups | **10 GB** (free on Backblaze B2 and Cloudflare R2) | 30 daily encrypted copies |
| Static website | free | 2.3 MB on GitHub Pages or Cloudflare Pages |

**Conclusion: the smallest plan every provider sells is more than enough.** Do
not pay for storage capacity. What you should pay for is memory, backups and
reliability.

## Three things that would change this

1. **PDF reports stored on the server.** Each generated report is 1–3 MB. If you
   keep every report for every user, storage becomes the largest item: 10,000
   reports is roughly 20 GB. Generating them on demand instead keeps it at zero.
2. **Uploaded evidence files.** If customers attach invoices or meter readings
   for assurance, budget per customer, not per record: 500 MB each is realistic.
   Put these in object storage, never in the database.
3. **Keeping raw AI responses for audit.** About 15 KB per estimate rather than
   4 KB. Worth it for traceability; still small.

## Retention, which matters more than capacity

- **Logs:** 30–90 days, then delete. Never log API keys, passwords or session
  tokens. The service already keeps vendor and cost details out of public
  responses.
- **Estimate cache:** 30 days today (`PCF_CACHE_TTL_DAYS`). Longer saves AI quota
  and money; the cache stores no personal data.
- **Accounts:** delete on request, and say in the privacy notice how long you keep
  data after an account closes.
