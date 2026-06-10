import { useState, useCallback, useRef } from 'react';
import { submitOnboarding } from '../api/onboard';
import type { OnboardRequest, OnboardResponse, ProvisioningStep } from '../api/types';

const INITIAL_STEPS: ProvisioningStep[] = [
  { id: 'account', label: 'Creating your account...', status: 'pending' },
  { id: 'database', label: 'Provisioning database...', status: 'pending' },
  { id: 'program', label: 'Setting up loyalty program...', status: 'pending' },
  { id: 'credentials', label: 'Generating API credentials...', status: 'pending' },
  { id: 'done', label: 'Done!', status: 'pending' },
];

export function useOnboarding() {
  const [provisioningSteps, setProvisioningSteps] = useState<ProvisioningStep[]>(INITIAL_STEPS);
  const [result, setResult] = useState<OnboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const abortRef = useRef(false);

  const advanceStep = useCallback((stepIndex: number) => {
    setProvisioningSteps((prev) =>
      prev.map((s, i) => {
        if (i < stepIndex) return { ...s, status: 'complete' as const };
        if (i === stepIndex) return { ...s, status: 'active' as const };
        return s;
      })
    );
  }, []);

  const completeAllSteps = useCallback(() => {
    setProvisioningSteps((prev) => prev.map((s) => ({ ...s, status: 'complete' as const })));
  }, []);

  const submit = useCallback(
    async (data: OnboardRequest) => {
      setIsSubmitting(true);
      setError(null);
      abortRef.current = false;
      setProvisioningSteps(INITIAL_STEPS.map((s) => ({ ...s, status: 'pending' })));

      // Simulate step-by-step progress while the real API call runs
      const progressPromise = (async () => {
        for (let i = 0; i < INITIAL_STEPS.length - 1; i++) {
          if (abortRef.current) return;
          advanceStep(i);
          await new Promise((r) => setTimeout(r, 1000 + Math.random() * 500));
        }
      })();

      try {
        const [response] = await Promise.all([submitOnboarding(data), progressPromise]);
        completeAllSteps();
        setResult(response);
      } catch (err) {
        abortRef.current = true;
        const message = err instanceof Error ? err.message : 'An unexpected error occurred';
        setError(message);
        setProvisioningSteps((prev) =>
          prev.map((s) =>
            s.status === 'active' ? { ...s, status: 'error' } : s
          )
        );
      } finally {
        setIsSubmitting(false);
      }
    },
    [advanceStep, completeAllSteps]
  );

  return {
    provisioningSteps,
    result,
    error,
    isSubmitting,
    submit,
  };
}
