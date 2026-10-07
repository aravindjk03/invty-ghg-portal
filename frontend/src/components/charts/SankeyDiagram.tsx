import React, { useState } from 'react';
import { Card } from '../ui/Card';
import { Table, Column } from '../ui/Table';
import { Button } from '../ui/Button';
import { TableProperties, Network } from 'lucide-react';

export interface SankeyRow {
  activity: string;
  category: string;
  scope: string;
  amount: number;
  scopeColor: string;
}

export interface SankeyDiagramProps {
  /**
   * The inventory's own rows. This diagram used to render eleven hardcoded
   * activities totalling 1,992.2 tCO2e for every company, printed directly
   * beside the real total on the same screen — two different answers to the
   * same question, one of them about nobody.
   */
  rows: SankeyRow[];
}

export const SankeyDiagram: React.FC<SankeyDiagramProps> = ({ rows }) => {
  const [viewAsTable, setViewAsTable] = useState(false);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const SANKEY_DATA = rows;
  const totalEmissions = SANKEY_DATA.reduce((acc, row) => acc + row.amount, 0);

  const tableColumns: Column<SankeyRow>[] = [
    { header: 'Activity Source', accessorKey: 'activity' },
    { header: 'GHG Category', accessorKey: 'category' },
    { header: 'Scope', accessorKey: 'scope' },
    {
      header: 'Emissions (tCO₂e)',
      accessorKey: 'amount',
      numeric: true,
      cell: (row) => <span className="font-mono tabular-nums">{row.amount.toFixed(1)}</span>,
    },
    {
      header: 'Share of Total',
      numeric: true,
      cell: (row) => (
        <span className="font-mono tabular-nums text-brand-muted">
          {totalEmissions > 0 ? ((row.amount / totalEmissions) * 100).toFixed(1) : '0.0'}%
        </span>
      ),
    },
  ];

  return (
    <Card className="flex flex-col gap-4">
      {/* Header with Table View Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border">
        <div>
          <h3 className="text-lg font-bold text-brand-heading">Emissions Flow Model (Sankey)</h3>
          <p className="text-xs text-brand-muted mt-0.5">
            Traces flows from raw activities → GHG categories → accounting scopes → total inventory.
          </p>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => setViewAsTable(!viewAsTable)}
          leftIcon={viewAsTable ? <Network size={15} /> : <TableProperties size={15} />}
        >
          {viewAsTable ? 'View diagram' : 'View as table'}
        </Button>
      </div>

      {SANKEY_DATA.length === 0 ? (
        <div className="py-12 text-center text-xs text-brand-muted">
          No calculated rows yet. Once activity data is entered and the engine has
          a published factor for it, every source appears here on its way to the total.
        </div>
      ) : viewAsTable ? (
        <Table columns={tableColumns} data={SANKEY_DATA} keyExtractor={(r) => r.activity} />
      ) : (
        <div className="w-full min-h-[440px] flex flex-col justify-center relative overflow-x-auto select-none pt-2">
          {/* Column Stages Indicator */}
          <div className="grid grid-cols-4 text-xs font-semibold uppercase tracking-wider text-brand-muted text-center pb-2 border-b border-border">
            <span className="text-left pl-2">Activities (Primary Data)</span>
            <span>GHG Categories</span>
            <span>Scopes</span>
            <span className="text-right pr-2">Total Inventory</span>
          </div>

          {/* Interactive SVG Flow Canvas */}
          <svg className="w-full h-[400px]" viewBox="0 0 900 400" preserveAspectRatio="none">
            <defs>
              {SANKEY_DATA.map((row, idx) => (
                <linearGradient key={`grad-${idx}`} id={`sankey-grad-${idx}`} x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor={row.scopeColor} stopOpacity={hoveredIdx === null || hoveredIdx === idx ? 0.6 : 0.15} />
                  <stop offset="100%" stopColor={row.scopeColor} stopOpacity={hoveredIdx === null || hoveredIdx === idx ? 0.35 : 0.08} />
                </linearGradient>
              ))}
            </defs>

            {/* Render Flow Ribbons */}
            {SANKEY_DATA.map((row, idx) => {
              const y1 = 20 + idx * 34;
              const y2 = 40 + (idx % 5) * 65;
              const y3 = row.scope === 'Scope 1' ? 70 : row.scope === 'Scope 2' ? 180 : 290;
              const y4 = 200;

              const isHovered = hoveredIdx === idx;
              const isDimmed = hoveredIdx !== null && !isHovered;

              return (
                <g key={`path-group-${idx}`}>
                  {/* Cubic Bezier Ribbons */}
                  <path
                    d={`M 180 ${y1 + 10} C 250 ${y1 + 10}, 270 ${y2 + 10}, 340 ${y2 + 10} C 440 ${y2 + 10}, 460 ${y3 + 10}, 560 ${y3 + 10} C 670 ${y3 + 10}, 710 ${y4}, 780 ${y4}`}
                    fill="none"
                    stroke={`url(#sankey-grad-${idx})`}
                    strokeWidth={Math.max(3, totalEmissions > 0 ? (row.amount / totalEmissions) * 45 : 3)}
                    strokeLinecap="round"
                    className="cursor-pointer transition-all duration-200"
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                  />

                  {/* Activity Node (Col 1) */}
                  <rect
                    x="10"
                    y={y1}
                    width="170"
                    height="24"
                    rx="6"
                    fill="var(--surface-raised)"
                    stroke="var(--border)"
                    className="cursor-pointer hover:stroke-blue-600"
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                  />
                  <text
                    x="20"
                    y={y1 + 16}
                    fontSize="11"
                    fontFamily="Inter"
                    fill="var(--text-body)"
                    fontWeight="500"
                    className="pointer-events-none"
                  >
                    {row.activity.length > 22 ? row.activity.slice(0, 20) + '…' : row.activity}
                  </text>

                  {/* Category Node (Col 2) */}
                  <circle
                    cx="340"
                    cy={y2 + 10}
                    r="5"
                    fill={row.scopeColor}
                    opacity={isDimmed ? 0.3 : 0.9}
                  />

                  {/* Scopes Node (Col 3) */}
                  <circle
                    cx="560"
                    cy={y3 + 10}
                    r="7"
                    fill={row.scopeColor}
                    opacity={isDimmed ? 0.3 : 0.9}
                  />
                </g>
              );
            })}

            {/* Scope Labels on Column 3 */}
            <g transform="translate(575, 75)">
              <rect x="0" y="-12" width="90" height="24" rx="4" fill="var(--surface-raised)" stroke="var(--border)" />
              <text x="8" y="4" fontSize="12" fontWeight="600" fill="var(--scope-1)">Scope 1</text>
            </g>
            <g transform="translate(575, 185)">
              <rect x="0" y="-12" width="90" height="24" rx="4" fill="var(--surface-raised)" stroke="var(--border)" />
              <text x="8" y="4" fontSize="12" fontWeight="600" fill="var(--scope-2)">Scope 2</text>
            </g>
            <g transform="translate(575, 295)">
              <rect x="0" y="-12" width="90" height="24" rx="4" fill="var(--surface-raised)" stroke="var(--border)" />
              <text x="8" y="4" fontSize="12" fontWeight="600" fill="var(--scope-3)">Scope 3</text>
            </g>

            {/* Total Target Node on Column 4 */}
            <g transform="translate(780, 175)">
              <rect
                x="0"
                y="0"
                width="110"
                height="50"
                rx="8"
                fill="var(--surface-raised)"
                stroke="var(--blue-600)"
                strokeWidth="1.5"
                filter="drop-shadow(0 2px 6px rgba(16,51,158,0.15))"
              />
              <text x="12" y="20" fontSize="10" fontWeight="700" fill="var(--text-muted)" letterSpacing="0.05em">
                TOTAL INVENTORY
              </text>
              <text x="12" y="38" fontSize="15" fontWeight="700" fontFamily="JetBrains Mono" fill="var(--text-heading)">
                {totalEmissions.toFixed(1)} tCO₂e
              </text>
            </g>
          </svg>

          {/* Flow Hover Details Callout */}
          <div className="h-7 text-xs flex items-center justify-between px-2 pt-1 border-t border-border/50 text-brand-muted">
            {hoveredIdx !== null ? (
              <span className="text-brand-heading font-medium">
                Flow: <strong>{SANKEY_DATA[hoveredIdx].activity}</strong> → {SANKEY_DATA[hoveredIdx].category} → {SANKEY_DATA[hoveredIdx].scope} (
                <span className="font-mono text-brand-link font-bold">
                  {SANKEY_DATA[hoveredIdx].amount} tCO₂e
                </span>
                )
              </span>
            ) : (
              <span>Hover any activity ribbon or node to highlight its lifecycle pathway.</span>
            )}
            <span className="font-mono text-[11px]">GHG Protocol Standard Allocation</span>
          </div>
        </div>
      )}
    </Card>
  );
};
