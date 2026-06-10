import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { useHasRole } from '../../auth/useAuth';

export function Branding() {
  const isManager = useHasRole('manager');
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['branding'],
    queryFn: () => apiClient.getBranding(),
  });

  const update = useMutation({
    mutationFn: (d: Parameters<typeof apiClient.updateBranding>[0]) => apiClient.updateBranding(d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['branding'] }),
  });

  const [form, setForm] = useState({
    logoUrl: '',
    primaryColor: '#3b82f6',
    secondaryColor: '#1e40af',
    senderName: '',
    senderEmail: '',
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) {
      setForm({
        logoUrl: data.logoUrl ?? '',
        primaryColor: data.primaryColor ?? '#3b82f6',
        secondaryColor: data.secondaryColor ?? '#1e40af',
        senderName: data.senderName ?? '',
        senderEmail: data.senderEmail ?? '',
      });
    }
  }, [data]);

  if (isLoading) return <LoadingSpinner className="py-20" size="lg" />;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Branding & Settings</h1>

      {saved && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-md p-3 mb-4 text-sm">
          Branding saved successfully.
        </div>
      )}

      <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Logo URL</label>
          <input
            type="url"
            value={form.logoUrl}
            onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
            disabled={!isManager}
            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm disabled:bg-slate-50"
            placeholder="https://cdn.example.com/logo.png"
          />
          {form.logoUrl && (
            <div className="mt-2 p-4 bg-slate-50 rounded border border-slate-200">
              <img src={form.logoUrl} alt="Logo preview" className="h-12 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Primary Color</label>
            <div className="flex gap-2 items-center">
              <input
                type="color"
                value={form.primaryColor}
                onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
                disabled={!isManager}
                className="h-10 w-14 rounded border border-slate-300"
              />
              <input
                type="text"
                value={form.primaryColor}
                onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
                disabled={!isManager}
                className="flex-1 px-3 py-2 border border-slate-300 rounded-md text-sm disabled:bg-slate-50"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Secondary Color</label>
            <div className="flex gap-2 items-center">
              <input
                type="color"
                value={form.secondaryColor}
                onChange={(e) => setForm({ ...form, secondaryColor: e.target.value })}
                disabled={!isManager}
                className="h-10 w-14 rounded border border-slate-300"
              />
              <input
                type="text"
                value={form.secondaryColor}
                onChange={(e) => setForm({ ...form, secondaryColor: e.target.value })}
                disabled={!isManager}
                className="flex-1 px-3 py-2 border border-slate-300 rounded-md text-sm disabled:bg-slate-50"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Sender Name</label>
            <input
              type="text"
              value={form.senderName}
              onChange={(e) => setForm({ ...form, senderName: e.target.value })}
              disabled={!isManager}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm disabled:bg-slate-50"
              placeholder="My Loyalty Program"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Sender Email</label>
            <input
              type="email"
              value={form.senderEmail}
              onChange={(e) => setForm({ ...form, senderEmail: e.target.value })}
              disabled={!isManager}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm disabled:bg-slate-50"
              placeholder="noreply@example.com"
            />
          </div>
        </div>

        {isManager && (
          <div className="pt-4 border-t border-slate-100">
            <button
              onClick={() => {
                update.mutate(form, {
                  onSuccess: () => {
                    setSaved(true);
                    setTimeout(() => setSaved(false), 3000);
                  },
                });
              }}
              disabled={update.isPending}
              className="px-4 py-2 text-sm bg-brand-600 text-white rounded-md hover:bg-brand-700 disabled:opacity-50"
            >
              {update.isPending ? 'Saving...' : 'Save Branding'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
