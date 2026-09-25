/**
 * The form for the facts a verifier needs that the inventory does not hold:
 * document control, period dates, boundary rationale, GWP basis, base year and
 * production output.
 *
 * Nothing here is pre-filled. Each field that is still empty shows up in the
 * readiness assessment (Part 30) until someone records it.
 */
import React from 'react';
import { ReportMeta, missingMetaFields } from './model/reportMeta';

interface Props {
  meta: ReportMeta;
  onChange: (meta: ReportMeta) => void;
}

const Field: React.FC<{
  label: string;
  value: string | number | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'number' | 'date';
  hint?: string;
}> = ({ label, value, onChange, placeholder, type = 'text', hint }) => (
  <label className="block mb-3">
    <span className="block text-[11px] font-semibold uppercase tracking-wider text-brand-muted mb-1">
      {label}
    </span>
    <input
      type={type}
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-brand-body
                 focus:outline-none focus:ring-2 focus:ring-brand-link/40"
    />
    {hint && <span className="block text-[11px] text-brand-muted mt-1">{hint}</span>}
  </label>
);

export const ReportSettings: React.FC<Props> = ({ meta, onChange }) => {
  const set = (patch: Partial<ReportMeta>) => onChange({ ...meta, ...patch });
  const missing = missingMetaFields(meta);

  return (
    <div>
      <p className="text-[12px] text-brand-body mb-3">
        These details belong to the report, not the inventory. Until they are recorded, the report shows
        them as missing and the readiness score in Part 30 stays low.
      </p>

      {missing.length > 0 && (
        <p className="text-[11.5px] text-[#8A5A00] bg-[#FFF8E6] border border-[#F0D9A0] rounded-md px-3 py-2 mb-4">
          Still missing: {missing.join(', ')}.
        </p>
      )}

      <Field label="Document number" value={meta.documentNumber}
        placeholder="IINVTY/ESG/GHG/001" onChange={(v) => set({ documentNumber: v })} />
      <Field label="Version" value={meta.version} placeholder="01" onChange={(v) => set({ version: v })} />
      <Field label="Effective date" type="date" value={meta.effectiveDate}
        onChange={(v) => set({ effectiveDate: v })} />
      <Field label="Prepared by" value={meta.preparedBy} placeholder="Sustainability / ESG team"
        onChange={(v) => set({ preparedBy: v })} />
      <Field label="Reviewed by" value={meta.reviewedBy} placeholder="EHS / Energy / Finance"
        onChange={(v) => set({ reviewedBy: v })} />
      <Field label="Approved by" value={meta.approvedBy} placeholder="Top management"
        onChange={(v) => set({ approvedBy: v })} />

      <hr className="border-border my-4" />

      <Field label="Reporting period start" type="date" value={meta.periodStart}
        onChange={(v) => set({ periodStart: v })} />
      <Field label="Reporting period end" type="date" value={meta.periodEnd}
        onChange={(v) => set({ periodEnd: v })} />
      <Field label="Facility covered" value={meta.facility}
        placeholder="Chennai manufacturing facility" onChange={(v) => set({ facility: v })} />
      <Field label="Consolidation approach rationale" value={meta.approachRationale}
        placeholder="Why this approach, and how JVs and leased assets are treated"
        onChange={(v) => set({ approachRationale: v })} />

      <hr className="border-border my-4" />

      <Field label="GWP basis" value={meta.gwpBasis} placeholder="IPCC AR6, 100-year"
        hint="Changing the GWP basis changes the inventory even when activity data does not."
        onChange={(v) => set({ gwpBasis: v })} />
      <Field label="Base year" value={meta.baseYear} placeholder="FY 2022–23"
        onChange={(v) => set({ baseYear: v })} />
      <Field label="Base year emissions (tCO2e, Scope 1 + 2)" type="number" value={meta.baseYearEmissions}
        onChange={(v) => set({ baseYearEmissions: v === '' ? undefined : Number(v) })} />
      <Field label="Base year rationale" value={meta.baseYearRationale}
        placeholder="Why this year, and what data supports it" onChange={(v) => set({ baseYearRationale: v })} />

      <hr className="border-border my-4" />

      <Field label="Renewable electricity share (%)" type="number" value={meta.renewableSharePercent}
        hint="Reported in the executive summary. Leave blank if no contractual instruments are held."
        onChange={(v) => set({ renewableSharePercent: v === '' ? undefined : Number(v) })} />

      <span className="block text-[11px] font-semibold uppercase tracking-wider text-brand-muted mb-1">
        Refrigerant equipment (part 13)
      </span>
      {meta.refrigerants.map((row, index) => (
        <div key={index} className="border border-border rounded-md p-2 mb-2 bg-surface">
          <div className="grid grid-cols-2 gap-2">
            <input placeholder="Equipment" value={row.equipment}
              onChange={(e) => set({ refrigerants: meta.refrigerants.map((r, i) =>
                (i === index ? { ...r, equipment: e.target.value } : r)) })}
              className="rounded border border-border px-2 py-1 text-xs" />
            <input placeholder="Refrigerant (R-410A)" value={row.refrigerant}
              onChange={(e) => set({ refrigerants: meta.refrigerants.map((r, i) =>
                (i === index ? { ...r, refrigerant: e.target.value } : r)) })}
              className="rounded border border-border px-2 py-1 text-xs" />
            <input placeholder="Loss kg" type="number" value={row.lossKg ?? ''}
              onChange={(e) => set({ refrigerants: meta.refrigerants.map((r, i) =>
                (i === index ? { ...r, lossKg: e.target.value === '' ? undefined : Number(e.target.value) } : r)) })}
              className="rounded border border-border px-2 py-1 text-xs" />
            <input placeholder="GWP" type="number" value={row.gwp ?? ''}
              onChange={(e) => set({ refrigerants: meta.refrigerants.map((r, i) =>
                (i === index ? { ...r, gwp: e.target.value === '' ? undefined : Number(e.target.value) } : r)) })}
              className="rounded border border-border px-2 py-1 text-xs" />
          </div>
          <input placeholder="Calculation method (mass balance / screening / leak rate)" value={row.method}
            onChange={(e) => set({ refrigerants: meta.refrigerants.map((r, i) =>
              (i === index ? { ...r, method: e.target.value } : r)) })}
            className="w-full mt-2 rounded border border-border px-2 py-1 text-xs" />
          <button type="button" className="text-[11px] text-status-danger mt-1"
            onClick={() => set({ refrigerants: meta.refrigerants.filter((_, i) => i !== index) })}>
            Remove
          </button>
        </div>
      ))}
      <button type="button"
        className="text-xs text-brand-link font-semibold mb-4"
        onClick={() => set({ refrigerants: [...meta.refrigerants,
          { equipment: '', refrigerant: '', method: '', lossKg: undefined, gwp: undefined }] })}>
        + Add equipment
      </button>

      <hr className="border-border my-4" />

      <Field label="Production output for the period" type="number" value={meta.productionOutput}
        hint="Used for intensity. Without it, intensity cannot be reported."
        onChange={(v) => set({ productionOutput: v === '' ? undefined : Number(v) })} />
      <Field label="Production unit" value={meta.productionUnit}
        placeholder="tonnes of finished product" onChange={(v) => set({ productionUnit: v })} />
      <Field label="Revenue (INR crore)" type="number" value={meta.revenueCrore}
        onChange={(v) => set({ revenueCrore: v === '' ? undefined : Number(v) })} />
    </div>
  );
};
