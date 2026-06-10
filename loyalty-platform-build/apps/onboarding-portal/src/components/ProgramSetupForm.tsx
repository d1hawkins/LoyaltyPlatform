import type { ProgramSetup, ExpiryMonths } from '../api/types';

interface ProgramSetupFormProps {
  data: ProgramSetup;
  errors: Record<string, string>;
  onChange: <K extends keyof ProgramSetup>(field: K, value: ProgramSetup[K]) => void;
}

const EXPIRY_OPTIONS: { value: ExpiryMonths; label: string }[] = [
  { value: 6, label: '6 months' },
  { value: 12, label: '12 months' },
  { value: 18, label: '18 months' },
  { value: 24, label: '24 months' },
];

export function ProgramSetupForm({ data, errors, onChange }: ProgramSetupFormProps) {
  const updateTierName = (index: number, name: string) => {
    const newTiers = [...data.tiers];
    newTiers[index] = { ...newTiers[index]!, name };
    onChange('tiers', newTiers);
  };

  const updateTierThreshold = (index: number, threshold: number) => {
    const newTiers = [...data.tiers];
    newTiers[index] = { ...newTiers[index]!, threshold };
    onChange('tiers', newTiers);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Loyalty Program Setup</h2>
        <p className="text-sm text-slate-500 mt-1">Configure how your customers earn and redeem rewards.</p>
      </div>

      {/* Program Name */}
      <div>
        <label htmlFor="programName" className="form-label">Program Name *</label>
        <input
          id="programName"
          type="text"
          className="input-field"
          placeholder="Daiso Rewards"
          value={data.programName}
          onChange={(e) => onChange('programName', e.target.value)}
        />
        {errors['programName'] && <p className="mt-1 text-xs text-red-600">{errors['programName']}</p>}
      </div>

      {/* Base Earn Rate */}
      <div>
        <label htmlFor="baseEarnRate" className="form-label">
          Base Earn Rate: <span className="text-brand-600 font-bold">{data.baseEarnRate}</span> point{data.baseEarnRate > 1 ? 's' : ''} per $1
        </label>
        <input
          id="baseEarnRate"
          type="range"
          min={1}
          max={10}
          step={1}
          className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-brand-600"
          value={data.baseEarnRate}
          onChange={(e) => onChange('baseEarnRate', Number(e.target.value))}
        />
        <div className="flex justify-between text-xs text-slate-400 mt-1">
          <span>1 pt/$1</span>
          <span>10 pts/$1</span>
        </div>
      </div>

      {/* Tier Toggle */}
      <div className="border border-slate-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Enable Tiers</h3>
            <p className="text-xs text-slate-500 mt-0.5">Reward your best customers with tier-based benefits</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={data.enableTiers}
            onClick={() => onChange('enableTiers', !data.enableTiers)}
            className={`
              relative inline-flex h-6 w-11 items-center rounded-full transition-colors
              ${data.enableTiers ? 'bg-brand-600' : 'bg-slate-300'}
            `}
          >
            <span
              className={`
                inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                ${data.enableTiers ? 'translate-x-6' : 'translate-x-1'}
              `}
            />
          </button>
        </div>

        {data.enableTiers && (
          <div className="mt-4 space-y-3">
            {data.tiers.map((tier, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="flex-1">
                  <input
                    type="text"
                    className="input-field text-sm"
                    placeholder="Tier name"
                    value={tier.name}
                    onChange={(e) => updateTierName(i, e.target.value)}
                  />
                </div>
                <div className="w-36">
                  <div className="relative">
                    <input
                      type="number"
                      className="input-field text-sm pr-12"
                      placeholder="0"
                      value={tier.threshold}
                      onChange={(e) => updateTierThreshold(i, Number(e.target.value))}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">pts</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Points Expiry Toggle */}
      <div className="border border-slate-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Points Expiry</h3>
            <p className="text-xs text-slate-500 mt-0.5">Automatically expire unused points after a set period</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={data.enableExpiry}
            onClick={() => onChange('enableExpiry', !data.enableExpiry)}
            className={`
              relative inline-flex h-6 w-11 items-center rounded-full transition-colors
              ${data.enableExpiry ? 'bg-brand-600' : 'bg-slate-300'}
            `}
          >
            <span
              className={`
                inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                ${data.enableExpiry ? 'translate-x-6' : 'translate-x-1'}
              `}
            />
          </button>
        </div>

        {data.enableExpiry && (
          <div className="mt-4">
            <label htmlFor="expiryMonths" className="form-label">Expire points after</label>
            <select
              id="expiryMonths"
              className="select-field w-48"
              value={data.expiryMonths}
              onChange={(e) => onChange('expiryMonths', Number(e.target.value) as ExpiryMonths)}
            >
              {EXPIRY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
