export function Terms() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-gradient-hero text-white">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <h1 className="text-2xl font-bold">Terms of Service</h1>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="card prose prose-slate max-w-none">
          <h2 className="text-lg font-semibold">Loyalty Platform Terms of Service</h2>
          <p className="text-sm text-slate-600 mt-4">
            <strong>Effective Date:</strong> January 1, 2026
          </p>

          <h3 className="text-base font-semibold mt-6">1. Acceptance of Terms</h3>
          <p className="text-sm text-slate-600 mt-2">
            By creating a tenant and using the Loyalty Platform ("Platform"), you agree to be bound by these
            Terms of Service. If you do not agree, do not use the Platform.
          </p>

          <h3 className="text-base font-semibold mt-6">2. Service Description</h3>
          <p className="text-sm text-slate-600 mt-2">
            The Platform provides loyalty program management including member enrollment, points tracking,
            tier management, offer creation, analytics, and multi-channel integrations.
          </p>

          <h3 className="text-base font-semibold mt-6">3. Account Responsibilities</h3>
          <p className="text-sm text-slate-600 mt-2">
            You are responsible for maintaining the security of your API keys and administrative credentials.
            You must notify us immediately of any unauthorized access.
          </p>

          <h3 className="text-base font-semibold mt-6">4. Data Protection</h3>
          <p className="text-sm text-slate-600 mt-2">
            Member personal data is encrypted at rest (AES-256-GCM) and in transit (TLS 1.2+).
            GDPR deletion requests are honored within 30 days. See our Privacy Policy for details.
          </p>

          <h3 className="text-base font-semibold mt-6">5. Acceptable Use</h3>
          <p className="text-sm text-slate-600 mt-2">
            You agree not to use the Platform for any illegal purpose or in violation of any applicable laws.
            You will not attempt to reverse-engineer, disrupt, or compromise the Platform's infrastructure.
          </p>

          <h3 className="text-base font-semibold mt-6">6. Limitation of Liability</h3>
          <p className="text-sm text-slate-600 mt-2">
            The Platform is provided "as is" without warranties of any kind. In no event shall the Platform
            provider be liable for indirect, incidental, or consequential damages.
          </p>

          <h3 className="text-base font-semibold mt-6">7. Contact</h3>
          <p className="text-sm text-slate-600 mt-2">
            Questions about these terms can be directed to legal@loyaltyplatform.dev.
          </p>

          <p className="text-xs text-slate-400 mt-8 border-t border-slate-200 pt-4">
            This is a placeholder Terms of Service document for development purposes.
          </p>
        </div>
      </main>
    </div>
  );
}
