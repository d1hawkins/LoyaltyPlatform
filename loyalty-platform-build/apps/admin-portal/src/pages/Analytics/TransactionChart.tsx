import { useState, useMemo } from 'react';
import { Chart } from '../../components/Chart';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { useTransactionTrend } from '../../hooks/useAnalytics';

export function TransactionChart() {
  const [range, setRange] = useState(30);
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day');

  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - range * 86400000).toISOString().slice(0, 10);

  const { data, isLoading } = useTransactionTrend(from, to, groupBy);

  const chartData = useMemo(() => {
    const items = data?.data ?? data?.trend ?? [];
    if (!items.length) return [];
    return items.map((d: Record<string, unknown>) => ({
      name: d.period,
      transactions: d.totalTransactions ?? d.count ?? 0,
      spend: ((d.totalSpend ?? d.totalSpendCents ?? 0) as number) / 100,
      avgBasket: ((d.avgBasket ?? d.avgBasketCents ?? 0) as number) / 100,
    }));
  }, [data]);

  if (isLoading) return <LoadingSpinner className="py-12" />;

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-900">Transaction Volume</h2>
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
        type="line"
        data={chartData}
        xKey="name"
        yKeys={[
          { key: 'transactions', label: 'Transactions', color: '#3b82f6' },
          { key: 'avgBasket', label: 'Avg Basket ($)', color: '#10b981' },
        ]}
        height={350}
      />
    </div>
  );
}
