import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { StatCard } from '../components/StatCard';
import { Chart } from '../components/Chart';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { useRealtimeKpi, useAnalyticsSummary, useEnrollmentTrend } from '../hooks/useAnalytics';
import { apiClient } from '../api/client';
import { formatNumber } from '../utils/format';
import type { ProgramConfigDTO } from '../api/types';

function getLast30Days() {
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  return { from, to };
}

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function EarnModeBadge({ program }: { program: ProgramConfigDTO | undefined }) {
  if (!program) return null;

  const earnMode = (program.configJson?.earnMode as string) ?? 'per-dollar';
  const isPerVisit = earnMode === 'per-visit';

  if (isPerVisit) {
    const pointsPerVisit = (program.configJson?.pointsPerVisit as number) ?? 10;
    const minSpendCents = (program.configJson?.visitMinSpendCents as number) ?? 500;
    const maxVisitsPerDay = (program.configJson?.maxVisitsPerDay as number | null) ?? 1;
    const minSpendDisplay = `$${(minSpendCents / 100).toFixed(2)}`;
    const capLabel = maxVisitsPerDay ? `max ${maxVisitsPerDay}/day` : 'no daily cap';

    return (
      <div className="bg-violet-50 border border-violet-200 rounded-lg px-4 py-3 mb-6">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-violet-100 text-violet-800">
            Per Visit
          </span>
          <span className="text-sm text-violet-700">
            {pointsPerVisit} pts per visit (min {minSpendDisplay}, {capLabel})
          </span>
        </div>
      </div>
    );
  }

  const baseRate = program.baseEarnRate ?? 1;
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-6">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
          Per Dollar
        </span>
        <span className="text-sm text-blue-700">
          {baseRate} pt per $1 spent
        </span>
      </div>
    </div>
  );
}

function RecentActivityFeed({ program }: { program: ProgramConfigDTO | undefined }) {
  const { data, isLoading } = useQuery({
    queryKey: ['transactions', 'recent'],
    queryFn: () => apiClient.getTransactions({ limit: 10 }),
    refetchInterval: 30_000,
  });

  const earnMode = (program?.configJson?.earnMode as string) ?? 'per-dollar';
  const isPerVisit = earnMode === 'per-visit';
  const minSpendCents = (program?.configJson?.visitMinSpendCents as number) ?? 500;
  const pointsPerVisit = (program?.configJson?.pointsPerVisit as number) ?? 10;

  if (isLoading || !data?.items?.length) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Recent Activity</h2>
        {isLoading ? (
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-slate-200 rounded w-3/4" />
            <div className="h-4 bg-slate-200 rounded w-1/2" />
            <div className="h-4 bg-slate-200 rounded w-2/3" />
          </div>
        ) : (
          <p className="text-sm text-slate-500">No recent transactions yet.</p>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Recent Activity</h2>
      <div className="space-y-2">
        {data.items.map((txn) => {
          const amountCents = txn.amount ?? 0;
          const qualified = isPerVisit ? amountCents >= minSpendCents : true;
          const ptsDisplay = isPerVisit
            ? (qualified ? pointsPerVisit : 0)
            : (txn.pointsEarned ?? 0);

          return (
            <div
              key={txn.transactionId}
              className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0"
            >
              <div className="flex items-center gap-3">
                {isPerVisit ? (
                  qualified ? (
                    <span className="text-emerald-500 text-sm font-medium" title="Qualified visit">&#10003;</span>
                  ) : (
                    <span className="text-slate-400 text-sm font-medium" title="Below minimum">&#10007;</span>
                  )
                ) : (
                  <span className="text-emerald-500 text-sm font-medium">&#10003;</span>
                )}
                <div>
                  <span className="text-sm text-slate-900">
                    ${(amountCents / 100).toFixed(2)}
                  </span>
                  <span className="text-xs text-slate-400 ml-2">
                    {txn.channel}
                  </span>
                </div>
              </div>
              <div className="text-right">
                {isPerVisit ? (
                  qualified ? (
                    <span className="text-sm font-medium text-emerald-600">
                      Qualified visit — {ptsDisplay} pts
                    </span>
                  ) : (
                    <span className="text-sm text-slate-400">
                      Below minimum — 0 pts
                    </span>
                  )
                ) : (
                  <span className="text-sm font-medium text-emerald-600">
                    +{ptsDisplay} pts
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Dashboard() {
  const { from, to } = useMemo(getLast30Days, []);
  const today = useMemo(getToday, []);
  const kpi = useRealtimeKpi();
  const summary = useAnalyticsSummary(from, to);
  const enrollment = useEnrollmentTrend(from, to, 'day');

  const program = useQuery({
    queryKey: ['program'],
    queryFn: () => apiClient.getProgram(),
  });

  const visitAnalytics = useQuery({
    queryKey: ['reports', 'visit-analytics', today, today],
    queryFn: () => apiClient.getVisitAnalytics(today, today),
  });

  const kpiData = kpi.data;
  const derived = summary.data?.derived;
  const programData = program.data;
  const earnMode = (programData?.configJson?.earnMode as string) ?? 'per-dollar';
  const isPerVisit = earnMode === 'per-visit';

  const enrollmentChartData = useMemo(() => {
    const items = enrollment.data?.data ?? enrollment.data?.trend ?? [];
    if (!items.length) return [];
    return items.map((d: Record<string, unknown>) => ({
      name: d.period,
      enrollments: d.total ?? d.enrollments ?? 0,
    }));
  }, [enrollment.data]);

  if (kpi.isLoading && summary.isLoading) {
    return <LoadingSpinner className="py-20" size="lg" />;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Dashboard</h1>

      {/* Earn Mode Badge */}
      <EarnModeBadge program={programData} />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Active Members Today"
          value={formatNumber(kpiData?.activeMembersToday ?? 0)}
          trend={derived ? { value: derived.activeRate * 100, direction: derived.activeRate > 0.5 ? 'up' : 'down' } : undefined}
        />
        <StatCard
          label="Transactions Today"
          value={formatNumber(kpiData?.transactionsToday ?? 0)}
        />
        <StatCard
          label="Points Issued Today"
          value={formatNumber(kpiData?.pointsIssuedToday ?? 0)}
        />
        <StatCard
          label="Redemptions Today"
          value={formatNumber(kpiData?.redemptionsToday ?? 0)}
          trend={derived ? { value: derived.redemptionRate * 100, direction: derived.redemptionRate > 0.1 ? 'up' : 'flat' } : undefined}
        />
      </div>

      {/* Visit-specific KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <StatCard
          label="Qualified Visits Today"
          value={formatNumber(visitAnalytics.data?.qualifiedVisits ?? 0)}
        />
        <StatCard
          label="Visit Conversion Rate"
          value={`${((visitAnalytics.data?.visitConversionRate ?? 0) * 100).toFixed(1)}%`}
          trend={visitAnalytics.data ? {
            value: visitAnalytics.data.visitConversionRate * 100,
            direction: visitAnalytics.data.visitConversionRate > 0.7 ? 'up' : visitAnalytics.data.visitConversionRate > 0.4 ? 'flat' : 'down',
          } : undefined}
        />
        <StatCard
          label={isPerVisit ? 'Points per Visit (flat rate)' : 'Avg Points per Transaction'}
          value={
            isPerVisit
              ? formatNumber((programData?.configJson?.pointsPerVisit as number) ?? 10)
              : formatNumber(Math.round(derived?.pointsPerTransaction ?? 0))
          }
        />
      </div>

      {/* Derived KPIs */}
      {derived && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            label="Avg Transaction Value"
            value={`$${(derived.avgTransactionValue / 100).toFixed(2)}`}
          />
          <StatCard
            label="Points per Transaction"
            value={formatNumber(Math.round(derived.pointsPerTransaction))}
          />
          <StatCard
            label="Redemption Rate"
            value={`${(derived.redemptionRate * 100).toFixed(1)}%`}
          />
          <StatCard
            label="Enrollment Growth"
            value={`${(derived.enrollmentGrowthRate * 100).toFixed(1)}%`}
            trend={{ value: derived.enrollmentGrowthRate * 100, direction: derived.enrollmentGrowthRate > 0 ? 'up' : 'down' }}
          />
        </div>
      )}

      {/* Enrollment Trend Chart */}
      <div className="bg-white rounded-lg border border-slate-200 p-6 mb-8">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Enrollment Trend (Last 30 Days)</h2>
        <Chart
          type="line"
          data={enrollmentChartData}
          xKey="name"
          yKeys={[{ key: 'enrollments', label: 'New Enrollments', color: '#3b82f6' }]}
          height={300}
        />
      </div>

      {/* Recent Activity with qualification status */}
      <RecentActivityFeed program={programData} />
    </div>
  );
}
