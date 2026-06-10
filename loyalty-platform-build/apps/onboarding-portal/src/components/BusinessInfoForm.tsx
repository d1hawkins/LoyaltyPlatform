import type { BusinessInfo } from '../api/types';

interface BusinessInfoFormProps {
  data: BusinessInfo;
  errors: Record<string, string>;
  onChange: (field: keyof BusinessInfo, value: string) => void;
}

const BUSINESS_TYPES = [
  { value: '', label: 'Select a business type' },
  { value: 'retail', label: 'Retail' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'hospitality', label: 'Hospitality' },
  { value: 'services', label: 'Services' },
  { value: 'other', label: 'Other' },
];

const LOCATION_RANGES = [
  { value: '1', label: '1 location' },
  { value: '2-5', label: '2-5 locations' },
  { value: '6-20', label: '6-20 locations' },
  { value: '20+', label: '20+ locations' },
];

const COUNTRIES = [
  { value: 'US', label: 'United States' },
  { value: 'CA', label: 'Canada' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'AU', label: 'Australia' },
  { value: 'DE', label: 'Germany' },
  { value: 'FR', label: 'France' },
  { value: 'JP', label: 'Japan' },
  { value: 'SG', label: 'Singapore' },
  { value: 'AE', label: 'United Arab Emirates' },
  { value: 'OTHER', label: 'Other' },
];

function FieldError({ error }: { error?: string }) {
  if (!error) return null;
  return <p className="mt-1 text-xs text-red-600">{error}</p>;
}

export function BusinessInfoForm({ data, errors, onChange }: BusinessInfoFormProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Business Information</h2>
        <p className="text-sm text-slate-500 mt-1">Tell us about your business so we can tailor your loyalty program.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Company Name */}
        <div className="sm:col-span-2">
          <label htmlFor="companyName" className="form-label">Company Name *</label>
          <input
            id="companyName"
            type="text"
            className="input-field"
            placeholder="Acme Retail Co."
            value={data.companyName}
            onChange={(e) => onChange('companyName', e.target.value)}
          />
          <FieldError error={errors['companyName']} />
        </div>

        {/* Business Type */}
        <div>
          <label htmlFor="businessType" className="form-label">Business Type *</label>
          <select
            id="businessType"
            className="select-field"
            value={data.businessType}
            onChange={(e) => onChange('businessType', e.target.value)}
          >
            {BUSINESS_TYPES.map((bt) => (
              <option key={bt.value} value={bt.value}>{bt.label}</option>
            ))}
          </select>
          <FieldError error={errors['businessType']} />
        </div>

        {/* Website URL */}
        <div>
          <label htmlFor="websiteUrl" className="form-label">Website URL</label>
          <input
            id="websiteUrl"
            type="url"
            className="input-field"
            placeholder="https://example.com"
            value={data.websiteUrl}
            onChange={(e) => onChange('websiteUrl', e.target.value)}
          />
          <FieldError error={errors['websiteUrl']} />
        </div>

        {/* Contact Name */}
        <div>
          <label htmlFor="contactName" className="form-label">Primary Contact Name *</label>
          <input
            id="contactName"
            type="text"
            className="input-field"
            placeholder="Jane Doe"
            value={data.contactName}
            onChange={(e) => onChange('contactName', e.target.value)}
          />
          <FieldError error={errors['contactName']} />
        </div>

        {/* Contact Email */}
        <div>
          <label htmlFor="contactEmail" className="form-label">Email *</label>
          <input
            id="contactEmail"
            type="email"
            className="input-field"
            placeholder="jane@example.com"
            value={data.contactEmail}
            onChange={(e) => onChange('contactEmail', e.target.value)}
          />
          <FieldError error={errors['contactEmail']} />
        </div>

        {/* Contact Phone */}
        <div>
          <label htmlFor="contactPhone" className="form-label">Phone *</label>
          <input
            id="contactPhone"
            type="tel"
            className="input-field"
            placeholder="+1 (555) 123-4567"
            value={data.contactPhone}
            onChange={(e) => onChange('contactPhone', e.target.value)}
          />
          <FieldError error={errors['contactPhone']} />
        </div>

        {/* Country */}
        <div>
          <label htmlFor="country" className="form-label">Country *</label>
          <select
            id="country"
            className="select-field"
            value={data.country}
            onChange={(e) => onChange('country', e.target.value)}
          >
            {COUNTRIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <FieldError error={errors['country']} />
        </div>

        {/* Estimated Locations */}
        <div>
          <label htmlFor="estimatedLocations" className="form-label">Estimated Locations *</label>
          <select
            id="estimatedLocations"
            className="select-field"
            value={data.estimatedLocations}
            onChange={(e) => onChange('estimatedLocations', e.target.value)}
          >
            {LOCATION_RANGES.map((lr) => (
              <option key={lr.value} value={lr.value}>{lr.label}</option>
            ))}
          </select>
          <FieldError error={errors['estimatedLocations']} />
        </div>
      </div>
    </div>
  );
}
