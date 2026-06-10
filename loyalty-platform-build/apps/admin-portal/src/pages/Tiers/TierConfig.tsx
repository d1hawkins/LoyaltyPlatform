import { useState } from 'react';
import { useTiers, useCreateTier, useUpdateTier, useDeleteTier } from '../../hooks/useTiers';
import { Modal } from '../../components/Modal';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { useHasRole } from '../../auth/useAuth';
import type { TierDTO, TierCreateInput } from '../../api/types';

export function TierConfig() {
  const isOwner = useHasRole('owner');
  const isManager = useHasRole('manager');
  const { data: tiers, isLoading } = useTiers();
  const createTier = useCreateTier();
  const updateTier = useUpdateTier();
  const deleteTier = useDeleteTier();

  const [showCreate, setShowCreate] = useState(false);
  const [editTier, setEditTier] = useState<TierDTO | null>(null);
  const [deletingTier, setDeletingTier] = useState<TierDTO | null>(null);

  const [form, setForm] = useState<TierCreateInput>({ name: '', sortOrder: 0, thresholdPoints: 0, multiplier: 1 });

  if (isLoading) return <LoadingSpinner className="py-20" size="lg" />;

  const sortedTiers = [...(tiers ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Tier Configuration</h1>
        {isOwner && (
          <button
            onClick={() => {
              setForm({ name: '', sortOrder: (tiers?.length ?? 0) + 1, thresholdPoints: 0, multiplier: 1 });
              setShowCreate(true);
            }}
            className="px-4 py-2 text-sm bg-brand-600 text-white rounded-md hover:bg-brand-700"
          >
            Create Tier
          </button>
        )}
      </div>

      <div className="grid gap-4">
        {sortedTiers.map((tier) => (
          <div key={tier.id} className="bg-white rounded-lg border border-slate-200 p-6 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold text-slate-900">{tier.name}</h3>
                {!tier.isActive && (
                  <span className="px-2 py-0.5 text-xs bg-slate-100 text-slate-500 rounded-full">Inactive</span>
                )}
              </div>
              <div className="flex gap-6 mt-2 text-sm text-slate-500">
                <span>Order: {tier.sortOrder}</span>
                <span>Threshold: {tier.thresholdPoints.toLocaleString()} pts</span>
                <span>Multiplier: {tier.multiplier}x</span>
              </div>
            </div>
            <div className="flex gap-2">
              {isManager && (
                <button
                  onClick={() => {
                    setForm({
                      name: tier.name,
                      sortOrder: tier.sortOrder,
                      thresholdPoints: tier.thresholdPoints,
                      multiplier: tier.multiplier,
                    });
                    setEditTier(tier);
                  }}
                  className="px-3 py-1.5 text-sm border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50"
                >
                  Edit
                </button>
              )}
              {isOwner && (
                <button
                  onClick={() => setDeletingTier(tier)}
                  className="px-3 py-1.5 text-sm border border-red-300 rounded-md text-red-700 hover:bg-red-50"
                >
                  Deactivate
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Create / Edit Modal */}
      <Modal
        isOpen={showCreate || !!editTier}
        onClose={() => { setShowCreate(false); setEditTier(null); }}
        title={editTier ? 'Edit Tier' : 'Create Tier'}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Sort Order</label>
              <input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Threshold Points</label>
              <input type="number" value={form.thresholdPoints} onChange={(e) => setForm({ ...form, thresholdPoints: Number(e.target.value) })} className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Multiplier</label>
              <input type="number" step="0.1" value={form.multiplier} onChange={(e) => setForm({ ...form, multiplier: Number(e.target.value) })} className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm" />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => { setShowCreate(false); setEditTier(null); }} className="px-4 py-2 text-sm border border-slate-300 rounded-md">Cancel</button>
            <button
              onClick={() => {
                if (editTier) {
                  updateTier.mutate({ id: editTier.id, data: form }, { onSuccess: () => setEditTier(null) });
                } else {
                  createTier.mutate(form, { onSuccess: () => setShowCreate(false) });
                }
              }}
              disabled={!form.name || createTier.isPending || updateTier.isPending}
              className="px-4 py-2 text-sm bg-brand-600 text-white rounded-md hover:bg-brand-700 disabled:opacity-50"
            >
              {(createTier.isPending || updateTier.isPending) ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        isOpen={!!deletingTier}
        onClose={() => setDeletingTier(null)}
        onConfirm={() => {
          if (deletingTier) deleteTier.mutate(deletingTier.id, { onSuccess: () => setDeletingTier(null) });
        }}
        title="Deactivate Tier"
        message={`Are you sure you want to deactivate the "${deletingTier?.name}" tier? This is a soft delete — the tier will be marked inactive.`}
        confirmLabel="Deactivate"
        variant="danger"
        isLoading={deleteTier.isPending}
      />
    </div>
  );
}
