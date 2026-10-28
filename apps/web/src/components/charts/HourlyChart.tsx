import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { fmtMoney, fmtPct } from '@/lib/format';

export function HourlyChart({
  data,
  height = 240,
}: {
  data: Array<{ hour: number; pnl: number; trades: number; winRate: number }>;
  height?: number;
}) {
  const points = data.map((item) => ({ ...item, label: `${String(item.hour).padStart(2, '0')}h` }));
  const total = points.reduce((sum, item) => sum + item.pnl, 0);

  return (
    <div
      style={{ height }}
      className="w-full"
      role="img"
      aria-label={`PnL por hora: ${fmtMoney(total)} no total, ${points.length} faixas horárias.`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 8, right: 6, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 6" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: '#5b6172', fontSize: 9 }}
            axisLine={false}
            tickLine={false}
            interval={2}
          />
          <YAxis
            yAxisId="pnl"
            tick={{ fill: '#5b6172', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={40}
            tickFormatter={(value: number) => value.toFixed(0)}
          />
          <YAxis yAxisId="rate" orientation="right" hide domain={[0, 100]} />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0]?.payload as {
                hour: number;
                pnl: number;
                trades: number;
                winRate: number;
              };
              return (
                <div className="border-line-strong bg-panel-2 rounded-xl border px-3 py-2 text-[11px] shadow-xl">
                  <p className="text-dim">{String(point.hour).padStart(2, '0')}:00 UTC</p>
                  <p
                    className={`num mt-1 font-semibold ${point.pnl >= 0 ? 'text-profit' : 'text-loss'}`}
                  >
                    {fmtMoney(point.pnl)}
                  </p>
                  <p className="text-dim">
                    {point.trades} trades · {fmtPct(point.winRate)} win
                  </p>
                </div>
              );
            }}
          />
          <Bar yAxisId="pnl" dataKey="pnl" radius={[2, 2, 0, 0]} isAnimationActive={false}>
            {points.map((point) => (
              <Cell
                key={point.hour}
                fill={point.pnl >= 0 ? '#2ee6a8' : '#ff5c7a'}
                opacity={point.trades ? 0.8 : 0.18}
              />
            ))}
          </Bar>
          <Line
            yAxisId="rate"
            type="monotone"
            dataKey="winRate"
            stroke="#5ad1ff"
            strokeWidth={1.4}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
