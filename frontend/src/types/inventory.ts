/**
 * The inventory calculation contract.
 *
 * The browser does not calculate emissions. It sends activity records to the
 * engine (ghg_core) and renders what comes back, including the reason a line
 * could not be calculated. Figures cross the wire as strings so no precision is
 * lost to JavaScript numbers before they are displayed.
 */
import { z } from 'zod';

export const GWP_SETS = ['AR5', 'AR6'] as const;
export type GwpSetName = (typeof GWP_SETS)[number];

export const GwpSetSchema = z.object({
  name: z.string(),
  horizon_years: z.number(),
  source_name: z.string(),
  source_url: z.string(),
  gases: z.array(z.string()),
});
export type GwpSetInfo = z.infer<typeof GwpSetSchema>;

export const ActivitySchema = z.object({
  activity_key: z.string(),
  name: z.string(),
  scope: z.string(),
  category_path: z.string(),
  unit: z.string(),
  region: z.string(),
  source: z.string(),
  reference_year: z.number(),
  gases: z.array(z.string()),
});
export type SelectableActivity = z.infer<typeof ActivitySchema>;

export interface InventoryRecordInput {
  record_id: string;
  activity_key: string;
  scope: '1' | '2' | '3' | 'memo';
  ghg_category: string;
  region: string;
  value: string | null;
  unit: string | null;
  facility_id?: string;
  scope2_view?: 'location' | 'market';
  period_month?: string;
  note?: string;
}

export const LineSchema = z.object({
  record_id: z.string(),
  activity_key: z.string(),
  scope: z.string(),
  ghg_category: z.string(),
  status: z.string(),
  message: z.string(),
  emissions_kgco2e: z.string(),
  gas_breakdown: z.record(z.string()),
  gwp_applied: z.record(z.string()),
  factor_value: z.string().nullable(),
  factor_source: z.string().nullable(),
  factor_reference_year: z.number().nullable(),
  factor_version_id: z.string().nullable(),
  resolution_flags: z.array(z.string()),
  data_quality_tier: z.string(),
});
export type InventoryLine = z.infer<typeof LineSchema>;

export const InventoryResponseSchema = z.object({
  run_id: z.string(),
  engine_version: z.string(),
  gwp_set: z.string(),
  gwp_source: z.string(),
  scope2_view: z.string(),
  reporting_year: z.number(),
  lines: z.array(LineSchema),
  totals: z.object({
    scope1: z.string(),
    scope2_location: z.string(),
    scope2_market: z.string(),
    scope2_headline: z.string(),
    scope3: z.string(),
    scope3_by_category: z.record(z.string()),
    total_scope12: z.string(),
    total_all: z.string(),
    memo: z.record(z.string()),
  }),
  excluded: z.array(z.record(z.unknown())),
});
export type InventoryResult = z.infer<typeof InventoryResponseSchema>;

/** Kilograms as reported by the engine, shown in tonnes. */
export const toTonnes = (kg: string): number => Number(kg) / 1000;
