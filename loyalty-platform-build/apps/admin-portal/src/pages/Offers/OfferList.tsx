import { useState, useEffect, useCallback, Fragment } from 'react';

const OFFER_API_URL = import.meta.env?.VITE_OFFER_URL as string || import.meta.env?.VITE_API_URL as string || '';
const TENANT_ID = import.meta.env?.VITE_TENANT_ID as string || '';

const headers: Record<string, string> = {
  'Content-Type': 'application/json',
  'x-tenant-id': TENANT_ID,
  'x-user-id': 'admin',
  'x-user-role': 'owner',
};

interface Offer {
  offerId: string;
  offer_id?: string;
  name: string;
  type: string;
  value: number;
  pointsCost: number | null;
  isActive: boolean;
  is_active?: boolean;
  validFrom: string;
  valid_from?: string;
  validTo: string;
  valid_to?: string;
  currentRedemptions: number;
  current_redemptions?: number;
  maxRedemptions: number | null;
  max_redemptions?: number | null;
}

function normalizeOffer(o: Record<string, unknown>): Offer {
  return {
    offerId: (o.offerId ?? o.offer_id ?? '') as string,
    name: (o.name ?? '') as string,
    type: (o.type ?? '') as string,
    value: (o.value ?? 0) as number,
    pointsCost: (o.pointsCost ?? o.points_cost ?? null) as number | null,
    isActive: (o.isActive ?? o.is_active ?? true) as boolean,
    validFrom: (o.validFrom ?? o.valid_from ?? '') as string,
    validTo: (o.validTo ?? o.valid_to ?? '') as string,
    currentRedemptions: (o.currentRedemptions ?? o.current_redemptions ?? 0) as number,
    maxRedemptions: (o.maxRedemptions ?? o.max_redemptions ?? null) as number | null,
  };
}

export function OfferList() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [defaultType, setDefaultType] = useState<string>('percent');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadOffers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${OFFER_API_URL}/v1/offers?active=true`, { headers });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      const items = Array.isArray(data) ? data : data.items || [];
      setOffers(items.map((o: Record<string, unknown>) => normalizeOffer(o)));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const expireOffer = async (offerId: string, name: string) => {
    if (!confirm(`Expire "${name}"? This offer will no longer be available to members.`)) return;
    try {
      await fetch(`${OFFER_API_URL}/v1/offers/${offerId}`, { method: 'DELETE', headers });
      loadOffers();
    } catch {
      alert('Failed to expire offer');
    }
  };

  useEffect(() => { loadOffers(); }, [loadOffers]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Offers</h1>

      <div className="bg-white rounded-lg border border-slate-200">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Active Offers</h2>
          <button
            onClick={() => { setDefaultType('percent'); setShowCreate(true); }}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Create Offer
          </button>
        </div>

        {loading && <div className="p-8 text-center text-slate-400">Loading offers...</div>}

        {error && (
          <div className="p-4 bg-red-50 border-b border-red-100 text-sm text-red-700">
            Could not load offers ({error}).
          </div>
        )}

        {!loading && !error && offers.length === 0 && (
          <div className="p-8 text-center text-slate-400">
            <p className="text-lg mb-2">No offers configured yet</p>
            <p className="text-sm">Click "Create Offer" to set up your first loyalty offer.</p>
          </div>
        )}

        {!loading && offers.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Value</th>
                <th className="px-4 py-3 font-medium">Points Cost</th>
                <th className="px-4 py-3 font-medium">Valid Until</th>
                <th className="px-4 py-3 font-medium">Redemptions</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {offers.map((o) => {
                const isExpanded = expandedId === o.offerId;
                const raw = o as unknown as Record<string, unknown>;
                return (
                <Fragment key={o.offerId}>
                <tr className={`hover:bg-slate-50 cursor-pointer ${isExpanded ? 'bg-blue-50/50' : ''}`}
                  onClick={() => setExpandedId(isExpanded ? null : o.offerId)}>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <div className="flex items-center gap-2">
                      <svg className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      {o.name}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">{o.type}</span>
                  </td>
                  <td className="px-4 py-3">{o.type === 'percent' ? `${o.value}%` : `$${o.value}`}</td>
                  <td className="px-4 py-3">{o.pointsCost ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {o.validTo ? new Date(o.validTo).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {o.currentRedemptions}{o.maxRedemptions ? ` / ${o.maxRedemptions}` : ''}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 text-xs rounded-full ${o.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {o.isActive ? 'Active' : 'Expired'}
                    </span>
                  </td>
                  <td className="px-4 py-3" onClick={(ev) => ev.stopPropagation()}>
                    {o.isActive ? (
                      <button
                        onClick={() => expireOffer(o.offerId, o.name)}
                        className="px-2 py-1 text-xs font-medium text-red-600 bg-red-50 rounded hover:bg-red-100 transition"
                      >
                        Expire
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                </tr>
                {isExpanded && (
                  <tr>
                    <td colSpan={8} className="bg-slate-50/80 px-8 py-4">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-3 text-sm">
                        <div><span className="text-xs text-slate-500 block">Offer ID</span><span className="font-mono text-xs">{o.offerId}</span></div>
                        <div><span className="text-xs text-slate-500 block">Type</span><span className="font-medium">{o.type}</span></div>
                        <div><span className="text-xs text-slate-500 block">Value</span><span className="font-medium">{o.type === 'percent' ? `${o.value}%` : `$${o.value}`}</span></div>
                        <div><span className="text-xs text-slate-500 block">Points Cost</span><span>{o.pointsCost ?? 'None (free)'}</span></div>
                        <div><span className="text-xs text-slate-500 block">Min Purchase to Redeem</span><span>{raw.minPurchase ? `$${Number(raw.minPurchase).toFixed(2)}` : 'None'}</span></div>
                        <div><span className="text-xs text-slate-500 block">Min Spend per Visit</span><span>{raw.visitMinSpendCents ? `$${(Number(raw.visitMinSpendCents) / 100).toFixed(2)}` : 'Any'}</span></div>
                        <div><span className="text-xs text-slate-500 block">Per-Member Limit</span><span>{String(raw.perMemberLimit ?? 'Unlimited')}</span></div>
                        <div><span className="text-xs text-slate-500 block">Max Redemptions</span><span>{o.maxRedemptions ?? 'Unlimited'}</span></div>
                        <div><span className="text-xs text-slate-500 block">Current Redemptions</span><span>{o.currentRedemptions}</span></div>
                        <div><span className="text-xs text-slate-500 block">Stackable</span><span>{raw.isStackable ? 'Yes' : 'No'}</span></div>
                        <div><span className="text-xs text-slate-500 block">Valid From</span><span>{o.validFrom ? new Date(o.validFrom).toLocaleDateString() : '—'}</span></div>
                        <div><span className="text-xs text-slate-500 block">Valid To</span><span>{o.validTo ? new Date(o.validTo).toLocaleDateString() : '—'}</span></div>
                        <div><span className="text-xs text-slate-500 block">Status</span><span className={o.isActive ? 'text-emerald-600 font-medium' : 'text-slate-400'}>{o.isActive ? 'Active' : 'Expired'}</span></div>
                      </div>
                      {/* Visit requirements */}
                      {typeof raw.minVisits === 'number' && raw.minVisits > 0 && (
                        <div className="mt-4 pt-3 border-t border-slate-200">
                          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Visit Requirements</h4>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-2 text-sm">
                            <div><span className="text-xs text-slate-500 block">Visits Required</span><span className="font-medium">{raw.minVisits as number}</span></div>
                            <div><span className="text-xs text-slate-500 block">Time Window</span><span>{raw.visitWindowDays ? `${raw.visitWindowDays} days` : 'Lifetime'}</span></div>
                            <div><span className="text-xs text-slate-500 block">Reset on Redeem</span><span>{raw.visitResetOnRedeem ? 'Yes (punch card)' : 'No'}</span></div>
                            <div><span className="text-xs text-slate-500 block">Min Spend/Visit</span><span>{raw.visitMinSpendCents ? `$${((raw.visitMinSpendCents as number) / 100).toFixed(2)}` : 'Any'}</span></div>
                            <div><span className="text-xs text-slate-500 block">Min Items/Visit</span><span>{String(raw.visitMinItems ?? 'Any')}</span></div>
                            <div><span className="text-xs text-slate-500 block">Count Mode</span><span>{raw.visitCountMode === 'per-day' ? 'Per Day' : 'Per Transaction'}</span></div>
                            {Array.isArray(raw.visitChannels) && raw.visitChannels.length > 0 && (
                              <div><span className="text-xs text-slate-500 block">Channels</span><span>{raw.visitChannels.join(', ')}</span></div>
                            )}
                            {Array.isArray(raw.visitStoreIds) && raw.visitStoreIds.length > 0 && (
                              <div><span className="text-xs text-slate-500 block">Stores</span><span>{raw.visitStoreIds.join(', ')}</span></div>
                            )}
                          </div>
                        </div>
                      )}
                      <div className="mt-3 text-xs text-slate-400">Created: {raw.createdAt ? new Date(raw.createdAt as string).toLocaleString() : '—'}</div>
                    </td>
                  </tr>
                )}
                </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        {([
          { label: 'Percentage Discount', type: 'percent' },
          { label: 'Fixed Amount Off', type: 'fixed' },
          { label: 'Free Item', type: 'freeitem' },
          { label: 'Threshold Reward', type: 'threshold' },
        ] as const).map((card) => (
          <div
            key={card.type}
            onClick={() => { setDefaultType(card.type); setShowCreate(true); }}
            className="bg-white rounded-lg border border-slate-200 p-4 text-center hover:shadow-sm transition-shadow cursor-pointer"
          >
            <div className="text-sm font-medium text-slate-700">{card.label}</div>
            <div className="text-xs text-slate-400 mt-1">Click to create</div>
          </div>
        ))}
      </div>

      {showCreate && (
        <CreateOfferModal
          defaultType={defaultType}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); loadOffers(); }}
        />
      )}
    </div>
  );
}

function CreateOfferModal({ defaultType, onClose, onCreated }: { defaultType?: string; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    name: '',
    type: (defaultType || 'percent') as 'percent' | 'fixed' | 'bogo' | 'threshold' | 'freeitem',
    value: 10,
    freeItemSku: '',
    freeItemName: '',
    pointsCost: '',
    minPurchase: '',
    maxRedemptions: '',
    perMemberLimit: '1',
    validFrom: new Date().toISOString().slice(0, 10),
    validTo: new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10),
    // Visit-based eligibility
    requireVisits: false,
    minVisits: '5',
    visitWindowDays: '30',
    visitResetOnRedeem: true,
    visitMinSpendCents: '',
    visitMinItems: '',
    visitChannels: [] as string[],
    visitStoreIds: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) { setError('Name is required'); return; }
    setSaving(true);
    setError('');
    try {
      const offerType = form.type === 'freeitem' ? 'fixed' : form.type;
      const body: Record<string, unknown> = {
        name: form.name,
        type: offerType,
        value: form.value,
        validFrom: new Date(form.validFrom).toISOString(),
        validTo: new Date(form.validTo + 'T23:59:59Z').toISOString(),
      };
      if (form.type === 'freeitem') {
        body.conditionsJson = {
          freeItem: true,
          sku: form.freeItemSku || undefined,
          itemName: form.freeItemName || undefined,
        };
        body.description = `Free ${form.freeItemName || 'item'}${form.freeItemSku ? ' (' + form.freeItemSku + ')' : ''}`;
      }
      if (form.pointsCost) body.pointsCost = Number(form.pointsCost);
      if (form.minPurchase) body.minPurchase = Number(form.minPurchase);
      if (form.maxRedemptions) body.maxRedemptions = Number(form.maxRedemptions);
      if (form.perMemberLimit) body.perMemberLimit = Number(form.perMemberLimit);

      // Visit-based eligibility
      if (form.requireVisits) {
        body.minVisits = Number(form.minVisits) || 0;
        if (form.visitWindowDays) body.visitWindowDays = Number(form.visitWindowDays);
        body.visitResetOnRedeem = form.visitResetOnRedeem;
        if (form.visitMinSpendCents) body.visitMinSpendCents = Number(form.visitMinSpendCents);
        if (form.visitMinItems) body.visitMinItems = Number(form.visitMinItems);
        if (form.visitChannels.length > 0) body.visitChannels = form.visitChannels;
        if (form.visitStoreIds.trim()) body.visitStoreIds = form.visitStoreIds.split(',').map((s: string) => s.trim()).filter(Boolean);
      }

      const res = await fetch(`${OFFER_API_URL}/v1/offers`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as Record<string, string>).detail || `Error ${res.status}`);
      }
      onCreated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const set = (field: string, value: string | number | boolean) => setForm((f) => ({ ...f, [field]: value }));

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-slate-900 mb-4">Create Offer</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Offer Name</label>
            <input value={form.name} onChange={(e) => set('name', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder="e.g. 10% Off Summer Sale" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
              <select value={form.type} onChange={(e) => set('type', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm">
                <option value="percent">Percentage Discount</option>
                <option value="fixed">Fixed Amount Off</option>
                <option value="bogo">Buy One Get One</option>
                <option value="freeitem">Free Item</option>
                <option value="threshold">Threshold Reward</option>
              </select>
            </div>
            {form.type === 'freeitem' ? (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Max Item Value ($) <span className="text-slate-400 font-normal">optional</span></label>
                <input type="number" value={form.value || ''} onChange={(e) => set('value', Number(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" min={0} step="0.01"
                  placeholder="Any value" />
                <p className="text-xs text-slate-400 mt-1">Leave empty for any item. Set to limit (e.g. $3 = free item up to $3).</p>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Value {form.type === 'percent' ? '(%)' : form.type === 'bogo' ? '($ value of free item)' : '($)'}
                </label>
                <input type="number" value={form.value} onChange={(e) => set('value', Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" min={0} />
              </div>
            )}
          </div>
          {form.type === 'freeitem' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Specific SKU <span className="text-slate-400 font-normal">optional</span></label>
                <input type="text" value={form.freeItemSku} onChange={(e) => set('freeItemSku', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  placeholder="e.g. MUG-001" />
                <p className="text-xs text-slate-400 mt-1">Leave empty = customer picks any item</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Item Name <span className="text-slate-400 font-normal">optional</span></label>
                <input type="text" value={form.freeItemName} onChange={(e) => set('freeItemName', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  placeholder="e.g. Ceramic Mug" />
                <p className="text-xs text-slate-400 mt-1">Display name shown to customer</p>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Points Cost (optional)</label>
              <input type="number" value={form.pointsCost} onChange={(e) => set('pointsCost', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder="0" min={0} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Min Purchase $ (optional)</label>
              <input type="number" value={form.minPurchase} onChange={(e) => set('minPurchase', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder="0" min={0} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Valid From</label>
              <input type="date" value={form.validFrom} onChange={(e) => set('validFrom', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Valid To</label>
              <input type="date" value={form.validTo} onChange={(e) => set('validTo', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Max Total Redemptions</label>
              <input type="number" value={form.maxRedemptions} onChange={(e) => set('maxRedemptions', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder="Unlimited" min={1} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Per-Member Limit</label>
              <input type="number" value={form.perMemberLimit} onChange={(e) => set('perMemberLimit', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" min={1} />
            </div>
          </div>

          {/* ── Visit Requirements ── */}
          <div className="border-t border-slate-200 pt-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.requireVisits}
                onChange={(e) => set('requireVisits', e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-600" />
              <span className="text-sm font-medium text-slate-700">Require minimum visits to unlock this offer</span>
            </label>

            {form.requireVisits && (
              <div className="mt-3 space-y-3 pl-6 border-l-2 border-blue-200">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Visits Required</label>
                    <input type="number" value={form.minVisits} onChange={(e) => set('minVisits', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" min={1} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Time Window</label>
                    <select value={form.visitWindowDays} onChange={(e) => set('visitWindowDays', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm">
                      <option value="">Lifetime</option>
                      <option value="7">7 days</option>
                      <option value="14">14 days</option>
                      <option value="30">30 days</option>
                      <option value="60">60 days</option>
                      <option value="90">90 days</option>
                      <option value="180">180 days</option>
                      <option value="365">365 days</option>
                    </select>
                  </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.visitResetOnRedeem}
                    onChange={(e) => set('visitResetOnRedeem', e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600" />
                  <span className="text-sm text-slate-600">Reset after use (punch-card style)</span>
                </label>

                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider pt-1">Visit Qualification Rules</div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Min Spend per Visit ($)</label>
                    <input type="text" inputMode="numeric"
                      value={form.visitMinSpendCents ? '$' + (Number(form.visitMinSpendCents) / 100).toFixed(2) : ''}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/[^0-9]/g, '');
                        set('visitMinSpendCents', digits || '');
                      }}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder="$0.00" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Min Items per Visit</label>
                    <input type="number" value={form.visitMinItems} onChange={(e) => set('visitMinItems', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder="Any basket" min={0} />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Channels</label>
                  <div className="flex flex-wrap gap-3">
                    {['in-store', 'mobile', 'dotcom'].map((ch) => (
                      <label key={ch} className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={form.visitChannels.includes(ch)}
                          onChange={(e) => {
                            const channels = e.target.checked
                              ? [...form.visitChannels, ch]
                              : form.visitChannels.filter((c: string) => c !== ch);
                            setForm((f) => ({ ...f, visitChannels: channels }));
                          }}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600" />
                        <span className="text-sm text-slate-600 capitalize">{ch}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Stores (comma-separated IDs, leave empty for all)</label>
                  <input type="text" value={form.visitStoreIds} onChange={(e) => set('visitStoreIds', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder="e.g. DAISO-042, DAISO-043" />
                </div>
              </div>
            )}
          </div>

          {error && <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</div>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Creating...' : 'Create Offer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
