/**
 * Format a date string for display.
 */
export function formatDate(dateStr: string | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!dateStr) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      ...opts,
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}

/**
 * Format a date string with time.
 */
export function formatDateTime(dateStr: string | undefined): string {
  return formatDate(dateStr, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Format a number with commas.
 */
export function formatNumber(n: number | undefined): string {
  if (n === undefined || n === null) return '—';
  return new Intl.NumberFormat('en-US').format(n);
}

/**
 * Format currency in minor units (cents) to display.
 */
export function formatCurrency(amountMinor: number, currency = 'USD'): string {
  const zeroDecimal = ['JPY', 'KRW', 'VND', 'CLP', 'ISK'];
  const amount = zeroDecimal.includes(currency.toUpperCase()) ? amountMinor : amountMinor / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
}

/**
 * Format a percentage (0.15 -> "15.0%").
 */
export function formatPercent(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Relative time (e.g. "2 hours ago").
 */
export function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 30) return `${diffDay}d ago`;
  return formatDate(dateStr);
}
