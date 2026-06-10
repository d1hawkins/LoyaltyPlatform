import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { useHasRole } from '../../auth/useAuth';
import type { ProgramConfigUpdateInput } from '../../api/types';

interface PromoMultiplier {
  type: 'global' | 'category' | 'sku';
  match?: string;
  multiplier: number;
  name: string;
  startDate: string;
  endDate: string;
}

interface CategoryMultiplier {
  type: 'category' | 'sku';
  match: string;
  multiplier: number;
  name: string;
}

export function ProgramConfig() {
  const isManager = useHasRole('manager');
  const qc = useQueryClient();

  const { data: program, isLoading } = useQuery({
    queryKey: ['program'],
    queryFn: () => apiClient.getProgram(),
  });

  const update = useMutation({
    mutationFn: (data: ProgramConfigUpdateInput) => apiClient.updateProgram(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['program'] }),
  });

  const [form, setForm] = useState<ProgramConfigUpdateInput>({});
  const [promos, setPromos] = useState<PromoMultiplier[]>([]);
  const [categories, setCategories] = useState<CategoryMultiplier[]>([]);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'promos' | 'categories'>('general');

  useEffect(() => {
    if (program) {
      const cfg = (program.configJson ?? {}) as Record<string, unknown>;
      // Read from both top-level and configJson (API returns everything in configJson)
      setForm({
        programName: program.programName || (cfg.programName as string) || '',
        baseEarnRate: program.baseEarnRate ?? (cfg.baseEarnRate as number) ?? 1,
        pointsExpiryDays: program.pointsExpiryDays ?? (cfg.pointsExpiryDays as number) ?? undefined,
        voidWindowHours: program.voidWindowHours ?? (cfg.voidWindowHours as number) ?? 168,
        currency: program.currency || (cfg.currency as string) || 'USD',
        timezone: program.timezone || (cfg.timezone as string) || '',
        earnMode: (cfg.earnMode as 'per-dollar' | 'per-visit') ?? 'per-dollar',
        pointsPerVisit: (cfg.pointsPerVisit as number) ?? 10,
        visitMinSpendCents: (cfg.visitMinSpendCents as number) ?? 500,
        maxVisitsPerDay: (cfg.maxVisitsPerDay as number | null) ?? null,
      });
      setPromos((cfg.promoMultipliers as PromoMultiplier[]) ?? []);
      setCategories((cfg.categoryMultipliers as CategoryMultiplier[]) ?? []);
    }
  }, [program]);

  const handleSave = () => {
    const data: ProgramConfigUpdateInput & { configJson?: Record<string, unknown> } = {
      programName: form.programName,
      baseEarnRate: form.baseEarnRate,
      pointsExpiryDays: form.pointsExpiryDays,
      voidWindowHours: form.voidWindowHours,
      currency: form.currency,
      timezone: form.timezone,
      earnMode: form.earnMode,
      pointsPerVisit: form.pointsPerVisit,
      visitMinSpendCents: form.visitMinSpendCents,
      maxVisitsPerDay: form.maxVisitsPerDay,
      configJson: {
        programName: form.programName,
        baseEarnRate: form.baseEarnRate,
        pointsExpiryDays: form.pointsExpiryDays,
        voidWindowHours: form.voidWindowHours,
        currency: form.currency,
        timezone: form.timezone,
        earnMode: form.earnMode,
        pointsPerVisit: form.pointsPerVisit,
        visitMinSpendCents: form.visitMinSpendCents,
        maxVisitsPerDay: form.maxVisitsPerDay,
        promoMultipliers: promos,
        categoryMultipliers: categories,
      },
    };
    update.mutate(data, {
      onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 3000); },
      onError: (err) => { alert('Save failed: ' + (err as Error).message); },
    });
  };

  if (isLoading) return <LoadingSpinner className="py-20" size="lg" />;

  const tabs = [
    { key: 'general' as const, label: 'General Settings' },
    { key: 'promos' as const, label: 'Promotional Multipliers' },
    { key: 'categories' as const, label: 'Category & SKU Multipliers' },
  ];

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Program Configuration</h1>

      {saved && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-md p-3 mb-4 text-sm">
          Program configuration saved successfully.
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 mb-6">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
              activeTab === t.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
            {t.key === 'promos' && promos.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">{promos.length}</span>
            )}
            {t.key === 'categories' && categories.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">{categories.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* General Settings */}
      {activeTab === 'general' && (
        <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Program Name</label>
            <input type="text" value={form.programName ?? ''} onChange={(e) => setForm({ ...form, programName: e.target.value })}
              disabled={!isManager} className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm disabled:bg-slate-50" />
          </div>

          {/* Earn Mode Selector */}
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <label className="block text-sm font-semibold text-slate-700 mb-2">Earn Mode</label>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setForm({ ...form, earnMode: 'per-dollar' })} disabled={!isManager}
                className={`p-3 rounded-lg border-2 text-left ${form.earnMode === 'per-dollar' ? 'border-blue-600 bg-blue-50' : 'border-slate-200 bg-white'} disabled:opacity-60`}>
                <div className="font-semibold text-sm">Points per Dollar</div>
                <div className="text-xs text-slate-500">Members earn based on spend amount</div>
              </button>
              <button onClick={() => setForm({ ...form, earnMode: 'per-visit' })} disabled={!isManager}
                className={`p-3 rounded-lg border-2 text-left ${form.earnMode === 'per-visit' ? 'border-blue-600 bg-blue-50' : 'border-slate-200 bg-white'} disabled:opacity-60`}>
                <div className="font-semibold text-sm">Points per Visit</div>
                <div className="text-xs text-slate-500">Members earn flat points per qualifying transaction</div>
              </button>
            </div>

            {form.earnMode === 'per-visit' && (
              <div className="grid grid-cols-3 gap-4 mt-4 p-4 bg-slate-50 rounded-lg">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Points per Visit</label>
                  <input type="number" min="1" value={form.pointsPerVisit ?? 10}
                    onChange={(e) => setForm({ ...form, pointsPerVisit: Number(e.target.value) })}
                    disabled={!isManager} className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm disabled:bg-slate-50" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Minimum Spend to Qualify ($)</label>
                  <input type="number" step="0.01" min="0" value={((form.visitMinSpendCents ?? 500) / 100).toFixed(2)}
                    onChange={(e) => setForm({ ...form, visitMinSpendCents: Math.round(Number(e.target.value) * 100) })}
                    disabled={!isManager} className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm disabled:bg-slate-50" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Max Visits per Day</label>
                  <input type="number" min="1" value={form.maxVisitsPerDay ?? ''}
                    onChange={(e) => setForm({ ...form, maxVisitsPerDay: e.target.value ? Number(e.target.value) : null })}
                    disabled={!isManager} placeholder="Unlimited"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm disabled:bg-slate-50" />
                </div>
              </div>
            )}
          </div>

          {/* Per-dollar: show base earn rate */}
          {form.earnMode !== 'per-visit' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Base Earn Rate (points per $1)</label>
                <input type="number" step="0.01" value={form.baseEarnRate ?? ''} onChange={(e) => setForm({ ...form, baseEarnRate: Number(e.target.value) })}
                  disabled={!isManager} className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm disabled:bg-slate-50" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Points Expiry (days)</label>
                <input type="number" value={form.pointsExpiryDays ?? ''} onChange={(e) => setForm({ ...form, pointsExpiryDays: Number(e.target.value) || undefined })}
                  disabled={!isManager} placeholder="No expiry" className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm disabled:bg-slate-50" />
              </div>
            </div>
          )}

          {/* Per-visit: still show expiry */}
          {form.earnMode === 'per-visit' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Points Expiry (days)</label>
                <input type="number" value={form.pointsExpiryDays ?? ''} onChange={(e) => setForm({ ...form, pointsExpiryDays: Number(e.target.value) || undefined })}
                  disabled={!isManager} placeholder="No expiry" className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm disabled:bg-slate-50" />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Void Window (hours)</label>
              <input type="number" value={form.voidWindowHours ?? ''} onChange={(e) => setForm({ ...form, voidWindowHours: Number(e.target.value) })}
                disabled={!isManager} className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm disabled:bg-slate-50" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Currency</label>
              <select value={form.currency ?? 'USD'} onChange={(e) => setForm({ ...form, currency: e.target.value })}
                disabled={!isManager} className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm disabled:bg-slate-50">
                <option value="USD">USD</option><option value="EUR">EUR</option><option value="GBP">GBP</option>
                <option value="JPY">JPY</option><option value="CAD">CAD</option><option value="AUD">AUD</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Promotional Multipliers */}
      {activeTab === 'promos' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600">Time-bound bonus earn multipliers. Customers earn extra points during active promotions.</p>
            {isManager && (
              <button onClick={() => setPromos([...promos, { type: 'global', multiplier: 2, name: '', startDate: new Date().toISOString().slice(0, 10), endDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10) }])}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700">
                + Add Promotion
              </button>
            )}
          </div>

          {promos.length === 0 && (
            <div className="bg-white rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-400">
              <p className="text-lg mb-1">No active promotions</p>
              <p className="text-sm">Add a promotional multiplier to boost point earning during special periods.</p>
            </div>
          )}

          {promos.map((p, i) => (
            <div key={i} className="bg-white rounded-lg border border-slate-200 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-blue-600 uppercase tracking-wide">Promotion {i + 1}</span>
                {isManager && (
                  <button onClick={() => setPromos(promos.filter((_, j) => j !== i))}
                    className="text-xs text-red-500 hover:text-red-700">Remove</button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Promotion Name</label>
                  <input type="text" value={p.name} onChange={(e) => { const u = [...promos]; u[i] = { ...p, name: e.target.value }; setPromos(u); }}
                    placeholder="e.g. Double Points Weekend" className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Multiplier</label>
                  <div className="flex items-center gap-2">
                    <input type="number" step="0.5" min="1" value={p.multiplier} onChange={(e) => { const u = [...promos]; u[i] = { ...p, multiplier: Number(e.target.value) }; setPromos(u); }}
                      className="w-24 px-3 py-1.5 border border-slate-300 rounded-md text-sm" />
                    <span className="text-sm text-slate-500">x points</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
                  <select value={p.type} onChange={(e) => { const u = [...promos]; u[i] = { ...p, type: e.target.value as PromoMultiplier['type'] }; setPromos(u); }}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm">
                    <option value="global">All Products</option>
                    <option value="category">Category</option>
                    <option value="sku">Specific SKU</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Start Date</label>
                  <input type="date" value={p.startDate} onChange={(e) => { const u = [...promos]; u[i] = { ...p, startDate: e.target.value }; setPromos(u); }}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">End Date</label>
                  <input type="date" value={p.endDate} onChange={(e) => { const u = [...promos]; u[i] = { ...p, endDate: e.target.value }; setPromos(u); }}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm" />
                </div>
              </div>
              {p.type !== 'global' && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{p.type === 'category' ? 'Category ID' : 'SKU'}</label>
                  <input type="text" value={p.match ?? ''} onChange={(e) => { const u = [...promos]; u[i] = { ...p, match: e.target.value }; setPromos(u); }}
                    placeholder={p.type === 'category' ? 'e.g. health' : 'e.g. VIT-001'} className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm" />
                </div>
              )}
              <div className="text-xs text-slate-400">
                {new Date(p.startDate) <= new Date() && new Date(p.endDate) >= new Date()
                  ? <span className="text-emerald-600 font-medium">Active now</span>
                  : new Date(p.startDate) > new Date()
                    ? <span className="text-amber-600">Scheduled</span>
                    : <span className="text-slate-400">Expired</span>
                }
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Category Multipliers */}
      {activeTab === 'categories' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600">Permanent bonus multipliers for product categories or specific SKUs. Always active.</p>
            {isManager && (
              <button onClick={() => setCategories([...categories, { type: 'category', match: '', multiplier: 2, name: '' }])}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700">
                + Add Multiplier
              </button>
            )}
          </div>

          {categories.length === 0 && (
            <div className="bg-white rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-400">
              <p className="text-lg mb-1">No category or SKU multipliers</p>
              <p className="text-sm">Add multipliers to reward purchases in specific product categories (e.g. 3x on health) or individual SKUs (e.g. 5x on VIT-001).</p>
            </div>
          )}

          {categories.map((c, i) => (
            <div key={i} className="bg-white rounded-lg border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-purple-600 uppercase tracking-wide">Multiplier {i + 1}</span>
                {isManager && (
                  <button onClick={() => setCategories(categories.filter((_, j) => j !== i))}
                    className="text-xs text-red-500 hover:text-red-700">Remove</button>
                )}
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Name</label>
                  <input type="text" value={c.name} onChange={(e) => { const u = [...categories]; u[i] = { ...c, name: e.target.value }; setCategories(u); }}
                    placeholder="e.g. Health Bonus" className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
                  <select value={c.type} onChange={(e) => { const u = [...categories]; u[i] = { ...c, type: e.target.value as 'category' | 'sku' }; setCategories(u); }}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm">
                    <option value="category">Category</option>
                    <option value="sku">Specific SKU</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{c.type === 'category' ? 'Category' : 'SKU'}</label>
                  <input type="text" value={c.match} onChange={(e) => { const u = [...categories]; u[i] = { ...c, match: e.target.value }; setCategories(u); }}
                    placeholder={c.type === 'category' ? 'health' : 'VIT-001'} className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Multiplier</label>
                  <div className="flex items-center gap-1">
                    <input type="number" step="0.5" min="1" value={c.multiplier} onChange={(e) => { const u = [...categories]; u[i] = { ...c, multiplier: Number(e.target.value) }; setCategories(u); }}
                      className="w-20 px-3 py-1.5 border border-slate-300 rounded-md text-sm" />
                    <span className="text-sm text-slate-500">x</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Save button */}
      {isManager && (
        <div className="mt-6 flex items-center justify-between">
          <button onClick={handleSave} disabled={update.isPending}
            className="px-5 py-2.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium">
            {update.isPending ? 'Saving...' : 'Save All Changes'}
          </button>
          {program && (
            <span className="text-xs text-slate-400">Last updated: {new Date(program.updatedAt).toLocaleString()}</span>
          )}
        </div>
      )}
    </div>
  );
}
