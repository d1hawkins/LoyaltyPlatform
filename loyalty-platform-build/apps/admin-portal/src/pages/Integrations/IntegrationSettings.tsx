import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../../api/client';

// ── Types ──

interface IntegrationSummary {
  provider: string;
  enabled: boolean;
  connected: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  contactsSynced: number;
  comingSoon: boolean;
}

interface IntegrationDetail {
  provider: string;
  enabled: boolean;
  connected: boolean;
  apiUrl?: string;
  apiKeyMasked?: string | null;
  listId?: string;
  automationMappings?: Record<string, string | null>;
  syncSchedule?: string;
  lastSyncAt?: string | null;
  lastSyncStatus?: string | null;
  contactsSynced?: number;
}

// ── Provider metadata ──

const PROVIDER_META: Record<
  string,
  { name: string; description: string; colorClass: string; borderHover: string; iconBg: string; iconColor: string }
> = {
  activecampaign: {
    name: 'ActiveCampaign',
    description: 'Email & SMS Marketing Automation',
    colorClass: 'blue',
    borderHover: 'hover:border-blue-500/30',
    iconBg: 'bg-blue-500/10',
    iconColor: 'text-blue-400',
  },
  klaviyo: {
    name: 'Klaviyo',
    description: 'E-Commerce Marketing Platform — Email, SMS & Push',
    colorClass: 'purple',
    borderHover: 'hover:border-purple-500/30',
    iconBg: 'bg-purple-500/10',
    iconColor: 'text-purple-400',
  },
  braze: {
    name: 'Braze',
    description: 'Enterprise Customer Engagement',
    colorClass: 'emerald',
    borderHover: 'hover:border-emerald-500/30',
    iconBg: 'bg-emerald-500/10',
    iconColor: 'text-emerald-400',
  },
  sendgrid: {
    name: 'SendGrid',
    description: 'Transactional & Marketing Email',
    colorClass: 'cyan',
    borderHover: 'hover:border-cyan-500/30',
    iconBg: 'bg-cyan-500/10',
    iconColor: 'text-cyan-400',
  },
};

const EVENT_TYPES = [
  { key: 'member.enrolled', label: 'Member Enrolled' },
  { key: 'tier.upgraded', label: 'Tier Upgraded' },
  { key: 'tier.downgraded', label: 'Tier Downgraded' },
  { key: 'points.earned', label: 'Points Earned' },
  { key: 'points.expiring', label: 'Points Expiring' },
];

const SYNC_SCHEDULES = [
  { value: 'realtime', label: 'Real-time' },
  { value: 'hourly', label: 'Hourly' },
  { value: 'daily', label: 'Daily' },
  { value: 'manual', label: 'Manual Only' },
];

// ── Provider icons ──

function ProviderIcon({ provider, className }: { provider: string; className?: string }) {
  const cls = className || 'w-6 h-6';
  switch (provider) {
    case 'activecampaign':
      // Envelope with lightning bolt — email automation
      return (
        <svg className={cls} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 14l-1.5-3L13 14zm-2 0l1.5 3L11 14z" />
        </svg>
      );
    case 'klaviyo':
      // Chart trending up — e-commerce analytics/marketing
      return (
        <svg className={cls} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
        </svg>
      );
    case 'braze':
      // Megaphone — customer engagement
      return (
        <svg className={cls} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 010 3.46" />
        </svg>
      );
    case 'sendgrid':
      // Paper airplane — transactional email
      return (
        <svg className={cls} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
        </svg>
      );
    default:
      // Puzzle piece — generic integration
      return (
        <svg className={cls} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 01-.657.643 48.491 48.491 0 01-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 01-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 00-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 01-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 00.657-.643v0c0-.355-.186-.676-.401-.959a1.647 1.647 0 01-.349-1.003c0-1.035 1.008-1.875 2.25-1.875 1.243 0 2.25.84 2.25 1.875 0 .369-.128.713-.349 1.003-.215.283-.401.604-.401.959v0c0 .333.277.599.61.58a48.1 48.1 0 005.427-.63 48.05 48.05 0 00.582-4.717.532.532 0 00-.533-.57v0c-.355 0-.676.186-.959.401-.29.221-.634.349-1.003.349-1.035 0-1.875-1.007-1.875-2.25s.84-2.25 1.875-2.25c.37 0 .713.128 1.003.349.283.215.604.401.959.401v0a.656.656 0 00.658-.663 48.422 48.422 0 00-.37-5.36c-1.886.342-3.81.574-5.766.689a.578.578 0 01-.61-.58v0z" />
        </svg>
      );
  }
}

// ── Main page ──

export function IntegrationSettings() {
  const [integrations, setIntegrations] = useState<IntegrationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [detail, setDetail] = useState<IntegrationDetail | null>(null);

  // Form state
  const [formApiUrl, setFormApiUrl] = useState('');
  const [formApiKey, setFormApiKey] = useState('');
  const [formListId, setFormListId] = useState('');
  const [formMappings, setFormMappings] = useState<Record<string, string>>({});
  const [formSchedule, setFormSchedule] = useState('hourly');

  // Action state
  const [testResult, setTestResult] = useState<{ success: boolean; accountName?: string; error?: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ synced: number; errors: number } | null>(null);

  const fetchIntegrations = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.getIntegrations();
      setIntegrations(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load integrations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  const openConfig = async (provider: string) => {
    setSelectedProvider(provider);
    setTestResult(null);
    setSyncResult(null);
    try {
      const d = await apiClient.getIntegrationDetail(provider);
      setDetail(d);
      setFormApiUrl(d.apiUrl || '');
      setFormApiKey(''); // Don't pre-fill key
      setFormListId(d.listId || '');
      setFormSchedule(d.syncSchedule || 'hourly');
      const mappings: Record<string, string> = {};
      if (d.automationMappings) {
        for (const [k, v] of Object.entries(d.automationMappings)) {
          mappings[k] = v ?? '';
        }
      }
      setFormMappings(mappings);
    } catch {
      setDetail(null);
      setFormApiUrl('');
      setFormApiKey('');
      setFormListId('');
      setFormMappings({});
      setFormSchedule('hourly');
    }
  };

  const closeModal = () => {
    setSelectedProvider(null);
    setDetail(null);
    setTestResult(null);
    setSyncResult(null);
  };

  const isKlaviyo = selectedProvider === 'klaviyo';

  const testConnection = async () => {
    if (!selectedProvider) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await apiClient.testIntegration(selectedProvider, {
        apiUrl: isKlaviyo ? undefined : formApiUrl,
        apiKey: formApiKey || undefined,
      });
      setTestResult(result);
    } catch (err) {
      setTestResult({ success: false, error: err instanceof Error ? err.message : 'Test failed' });
    } finally {
      setTesting(false);
    }
  };

  const saveConfig = async () => {
    if (!selectedProvider) return;
    setSaving(true);
    try {
      const cleanMappings: Record<string, string | null> = {};
      for (const [k, v] of Object.entries(formMappings)) {
        cleanMappings[k] = v || null;
      }
      await apiClient.saveIntegration(selectedProvider, {
        apiUrl: isKlaviyo ? 'https://a.klaviyo.com' : formApiUrl,
        apiKey: formApiKey || (detail?.apiKeyMasked ? '__keep__' : ''),
        listId: formListId,
        automationMappings: cleanMappings,
        syncSchedule: formSchedule,
      });
      await fetchIntegrations();
      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const triggerSync = async () => {
    if (!selectedProvider) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      const result = await apiClient.syncIntegration(selectedProvider);
      setSyncResult(result);
      await fetchIntegrations();
    } catch (err) {
      setSyncResult({ synced: 0, errors: -1 });
    } finally {
      setSyncing(false);
    }
  };

  const disconnectProvider = async () => {
    if (!selectedProvider) return;
    if (!window.confirm(`Are you sure you want to disconnect ${PROVIDER_META[selectedProvider]?.name ?? selectedProvider}?`)) return;
    try {
      await apiClient.disconnectIntegration(selectedProvider);
      await fetchIntegrations();
      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect');
    }
  };

  // ── Render ──

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Marketing Integrations</h1>
        <p className="text-sm text-slate-500 mt-1">
          Connect your loyalty program to marketing automation tools.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">dismiss</button>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-slate-400">Loading integrations...</div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {integrations.map((int) => {
            const meta = PROVIDER_META[int.provider];
            if (!meta) return null;
            return (
              <div
                key={int.provider}
                className={`bg-white border border-slate-200 rounded-xl p-5 transition ${meta.borderHover} relative`}
              >
                {int.comingSoon && (
                  <span className="absolute top-3 right-3 text-xs font-medium bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                    Coming Soon
                  </span>
                )}
                <div className={`w-10 h-10 flex items-center justify-center rounded-lg ${meta.iconBg} ${meta.iconColor} mb-3`}>
                  <ProviderIcon provider={int.provider} className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-semibold text-slate-900 mb-0.5">{meta.name}</h3>
                <p className="text-xs text-slate-500 mb-3">{meta.description}</p>

                {/* Status */}
                <div className="mb-3">
                  {int.connected ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Connected
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                      Not Connected
                    </span>
                  )}
                </div>

                {int.connected && int.lastSyncAt && (
                  <div className="text-xs text-slate-400 mb-3">
                    Last sync: {new Date(int.lastSyncAt).toLocaleString()} ({int.contactsSynced} contacts)
                  </div>
                )}

                <button
                  onClick={() => !int.comingSoon && openConfig(int.provider)}
                  disabled={int.comingSoon}
                  className={`w-full text-sm font-medium py-2 rounded-lg transition ${
                    int.comingSoon
                      ? 'bg-slate-50 text-slate-400 cursor-not-allowed'
                      : int.connected
                        ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        : 'bg-blue-600 text-white hover:bg-blue-500'
                  }`}
                >
                  {int.comingSoon ? 'Coming Soon' : int.connected ? 'Configure' : 'Connect'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Configuration Modal ── */}
      {selectedProvider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900">
                {PROVIDER_META[selectedProvider]?.name} Integration
              </h2>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Klaviyo logo placeholder */}
              {isKlaviyo && (
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-8 h-8 flex items-center justify-center rounded-lg bg-purple-600 text-white text-sm font-bold">K</span>
                  <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">KLAVIYO</span>
                </div>
              )}

              {/* API URL — ActiveCampaign only */}
              {!isKlaviyo && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">API URL</label>
                  <input
                    type="url"
                    value={formApiUrl}
                    onChange={(e) => setFormApiUrl(e.target.value)}
                    placeholder="https://account.api-us1.com"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  />
                </div>
              )}

              {/* API Key */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {isKlaviyo ? 'Private API Key' : 'API Key'}
                </label>
                <input
                  type="password"
                  value={formApiKey}
                  onChange={(e) => setFormApiKey(e.target.value)}
                  placeholder={detail?.apiKeyMasked ?? (isKlaviyo ? 'Enter your Klaviyo private API key' : 'Enter your API key')}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
                {isKlaviyo && (
                  <p className="text-xs text-slate-400 mt-1">
                    Found in Klaviyo &rarr; Settings &rarr; API Keys. Use a Private API key, not a public site ID.
                  </p>
                )}
              </div>

              {/* List ID */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {isKlaviyo ? 'List ID' : 'List ID'}
                </label>
                <input
                  type="text"
                  value={formListId}
                  onChange={(e) => setFormListId(e.target.value)}
                  placeholder={isKlaviyo ? 'e.g. AbCdEf' : '1'}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
                {isKlaviyo && (
                  <p className="text-xs text-slate-400 mt-1">
                    Klaviyo list ID to add loyalty member profiles to. Found in Lists &amp; Segments.
                  </p>
                )}
              </div>

              {/* Test Connection */}
              <div className="flex items-center gap-3">
                <button
                  onClick={testConnection}
                  disabled={testing || (!isKlaviyo && !formApiUrl)}
                  className="text-sm font-medium bg-slate-100 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-200 transition disabled:opacity-50"
                >
                  {testing ? 'Testing...' : 'Test Connection'}
                </button>
                {testResult && (
                  <span className={`text-sm ${testResult.success ? 'text-emerald-600' : 'text-red-600'}`}>
                    {testResult.success
                      ? `Connected successfully${testResult.accountName ? ` (${testResult.accountName})` : ''}`
                      : testResult.error ?? 'Connection failed'}
                  </span>
                )}
              </div>

              {/* Event / Automation Mappings */}
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-2 border-t border-slate-200 pt-4">
                  {isKlaviyo ? 'Event Mappings' : 'Automation Mappings'}
                </h3>
                {isKlaviyo && (
                  <p className="text-xs text-slate-400 mb-3">
                    Map loyalty events to Klaviyo metric/event names. These appear in Klaviyo flows.
                  </p>
                )}
                <div className="space-y-2">
                  {EVENT_TYPES.map((evt) => {
                    const klaviyoDefaults: Record<string, string> = {
                      'member.enrolled': 'Loyalty Member Enrolled',
                      'tier.upgraded': 'Loyalty Tier Upgraded',
                      'tier.downgraded': 'Loyalty Tier Downgraded',
                      'points.earned': 'Loyalty Points Earned',
                      'points.expiring': 'Loyalty Points Expiring',
                    };
                    return (
                      <div key={evt.key} className="flex items-center gap-3">
                        <label className="text-sm text-slate-600 w-36 flex-shrink-0">{evt.label}</label>
                        <input
                          type="text"
                          value={formMappings[evt.key] ?? ''}
                          onChange={(e) => setFormMappings((m) => ({ ...m, [evt.key]: e.target.value }))}
                          placeholder={isKlaviyo ? (klaviyoDefaults[evt.key] ?? 'Event name') : 'Automation ID'}
                          className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Sync Settings */}
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-2 border-t border-slate-200 pt-4">
                  Sync Schedule
                </h3>
                <div className="flex items-center gap-3">
                  <label className="text-sm text-slate-600 w-20">Schedule:</label>
                  <select
                    value={formSchedule}
                    onChange={(e) => setFormSchedule(e.target.value)}
                    className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  >
                    {SYNC_SCHEDULES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
                {detail?.lastSyncAt && (
                  <div className="text-xs text-slate-400 mt-2">
                    Last sync: {new Date(detail.lastSyncAt).toLocaleString()} ({detail.contactsSynced ?? 0} contacts)
                  </div>
                )}
                <button
                  onClick={triggerSync}
                  disabled={syncing || !detail?.connected}
                  className="mt-2 text-sm font-medium bg-slate-100 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-200 transition disabled:opacity-50"
                >
                  {syncing ? 'Syncing...' : 'Sync Now'}
                </button>
                {syncResult && (
                  <div className="text-xs mt-1 text-slate-500">
                    Synced {syncResult.synced} contacts{syncResult.errors > 0 ? `, ${syncResult.errors} errors` : ''}
                  </div>
                )}
              </div>

              {/* Custom Properties / Fields Info */}
              {isKlaviyo ? (
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-xs text-purple-800">
                  <p className="font-medium mb-1">Custom Properties</p>
                  <p>
                    These profile properties are synced: Loyalty Tier, Loyalty Points, Loyalty Member ID,
                    Loyalty Enrolled At, Loyalty Status.
                  </p>
                </div>
              ) : (
                <>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
                    <p className="font-medium mb-1">Custom Fields</p>
                    <p>
                      The following custom fields will be synced to your contacts:
                      LOYALTY_TIER, LOYALTY_POINTS, LOYALTY_MEMBER_ID, LOYALTY_ENROLLED_AT, LOYALTY_STATUS.
                      Create these as custom fields in your ActiveCampaign account.
                    </p>
                  </div>

                  {/* Merge Tag Reference */}
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600">
                    <p className="font-medium mb-1">Merge Tags for Email Templates</p>
                    <p className="font-mono">%LOYALTY_TIER% &middot; %LOYALTY_POINTS% &middot; %LOYALTY_MEMBER_ID%</p>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
              <div>
                {detail?.connected && (
                  <button
                    onClick={disconnectProvider}
                    className="text-sm font-medium text-red-600 hover:text-red-700 transition"
                  >
                    Disconnect
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={closeModal}
                  className="text-sm font-medium text-slate-600 hover:text-slate-800 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={saveConfig}
                  disabled={saving || (!isKlaviyo && !formApiUrl)}
                  className="text-sm font-medium bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-500 transition disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
