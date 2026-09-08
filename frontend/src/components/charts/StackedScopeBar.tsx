import React from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';

export interface StackedScopeBarProps {
  scope1: number;
  scope2: number;
  scope3: number;
}

export const StackedScopeBar: React.FC<StackedScopeBarProps> = ({ scope1, scope2, scope3 }) => {
  const data = [
    {
      name: 'Inventory',
      'Scope 1 (Direct)': scope1,
      'Scope 2 (Electricity)': scope2,
      'Scope 3 (Value Chain)': scope3,
    },
  ];

  return (
    <div className="w-full h-24">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          layout="vertical"
          data={data}
          stackOffset="expand"
          margin={{ top: 10, right: 10, left: 10, bottom: 10 }}
        >
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" hide />
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                return (
                  <div className="bg-surface-raised border border-border shadow-nm-raised-sm rounded-md p-3 text-xs flex flex-col gap-1 z-30">
                    {payload.map((entry: any, index: number) => (
                      <div key={`item-${index}`} className="flex items-center justify-between gap-4">
                        <span className="font-semibold" style={{ color: entry.color }}>
                          {entry.name}:
                        </span>
                        <span className="font-mono tabular-nums text-brand-heading">
                          {Number(entry.value).toFixed(1)} tCO₂e
                        </span>
                      </div>
                    ))}
                  </div>
                );
              }
              return null;
            }}
          />
          <Bar dataKey="Scope 1 (Direct)" fill="var(--scope-1)" stackId="a" radius={[6, 0, 0, 6]} />
          <Bar dataKey="Scope 2 (Electricity)" fill="var(--scope-2)" stackId="a" />
          <Bar dataKey="Scope 3 (Value Chain)" fill="var(--scope-3)" stackId="a" radius={[0, 6, 6, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
