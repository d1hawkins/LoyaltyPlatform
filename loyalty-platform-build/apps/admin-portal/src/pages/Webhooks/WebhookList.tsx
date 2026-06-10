import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { Modal } from '../../components/Modal';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { formatDateTime } from '../../utils/format';
import type { WebhookDTO, WebhookDeliveryDTO } from '../../api/types';

const EVENT_TYPES = [
  'member.enrolled',
  'member.updated',
  'member.deleted',
  'points.earned',
  'points.redeemed',
  'transaction.voided',
  'tier.upgraded',
  'tier.downgraded',
];

export function WebhookList() {
  const qc = useQueryClient();
  const { data: webhooks, isLoading } = useQuery({
    queryKey: ['webhooks'],
    queryFn: () => apiClient.getWebhooks(),
  });

  const createWebhook = useMutation({
    mutationFn: (data: { url: string; events: string[] }) => apiClient.createWebhook(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webhooks'] }),
  });

  const deleteWebhook = useMutation({
    mutationFn: (id: string) => apiClient.deleteWebhook(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webhooks'] }),
  });

  const testWebhook = useMutation({
    mutationFn: (id: string) => apiClient.testWebhook(id),
  });

  const [showCreate, setShowCreate] = useState(false);
  const [deleting, setDeleting] = useState<WebhookDTO | null>(null);
  const [deliveriesFor, setDeliveriesFor] = useState<string | null>(null);
  const [newUrl, setNewUrl] = useState('');
  const [newEvents, setNewEvents] = useState<string[]>([]);
  const [testResult, setTestResult] = useState<{ id: string; result?: { success: boolean; statusCode: number } } | null>(null);

  const { data: deliveries } = useQuery({
    queryKey: ['webhooks', deliveriesFor, 'deliveries'],
    queryFn: () => apiClient.getWebhookDeliveries(deliveriesFor!),
    enabled: !!deliveriesFor,
  });

  if (isLoading) return <LoadingSpinner className="py-20" size="lg" />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Webhooks</h1>
        <button
          onClick={() => { setShowCreate(true); setNewUrl(''); setNewEvents([]); }}
          className="px-4 py-2 text-sm bg-brand-600 text-white rounded-md hover:bg-brand-700"
        >
          Register Webhook
        </button>
      </div>

      <div className="space-y-4">
        {(webhooks ?? []).map((wh) => (
          <div key={wh.id} className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-mono text-sm text-slate-900">{wh.url}</div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {wh.events.map((ev) => (
                    <span key={ev} className="px-2 py-0.5 text-xs bg-slate-100 text-slate-600 rounded">{ev}</span>
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`w-2 h-2 rounded-full ${wh.isActive ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                  <span className="text-xs text-slate-500">{wh.isActive ? 'Active' : 'Inactive'}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setTestResult({ id: wh.id });
                    testWebhook.mutate(wh.id, {
                      onSuccess: (result) => setTestResult({ id: wh.id, result }),
                    });
                  }}
                  className="px-3 py-1.5 text-xs border border-slate-300 rounded-md hover:bg-slate-50"
                >
                  Test
                </button>
                <button
                  onClick={() => setDeliveriesFor(wh.id)}
                  className="px-3 py-1.5 text-xs border border-slate-300 rounded-md hover:bg-slate-50"
                >
                  Deliveries
                </button>
                <button
                  onClick={() => setDeleting(wh)}
                  className="px-3 py-1.5 text-xs border border-red-300 text-red-700 rounded-md hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            </div>
            {testResult?.id === wh.id && testResult.result && (
              <div className={`mt-2 text-xs p-2 rounded ${testResult.result.success ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
                Test delivery: {testResult.result.success ? 'Success' : 'Failed'} (HTTP {testResult.result.statusCode})
              </div>
            )}
          </div>
        ))}
        {(webhooks ?? []).length === 0 && (
          <div className="text-center py-12 text-slate-400">No webhooks registered.</div>
        )}
      </div>

      {/* Create Modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Register Webhook" size="lg">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">URL</label>
            <input
              type="url"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
              placeholder="https://example.com/webhook"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Events</label>
            <div className="grid grid-cols-2 gap-2">
              {EVENT_TYPES.map((ev) => (
                <label key={ev} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={newEvents.includes(ev)}
                    onChange={(e) =>
                      setNewEvents(
                        e.target.checked ? [...newEvents, ev] : newEvents.filter((x) => x !== ev),
                      )
                    }
                    className="rounded border-slate-300"
                  />
                  {ev}
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm border border-slate-300 rounded-md">Cancel</button>
            <button
              onClick={() => {
                createWebhook.mutate({ url: newUrl, events: newEvents }, { onSuccess: () => setShowCreate(false) });
              }}
              disabled={!newUrl || newEvents.length === 0 || createWebhook.isPending}
              className="px-4 py-2 text-sm bg-brand-600 text-white rounded-md hover:bg-brand-700 disabled:opacity-50"
            >
              Register
            </button>
          </div>
        </div>
      </Modal>

      {/* Deliveries Modal */}
      <Modal isOpen={!!deliveriesFor} onClose={() => setDeliveriesFor(null)} title="Delivery History" size="lg">
        <div className="max-h-96 overflow-y-auto">
          {(deliveries ?? []).length === 0 ? (
            <p className="text-sm text-slate-500 py-4">No deliveries yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 font-medium text-slate-500">Event</th>
                  <th className="text-left py-2 font-medium text-slate-500">Status</th>
                  <th className="text-left py-2 font-medium text-slate-500">Attempts</th>
                  <th className="text-left py-2 font-medium text-slate-500">Date</th>
                </tr>
              </thead>
              <tbody>
                {(deliveries as WebhookDeliveryDTO[]).map((d) => (
                  <tr key={d.id} className="border-b">
                    <td className="py-2">{d.eventType}</td>
                    <td className="py-2">
                      <span className={d.success ? 'text-emerald-600' : 'text-red-600'}>
                        {d.statusCode}
                      </span>
                    </td>
                    <td className="py-2">{d.attemptCount}</td>
                    <td className="py-2">{formatDateTime(d.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) deleteWebhook.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
        }}
        title="Delete Webhook"
        message={`Delete webhook for ${deleting?.url}? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleteWebhook.isPending}
      />
    </div>
  );
}
