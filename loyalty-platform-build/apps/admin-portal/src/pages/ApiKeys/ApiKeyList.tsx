import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { Modal } from '../../components/Modal';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { formatDateTime } from '../../utils/format';

export function ApiKeyList() {
  const qc = useQueryClient();
  const { data: keys, isLoading } = useQuery({
    queryKey: ['apikeys'],
    queryFn: () => apiClient.getApiKeys(),
  });

  const createKey = useMutation({
    mutationFn: (label: string) => apiClient.createApiKey(label),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['apikeys'] }),
  });

  const revokeKey = useMutation({
    mutationFn: (id: string) => apiClient.revokeApiKey(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['apikeys'] }),
  });

  const [showCreate, setShowCreate] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newPlaintext, setNewPlaintext] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (isLoading) return <LoadingSpinner className="py-20" size="lg" />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">API Keys</h1>
        <button
          onClick={() => { setShowCreate(true); setNewLabel(''); setNewPlaintext(null); }}
          className="px-4 py-2 text-sm bg-brand-600 text-white rounded-md hover:bg-brand-700"
        >
          Generate API Key
        </button>
      </div>

      <div className="bg-white rounded-lg border border-slate-200">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Label</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Prefix</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Last Used</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Created</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {(keys ?? []).map((key) => (
              <tr key={key.id}>
                <td className="px-4 py-3 text-sm text-slate-900">{key.label}</td>
                <td className="px-4 py-3 text-sm font-mono text-slate-600">{key.prefix}...</td>
                <td className="px-4 py-3 text-sm text-slate-500">{key.lastUsedAt ? formatDateTime(key.lastUsedAt) : 'Never'}</td>
                <td className="px-4 py-3 text-sm text-slate-500">{formatDateTime(key.createdAt)}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => setRevoking(key.id)}
                    className="px-3 py-1.5 text-xs border border-red-300 text-red-700 rounded-md hover:bg-red-50"
                  >
                    Revoke
                  </button>
                </td>
              </tr>
            ))}
            {(keys ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">No API keys generated.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      <Modal isOpen={showCreate} onClose={() => { if (!newPlaintext) setShowCreate(false); }} title="Generate API Key">
        {newPlaintext ? (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-800">
              <strong>Save this key now.</strong> It will not be shown again.
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newPlaintext}
                readOnly
                className="flex-1 px-3 py-2 border border-slate-300 rounded-md text-sm font-mono bg-slate-50"
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(newPlaintext);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="px-3 py-2 text-sm border border-slate-300 rounded-md hover:bg-slate-50"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => { setShowCreate(false); setNewPlaintext(null); }}
                className="px-4 py-2 text-sm bg-brand-600 text-white rounded-md hover:bg-brand-700"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Label</label>
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                placeholder="e.g. Production POS"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm border border-slate-300 rounded-md">Cancel</button>
              <button
                onClick={() => {
                  createKey.mutate(newLabel, {
                    onSuccess: (res) => setNewPlaintext(res.plaintextKey),
                  });
                }}
                disabled={!newLabel || createKey.isPending}
                className="px-4 py-2 text-sm bg-brand-600 text-white rounded-md hover:bg-brand-700 disabled:opacity-50"
              >
                {createKey.isPending ? 'Generating...' : 'Generate'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Revoke Confirm */}
      <ConfirmDialog
        isOpen={!!revoking}
        onClose={() => setRevoking(null)}
        onConfirm={() => {
          if (revoking) revokeKey.mutate(revoking, { onSuccess: () => setRevoking(null) });
        }}
        title="Revoke API Key"
        message="This will permanently revoke the API key. Any integrations using this key will stop working immediately."
        confirmLabel="Revoke"
        variant="danger"
        isLoading={revokeKey.isPending}
      />
    </div>
  );
}
