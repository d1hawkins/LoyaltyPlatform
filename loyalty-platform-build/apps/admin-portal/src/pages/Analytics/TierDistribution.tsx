import { useMemo } from 'react';
import { Chart } from '../../components/Chart';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { useTierDistribution } from '../../hooks/useAnalytics';

export function TierDistribution() {
  const { data, isLoading } = useTierDistribution();

  const chartData = useMemo(() => {
    if (!data?.tiers) return [];
    return data.tiers.map((t) => ({
      name: t.tierName,
      members: t.memberCount,
      percentage: t.percentage,
    }));
  }, [data]);

  if (isLoading) return <LoadingSpinner className="py-12" />;

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Tier Distribution</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Chart
          type="pie"
          data={chartData}
          xKey="name"
          yKeys={[{ key: 'members', label: 'Members' }]}
          height={300}
        />
        <div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 font-medium text-slate-500">Tier</th>
                <th className="text-right py-2 font-medium text-slate-500">Members</th>
                <th className="text-right py-2 font-medium text-slate-500">%</th>
              </tr>
            </thead>
            <tbody>
              {(data?.tiers ?? []).map((t) => (
                <tr key={t.tierId} className="border-b">
                  <td className="py-2 text-slate-900">{t.tierName}</td>
                  <td className="py-2 text-right text-slate-700">{t.memberCount.toLocaleString()}</td>
                  <td className="py-2 text-right text-slate-500">{t.percentage.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
