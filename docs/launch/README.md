# Launch plan — IINVTY GHG Portal

Written 2026-09-23, for a launch about ten days out. Everything here is based on
measurements from this repository, not estimates from memory; where a number is
an assumption it says so.

| Document | What it answers |
|---|---|
| [01-issues-before-launch.md](01-issues-before-launch.md) | What must be fixed first, in priority order, with effort |
| [02-storage-sizing.md](02-storage-sizing.md) | How much storage is needed, measured per user and per estimate |
| [03-cloud-choice.md](03-cloud-choice.md) | Which cloud is cheap and secure, with prices and a security checklist |
| [04-ai-plan.md](04-ai-plan.md) | Open-source AI: what training really needs, what is free, and the honest verdict |
| [05-ten-day-plan.md](05-ten-day-plan.md) | Day-by-day schedule for the ten days |

## The short version

**Storage is not your problem.** One estimate costs about 4 KB, one user about
1 KB. Ten thousand estimates and a thousand users fit in under 100 MB. A free
database tier (500 MB) covers your first year; budget 10 GB of disk and you have
room for backups and logs as well. Details and the growth table are in
[02](02-storage-sizing.md).

**Cheapest secure hosting: about ₹400–900 (US$5–10) a month.** One small server
plus a free static site host. If you want Indian data residency and low latency
for Indian customers, use DigitalOcean Bangalore or AWS Lightsail Mumbai. If cost
matters more than location, Hetzner is the cheapest reliable option, and Oracle
Cloud's Always Free tier can be genuinely free including a Mumbai region. The
comparison and the security checklist are in [03](03-cloud-choice.md).

**On training your own AI — my honest recommendation: do not train a model for
this launch.** Not because it is too hard, but because it would not fix the thing
you need fixed. Training teaches a model how to *write*, not which emission
factors are *true*. A model that has memorised numbers still invents new ones,
and you cannot cite a model's memory to an auditor.

What actually makes the numbers trustworthy is the work you have already started:
a verified factor registry, with the calculation done in code. Today your
registry holds **zero verified factors**, so every figure on the page is an AI
estimate. Loading 30–50 real factors from public sources (CEA, IPCC, published
EPDs) would do more for accuracy in three days than any amount of fine-tuning.

If you want an open-source model rather than Google's, you can have that **for
free and without training**: several providers serve open models (Llama, Qwen,
Mistral) on free tiers, and the service already supports a provider chain. That
gets you "open model, free, no vendor lock-in" this week. Fine-tuning can come
later, in month two, once you have real user data to train on. Full reasoning,
including what a fine-tune would cost in time and money if you still want it, is
in [04](04-ai-plan.md).

**The ten days are tight but realistic** if the AI training is off the critical
path. The plan in [05](05-ten-day-plan.md) spends the first four days on security
and data quality, two on hosting, and leaves the last two for a beta and a buffer.

## What I would not launch without

1. The demo admin password is printed on the public login page.
2. There is a package with a known critical security problem in the website build.
3. No backups exist, and no one has ever restored one.
4. No privacy notice, no terms, and the page collects work e-mail addresses.
5. Zero verified emission factors, while the page says figures are screening
   estimates. That is honest today, but it is a thin offer to sell.
