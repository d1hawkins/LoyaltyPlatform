import type { ChannelConfig, Channel, EcommercePlatform } from '../api/types';

interface ChannelConfigFormProps {
  data: ChannelConfig;
  errors: Record<string, string>;
  onChange: <K extends keyof ChannelConfig>(field: K, value: ChannelConfig[K]) => void;
}

const CHANNEL_OPTIONS: { value: Channel; label: string; description: string; icon: string }[] = [
  { value: 'pos', label: 'Point of Sale', description: 'In-store terminals and registers', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { value: 'ecommerce', label: 'E-Commerce', description: 'Online store integration', icon: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z' },
  { value: 'mobile', label: 'Mobile App', description: 'Native iOS/Android app', icon: 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z' },
];

const ECOMMERCE_PLATFORMS: { value: EcommercePlatform; label: string }[] = [
  { value: 'shopify', label: 'Shopify' },
  { value: 'woocommerce', label: 'WooCommerce' },
  { value: 'custom', label: 'Custom / API Integration' },
  { value: 'other', label: 'Other' },
];

export function ChannelConfigForm({ data, errors, onChange }: ChannelConfigFormProps) {
  const toggleChannel = (channel: Channel) => {
    const channels = data.channels.includes(channel)
      ? data.channels.filter((c) => c !== channel)
      : [...data.channels, channel];
    onChange('channels', channels);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Channel Configuration</h2>
        <p className="text-sm text-slate-500 mt-1">Select the channels where your customers will earn and redeem points.</p>
      </div>

      {/* Channel Selection */}
      <div className="space-y-3">
        {CHANNEL_OPTIONS.map((ch) => {
          const selected = data.channels.includes(ch.value);
          return (
            <button
              key={ch.value}
              type="button"
              onClick={() => toggleChannel(ch.value)}
              className={`
                w-full flex items-center gap-4 p-4 rounded-lg border-2 text-left transition-all
                ${selected ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300 bg-white'}
              `}
            >
              <div className={`
                flex items-center justify-center w-10 h-10 rounded-lg
                ${selected ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500'}
              `}>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={ch.icon} />
                </svg>
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-slate-900">{ch.label}</div>
                <div className="text-xs text-slate-500">{ch.description}</div>
              </div>
              <div className={`
                w-5 h-5 rounded border-2 flex items-center justify-center
                ${selected ? 'bg-brand-600 border-brand-600' : 'border-slate-300'}
              `}>
                {selected && (
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            </button>
          );
        })}
        {errors['channels'] && <p className="text-xs text-red-600">{errors['channels']}</p>}
      </div>

      {/* POS: Terminal Count */}
      {data.channels.includes('pos') && (
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
          <label htmlFor="posTerminals" className="form-label">How many POS terminals?</label>
          <input
            id="posTerminals"
            type="number"
            min={1}
            max={100}
            className="input-field w-32"
            value={data.posTerminals}
            onChange={(e) => onChange('posTerminals', Math.max(1, Math.min(100, Number(e.target.value))))}
          />
        </div>
      )}

      {/* E-Commerce: Platform */}
      {data.channels.includes('ecommerce') && (
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
          <label htmlFor="ecommercePlatform" className="form-label">E-Commerce Platform</label>
          <select
            id="ecommercePlatform"
            className="select-field w-64"
            value={data.ecommercePlatform}
            onChange={(e) => onChange('ecommercePlatform', e.target.value as EcommercePlatform)}
          >
            {ECOMMERCE_PLATFORMS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
