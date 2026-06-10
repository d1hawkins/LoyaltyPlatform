import type { ProvisioningStep } from '../api/types';

interface ProvisioningProgressProps {
  steps: ProvisioningStep[];
  error: string | null;
}

function StatusIcon({ status }: { status: ProvisioningStep['status'] }) {
  switch (status) {
    case 'complete':
      return (
        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
          <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      );
    case 'active':
      return (
        <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center">
          <svg className="animate-spin h-5 w-5 text-brand-600" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      );
    case 'error':
      return (
        <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
          <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
      );
    default:
      return (
        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-slate-300" />
        </div>
      );
  }
}

export function ProvisioningProgress({ steps, error }: ProvisioningProgressProps) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-slate-900">Setting Up Your Loyalty Program</h2>
        <p className="text-sm text-slate-500 mt-1">This usually takes about 30 seconds. Please don't close this page.</p>
      </div>

      <div className="space-y-1">
        {steps.map((step, index) => (
          <div key={step.id} className="flex items-center gap-4 py-3">
            <StatusIcon status={step.status} />
            <span
              className={`text-sm font-medium ${
                step.status === 'complete' ? 'text-green-700' :
                step.status === 'active' ? 'text-brand-700' :
                step.status === 'error' ? 'text-red-700' :
                'text-slate-400'
              }`}
            >
              {step.label}
            </span>
            {index < steps.length - 1 && <div className="flex-1" />}
          </div>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-700 font-medium">Provisioning failed</p>
          <p className="text-xs text-red-600 mt-1">{error}</p>
          <p className="text-xs text-slate-500 mt-2">Please try again or contact support at support@loyaltyplatform.dev</p>
        </div>
      )}
    </div>
  );
}
