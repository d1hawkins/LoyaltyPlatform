import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './auth/AuthProvider';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { MemberList } from './pages/Members/MemberList';
import { MemberDetail } from './pages/Members/MemberDetail';
import { TransactionList } from './pages/Transactions/TransactionList';
import { TierConfig } from './pages/Tiers/TierConfig';
import { OfferList } from './pages/Offers/OfferList';
import { ProgramConfig } from './pages/Program/ProgramConfig';
import { WebhookList } from './pages/Webhooks/WebhookList';
import { ApiKeyList } from './pages/ApiKeys/ApiKeyList';
import { AnalyticsOverview } from './pages/Analytics/AnalyticsOverview';
import { AuditLog } from './pages/AuditLog/AuditLog';
import { Branding } from './pages/Settings/Branding';
import { IntegrationSettings } from './pages/Integrations/IntegrationSettings';
import { ReportsPage } from './pages/Reports/ReportsPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function LoginPage() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-slate-900 mb-4">Loyalty Admin Portal</h1>
        <p className="text-slate-600 mb-6">
          Set <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">VITE_AUTH_MODE=skip</code> for dev mode.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Dashboard />} />
                <Route path="members" element={<MemberList />} />
                <Route path="members/:id" element={<MemberDetail />} />
                <Route path="transactions" element={<TransactionList />} />
                <Route path="tiers" element={<TierConfig />} />
                <Route path="offers" element={<OfferList />} />
                <Route path="program" element={<ProtectedRoute minRole="manager"><ProgramConfig /></ProtectedRoute>} />
                <Route path="webhooks" element={<ProtectedRoute minRole="manager"><WebhookList /></ProtectedRoute>} />
                <Route path="apikeys" element={<ProtectedRoute minRole="owner"><ApiKeyList /></ProtectedRoute>} />
                <Route path="analytics" element={<AnalyticsOverview />} />
                <Route path="reports" element={<ReportsPage />} />
                <Route path="audit" element={<AuditLog />} />
                <Route path="integrations" element={<ProtectedRoute minRole="manager"><IntegrationSettings /></ProtectedRoute>} />
                <Route path="settings" element={<ProtectedRoute minRole="manager"><Branding /></ProtectedRoute>} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
