import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

interface ChartProps {
  type: 'line' | 'bar' | 'pie';
  data: Record<string, unknown>[];
  xKey?: string;
  yKeys?: { key: string; color?: string; label?: string }[];
  height?: number;
  className?: string;
}

export function Chart({ type, data, xKey = 'name', yKeys = [], height = 300, className = '' }: ChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className={`flex items-center justify-center h-[${height}px] text-slate-400 text-sm ${className}`}>
        No data available
      </div>
    );
  }

  if (type === 'pie') {
    const dataKey = yKeys[0]?.key ?? 'value';
    return (
      <div className={className}>
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie
              data={data}
              dataKey={dataKey}
              nameKey={xKey}
              cx="50%"
              cy="50%"
              outerRadius={height / 3}
              label={({ name, percent }: { name: string; percent: number }) =>
                `${name} (${(percent * 100).toFixed(0)}%)`
              }
            >
              {data.map((_, idx) => (
                <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (type === 'bar') {
    return (
      <div className={className}>
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey={xKey} tick={{ fontSize: 12 }} stroke="#94a3b8" />
            <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
            <Tooltip />
            <Legend />
            {yKeys.map((yk, idx) => (
              <Bar
                key={yk.key}
                dataKey={yk.key}
                fill={yk.color ?? COLORS[idx % COLORS.length]}
                name={yk.label ?? yk.key}
                radius={[4, 4, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // Default: line chart
  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey={xKey} tick={{ fontSize: 12 }} stroke="#94a3b8" />
          <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
          <Tooltip />
          <Legend />
          {yKeys.map((yk, idx) => (
            <Line
              key={yk.key}
              type="monotone"
              dataKey={yk.key}
              stroke={yk.color ?? COLORS[idx % COLORS.length]}
              name={yk.label ?? yk.key}
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
