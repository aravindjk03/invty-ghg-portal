---
activation: Always On
---
# Product Carbon Reference — the rules that keep it honest

The full specification is @docs/product-carbon-and-mitigation-spec.md and the
taxonomy is @data/product_carbon_catalogue.csv. Read them before touching this
feature. What follows is the part that must never be violated.

## 1. This feature is not organisation-scoped

It is a public reference. Any visitor, any material. No BOM, no facility data, no
allocation of a client's inventory, no login required for the lookup. If you find
yourself building a bill of materials, you are building the wrong feature.

## 2. A material name is never a valid key

The key is:

    (material_key, production_route, region, system_boundary, reference_year)

A request without a production route MUST raise. It must never resolve to a
default route. Ammonia by SMR and by coal gasification are different products
with the same name; so are BF-BOF and scrap-EAF steel, primary and secondary
aluminium, OPC and blended cement, virgin PET and rPET.

## 3. Never rank across boundaries

`cradle_to_gate` and `cradle_to_grave` rows are not comparable and must never be
ranked against each other. This matters most for vehicles: a BEV and an ICE car
compared cradle-to-gate will mislead every reader, because the use phase is where
an ICE vehicle spends its carbon.

## 4. Allocation is recorded, never performed

We do not allocate. The source did. `allocation_method` exists so two sources are
not silently compared across incompatible methods. Read it from the publication.
If the publication does not declare one, record `unstated` — never assume `mass`.

## 5. Tier is part of the number

Every displayed intensity carries its tier badge, source publication and reference
year, always visible, never hover-only. A Tier C EEIO proxy rendered to look like
a Tier A route-specific value is the failure mode that destroys the product.

Fallback ladder: exact → prior year → parent region → class average (Tier B) →
EEIO proxy (Tier C) → **raise**. Every rung sets its flag. The last rung is not
optional.

## 6. The AI proposes lines; the engine produces every aggregate

Decision recorded 2026-09-16, at the product owner's request: on the Product
Carbon page ONLY, the AI may propose per-line quantities and per-unit emission
factor ranges for any product, so that a visitor can get a screening estimate
for materials INVTY holds no verified data for.

What stays absolute:

- The AI never states an aggregate. The output schema in `service/schemas.py`
  has no field for a total, subtotal, share or ranking. Every one of those is
  computed by `ghg_core.screening.screen_product` in Decimal.
- Every AI-proposed factor is labelled `ai_estimate` on every screen it appears
  on, with its cited reference marked unverified, or "No source cited".
- A verified registry factor always REPLACES the AI's factor for a matching
  catalogue material and route. AI estimates never enter the registry or the
  catalogue, and never feed the corporate inventory (Scope 1/2/3).
- Ranges are summed endpoint-to-endpoint and labelled as ranges, never as a
  confidence interval.
- Results carry a standing label: screening estimate, not an ISO 14067-verified
  footprint or an EPD.
- Abstention stays first-class. `is_ambiguous` + `clarification` must be
  rendered, never swallowed.

## 6a. INSITY EDGE AI: one public name, untrusted input and output

- Visitors see only the assistant name (PCF_ASSISTANT_NAME, "INSITY EDGE AI").
  Never put a vendor or model name, token count, cost or provider status in a
  public response, public error message or the page. Those belong in the log and
  /admin/status.
- Always keep the "AI estimate" label. Branding must not hide that figures are
  AI-generated.
- Visitor text is untrusted data: cleaned (service/text.py), fenced in the
  prompt, never interpolated into the system prompt.
- Model output is untrusted: sanitised and bounded (service/guard.py) before use.
  Never render model text as HTML.
- Do not weaken is_product, the fences, the sanitiser or the plausibility bounds
  without a test showing why.

## 7. Everything in the catalogue is TO_INGEST

No coefficient value in `data/product_carbon_catalogue.csv` may be filled in by
you. Values enter through the ingestion pipeline from the named publication in
that row. This is rule 0 of @.agents/rules/00-project.md applied to materials, and
it does not relax because a number is easy to recall.

We have no ecoinvent licence. Sources are EXIOBASE, USEEIO, IPCC, national
inventories, sector-association LCIs and published EPDs. ecoinvent and GaBi are
excluded and may not be redistributed through a public tool.
