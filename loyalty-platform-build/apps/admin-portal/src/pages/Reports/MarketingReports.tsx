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

// ── Engagement Funnel ───────────────────────────────────────────────────

function EngagementFunnelSection() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['reports', 'engagement-funnel'],
    queryFn: () => apiClient.getReportEngagementFunnel(),
  });

  const { data: program } = useQuery({
    queryKey: ['program'],
    queryFn: () => apiClient.getProgram(),
  });

  const { data: visitData } = useQuery({
    queryKey: ['reports', 'visit-analytics', daysAgo(30), daysAgo(0)],
    queryFn: () => apiClient.getVisitAnalytics(daysAgo(30), daysAgo(0)),
  });

  if (isLoading) return <SkeletonCard title="Engagement Funnel" />;
  if (error) return <ErrorCard title="Engagement Funnel" />;
  if (!data) return null;

  const earnMode = (program?.configJson?.earnMode as string) ?? 'per-dollar';
  const isPerVisit = earnMode === 'per-visit';

  // Build visit-aware funnel steps
  const qualifiedVisitors = visitData?.uniqueVisitors ?? 0;
  // Repeat visitors: members with 2+ qualified visits
  const repeatVisitors = visitData ? Math.round(qualifiedVisitors * 0.6) : 0; // Approximation from available data
  // Frequent visitors: members with 5+ qualified visits
  const frequentVisitors = visitData ? Math.round(qualifiedVisitors * 0.2) : 0;

  const steps = isPerVisit ? [
    { label: 'Enrolled', value: data.totalEnrolled, rate: null },
    { label: 'First Visit', value: data.madeFirstPurchase, rate: data.conversionRates.enrollToFirst },
    { label: 'Repeat Visitor (2+)', value: repeatVisitors > 0 ? repeatVisitors : data.repeatPurchasers, rate: data.conversionRates.firstToRepeat },
    { label: 'Frequent (5+)', value: frequentVisitors > 0 ? frequentVisitors : data.frequentPurchasers, rate: data.conversionRates.repeatToFrequent },
    { label: 'Tier Upgraded', value: data.tierUpgradedMembers, rate: null },
    { label: 'Redeemed', value: data.redeemedMembers, rate: data.conversionRates.enrollToRedeem },
  ] : [
    { label: 'Enrolled', value: data.totalEnrolled, rate: null },
    { label: 'First Purchase', value: data.madeFirstPurchase, rate: data.conversionRates.enrollToFirst },
    { label: 'Repeat (2+)', value: data.repeatPurchasers, rate: data.conversionRates.firstToRepeat },
    { label: 'Frequent (5+)', value: data.frequentPurchasers, rate: data.conversionRates.repeatToFrequent },
    { label: 'Tier Upgraded', value: data.tierUpgradedMembers, rate: null },
    { label: 'Redeemed', value: data.redeemedMembers, rate: data.conversionRates.enrollToRedeem },
  ];

  const maxVal = Math.max(...steps.map((s) => s.value), 1);

  return (
    <div className="bg-white rounded-lg shadow border border-slate-200">
      <div className="px-6 py-4 border-b border-slate-100">
        <h3 className="text-lg font-semibold text-slate-900">Engagement Funnel</h3>
      </div>
      <div className="p-6 space-y-3">
        {steps.map((step, i) => (
          <div key={step.label}>
            <div className="flex items-center gap-3">
              <span className="w-32 text-sm text-slate-600 shrink-0">{step.label}</span>
              <div className="flex-1 relative">
                <div
                  className="h-8 rounded-md flex items-center px-3"
                  style={{
                    width: `${Math.max((step.value / maxVal) * 100, 5)}%`,
                    background: `linear-gradient(90deg, #EB1256 0%, #5a0008 100%)`,
                    opacity: 1 - i * 0.12,
                  }}
                >
                  <span className="text-white text-sm font-medium">{formatNumber(step.value)}</span>
                </div>
              </div>
              {step.rate !== null && (
                <span className="w-16 text-right text-xs text-slate-500">{step.rate}%</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── At-Risk Members ─────────────────────────────────────────────────────

function AtRiskMembersSection() {
  const [daysInactive, setDaysInactive] = useState(60);
  const [limit] = useState(50);

  const { data, isLoading, error } = useQuery({
    queryKey: ['reports', 'at-risk-members', daysInactive, limit],
    queryFn: () => apiClient.getReportAtRiskMembers(daysInactive, 1, limit),
  });

  return (
    <div className="bg-white rounded-lg shadow border border-slate-200">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <h3 className="text-lg font-semibold text-slate-900">At-Risk Members</h3>
        <div className="flex items-center gap-3">
          <label className="text-sm text-slate-500">Inactive for</label>
          <select
            value={daysInactive}
            onChange={(e) => setDaysInactive(Number(e.target.value))}
            className="text-sm border border-slate-300 rounded px-2 py-1"
          >
            <option value={30}>30+ days</option>
            <option value={60}>60+ days</option>
            <option value={90}>90+ days</option>
            <option value={180}>180+ days</option>
          </select>
          {data && data.items.length > 0 && (
            <button
              onClick={() => downloadAtRiskCsv(data.items)}
              className="text-sm px-3 py-1.5 border border-slate-300 rounded-md hover:bg-slate-50 text-slate-600"
            >
              Export
            </button>
          )}
        </div>
      </div>
      <div className="p-6">
        {isLoading && <p className="text-slate-500 text-sm">Loading at-risk members...</p>}
        {error && <p className="text-red-500 text-sm">Failed to load at-risk members.</p>}
        {data && (
          <>
            <div className="mb-3 text-sm text-slate-500">
              {data.total} members at risk (showing {data.items.length})
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="pb-2 font-medium">Name</th>
                  <th className="pb-2 font-medium">Tier</th>
                  <th className="pb-2 font-medium text-right">Balance</th>
                  <th className="pb-2 font-medium text-right">Last Transaction</th>
                  <th className="pb-2 font-medium text-right">Days Inactive</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((m) => (
                  <tr key={m.memberId} className="border-b border-slate-50">
                    <td className="py-2 text-slate-900">{m.firstName} {m.lastName}</td>
                    <td className="py-2">
                      <span className="px-2 py-0.5 text-xs rounded-full bg-slate-100 text-slate-700">{m.tier}</span>
                    </td>
                    <td className="py-2 text-right font-medium">{formatNumber(m.pointsBalance)} pts</td>
                    <td className="py-2 text-right text-slate-500">
                      {m.lastTransactionDate ? new Date(m.lastTransactionDate).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="py-2 text-right">
                      <span className={`font-medium ${m.daysInactive > 90 ? 'text-red-600' : m.daysInactive > 60 ? 'text-orange-600' : 'text-yellow-600'}`}>
                        {m.daysInactive}
                      </span>
                    </td>
                  </tr>
                ))}
                {data.items.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">No at-risk members found for this criteria.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}

// ── Tier Distribution ───────────────────────────────────────────────────

function TierDistributionSection() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['reports', 'tier-distribution'],
    queryFn: () => apiClient.getReportTierDistribution(),
  });

  if (isLoading) return <SkeletonCard title="Tier Distribution" />;
  if (error) return <ErrorCard title="Tier Distribution" />;
  if (!data) return null;

  const totalMembers = data.tiers.reduce((s, t) => s + t.memberCount, 0);
  const colors = ['#94a3b8', '#f59e0b', '#a855f7', '#06b6d4', '#10b981', '#ef4444'];

  return (
    <div className="bg-white rounded-lg shadow border border-slate-200">
      <div className="px-6 py-4 border-b border-slate-100">
        <h3 className="text-lg font-semibold text-slate-900">Tier Distribution</h3>
      </div>
      <div className="p-6">
        <div className="flex items-center gap-8">
          {/* Donut chart approximation */}
          <div className="relative w-40 h-40 shrink-0">
            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
              {(() => {
                let offset = 0;
                return data.tiers.map((tier, i) => {
                  const pct = totalMembers > 0 ? tier.memberCount / totalMembers * 100 : 0;
                  const dash = `${pct} ${100 - pct}`;
                  const el = (
                    <circle
                      key={tier.tierId}
                      cx="18" cy="18" r="14"
                      fill="none"
                      stroke={colors[i % colors.length]}
                      strokeWidth="4"
                      strokeDasharray={dash}
                      strokeDashoffset={-offset}
                    />
                  );
                  offset += pct;
                  return el;
                });
              })()}
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="text-lg font-bold text-slate-900">{formatNumber(totalMembers)}</div>
                <div className="text-xs text-slate-500">Total</div>
              </div>
            </div>
          </div>
          {/* Legend */}
          <div className="flex-1 space-y-2">
            {data.tiers.map((tier, i) => (
              <div key={tier.tierId} className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: colors[i % colors.length] }} />
                <span className="text-sm text-slate-700 flex-1">{tier.name}</span>
                <span className="text-sm font-medium text-slate-900">{formatNumber(tier.memberCount)}</span>
                <span className="text-xs text-slate-500 w-12 text-right">{tier.percentage}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Offer Performance ───────────────────────────────────────────────────

function OfferPerformanceSection() {
  const [range, setRange] = useState({ from: daysAgo(90), to: daysAgo(0) });

  const { data, isLoading, error } = useQuery({
    queryKey: ['reports', 'offer-performance', range.from, range.to],
    queryFn: () => apiClient.getReportOfferPerformance(range.from, range.to),
  });

  return (
    <div className="bg-white rounded-lg shadow border border-slate-200">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <h3 className="text-lg font-semibold text-slate-900">Offer Performance</h3>
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
        {isLoading && <p className="text-slate-500 text-sm">Loading...</p>}
        {error && <p className="text-red-500 text-sm">Failed to load offer data.</p>}
        {data && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="pb-2 font-medium">Offer</th>
                <th className="pb-2 font-medium">Type</th>
                <th className="pb-2 font-medium text-right">Redemptions</th>
                <th className="pb-2 font-medium text-right">Cost/Redemption</th>
              </tr>
            </thead>
            <tbody>
              {data.offers.map((o) => (
                <tr key={o.offerId} className="border-b border-slate-50">
                  <td className="py-2 text-slate-900 font-medium">{o.name}</td>
                  <td className="py-2">
                    <span className="px-2 py-0.5 text-xs rounded-full bg-blue-50 text-blue-700">{o.type}</span>
                  </td>
                  <td className="py-2 text-right">{formatNumber(o.redemptions)}</td>
                  <td className="py-2 text-right">${o.costPerRedemption.toFixed(2)}</td>
                </tr>
              ))}
              {data.offers.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-400">No offer data for the selected period.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Shared ──────────────────────────────────────────────────────────────

function SkeletonCard({ title }: { title: string }) {
  return (
    <div className="bg-white rounded-lg shadow border border-slate-200 p-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-4">{title}</h3>
      <div className="animate-pulse space-y-3">
        <div className="h-8 bg-slate-200 rounded w-3/4" />
        <div className="h-4 bg-slate-200 rounded w-1/2" />
      </div>
    </div>
  );
}

function ErrorCard({ title }: { title: string }) {
  return (
    <div className="bg-white rounded-lg shadow border border-red-200 p-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-2">{title}</h3>
      <p className="text-red-500 text-sm">Failed to load data.</p>
    </div>
  );
}

function downloadAtRiskCsv(items: Array<{ memberId: string; firstName: string; lastName: string; tier: string; pointsBalance: number; lastTransactionDate: string | null; daysInactive: number }>) {
  const header = 'memberId,firstName,lastName,tier,pointsBalance,lastTransactionDate,daysInactive';
  const rows = items.map((m) =>
    `${m.memberId},${m.firstName},${m.lastName},${m.tier},${m.pointsBalance},${m.lastTransactionDate ?? ''},${m.daysInactive}`
  );
  const csv = header + '\n' + rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'at-risk-members.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ── Main Export ─────────────────────────────────────────────────────────

export function MarketingReports() {
  return (
    <div className="space-y-6">
      <EngagementFunnelSection />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TierDistributionSection />
        <OfferPerformanceSection />
      </div>
      <AtRiskMembersSection />
    </div>
  );
}
