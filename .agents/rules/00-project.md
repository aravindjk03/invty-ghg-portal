---
activation: Always On
---
# INVTY GHG Accounting Portal — project map

A public web tool on the INVTY website. Any visitor enters energy, fuel and
value-chain data and receives a calculated GHG inventory (Scope 1, 2, 3) plus a
downloadable, INVTY-watermarked PDF report. Audience: Indian industrial and
corporate professionals. It is also a lead-generation funnel for INVTY.

## The specifications live in the repo. Read them, do not guess.

- @docs/architecture-spec.md — system design, data model, services, report pipeline
- @docs/calculation-methodology.md — THE EQUATIONS. Every formula the engine implements.
- @docs/source-catalogue-and-routing.md — how a source maps to a scope; the routing traps
- @docs/techstack-and-bugguard.md — pinned dependencies and known failure classes
- @docs/ui-master-prompt.md — the design system and screen specs
- @data/emission_source_catalogue.csv — 266 activity sources, seed data
- @data/coefficient_ingestion_worklist.csv — every coefficient needed and where to source it

Before implementing anything in the calculation engine, factor registry, or unit
system, open @docs/calculation-methodology.md and follow the equation given there
exactly. Do not derive your own formula.

## Build order — do not deviate

1. Unit conversion service + tests
2. Factor registry + resolution + tests
3. Calculation engine + golden-path tests
4. Factor ingestion pipeline
5. API layer
6. UI
7. PDF report

Steps 1–3 have NO user interface. Do not build screens until the engine passes
its tests. Building UI first is the standard failure mode for this product.

## Non-negotiable

Never invent, estimate or recall an emission factor, calorific value, density or
GWP value. These are ingested from named publications only. If a coefficient is
missing, raise an error and tell me which one — never substitute a plausible
number, and never default to zero.

## Dependencies

Install only what @docs/techstack-and-bugguard.md Part 1 approves. If you believe
another package is needed, stop and ask me which and why. Do not install it.
