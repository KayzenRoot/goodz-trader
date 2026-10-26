import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { dayShort, fmtMoney } from '@/lib/format';

export function PnlBars({
  data,
  height = 240,
}: {
  data: Array<{ dayKey: string; pnl: number; trades: number }>;
  height?: number;
}) {
  const points = useMemo(
    () =>
      data.map((item) => ({
        ...item,
        label: dayShort(item.dayKey),
      })),
    [data],
  );

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ top: 8, right: 6, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 6" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: '#5b6172', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            minTickGap={26}
          />
          <YAxis
            tick={{ fill: '#5b6172', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={44}
            tickFormatter={(value: number) => value.toFixed(0)}
          />
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.14)" />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0]?.payload as { dayKey: string; pnl: number; trades: number };
              return (
                <div className="border-line-strong bg-panel-2 rounded-xl border px-3 py-2 text-[11px] shadow-xl">
                  <p className="text-dim">{point.dayKey}</p>
                  <p
                    className={`num mt-1 font-semibold ${point.pnl >= 0 ? 'text-profit' : 'text-loss'}`}
                  >
                    {fmtMoney(point.pnl)}
                  </p>
                  <p className="text-dim">{point.trades} trades</p>
                </div>
              );
            }}
          />
          <Bar dataKey="pnl" radius={[3, 3, 0, 0]} isAnimationActive={false}>
            {points.map((point) => (
              <Cell
                key={point.dayKey}
                fill={point.pnl >= 0 ? '#2ee6a8' : '#ff5c7a'}
                opacity={0.82}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
