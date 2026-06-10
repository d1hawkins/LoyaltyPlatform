import { useEffect, useState, useMemo } from 'react';
import type { OnboardResponse } from '../api/types';
import { ApiKeyDisplay } from './ApiKeyDisplay';

interface SuccessScreenProps {
  result: OnboardResponse;
}

/** Simple confetti effect: creates colored divs that fall from the top */
function Confetti() {
  const pieces = useMemo(() => {
    const colors = ['#0ea5e9', '#d946ef', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6'];
    return Array.from({ length: 40 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      color: colors[i % colors.length]!,
      delay: Math.random() * 2,
      size: 6 + Math.random() * 8,
    }));
  }, []);

  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 4000);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <>
      {pieces.map((p) => (
        <div
          key={p.id}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            borderRadius: Math.random() > 0.5 ? '50%' : '2px',
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </>
  );
}

export function SuccessScreen({ result }: SuccessScreenProps) {
  const adminUrl = result.adminPortalUrl || '/admin';

  return (
    <div className="space-y-6">
      <Confetti />

      {/* Success Banner */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Your Loyalty Program is Live!</h2>
        <p className="text-sm text-slate-500 mt-2">
          <span className="font-semibold text-brand-600">{result.programName}</span> is ready to go.
          Here's everything you need to get started.
        </p>
      </div>

      {/* Tenant Info */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Your Account</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-slate-500">Tenant ID:</span>{' '}
            <code className="font-mono text-slate-800">{result.tenantId}</code>
          </div>
          <div>
            <span className="text-slate-500">Slug:</span>{' '}
            <code className="font-mono text-slate-800">{result.slug}</code>
          </div>
        </div>
      </div>

      {/* API Key */}
      <ApiKeyDisplay apiKey={result.apiKey} />

      {/* Next Steps */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-700">Next Steps</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <a
            href={adminUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-4 bg-brand-50 border border-brand-200 rounded-lg hover:bg-brand-100 transition-colors"
          >
            <svg className="w-6 h-6 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
            </svg>
            <div>
              <div className="text-sm font-semibold text-brand-700">Admin Portal</div>
              <div className="text-xs text-brand-600">Manage your program, members, and tiers</div>
            </div>
          </a>
          <a
            href="https://loyaltydocs.z13.web.core.windows.net"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-4 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <svg className="w-6 h-6 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
            </svg>
            <div>
              <div className="text-sm font-semibold text-slate-700">Integration Docs</div>
              <div className="text-xs text-slate-500">API reference, SDKs, and guides</div>
            </div>
          </a>
        </div>
      </div>
    </div>
  );
}
