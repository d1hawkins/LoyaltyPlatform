import { useState, useMemo } from 'react';
import { StatCard } from '../../components/StatCard';
import { Chart } from '../../components/Chart';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { usePointsEconomy } from '../../hooks/useAnalytics';
import { formatNumber } from '../../utils/format';

export function PointsEconomy() {
  const [range, setRange] = useState(30);
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - range * 86400000).toISOString().slice(0, 10);

  const { data, isLoading } = usePointsEconomy(from, to);

  const chartData = useMemo(() => {
    if (!data) return [];
    return [
      { name: 'Issued', value: data.pointsIssued ?? data.totalIssued ?? 0 },
      { name: 'Redeemed', value: data.pointsRedeemed ?? data.totalRedeemed ?? 0 },
      { name: 'Expired', value: data.pointsExpired ?? data.totalExpired ?? 0 },
    ];
  }, [data]);

  if (isLoading) return <LoadingSpinner className="py-12" />;

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-900">Points Economy</h2>
        <select value={range} onChange={(e) => setRange(Number(e.target.value))} className="px-2 py-1 text-sm border border-slate-300 rounded">
          <option value={7}>7 days</option>
          <option value={30}>30 days</option>
          <option value={90}>90 days</option>
        </select>
      </div>

      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard label="Points Issued" value={formatNumber(data.pointsIssued ?? data.totalIssued ?? 0)} />
            <StatCard label="Points Redeemed" value={formatNumber(data.pointsRedeemed ?? data.totalRedeemed ?? 0)} />
            <StatCard label="Points Expired" value={formatNumber(data.pointsExpired ?? data.totalExpired ?? 0)} />
            <StatCard label="Net Outstanding" value={formatNumber(data.netOutstanding)} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Chart
              type="bar"
              data={chartData}
              xKey="name"
              yKeys={[{ key: 'value', label: 'Points' }]}
              height={250}
            />
            <div className="flex flex-col justify-center">
              <div className="text-sm text-slate-500 mb-1">Estimated Liability</div>
              <div className="text-3xl font-bold text-slate-900">${((data.liabilityEstimate ?? 0) / 100).toLocaleString()}</div>
              <p className="text-xs text-slate-400 mt-2">
                Based on outstanding points at average redemption value.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
