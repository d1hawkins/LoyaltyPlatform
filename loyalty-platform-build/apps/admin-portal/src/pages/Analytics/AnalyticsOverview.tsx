import { EnrollmentChart } from './EnrollmentChart';
import { TransactionChart } from './TransactionChart';
import { PointsEconomy } from './PointsEconomy';
import { TierDistribution } from './TierDistribution';

export function AnalyticsOverview() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Analytics</h1>
      <div className="space-y-6">
        <EnrollmentChart />
        <TransactionChart />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <PointsEconomy />
          <TierDistribution />
        </div>
      </div>
    </div>
  );
}
