import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import type { ProgramConfigDTO } from '../../api/types';

function formatUsd(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatUsdDollars(dollars: number): string {
  return `$${dollars.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

// ── Date helpers ────────────────────────────────────────────────────────

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// ── Points Liability Card ───────────────────────────────────────────────

function LiabilityCard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['reports', 'liability'],
    queryFn: () => apiClient.getReportLiability(),
  });

  if (isLoading) return <CardSkeleton title="Points Liability Report" />;
  if (error) return <CardError title="Points Liability Report" />;
  if (!data) return null;

  return (
    <div className="bg-white rounded-lg shadow border border-slate-200">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <h3 className="text-lg font-semibold text-slate-900">Points Liability Report</h3>
        <button
          onClick={() => downloadCsv('liability', data)}
          className="text-sm px-3 py-1.5 border border-slate-300 rounded-md hover:bg-slate-50 text-slate-600"
        >
          Export CSV
        </button>
      </div>
      <div className="p-6">
        <div className="grid grid-cols-3 gap-8 mb-6">
          <MetricBlock label="Outstanding Points" value={formatNumber(data.totalOutstandingPoints) + ' pts'} />
          <MetricBlock label="Gross Liability" value={formatUsd(data.estimatedLiabilityUsd)} />
          <MetricBlock label="Net Liability" value={formatUsd(data.netLiabilityUsd)} highlight />
        </div>
        <div className="grid grid-cols-4 gap-4 text-sm text-slate-600">
          <div>Breakage Rate: <span className="font-medium text-slate-900">{(data.breakageRate * 100).toFixed(0)}%</span></div>
          <div>Active Members: <span className="font-medium text-slate-900">{formatNumber(data.activeMembers)}</span></div>
          <div>Cost Per Point: <span className="font-medium text-slate-900">{formatUsd(data.costPerPoint)}</span></div>
          <div>As of: <span className="font-medium text-slate-900">{data.reportDate}</span></div>
        </div>
      </div>
    </div>
  );
}

// ── Points Flow ─────────────────────────────────────────────────────────

function EarnModeContextBanner({ program }: { program: ProgramConfigDTO | undefined }) {
  if (!program) return null;
  const earnMode = (program.configJson?.earnMode as string) ?? 'per-dollar';
  const isPerVisit = earnMode === 'per-visit';

  if (isPerVisit) {
    const pointsPerVisit = (program.configJson?.pointsPerVisit as number) ?? 10;
    return (
      <div className="bg-violet-50 border border-violet-100 rounded px-3 py-2 mb-4 text-xs text-violet-700">
        Points issued via per-visit mode ({pointsPerVisit} pts/visit)
      </div>
    );
  }

  return (
    <div className="bg-blue-50 border border-blue-100 rounded px-3 py-2 mb-4 text-xs text-blue-700">
      Points issued via per-dollar mode ({program.baseEarnRate ?? 1} pt per $1 spent)
    </div>
  );
}

function PointsFlowSection() {
  const [range, setRange] = useState({ from: daysAgo(30), to: daysAgo(0) });
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day');

  const { data, isLoading, error } = useQuery({
    queryKey: ['reports', 'points-flow', range.from, range.to, groupBy],
    queryFn: () => apiClient.getReportPointsFlow(range.from, range.to, groupBy),
  });

  const { data: program } = useQuery({
    queryKey: ['program'],
    queryFn: () => apiClient.getProgram(),
  });

  return (
    <div className="bg-white rounded-lg shadow border border-slate-200">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <h3 className="text-lg font-semibold text-slate-900">Points Flow</h3>
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
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as 'day' | 'week' | 'month')}
            className="text-sm border border-slate-300 rounded px-2 py-1"
          >
            <option value="day">Daily</option>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
          </select>
        </div>
      </div>
      <div className="p-6">
        <EarnModeContextBanner program={program} />
        {isLoading && <p className="text-slate-500 text-sm">Loading points flow data...</p>}
        {error && <p className="text-red-500 text-sm">Failed to load points flow data.</p>}
        {data && data.periods.length === 0 && <p className="text-slate-500 text-sm">No data for the selected period.</p>}
        {data && data.periods.length > 0 && (
          <>
            {/* Simple bar visualization */}
            <div className="space-y-2 mb-4">
              {data.periods.map((p) => {
                const max = Math.max(...data.periods.map((x) => Math.max(x.pointsIssued, x.pointsRedeemed, 1)));
                return (
                  <div key={p.date} className="flex items-center gap-3 text-xs">
                    <span className="w-20 text-slate-500 shrink-0">{p.date.slice(5)}</span>
                    <div className="flex-1 flex gap-1">
                      <div
                        className="h-4 bg-emerald-400 rounded-sm"
                        style={{ width: `${(p.pointsIssued / max) * 100}%` }}
                        title={`Issued: ${formatNumber(p.pointsIssued)}`}
                      />
                      <div
                        className="h-4 bg-blue-400 rounded-sm"
                        style={{ width: `${(p.pointsRedeemed / max) * 100}%` }}
                        title={`Redeemed: ${formatNumber(p.pointsRedeemed)}`}
                      />
                      {p.pointsExpired > 0 && (
                        <div
                          className="h-4 bg-orange-400 rounded-sm"
                          style={{ width: `${(p.pointsExpired / max) * 100}%` }}
                          title={`Expired: ${formatNumber(p.pointsExpired)}`}
                        />
                      )}
                    </div>
                    <span className="w-16 text-right font-medium text-slate-700">
                      {p.netChange >= 0 ? '+' : ''}{formatNumber(p.netChange)}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-emerald-400 inline-block" /> Issued</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-400 inline-block" /> Redeemed</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-orange-400 inline-block" /> Expired</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Redemption Reserve Table ────────────────────────────────────────────

function RedemptionReserveSection() {
  const [range, setRange] = useState({ from: daysAgo(180), to: daysAgo(0) });

  const { data, isLoading, error } = useQuery({
    queryKey: ['reports', 'redemption-reserve', range.from, range.to],
    queryFn: () => apiClient.getReportRedemptionReserve(range.from, range.to),
  });

  const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return (
    <div className="bg-white rounded-lg shadow border border-slate-200">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <h3 className="text-lg font-semibold text-slate-900">Redemption Reserve</h3>
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
        {error && <p className="text-red-500 text-sm">Failed to load redemption reserve data.</p>}
        {data && (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="pb-2 font-medium">Period</th>
                  <th className="pb-2 font-medium text-right">Count</th>
                  <th className="pb-2 font-medium text-right">Points Redeemed</th>
                  <th className="pb-2 font-medium text-right">Discount Value</th>
                  <th className="pb-2 font-medium text-right">Avg/Redemption</th>
                  <th className="pb-2 font-medium text-right">Cost/Point</th>
                </tr>
              </thead>
              <tbody>
                {data.periods.map((p) => (
                  <tr key={`${p.year}-${p.month}`} className="border-b border-slate-50">
                    <td className="py-2 text-slate-900">{monthNames[p.month]} {p.year}</td>
                    <td className="py-2 text-right">{formatNumber(p.redemptionCount)}</td>
                    <td className="py-2 text-right">{formatNumber(p.totalPointsRedeemed)}</td>
                    <td className="py-2 text-right">{formatUsd(p.totalDiscountValue)}</td>
                    <td className="py-2 text-right">{formatUsd(p.avgDiscountPerRedemption)}</td>
                    <td className="py-2 text-right">{formatUsd(p.costPerPoint)}</td>
                  </tr>
                ))}
              </tbody>
              {data.totals && (
                <tfoot>
                  <tr className="font-semibold border-t-2">
                    <td className="py-2">Total</td>
                    <td className="py-2 text-right">{formatNumber(data.totals.redemptionCount)}</td>
                    <td className="py-2 text-right">{formatNumber(data.totals.totalPointsRedeemed)}</td>
                    <td className="py-2 text-right">{formatUsd(data.totals.totalDiscountValue)}</td>
                    <td className="py-2 text-right">-</td>
                    <td className="py-2 text-right">{formatUsd(data.totals.avgCostPerPoint)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </>
        )}
      </div>
    </div>
  );
}

// ── Revenue Attribution ─────────────────────────────────────────────────

function RevenueAttributionSection() {
  const [range, setRange] = useState({ from: daysAgo(30), to: daysAgo(0) });

  const { data, isLoading, error } = useQuery({
    queryKey: ['reports', 'revenue-attribution', range.from, range.to],
    queryFn: () => apiClient.getReportRevenueAttribution(range.from, range.to),
  });

  return (
    <div className="bg-white rounded-lg shadow border border-slate-200">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <h3 className="text-lg font-semibold text-slate-900">Revenue Attribution</h3>
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
        {error && <p className="text-red-500 text-sm">Failed to load revenue data.</p>}
        {data && (
          <>
            {data.summary && (
              <div className="grid grid-cols-3 gap-6 mb-6">
                <MetricBlock label="Total Revenue" value={formatUsd(data.summary.totalRevenue)} />
                <MetricBlock label="Avg Basket" value={formatUsd(data.summary.avgBasketOverall)} />
                <MetricBlock label="Revenue/Member" value={formatUsd(data.summary.revenuePerMember)} />
              </div>
            )}
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="pb-2 font-medium">Date</th>
                  <th className="pb-2 font-medium text-right">Transactions</th>
                  <th className="pb-2 font-medium text-right">Total Spend</th>
                  <th className="pb-2 font-medium text-right">Avg Basket</th>
                  <th className="pb-2 font-medium text-right">Members</th>
                  <th className="pb-2 font-medium text-right">Spend/Member</th>
                </tr>
              </thead>
              <tbody>
                {data.periods.map((p) => (
                  <tr key={p.date} className="border-b border-slate-50">
                    <td className="py-2 text-slate-900">{p.date}</td>
                    <td className="py-2 text-right">{formatNumber(p.totalTransactions)}</td>
                    <td className="py-2 text-right">{formatUsd(p.totalSpend)}</td>
                    <td className="py-2 text-right">{formatUsd(p.avgBasket)}</td>
                    <td className="py-2 text-right">{formatNumber(p.uniqueMembers)}</td>
                    <td className="py-2 text-right">{formatUsd(p.spendPerMember)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}

// ── Shared Components ───────────────────────────────────────────────────

function MetricBlock({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="text-center">
      <div className="text-sm text-slate-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${highlight ? 'text-[#EB1256]' : 'text-slate-900'}`}>{value}</div>
    </div>
  );
}

function CardSkeleton({ title }: { title: string }) {
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

function CardError({ title }: { title: string }) {
  return (
    <div className="bg-white rounded-lg shadow border border-red-200 p-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-2">{title}</h3>
      <p className="text-red-500 text-sm">Failed to load report data. Check API connectivity.</p>
    </div>
  );
}

// ── CSV helper ──────────────────────────────────────────────────────────

function downloadCsv(name: string, data: Record<string, unknown>) {
  const rows = Object.entries(data).map(([k, v]) => `${k},${v}`);
  const csv = 'field,value\n' + rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}-report.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Main Export ─────────────────────────────────────────────────────────

export function FinanceReports() {
  return (
    <div className="space-y-6">
      <LiabilityCard />
      <PointsFlowSection />
      <RedemptionReserveSection />
      <RevenueAttributionSection />
    </div>
  );
}
