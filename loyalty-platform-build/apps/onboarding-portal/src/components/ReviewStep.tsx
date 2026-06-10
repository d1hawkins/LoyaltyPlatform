import type { OnboardingData } from '../api/types';

interface ReviewStepProps {
  data: OnboardingData;
  onAcceptTerms: (accepted: boolean) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-slate-200 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-slate-700 mb-3">{title}</h3>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1.5 text-sm border-b border-slate-100 last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-900">{value}</span>
    </div>
  );
}

const CHANNEL_LABELS: Record<string, string> = {
  pos: 'Point of Sale',
  ecommerce: 'E-Commerce',
  mobile: 'Mobile App',
};

const PLATFORM_LABELS: Record<string, string> = {
  shopify: 'Shopify',
  woocommerce: 'WooCommerce',
  custom: 'Custom / API',
  other: 'Other',
};

export function ReviewStep({ data, onAcceptTerms, onSubmit, isSubmitting }: ReviewStepProps) {
  const { business, program, channels } = data;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Review & Confirm</h2>
        <p className="text-sm text-slate-500 mt-1">Please review your selections before launching your loyalty program.</p>
      </div>

      {/* Business Info */}
      <SectionCard title="Business Information">
        <Row label="Company" value={business.companyName} />
        <Row label="Type" value={business.businessType} />
        {business.websiteUrl && <Row label="Website" value={business.websiteUrl} />}
        <Row label="Contact" value={`${business.contactName} (${business.contactEmail})`} />
        <Row label="Phone" value={business.contactPhone} />
        <Row label="Country" value={business.country} />
        <Row label="Locations" value={business.estimatedLocations} />
      </SectionCard>

      {/* Program Setup */}
      <SectionCard title="Loyalty Program">
        <Row label="Program Name" value={program.programName} />
        <Row label="Earn Rate" value={`${program.baseEarnRate} point${program.baseEarnRate > 1 ? 's' : ''} per $1`} />
        <Row label="Tiers" value={program.enableTiers ? program.tiers.map((t) => `${t.name} (${t.threshold} pts)`).join(', ') : 'Disabled'} />
        <Row label="Points Expiry" value={program.enableExpiry ? `${program.expiryMonths} months` : 'No expiry'} />
      </SectionCard>

      {/* Channels */}
      <SectionCard title="Channels">
        <Row label="Active Channels" value={channels.channels.map((c) => CHANNEL_LABELS[c] ?? c).join(', ')} />
        {channels.channels.includes('pos') && (
          <Row label="POS Terminals" value={String(channels.posTerminals)} />
        )}
        {channels.channels.includes('ecommerce') && (
          <Row label="E-Commerce Platform" value={PLATFORM_LABELS[channels.ecommercePlatform] ?? channels.ecommercePlatform} />
        )}
      </SectionCard>

      {/* Terms */}
      <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
        <input
          id="terms"
          type="checkbox"
          checked={data.acceptedTerms}
          onChange={(e) => onAcceptTerms(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
        />
        <label htmlFor="terms" className="text-sm text-slate-600">
          I agree to the{' '}
          <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">
            Terms of Service
          </a>{' '}
          and authorize the creation of my loyalty platform tenant.
        </label>
      </div>

      {/* Submit Button */}
      <div className="text-center">
        <button
          type="button"
          onClick={onSubmit}
          disabled={!data.acceptedTerms || isSubmitting}
          className="btn-primary text-base px-8 py-3.5"
        >
          {isSubmitting ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Creating...
            </span>
          ) : (
            'Create My Loyalty Program'
          )}
        </button>
      </div>
    </div>
  );
}
