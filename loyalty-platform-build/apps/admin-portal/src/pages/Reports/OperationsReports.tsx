import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// ── Program Health Overview ─────────────────────────────────────────────

function ProgramHealthSection() {
  const { data: liability } = useQuery({
    queryKey: ['reports', 'liability'],
    queryFn: () => apiClient.getReportLiability(),
  });

  const { data: funnel } = useQuery({
    queryKey: ['reports', 'engagement-funnel'],
    queryFn: () => apiClient.getReportEngagementFunnel(),
  });

  const { data: tierDist } = useQuery({
    queryKey: ['reports', 'tier-distribution'],
    queryFn: () => apiClient.getReportTierDistribution(),
  });

  return (
    <div className="bg-white rounded-lg shadow border border-slate-200">
      <div className="px-6 py-4 border-b border-slate-100">
        <h3 className="text-lg font-semibold text-slate-900">Program Health Summary</h3>
      </div>
      <div className="p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <HealthMetric
            label="Active Members"
            value={liability ? formatNumber(liability.activeMembers) : '-'}
            status="good"
          />
          <HealthMetric
            label="Enroll-to-Purchase"
            value={funnel ? `${funnel.conversionRates.enrollToFirst}%` : '-'}
            status={funnel && funnel.conversionRates.enrollToFirst > 50 ? 'good' : funnel && funnel.conversionRates.enrollToFirst > 25 ? 'warning' : 'alert'}
          />
          <HealthMetric
            label="Redemption Rate"
            value={funnel ? `${funnel.conversionRates.enrollToRedeem}%` : '-'}
            status={funnel && funnel.conversionRates.enrollToRedeem > 15 ? 'good' : 'warning'}
          />
          <HealthMetric
            label="Tier Coverage"
            value={tierDist ? `${tierDist.tiers.length} tiers` : '-'}
            status="good"
          />
        </div>
      </div>
    </div>
  );
}

function HealthMetric({ label, value, status }: { label: string; value: string; status: 'good' | 'warning' | 'alert' }) {
  const colors = {
    good: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    warning: 'text-orange-600 bg-orange-50 border-orange-200',
    alert: 'text-red-600 bg-red-50 border-red-200',
  };

  return (
    <div className={`rounded-lg border p-4 ${colors[status]}`}>
      <div className="text-xs font-medium opacity-75 mb-1">{label}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
}

// ── Points Flow Summary (Operations view) ───────────────────────────────

function PointsFlowSummary() {
  const [range] = useState({ from: daysAgo(30), to: daysAgo(0) });

  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'points-flow', range.from, range.to, 'month'],
    queryFn: () => apiClient.getReportPointsFlow(range.from, range.to, 'month'),
  });

  if (isLoading || !data) {
    return (
      <div className="bg-white rounded-lg shadow border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Points Flow (Last 30 Days)</h3>
        <div className="animate-pulse h-16 bg-slate-200 rounded" />
      </div>
    );
  }

  const totalIssued = data.periods.reduce((s, p) => s + p.pointsIssued, 0);
  const totalRedeemed = data.periods.reduce((s, p) => s + p.pointsRedeemed, 0);
  const totalExpired = data.periods.reduce((s, p) => s + p.pointsExpired, 0);
  const netChange = data.periods.reduce((s, p) => s + p.netChange, 0);

  return (
    <div className="bg-white rounded-lg shadow border border-slate-200">
      <div className="px-6 py-4 border-b border-slate-100">
        <h3 className="text-lg font-semibold text-slate-900">Points Flow (Last 30 Days)</h3>
      </div>
      <div className="p-6">
        <div className="grid grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-sm text-slate-500 mb-1">Issued</div>
            <div className="text-lg font-bold text-emerald-600">{formatNumber(totalIssued)}</div>
          </div>
          <div className="text-center">
            <div className="text-sm text-slate-500 mb-1">Redeemed</div>
            <div className="text-lg font-bold text-blue-600">{formatNumber(totalRedeemed)}</div>
          </div>
          <div className="text-center">
            <div className="text-sm text-slate-500 mb-1">Expired</div>
            <div className="text-lg font-bold text-orange-600">{formatNumber(totalExpired)}</div>
          </div>
          <div className="text-center">
            <div className="text-sm text-slate-500 mb-1">Net Change</div>
            <div className={`text-lg font-bold ${netChange >= 0 ? 'text-slate-900' : 'text-red-600'}`}>
              {netChange >= 0 ? '+' : ''}{formatNumber(netChange)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Revenue Summary (Operations view) ───────────────────────────────────

function RevenueSummary() {
  const [range] = useState({ from: daysAgo(30), to: daysAgo(0) });

  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'revenue-attribution', range.from, range.to],
    queryFn: () => apiClient.getReportRevenueAttribution(range.from, range.to),
  });

  if (isLoading || !data) {
    return (
      <div className="bg-white rounded-lg shadow border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Revenue (Last 30 Days)</h3>
        <div className="animate-pulse h-16 bg-slate-200 rounded" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow border border-slate-200">
      <div className="px-6 py-4 border-b border-slate-100">
        <h3 className="text-lg font-semibold text-slate-900">Revenue (Last 30 Days)</h3>
      </div>
      <div className="p-6">
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-sm text-slate-500 mb-1">Total Revenue</div>
            <div className="text-lg font-bold text-slate-900">${(data.summary.totalRevenue / 100).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
          </div>
          <div className="text-center">
            <div className="text-sm text-slate-500 mb-1">Avg Basket</div>
            <div className="text-lg font-bold text-slate-900">${(data.summary.avgBasketOverall / 100).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
          </div>
          <div className="text-center">
            <div className="text-sm text-slate-500 mb-1">Revenue/Member</div>
            <div className="text-lg font-bold text-slate-900">${(data.summary.revenuePerMember / 100).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Visit Analytics Section ──────────────────────────────────────────────

function VisitAnalyticsSection() {
  const [range, setRange] = useState({ from: daysAgo(30), to: daysAgo(0) });

  const { data: program } = useQuery({
    queryKey: ['program'],
    queryFn: () => apiClient.getProgram(),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'visit-analytics', range.from, range.to],
    queryFn: () => apiClient.getVisitAnalytics(range.from, range.to),
  });

  const earnMode = (program?.configJson?.earnMode as string) ?? 'per-dollar';
  const isPerVisit = earnMode === 'per-visit';
  const minSpendCents = (program?.configJson?.visitMinSpendCents as number) ?? 500;

  if (isLoading || !data) {
    return (
      <div className="bg-white rounded-lg shadow border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Visit Analytics (Last 30 Days)</h3>
        <div className="animate-pulse h-16 bg-slate-200 rounded" />
      </div>
    );
  }

  const unqualifiedPct = data.totalTransactions > 0
    ? ((data.unqualifiedTransactions / data.totalTransactions) * 100).toFixed(1)
    : '0.0';

  return (
    <div className="bg-white rounded-lg shadow border border-slate-200">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <h3 className="text-lg font-semibold text-slate-900">Visit Analytics</h3>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={range.from}
            onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
            className="text-sm border border-slate-300 rounded px-2 py-1"
          />
          <span className="text-slate-400">to</span>
          <input
            type="date"
            value={range.to}
            onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            className="text-sm border border-slate-300 rounded px-2 py-1"
          />
        </div>
      </div>
      <div className="p-6">
        {/* Earn Mode context */}
        {isPerVisit && (
          <div className="bg-violet-50 border border-violet-100 rounded px-3 py-2 mb-4 text-xs text-violet-700">
            Per-visit mode active — min spend ${(minSpendCents / 100).toFixed(2)}
          </div>
        )}

        {/* Visit Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="text-center">
            <div className="text-sm text-slate-500 mb-1">Qualified Visits</div>
            <div className="text-lg font-bold text-emerald-600">{formatNumber(data.qualifiedVisits)}</div>
          </div>
          <div className="text-center">
            <div className="text-sm text-slate-500 mb-1">Visit Conversion</div>
            <div className="text-lg font-bold text-blue-600">{(data.visitConversionRate * 100).toFixed(1)}%</div>
          </div>
          <div className="text-center">
            <div className="text-sm text-slate-500 mb-1">Unique Visitors</div>
            <div className="text-lg font-bold text-slate-900">{formatNumber(data.uniqueVisitors)}</div>
          </div>
          <div className="text-center">
            <div className="text-sm text-slate-500 mb-1">Avg Spend/Visit</div>
            <div className="text-lg font-bold text-slate-900">${(data.avgSpendPerVisit / 100).toFixed(2)}</div>
          </div>
        </div>

        {/* Visit Trend - Bar chart */}
        {data.dailyBreakdown.length > 0 && (
          <div className="mb-6">
            <h4 className="text-sm font-medium text-slate-700 mb-3">Daily Qualified Visits</h4>
            <div className="space-y-1.5">
              {data.dailyBreakdown.map((d) => {
                const maxVisits = Math.max(...data.dailyBreakdown.map((x) => x.qualifiedVisits), 1);
                const convRate = d.transactions > 0 ? (d.qualifiedVisits / d.transactions * 100).toFixed(0) : '0';
                return (
                  <div key={d.date} className="flex items-center gap-3 text-xs">
                    <span className="w-20 text-slate-500 shrink-0">{d.date.slice(5)}</span>
                    <div className="flex-1 relative">
                      <div
                        className="h-5 bg-emerald-400 rounded-sm flex items-center px-2"
                        style={{ width: `${Math.max((d.qualifiedVisits / maxVisits) * 100, 3)}%` }}
                      >
                        <span className="text-white text-xs font-medium">{d.qualifiedVisits}</span>
                      </div>
                    </div>
                    <span className="w-12 text-right text-slate-400">{convRate}%</span>
                    <span className="w-14 text-right font-medium text-slate-700">{d.pointsAwarded} pts</span>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-4 text-xs text-slate-500 mt-2">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-sm bg-emerald-400 inline-block" /> Qualified Visits
              </span>
              <span>% = conversion rate</span>
            </div>
          </div>
        )}

        {/* Unqualified Transactions insight */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <span className="text-amber-500 text-lg">!</span>
            <div>
              <div className="text-sm font-medium text-amber-800">Unqualified Transactions</div>
              <div className="text-sm text-amber-700 mt-1">
                {formatNumber(data.unqualifiedTransactions)} transactions ({unqualifiedPct}%) were below the
                ${(minSpendCents / 100).toFixed(2)} minimum spend threshold.
                {parseFloat(unqualifiedPct) > 30 && (
                  <span className="font-medium"> Consider lowering the minimum spend to improve qualification rate.</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Export ─────────────────────────────────────────────────────────

export function OperationsReports() {
  return (
    <div className="space-y-6">
      <ProgramHealthSection />
      <VisitAnalyticsSection />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PointsFlowSummary />
        <RevenueSummary />
      </div>
    </div>
  );
}
