# The ten days

Written for one person working on this, with me doing the implementation work.
Days are working days. Tasks marked **you** need a decision, an account, or a
domain expert — I cannot do them.

## Day 1 — stop the bleeding (security)

- Hide the demo credentials; seed a random admin password printed only to the log
- Update the backend packages; decide on `xlsx` (replace with CSV export, or take
  SheetJS from its official source)
- Enable `trust proxy` so rate limits count each visitor
- Add security headers and account lockout after repeated failed logins
- **You:** create new Gemini and Anthropic keys, delete the exposed ones

*End of day: nothing publicly exploitable that we know of.*

## Day 2 — hosting and backups

- **You:** choose the cloud (see [03](03-cloud-choice.md)) and create the account
- Deploy both services, point the website at them, check it end to end
- Set up Postgres or a persistent disk, nightly encrypted backups to object
  storage
- **Restore a backup and write down how long it took**

*End of day: the live link works completely, and data survives a server loss.*

## Day 3 — the open-source AI provider

- Add Groq or OpenRouter to the provider chain, with tests
- Run the same 20 products through the open model and Gemini, compare side by side
- Add a daily call and spend ceiling, with an alert

*End of day: the tool runs on an open model, free, with two fallbacks.*

## Days 4–5 — verified factors (the most valuable work)

- **You (or an LCA colleague):** collect 30–50 factors from public sources — CEA
  for Indian grid electricity, IPCC for fuels, national inventories, published
  EPDs for cement, steel, aluminium and common plastics
- I load them into the registry with value, unit, year, region, source, licence
- Cached estimates upgrade automatically; the page starts showing "verified"

*End of day 5: the headline claim changes from "AI estimate" to "verified where
it matters, AI elsewhere".*

## Day 6 — proof of quality

- Build the evaluation set: 30–50 products with an expected range and a source
- Run it, record the score, fix whatever is clearly wrong
- Re-run after any provider change from now on

*End of day: you can answer "how accurate is it?" with a number.*

## Day 7 — legal, privacy and the launch page

- **You:** privacy notice, terms of use, refund/support policy; have them reviewed
- Add the AI disclosure and the "not an ISO 14067 footprint" line to the terms
- Analytics that respect privacy (Plausible or Umami, both self-hostable)
- Support inbox and a response commitment you can keep

## Day 8 — operations

- Uptime monitoring and error reporting with alerts to your phone
- Load test: 50 concurrent visitors on the estimate endpoint; confirm the queue,
  the cache and the rate limits behave
- Write the incident plan: how to take the site down, who to call, what to say
- A staging copy so day-one fixes are not tested in production

## Day 9 — beta

- **You:** invite 5–10 real users — a plant engineer, an ESG consultant, a
  customer who asked for this
- Watch what they type into Product Carbon; the real vocabulary is never what you
  expect
- Fix the top three problems they hit

## Day 10 — buffer and launch

- Keep this day empty. Something from days 1–9 will overrun; if nothing does,
  launch a day early.
- Final check: backups working, alerts firing, keys rotated, demo credentials
  gone, privacy notice live, PR merged into `main`

## What is deliberately not in these ten days

| Left out | Why | When |
|---|---|---|
| Fine-tuning an open model | 8–15 days on its own, and it does not fix accuracy ([04](04-ai-plan.md)) | Month 2–3, on real usage data |
| Retrieval over the factor registry | The registry has to be filled first | Weeks 3–4 |
| Removing the duplicate TypeScript engine | Real risk, but slow and invisible to users | Weeks 3–4 |
| Chemical safety data | Designed, not started; needs the PubChem integration | Month 2 |
| Ingesting all 190 catalogue rows | Diminishing returns after the top 50 | Ongoing |

## If you only have five days

Do days 1, 2, 4, 5 and 9: security, hosting with backups, verified factors, and a
beta. Ship on Gemini as it is, add the open model afterwards. A tool with real
factors and no backups fails differently from one with backups and no factors —
the first loses customer data, the second only loses face.
