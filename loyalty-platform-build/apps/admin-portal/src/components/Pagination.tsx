interface PaginationProps {
  hasNext: boolean;
  hasPrev: boolean;
  onNext: () => void;
  onPrev: () => void;
  className?: string;
}

export function Pagination({ hasNext, hasPrev, onNext, onPrev, className = '' }: PaginationProps) {
  return (
    <div className={`flex items-center justify-between py-3 ${className}`}>
      <button
        onClick={onPrev}
        disabled={!hasPrev}
        className="px-4 py-2 text-sm border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Previous
      </button>
      <button
        onClick={onNext}
        disabled={!hasNext}
        className="px-4 py-2 text-sm border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Next
      </button>
    </div>
  );
}
