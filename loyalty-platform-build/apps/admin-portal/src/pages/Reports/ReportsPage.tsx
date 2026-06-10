import { useState } from 'react';
import { FinanceReports } from './FinanceReports';
import { MarketingReports } from './MarketingReports';
import { OperationsReports } from './OperationsReports';

type ReportTab = 'finance' | 'marketing' | 'operations';

const tabs: { key: ReportTab; label: string }[] = [
  { key: 'finance', label: 'Finance' },
  { key: 'marketing', label: 'Marketing' },
  { key: 'operations', label: 'Operations' },
];

export function ReportsPage() {
  const [activeTab, setActiveTab] = useState<ReportTab>('finance');

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Reports</h1>

      {/* Tab navigation */}
      <div className="border-b border-slate-200 mb-6">
        <nav className="flex gap-6" aria-label="Report tabs">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-[#EB1256] text-[#EB1256]'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === 'finance' && <FinanceReports />}
      {activeTab === 'marketing' && <MarketingReports />}
      {activeTab === 'operations' && <OperationsReports />}
    </div>
  );
}
