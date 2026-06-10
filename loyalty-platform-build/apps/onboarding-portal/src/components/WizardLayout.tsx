import type { ReactNode } from 'react';
import { StepIndicator } from './StepIndicator';

interface WizardLayoutProps {
  currentStep: number;
  children: ReactNode;
  onNext?: () => void;
  onPrev?: () => void;
  isFirst: boolean;
  isLast: boolean;
  nextLabel?: string;
  nextDisabled?: boolean;
  hideNav?: boolean;
}

export function WizardLayout({
  currentStep,
  children,
  onNext,
  onPrev,
  isFirst,
  isLast,
  nextLabel = 'Continue',
  nextDisabled = false,
  hideNav = false,
}: WizardLayoutProps) {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Gradient header */}
      <header className="bg-gradient-hero text-white">
        <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
          <div className="text-center mb-2">
            <div className="mb-3">
              <img src="https://www.daisousa.com/cdn/shop/files/Daiso_Logo.png" alt="Daiso" className="h-12 mx-auto object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Daiso Rewards &mdash; Merchant Portal
            </h1>
            <p className="mt-2 text-sm sm:text-base text-red-200">
              Set up your Daiso Rewards program in minutes. No technical expertise required.
            </p>
          </div>
        </div>
      </header>

      {/* Step indicator */}
      <div className="max-w-3xl mx-auto px-4 -mt-5">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
          <StepIndicator currentStep={currentStep} />
        </div>
      </div>

      {/* Content area */}
      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="card">{children}</div>

        {/* Navigation */}
        {!hideNav && (
          <div className="flex justify-between mt-6">
            <button
              type="button"
              onClick={onPrev}
              disabled={isFirst}
              className="btn-secondary"
              style={{ visibility: isFirst ? 'hidden' : 'visible' }}
            >
              Back
            </button>
            {!isLast && (
              <button
                type="button"
                onClick={onNext}
                disabled={nextDisabled}
                className="btn-primary"
              >
                {nextLabel}
              </button>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center text-xs text-slate-400 pb-8">
        Daiso USA &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
}
