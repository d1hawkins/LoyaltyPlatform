import { useState, useCallback } from 'react';

interface ApiKeyDisplayProps {
  apiKey: string;
}

export function ApiKeyDisplay({ apiKey }: ApiKeyDisplayProps) {
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const copyToClipboard = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = apiKey;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [apiKey]);

  const maskedKey = apiKey.substring(0, 8) + '*'.repeat(Math.max(0, apiKey.length - 8));

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
      <div className="flex items-start gap-2 mb-3">
        <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div>
          <p className="text-sm font-semibold text-amber-800">API Key — Save This Now</p>
          <p className="text-xs text-amber-700 mt-0.5">
            This key is displayed only once and cannot be recovered. Store it securely.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <code className="flex-1 bg-white border border-amber-200 rounded px-3 py-2 text-sm font-mono text-slate-800 break-all">
          {revealed ? apiKey : maskedKey}
        </code>
        <button
          type="button"
          onClick={() => setRevealed(!revealed)}
          className="px-3 py-2 text-xs font-medium text-amber-700 bg-white border border-amber-200 rounded hover:bg-amber-100 transition-colors"
          title={revealed ? 'Hide' : 'Reveal'}
        >
          {revealed ? 'Hide' : 'Show'}
        </button>
        <button
          type="button"
          onClick={copyToClipboard}
          className={`
            px-3 py-2 text-xs font-medium rounded transition-colors
            ${copied
              ? 'bg-green-100 text-green-700 border border-green-200'
              : 'bg-white text-amber-700 border border-amber-200 hover:bg-amber-100'}
          `}
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
