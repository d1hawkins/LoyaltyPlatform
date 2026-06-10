import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable, type Column } from '../../components/DataTable';
import { useMemberSearch } from '../../hooks/useMembers';
import { apiClient } from '../../api/client';
import { downloadCsv } from '../../utils/csv';
import { formatDate } from '../../utils/format';
import type { MemberDTO } from '../../api/types';

const columns: Column<MemberDTO>[] = [
  { key: 'firstName', header: 'Name', sortable: true, render: (r) => `${r.firstName} ${r.lastName}` },
  { key: 'email', header: 'Email', sortable: true, render: (r) => r.email ?? '—' },
  { key: 'phone', header: 'Phone' },
  { key: 'tierName', header: 'Tier', sortable: true },
  { key: 'pointsBalance', header: 'Points', sortable: true, render: (r) => r.pointsBalance.toLocaleString() },
  {
    key: 'status',
    header: 'Status',
    sortable: true,
    render: (r) => {
      const colors: Record<string, string> = {
        active: 'bg-emerald-100 text-emerald-800',
        suspended: 'bg-amber-100 text-amber-800',
        closed: 'bg-red-100 text-red-800',
      };
      return (
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[r.status] ?? ''}`}>
          {r.status}
        </span>
      );
    },
  },
  { key: 'enrolledAt', header: 'Enrolled', sortable: true, render: (r) => formatDate(r.enrolledAt) },
];

export function MemberList() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [cursors, setCursors] = useState<string[]>([]);
  const currentCursor = cursors[cursors.length - 1];

  const { data, isLoading } = useMemberSearch({
    query: search || undefined,
    status: statusFilter || undefined,
    cursor: currentCursor,
    limit: 25,
  });

  const handleExport = useCallback(async () => {
    try {
      const res = await apiClient.exportMembersCsv();
      await downloadCsv(res, 'members-export.csv');
    } catch (e) {
      console.error('Export failed', e);
    }
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Members</h1>
        <button
          onClick={handleExport}
          className="px-4 py-2 text-sm bg-brand-600 text-white rounded-md hover:bg-brand-700"
        >
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <input
          type="text"
          placeholder="Search by name, email, or phone..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setCursors([]);
          }}
          className="flex-1 px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setCursors([]);
          }}
          className="px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      <DataTable
        columns={columns}
        data={data?.items ?? []}
        isLoading={isLoading}
        keyExtractor={(r) => r.id}
        onRowClick={(r) => navigate(`/members/${r.id}`)}
        hasNextPage={!!data?.nextCursor}
        hasPrevPage={cursors.length > 0}
        onNextPage={() => data?.nextCursor && setCursors((c) => [...c, data.nextCursor!])}
        onPrevPage={() => setCursors((c) => c.slice(0, -1))}
        emptyMessage="No members found."
      />
    </div>
  );
}
