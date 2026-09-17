import { z } from 'zod';

/**
 * Product Carbon API contract. Mirrors service/schemas.py.
 *
 * Every number arrives as a STRING computed by ghg_core. The UI renders these
 * strings; it never performs emissions arithmetic of its own.
 */

export const STAGES = ['raw_materials', 'manufacturing', 'distribution', 'use', 'end_of_life'] as const;
export const REGIONS = ['IN', 'GLOBAL', 'GB', 'US', 'EU'] as const;

const Stage = z.enum(STAGES);

const DisplayRange = z.object({
  low: z.string(),
  central: z.string(),
  high: z.string(),
  unit: z.string(),
});

const RangeOut = z.object({
  low: z.string(),
  central: z.string(),
  high: z.string(),
  display: DisplayRange,
});

const LineOut = z.object({
  line_id: z.string(),
  stage: Stage,
  component: z.string(),
  quantity: z.string(),
  quantity_unit: z.string(),
  factor: RangeOut,
  emissions: RangeOut,
  share_of_lifecycle_pct: z.string().nullable(),
  provenance: z.enum(['ai_estimate', 'verified_registry']),
  tier: z.string().nullable(),
  factor_version_id: z.string().nullable(),
  factor_basis: z.string(),
  reference: z.string(),
  catalogue_key: z.string(),
  production_route: z.string(),
});

export const EstimateResponseSchema = z.object({
  estimate_id: z.string(),
  request: z.object({ product: z.string(), region: z.enum(REGIONS), details: z.string() }),
  product: z.object({
    interpreted_as: z.string(),
    category: z.string(),
    declared_unit: z.string(),
    is_ambiguous: z.boolean(),
    clarification: z.string(),
  }),
  assumptions: z.object({
    region: z.string(),
    service_life_years: z.union([z.string(), z.number()]),
    use_profile: z.string(),
    end_of_life_route: z.string(),
  }),
  totals: z.object({
    creation: RangeOut,
    use: RangeOut,
    end_of_life: RangeOut,
    lifecycle: RangeOut,
  }),
  stages: z.record(RangeOut),
  stage_shares_pct: z.record(z.string().nullable()),
  lines: z.array(LineOut),
  hotspot_line_ids: z.array(z.string()),
  verified_share_pct: z.string().nullable(),
  excluded: z.array(z.object({ component: z.string(), stage: z.string(), reason: z.string() })),
  analysis: z.object({
    summary: z.string(),
    creation_drivers: z.array(z.string()),
    use_phase_drivers: z.array(z.string()),
    reduction_opportunities: z.array(
      z.object({ lever: z.string(), stage: Stage, rationale: z.string() })
    ),
    data_gaps: z.array(z.string()),
    confidence: z.enum(['high', 'medium', 'low']),
  }),
  method: z.object({
    provider: z.enum(['anthropic', 'gemini']),
    model: z.string(),
    model_label: z.string(),
    effort: z.string().nullable(),
    engine_version: z.string(),
    generated_at: z.string(),
    reporting_year: z.number(),
    cache_hit: z.boolean(),
    usage: z
      .object({
        input_tokens: z.number(),
        output_tokens: z.number(),
        cache_read_input_tokens: z.number(),
        cache_creation_input_tokens: z.number(),
      })
      .nullable(),
    estimated_cost_usd: z.string(),
    cost_basis: z.enum(['estimated', 'free_tier']),
    fallback_from: z.array(z.string()),
  }),
});

export const HealthSchema = z.object({
  status: z.string(),
  ai_configured: z.boolean(),
  provider: z.enum(['anthropic', 'gemini']),
  billing: z.enum(['estimated', 'free_tier']),
  model: z.string(),
  model_label: z.string(),
  providers: z.array(
    z.object({
      provider: z.enum(['anthropic', 'gemini']),
      model: z.string(),
      label: z.string(),
      billing: z.enum(['estimated', 'free_tier']),
      configured: z.boolean(),
    })
  ),
  engine_version: z.string(),
  catalogue_rows: z.number(),
  verified_factors: z.number(),
  cache_enabled: z.boolean(),
  rate_limit_per_hour: z.number(),
  ai_calls: z.number(),
  cache_hits: z.number(),
  estimated_spend_usd: z.string(),
});

export type Stage = z.infer<typeof Stage>;
export type Region = (typeof REGIONS)[number];
export type RangeValue = z.infer<typeof RangeOut>;
export type EstimateLine = z.infer<typeof LineOut>;
export type EstimateResponse = z.infer<typeof EstimateResponseSchema>;
export type PcfHealth = z.infer<typeof HealthSchema>;

export interface EstimateInput {
  product: string;
  region: Region;
  details: string;
}
