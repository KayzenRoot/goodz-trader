import type { EquityPoint } from '@goodz/core';
import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { fmtDateTime, fmtMoney, fmtTime } from '@/lib/format';

function sample(points: EquityPoint[], max = 420): EquityPoint[] {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, index) => points[Math.round(index * step)]).filter(
    (point): point is EquityPoint => Boolean(point),
  );
}

export function EquityChart({
  data,
  height = 280,
  showAxis = true,
  showReference = true,
}: {
  data: EquityPoint[];
  height?: number;
  showAxis?: boolean;
  showReference?: boolean;
}) {
  const points = useMemo(() => sample(data), [data]);
  const first = points[0]?.equity ?? 0;
  const last = points.at(-1)?.equity ?? first;

  if (points.length < 2) {
    return (
      <div className="text-dim flex h-[220px] items-center justify-center text-xs">
        Aguardando snapshots de equity...
      </div>
    );
  }

  return (
    <div
      style={{ height }}
      className="w-full"
      role="img"
      aria-label={`Equity de ${fmtMoney(first)} para ${fmtMoney(last)} em ${points.length} pontos.`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 6, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#c9f73a" stopOpacity={0.24} />
              <stop offset="70%" stopColor="#c9f73a" stopOpacity={0.03} />
              <stop offset="100%" stopColor="#c9f73a" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 6" vertical={false} />
          <XAxis
            dataKey="ts"
            hide={!showAxis}
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(value: number) => {
              const span = (points.at(-1)?.ts ?? 0) - (points[0]?.ts ?? 0);
              return span > 3 * 86_400_000
                ? new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
                : fmtTime(value);
            }}
            tick={{ fill: '#5b6172', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            minTickGap={48}
          />
          <YAxis
            hide={!showAxis}
            domain={['auto', 'auto']}
            tickFormatter={(value: number) => value.toFixed(0)}
            tick={{ fill: '#5b6172', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={44}
          />
          {showReference && first > 0 ? (
            <ReferenceLine y={first} stroke="rgba(255,255,255,0.14)" strokeDasharray="4 6" />
          ) : null}
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0]?.payload as EquityPoint;
              return (
                <div className="border-line-strong bg-panel-2 rounded-xl border px-3 py-2 text-[11px] shadow-xl">
                  <p className="text-dim">{fmtDateTime(point.ts)}</p>
                  <p className="num text-ink mt-1 font-semibold">{fmtMoney(point.equity)}</p>
                  <p className="num text-dim">PnL dia {fmtMoney(point.dayPnl)}</p>
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="equity"
            stroke="#c9f73a"
            strokeWidth={1.8}
            fill="url(#equityFill)"
            dot={false}
            activeDot={{ r: 3, fill: '#c9f73a', stroke: '#06070a', strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
