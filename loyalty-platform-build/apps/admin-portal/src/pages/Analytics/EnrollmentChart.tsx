import { useState, useMemo } from 'react';
import { Chart } from '../../components/Chart';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { useEnrollmentTrend } from '../../hooks/useAnalytics';

export function EnrollmentChart() {
  const [range, setRange] = useState(30);
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day');

  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - range * 86400000).toISOString().slice(0, 10);

  const { data, isLoading } = useEnrollmentTrend(from, to, groupBy);

  const chartData = useMemo(() => {
    const items = data?.data ?? data?.trend ?? [];
    if (!items.length) return [];
    return items.map((d: Record<string, unknown>) => ({
      name: d.period,
      total: d.total ?? d.enrollments ?? 0,
      ...(d.channels as Record<string, number> ?? {}),
    }));
  }, [data]);

  const channelKeys = useMemo(() => {
    const items = data?.data ?? data?.trend ?? [];
    if (!items.length) return [];
    const channels = new Set<string>();
    items.forEach((d: Record<string, unknown>) => {
      if (d.channels) Object.keys(d.channels as Record<string, unknown>).forEach((k) => channels.add(k));
    });
    return Array.from(channels);
  }, [data]);

  if (isLoading) return <LoadingSpinner className="py-12" />;

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-900">Enrollment Trend</h2>
        <div className="flex gap-2">
          <select value={range} onChange={(e) => setRange(Number(e.target.value))} className="px-2 py-1 text-sm border border-slate-300 rounded">
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
          </select>
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as 'day' | 'week' | 'month')} className="px-2 py-1 text-sm border border-slate-300 rounded">
            <option value="day">Daily</option>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
          </select>
        </div>
      </div>
      <Chart
        type="bar"
        data={chartData}
        xKey="name"
        yKeys={[
          { key: 'total', label: 'Total Enrollments', color: '#3b82f6' },
          ...channelKeys.map((k) => ({ key: k, label: k })),
        ]}
        height={350}
      />
    </div>
  );
}
