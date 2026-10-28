import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export function RDistributionChart({
  data,
  height = 220,
}: {
  data: Array<{ bucket: string; count: number }>;
  height?: number;
}) {
  const total = data.reduce((sum, item) => sum + item.count, 0);
  return (
    <div
      style={{ height }}
      className="w-full"
      role="img"
      aria-label={`Distribuição de R: ${total} trades em ${data.length} faixas.`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 6, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 6" vertical={false} />
          <XAxis
            dataKey="bucket"
            tick={{ fill: '#5b6172', fontSize: 9 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: '#5b6172', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={30}
          />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0]?.payload as { bucket: string; count: number };
              return (
                <div className="border-line-strong bg-panel-2 rounded-xl border px-3 py-2 text-[11px] shadow-xl">
                  <p className="text-dim">{point.bucket}</p>
                  <p className="num text-ink mt-1">{point.count} trades</p>
                </div>
              );
            }}
          />
          <Bar dataKey="count" radius={[3, 3, 0, 0]} isAnimationActive={false}>
            {data.map((point) => (
              <Cell
                key={point.bucket}
                fill={point.bucket.startsWith('-') ? '#ff5c7a' : '#c9f73a'}
                opacity={0.82}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
