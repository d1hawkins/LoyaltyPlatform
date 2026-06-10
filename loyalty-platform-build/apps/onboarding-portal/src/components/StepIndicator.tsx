import { WIZARD_STEPS } from '../hooks/useWizard';

interface StepIndicatorProps {
  currentStep: number;
}

export function StepIndicator({ currentStep }: StepIndicatorProps) {
  return (
    <nav aria-label="Onboarding progress" className="w-full">
      <ol className="flex items-center justify-between">
        {WIZARD_STEPS.map((step, index) => {
          const isComplete = index < currentStep;
          const isCurrent = index === currentStep;

          return (
            <li key={step.id} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <div
                  className={`
                    flex items-center justify-center w-10 h-10 rounded-full text-sm font-semibold transition-all duration-300
                    ${isComplete ? 'bg-brand-600 text-white' : ''}
                    ${isCurrent ? 'bg-brand-600 text-white ring-4 ring-brand-100' : ''}
                    ${!isComplete && !isCurrent ? 'bg-slate-200 text-slate-500' : ''}
                  `}
                >
                  {isComplete ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </div>
                <span
                  className={`
                    mt-2 text-xs font-medium hidden sm:block
                    ${isCurrent ? 'text-brand-700' : 'text-slate-500'}
                  `}
                >
                  {step.label}
                </span>
              </div>
              {index < WIZARD_STEPS.length - 1 && (
                <div
                  className={`
                    flex-1 h-0.5 mx-3 transition-colors duration-300
                    ${index < currentStep ? 'bg-brand-600' : 'bg-slate-200'}
                  `}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
