import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMember, useMemberLedger, useAdjustPoints, useOverrideTier, useChangeMemberStatus, useGdprDelete } from '../../hooks/useMembers';
import { useTiers } from '../../hooks/useTiers';
import { DataTable, type Column } from '../../components/DataTable';
import { Modal } from '../../components/Modal';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { formatDate, formatDateTime, formatNumber } from '../../utils/format';
import { useHasRole } from '../../auth/useAuth';
import type { LedgerEntryDTO } from '../../api/types';

const ledgerColumns: Column<LedgerEntryDTO>[] = [
  { key: 'createdAt', header: 'Date', render: (r) => formatDateTime(r.createdAt), sortable: true },
  {
    key: 'delta',
    header: 'Points',
    render: (r) => (
      <span className={r.delta > 0 ? 'text-emerald-600' : 'text-red-600'}>
        {r.delta > 0 ? '+' : ''}{r.delta}
      </span>
    ),
  },
  { key: 'balanceAfter', header: 'Balance After', render: (r) => formatNumber(r.balanceAfter) },
  { key: 'reason', header: 'Reason' },
  { key: 'note', header: 'Note', render: (r) => r.note ?? '—' },
];

export function MemberDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isManager = useHasRole('manager');
  const isOwner = useHasRole('owner');

  const { data: member, isLoading } = useMember(id!);
  const [ledgerCursors, setLedgerCursors] = useState<string[]>([]);
  const ledger = useMemberLedger(id!, { cursor: ledgerCursors[ledgerCursors.length - 1], limit: 20 });
  const tiers = useTiers();

  // Mutations
  const adjustPoints = useAdjustPoints();
  const overrideTier = useOverrideTier();
  const changeStatus = useChangeMemberStatus();
  const gdprDelete = useGdprDelete();

  // Modal states
  const [showAdjust, setShowAdjust] = useState(false);
  const [showTierOverride, setShowTierOverride] = useState(false);
  const [showStatusChange, setShowStatusChange] = useState(false);
  const [showGdpr, setShowGdpr] = useState(false);

  // Form states
  const [adjustDelta, setAdjustDelta] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [overrideTierId, setOverrideTierId] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [statusReason, setStatusReason] = useState('');

  if (isLoading) return <LoadingSpinner className="py-20" size="lg" />;
  if (!member) return <div className="text-center py-20 text-slate-500">Member not found</div>;

  const statusColors: Record<string, string> = {
    active: 'bg-emerald-100 text-emerald-800',
    suspended: 'bg-amber-100 text-amber-800',
    closed: 'bg-red-100 text-red-800',
  };

  return (
    <div>
      <button onClick={() => navigate('/members')} className="text-sm text-brand-600 hover:underline mb-4 inline-block">
        &larr; Back to Members
      </button>

      {/* Profile header */}
      <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{member.firstName} {member.lastName}</h1>
            <div className="flex items-center gap-3 mt-2">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[member.status] ?? ''}`}>
                {member.status}
              </span>
              <span className="text-sm text-slate-500">{member.tierName} tier</span>
              <span className="text-sm text-slate-500">ID: {member.id.slice(0, 8)}...</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-brand-600">{formatNumber(member.pointsBalance)}</div>
            <div className="text-sm text-slate-500">points balance</div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-4 border-t border-slate-100">
          <div>
            <div className="text-xs text-slate-500 uppercase">Email</div>
            <div className="text-sm text-slate-900">{member.email ?? '—'}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500 uppercase">Phone</div>
            <div className="text-sm text-slate-900">{member.phone}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500 uppercase">Enrolled</div>
            <div className="text-sm text-slate-900">{formatDate(member.enrolledAt)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500 uppercase">Channel</div>
            <div className="text-sm text-slate-900">{member.enrolledChannel}</div>
          </div>
        </div>
      </div>

      {/* Actions */}
      {isManager && member.status !== 'closed' && (
        <div className="flex gap-3 mb-6">
          <button onClick={() => setShowAdjust(true)} className="px-4 py-2 text-sm bg-brand-600 text-white rounded-md hover:bg-brand-700">
            Adjust Points
          </button>
          <button onClick={() => setShowTierOverride(true)} className="px-4 py-2 text-sm border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50">
            Override Tier
          </button>
          <button onClick={() => setShowStatusChange(true)} className="px-4 py-2 text-sm border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50">
            Change Status
          </button>
          {isOwner && (
            <button onClick={() => setShowGdpr(true)} className="px-4 py-2 text-sm border border-red-300 rounded-md text-red-700 hover:bg-red-50">
              GDPR Delete
            </button>
          )}
        </div>
      )}

      {/* Ledger history */}
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Points Ledger</h2>
        <DataTable
          columns={ledgerColumns}
          data={ledger.data?.items ?? []}
          isLoading={ledger.isLoading}
          keyExtractor={(r) => r.id}
          hasNextPage={!!ledger.data?.nextCursor}
          hasPrevPage={ledgerCursors.length > 0}
          onNextPage={() => ledger.data?.nextCursor && setLedgerCursors((c) => [...c, ledger.data!.nextCursor!])}
          onPrevPage={() => setLedgerCursors((c) => c.slice(0, -1))}
        />
      </div>

      {/* Adjust Points Modal */}
      <Modal isOpen={showAdjust} onClose={() => setShowAdjust(false)} title="Adjust Points">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Points (positive or negative)</label>
            <input
              type="number"
              value={adjustDelta}
              onChange={(e) => setAdjustDelta(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
              placeholder="e.g. 500 or -200"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Reason</label>
            <input
              type="text"
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
              placeholder="e.g. Goodwill credit"
            />
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowAdjust(false)} className="px-4 py-2 text-sm border border-slate-300 rounded-md">Cancel</button>
            <button
              onClick={() => {
                adjustPoints.mutate(
                  { memberId: id!, data: { delta: Number(adjustDelta), reason: adjustReason } },
                  { onSuccess: () => { setShowAdjust(false); setAdjustDelta(''); setAdjustReason(''); } },
                );
              }}
              disabled={!adjustDelta || !adjustReason || adjustPoints.isPending}
              className="px-4 py-2 text-sm bg-brand-600 text-white rounded-md hover:bg-brand-700 disabled:opacity-50"
            >
              {adjustPoints.isPending ? 'Saving...' : 'Apply'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Tier Override Modal */}
      <Modal isOpen={showTierOverride} onClose={() => setShowTierOverride(false)} title="Override Tier">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">New Tier</label>
            <select
              value={overrideTierId}
              onChange={(e) => setOverrideTierId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
            >
              <option value="">Select tier...</option>
              {(tiers.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Reason</label>
            <input
              type="text"
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
            />
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowTierOverride(false)} className="px-4 py-2 text-sm border border-slate-300 rounded-md">Cancel</button>
            <button
              onClick={() => {
                overrideTier.mutate(
                  { memberId: id!, data: { tierId: overrideTierId, reason: overrideReason } },
                  { onSuccess: () => { setShowTierOverride(false); setOverrideTierId(''); setOverrideReason(''); } },
                );
              }}
              disabled={!overrideTierId || !overrideReason || overrideTier.isPending}
              className="px-4 py-2 text-sm bg-brand-600 text-white rounded-md hover:bg-brand-700 disabled:opacity-50"
            >
              {overrideTier.isPending ? 'Saving...' : 'Apply'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Status Change Modal */}
      <Modal isOpen={showStatusChange} onClose={() => setShowStatusChange(false)} title="Change Status">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">New Status</label>
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
            >
              <option value="">Select status...</option>
              {member.status === 'active' && <option value="suspended">Suspended</option>}
              {member.status === 'active' && <option value="closed">Closed</option>}
              {member.status === 'suspended' && <option value="active">Active</option>}
              {member.status === 'suspended' && <option value="closed">Closed</option>}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Reason</label>
            <input
              type="text"
              value={statusReason}
              onChange={(e) => setStatusReason(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
            />
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowStatusChange(false)} className="px-4 py-2 text-sm border border-slate-300 rounded-md">Cancel</button>
            <button
              onClick={() => {
                changeStatus.mutate(
                  { memberId: id!, data: { status: newStatus, reason: statusReason } },
                  { onSuccess: () => { setShowStatusChange(false); setNewStatus(''); setStatusReason(''); } },
                );
              }}
              disabled={!newStatus || !statusReason || changeStatus.isPending}
              className="px-4 py-2 text-sm bg-brand-600 text-white rounded-md hover:bg-brand-700 disabled:opacity-50"
            >
              {changeStatus.isPending ? 'Saving...' : 'Apply'}
            </button>
          </div>
        </div>
      </Modal>

      {/* GDPR Delete Confirm */}
      <ConfirmDialog
        isOpen={showGdpr}
        onClose={() => setShowGdpr(false)}
        onConfirm={() => {
          gdprDelete.mutate(
            { memberId: id!, confirm: true },
            { onSuccess: () => { setShowGdpr(false); navigate('/members'); } },
          );
        }}
        title="GDPR Delete"
        message={`This will permanently delete all personal data for ${member.firstName} ${member.lastName}. This action cannot be undone. Only owners can confirm this action.`}
        confirmLabel="Confirm Delete"
        variant="danger"
        isLoading={gdprDelete.isPending}
      />
    </div>
  );
}
