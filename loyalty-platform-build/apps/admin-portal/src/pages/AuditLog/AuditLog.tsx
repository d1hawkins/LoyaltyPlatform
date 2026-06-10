import { useState, useCallback, Fragment } from 'react';
import { useAuditLog } from '../../hooks/useAudit';
import { apiClient } from '../../api/client';
import { downloadCsv } from '../../utils/csv';
import { formatDateTime } from '../../utils/format';

function diffKeys(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter(k => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  if (Array.isArray(val)) return val.length === 0 ? '(empty)' : JSON.stringify(val);
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

function friendlyFieldName(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]/g, ' ')
    .replace(/^\w/, c => c.toUpperCase())
    .trim();
}

export function AuditLog() {
  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [cursors, setCursors] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading } = useAuditLog({
    entity: entity || undefined,
    action: action || undefined,
    from: fromDate || undefined,
    to: toDate || undefined,
    cursor: cursors[cursors.length - 1],
    limit: 25,
  });

  const handleExport = useCallback(async () => {
    try {
      const res = await apiClient.exportAuditCsv();
      await downloadCsv(res, 'audit-log-export.csv');
    } catch (e) {
      console.error('Export failed', e);
    }
  }, []);

  const items = data?.items ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Audit Log</h1>
        <button onClick={handleExport}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700">
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select value={entity} onChange={(e) => { setEntity(e.target.value); setCursors([]); }}
          className="px-3 py-2 border border-slate-300 rounded-md text-sm">
          <option value="">All entities</option>
          <option value="program_config">Program Config</option>
          <option value="tier">Tier</option>
          <option value="member">Member</option>
          <option value="api_key">API Key</option>
          <option value="webhook">Webhook</option>
        </select>
        <select value={action} onChange={(e) => { setAction(e.target.value); setCursors([]); }}
          className="px-3 py-2 border border-slate-300 rounded-md text-sm">
          <option value="">All actions</option>
          <option value="program.update">program.update</option>
          <option value="tier.create">tier.create</option>
          <option value="tier.update">tier.update</option>
          <option value="points.adjust">points.adjust</option>
          <option value="member.status">member.status</option>
          <option value="member.gdpr_delete">member.gdpr_delete</option>
          <option value="apikey.create">apikey.create</option>
          <option value="webhook.create">webhook.create</option>
        </select>
        <input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setCursors([]); }}
          className="px-3 py-2 border border-slate-300 rounded-md text-sm" />
        <input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setCursors([]); }}
          className="px-3 py-2 border border-slate-300 rounded-md text-sm" />
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-left">
            <tr>
              <th className="px-3 py-3 w-8"></th>
              <th className="px-4 py-3 font-medium">Time</th>
              <th className="px-4 py-3 font-medium">Actor</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Action</th>
              <th className="px-4 py-3 font-medium">Entity</th>
              <th className="px-4 py-3 font-medium">Changes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Loading...</td></tr>
            )}
            {!isLoading && items.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No audit entries found.</td></tr>
            )}
            {items.map((entry) => {
              const e = entry as unknown as Record<string, unknown>;
              const isExpanded = expandedId === (e.id ?? e.auditId);
              const entryId = String(e.id ?? e.auditId ?? '');
              const before = ((e.beforeJson ?? {}) as Record<string, unknown>);
              const after = ((e.afterJson ?? {}) as Record<string, unknown>);
              const beforeCfg = (before.configJson ?? before) as Record<string, unknown>;
              const afterCfg = (after.configJson ?? after) as Record<string, unknown>;
              const changed = diffKeys(beforeCfg, afterCfg).filter(k => k !== 'updatedAt' && k !== 'tenantId');
              const hasDetails = Object.keys(before).length > 0 || Object.keys(after).length > 0;

              return (
                <Fragment key={entryId}>
                  <tr
                    className={`hover:bg-slate-50 ${hasDetails ? 'cursor-pointer' : ''} ${isExpanded ? 'bg-blue-50/50' : ''}`}
                    onClick={() => hasDetails && setExpandedId(isExpanded ? null : entryId)}
                  >
                    <td className="px-3 py-3 text-slate-400">
                      {hasDetails && (
                        <svg className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                          fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{formatDateTime(e.createdAt as string)}</td>
                    <td className="px-4 py-3">{(e.actorUserId as string || '—').slice(0, 16)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                        e.actorRole === 'owner' ? 'bg-purple-100 text-purple-700' :
                        e.actorRole === 'manager' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                      }`}>{e.actorRole as string}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs font-medium rounded">{e.action as string}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{e.entity as string}</td>
                    <td className="px-4 py-3">
                      {changed.length > 0 ? (
                        <span className="text-xs text-slate-500">{changed.length} field{changed.length > 1 ? 's' : ''} changed</span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                  {isExpanded && hasDetails && (
                    <tr>
                      <td colSpan={7} className="bg-slate-50/80">
                        <div className="px-8 py-4">
                          {/* Changes diff */}
                          {changed.length > 0 ? (
                            <div className="mb-4">
                              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">What Changed</h4>
                              <div className="space-y-2">
                                {changed.map(key => (
                                  <div key={key} className="grid grid-cols-[180px_1fr_auto_1fr] items-start gap-2 text-sm">
                                    <span className="font-medium text-slate-700">{friendlyFieldName(key)}</span>
                                    <div className="px-2 py-1 bg-red-50 rounded text-red-600 text-xs break-all">
                                      {formatValue(beforeCfg[key])}
                                    </div>
                                    <span className="text-slate-300 px-1">→</span>
                                    <div className="px-2 py-1 bg-green-50 rounded text-green-700 text-xs break-all">
                                      {formatValue(afterCfg[key])}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <p className="text-xs text-slate-400 mb-4 italic">No field changes detected (re-save with same values).</p>
                          )}

                          {/* Metadata */}
                          <div className="border-t border-slate-200 pt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-slate-400">
                            <div><span className="font-medium text-slate-500">Audit ID:</span> {entryId}</div>
                            <div><span className="font-medium text-slate-500">Entity ID:</span> {(e.entityId as string || '—').slice(0, 12)}</div>
                            <div><span className="font-medium text-slate-500">IP:</span> {(e.ipAddress as string) ?? '—'}</div>
                            <div><span className="font-medium text-slate-500">Correlation:</span> {((e.correlationId as string) ?? '—').slice(0, 16)}</div>
                            {e.reason ? <div className="col-span-2"><span className="font-medium text-slate-500">Reason:</span> {String(e.reason)}</div> : null}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
          <button onClick={() => setCursors(c => c.slice(0, -1))} disabled={cursors.length === 0}
            className="px-3 py-1.5 text-sm border border-slate-300 rounded hover:bg-white disabled:opacity-40">
            Previous
          </button>
          <span className="text-xs text-slate-400">{items.length} entries</span>
          <button onClick={() => data?.nextCursor && setCursors(c => [...c, data.nextCursor!])} disabled={!data?.nextCursor}
            className="px-3 py-1.5 text-sm border border-slate-300 rounded hover:bg-white disabled:opacity-40">
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
