import { useState, useCallback } from 'react';
import { WizardLayout } from '../components/WizardLayout';
import { BusinessInfoForm } from '../components/BusinessInfoForm';
import { ProgramSetupForm } from '../components/ProgramSetupForm';
import { ChannelConfigForm } from '../components/ChannelConfigForm';
import { ReviewStep } from '../components/ReviewStep';
import { ProvisioningProgress } from '../components/ProvisioningProgress';
import { SuccessScreen } from '../components/SuccessScreen';
import { useWizard } from '../hooks/useWizard';
import { useOnboarding } from '../hooks/useOnboarding';
import { validateStep, businessInfoSchema, programSetupSchema, channelConfigSchema } from '../utils/validation';
import type { BusinessInfo, ProgramSetup, ChannelConfig, OnboardingData } from '../api/types';

const DEFAULT_BUSINESS: BusinessInfo = {
  companyName: '',
  businessType: 'retail',
  websiteUrl: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  country: 'US',
  estimatedLocations: '1',
};

const DEFAULT_PROGRAM: ProgramSetup = {
  programName: '',
  baseEarnRate: 1,
  enableTiers: true,
  tiers: [
    { name: 'Bronze', threshold: 0 },
    { name: 'Silver', threshold: 500 },
    { name: 'Gold', threshold: 2000 },
  ],
  enableExpiry: true,
  expiryMonths: 12,
};

const DEFAULT_CHANNELS: ChannelConfig = {
  channels: ['pos'],
  posTerminals: 1,
  ecommercePlatform: 'shopify',
};

export function OnboardingWizard() {
  const wizard = useWizard();
  const onboarding = useOnboarding();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [business, setBusiness] = useState<BusinessInfo>(DEFAULT_BUSINESS);
  const [program, setProgram] = useState<ProgramSetup>(DEFAULT_PROGRAM);
  const [channels, setChannels] = useState<ChannelConfig>(DEFAULT_CHANNELS);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  // Auto-set program name when company name changes
  const handleBusinessChange = useCallback((field: keyof BusinessInfo, value: string) => {
    setBusiness((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'companyName' && (!program.programName || program.programName === `${prev.companyName} Rewards`)) {
        setProgram((p) => ({ ...p, programName: value ? `${value} Rewards` : '' }));
      }
      return next;
    });
    setErrors({});
  }, [program.programName]);

  const handleProgramChange = useCallback(<K extends keyof ProgramSetup>(field: K, value: ProgramSetup[K]) => {
    setProgram((prev) => ({ ...prev, [field]: value }));
    setErrors({});
  }, []);

  const handleChannelsChange = useCallback(<K extends keyof ChannelConfig>(field: K, value: ChannelConfig[K]) => {
    setChannels((prev) => ({ ...prev, [field]: value }));
    setErrors({});
  }, []);

  const validateAndNext = useCallback(() => {
    let validationErrors: Record<string, string> = {};

    switch (wizard.currentStep) {
      case 0:
        validationErrors = validateStep(businessInfoSchema, business);
        break;
      case 1:
        validationErrors = validateStep(programSetupSchema, program);
        break;
      case 2:
        validationErrors = validateStep(channelConfigSchema, channels);
        break;
    }

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});
    wizard.next();
  }, [wizard, business, program, channels]);

  const handleSubmit = useCallback(() => {
    onboarding.submit({
      business,
      program,
      channels,
    });
    wizard.next(); // Move to provisioning step
  }, [onboarding, wizard, business, program, channels]);

  const formData: OnboardingData = { business, program, channels, acceptedTerms };

  // Steps 0-3: wizard with navigation. Step 4: provisioning (no nav).
  const isProvisioningStep = wizard.currentStep === 4;
  const isReviewStep = wizard.currentStep === 3;

  return (
    <WizardLayout
      currentStep={wizard.currentStep}
      onNext={isReviewStep ? undefined : validateAndNext}
      onPrev={wizard.prev}
      isFirst={wizard.isFirst}
      isLast={wizard.isLast}
      nextDisabled={false}
      hideNav={isProvisioningStep || isReviewStep}
    >
      {wizard.currentStep === 0 && (
        <BusinessInfoForm data={business} errors={errors} onChange={handleBusinessChange} />
      )}
      {wizard.currentStep === 1 && (
        <ProgramSetupForm data={program} errors={errors} onChange={handleProgramChange} />
      )}
      {wizard.currentStep === 2 && (
        <ChannelConfigForm data={channels} errors={errors} onChange={handleChannelsChange} />
      )}
      {wizard.currentStep === 3 && (
        <ReviewStep
          data={formData}
          onAcceptTerms={setAcceptedTerms}
          onSubmit={handleSubmit}
          isSubmitting={onboarding.isSubmitting}
        />
      )}
      {wizard.currentStep === 4 && (
        onboarding.result ? (
          <SuccessScreen result={onboarding.result} />
        ) : (
          <ProvisioningProgress steps={onboarding.provisioningSteps} error={onboarding.error} />
        )
      )}
    </WizardLayout>
  );
}
