import { useState, useCallback } from 'react';

export interface WizardStep {
  id: string;
  label: string;
}

export const WIZARD_STEPS: WizardStep[] = [
  { id: 'business', label: 'Business Info' },
  { id: 'program', label: 'Program Setup' },
  { id: 'channels', label: 'Channels' },
  { id: 'review', label: 'Review' },
  { id: 'provisioning', label: 'Launch' },
];

export function useWizard() {
  const [currentStep, setCurrentStep] = useState(0);

  const next = useCallback(() => {
    setCurrentStep((s) => Math.min(s + 1, WIZARD_STEPS.length - 1));
  }, []);

  const prev = useCallback(() => {
    setCurrentStep((s) => Math.max(s - 1, 0));
  }, []);

  const goTo = useCallback((step: number) => {
    if (step >= 0 && step < WIZARD_STEPS.length) {
      setCurrentStep(step);
    }
  }, []);

  return {
    currentStep,
    stepInfo: WIZARD_STEPS[currentStep]!,
    totalSteps: WIZARD_STEPS.length,
    isFirst: currentStep === 0,
    isLast: currentStep === WIZARD_STEPS.length - 1,
    next,
    prev,
    goTo,
  };
}
