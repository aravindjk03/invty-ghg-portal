import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';

export interface DonutSource {
  name: string;
  value: number;
  color: string;
}

export interface DonutChartProps {
  data: DonutSource[];
  centerLabel?: string;
  centerValue?: string;
}

export const DonutChart: React.FC<DonutChartProps> = ({
  data,
  centerLabel = 'Top Sources',
  centerValue,
}) => {
  return (
    <div className="relative w-full h-64 flex items-center justify-center">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const item = payload[0];
                return (
                  <div className="bg-surface-raised border border-border shadow-nm-raised-sm rounded-md p-2.5 text-xs">
                    <span className="font-semibold text-brand-heading block">{item.name}</span>
                    <span className="font-mono text-brand-body tabular-nums">
                      {Number(item.value).toFixed(1)} tCO₂e
                    </span>
                  </div>
                );
              }
              return null;
            }}
          />
          <Pie
            data={data}
            innerRadius={65}
            outerRadius={95}
            paddingAngle={3}
            dataKey="value"
            stroke="var(--surface-raised)"
            strokeWidth={2}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>

      {/* Center Label */}
      <div className="absolute flex flex-col items-center justify-center pointer-events-none text-center">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-brand-muted">
          {centerLabel}
        </span>
        {centerValue && (
          <span className="text-lg font-mono font-bold text-brand-heading tabular-nums">
            {centerValue}
          </span>
        )}
      </div>
    </div>
  );
};
