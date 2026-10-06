/** Report parts 21-24 and 33: emissions summary, intensity, trends and commentary. */
import React from 'react';
import { GhgInventoryReport } from '../model/types';
import { GapNote, num, pct, Prose, ReportPage, SectionTitle, Table } from './primitives';

export const SummaryTablePage: React.FC<{ report: GhgInventoryReport }> = ({ report }) => (
  <ReportPage part="Part 23" title="Emissions summary">
    <Prose>
      Every reported category, its absolute emissions and its share of the total. Scope 2 is shown under
      both methods; the total uses the location-based figure so that scopes remain additive.
    </Prose>
    <Table
      headers={['Emission category', 'tCO2e', '% of total']}
      align={['left', 'right', 'right']}
      rows={report.emissionsSummary.map((row) => [
        row.isSubtotal ? <strong key={row.category}>{row.category}</strong> : row.category,
        row.isSubtotal ? <strong>{num(row.tco2e)}</strong> : num(row.tco2e),
        pct(row.shareOfTotal),
      ])}
    />
  </ReportPage>
);

export const IntensityAndTrendPage: React.FC<{ report: GhgInventoryReport }> = ({ report }) => {
  const { intensity, trends } = report;
  return (
    <ReportPage part="Parts 22, 24, 33" title="Intensity and trend analysis">
      <SectionTitle number="22" note="Absolute emissions alone can mislead when production changes. Report both.">
        Production-normalised intensity
      </SectionTitle>
      <Table
        headers={['Indicator', 'Value', 'Unit']}
        align={['left', 'right', 'left']}
        rows={intensity.indicators.map((indicator) => [
          indicator.label,
          indicator.value !== undefined
            ? indicator.value.toFixed(3)
            : <span className="text-[#8A5A00] italic">{indicator.missingReason}</span>,
          indicator.unit,
        ])}
      />

      <SectionTitle number="24" note="Three years or more, where data exists, with the physical cause of each change.">
        Year-on-year trend
      </SectionTitle>
      {trends.available ? (
        <Table
          headers={['Year', 'Scope 1', 'Scope 2 (location)', 'Scope 3', 'Total S1+2', 'Intensity']}
          align={['left', 'right', 'right', 'right', 'right', 'right']}
          rows={trends.rows.map((row) => [
            row.year, num(row.scope1), num(row.scope2Location), num(row.scope3), num(row.totalScope12),
            row.intensity !== undefined ? row.intensity.toFixed(3) : '—',
          ])}
        />
      ) : (
        <GapNote>
          Only the current reporting period is held, so no trend can be shown. Record prior-year Scope 1,
          Scope 2 and Scope 3 totals — with the production output for each year — to enable comparison.
        </GapNote>
      )}

      {trends.commentary.map((comment) => <Prose key={comment}>{comment}</Prose>)}

      <SectionTitle number="33" note="Choose the denominator that explains the emission driver, rather than reporting every ratio that can be calculated.">
        Choice of intensity denominator
      </SectionTitle>
      <Prose>
        For a manufacturing site, physical output normally explains the emission driver better than
        revenue, because revenue moves with price as well as volume. Revenue intensity is reported
        alongside it where required by a disclosure framework such as BRSR.
      </Prose>
    </ReportPage>
  );
};
