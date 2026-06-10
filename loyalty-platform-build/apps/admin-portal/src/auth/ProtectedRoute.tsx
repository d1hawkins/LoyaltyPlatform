import { Navigate } from 'react-router-dom';
import { useAuth } from './useAuth';

interface ProtectedRouteProps {
  children: React.ReactNode;
  minRole?: 'owner' | 'manager' | 'analyst';
}

const roleHierarchy: Record<string, number> = { owner: 3, manager: 2, analyst: 1 };

export function ProtectedRoute({ children, minRole = 'analyst' }: ProtectedRouteProps) {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  if (minRole) {
    const userLevel = Math.max(...user.roles.map((r) => roleHierarchy[r] ?? 0));
    const required = roleHierarchy[minRole] ?? 99;
    if (userLevel < required) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Access Denied</h1>
            <p className="text-slate-600">You need at least the <strong>{minRole}</strong> role to access this page.</p>
          </div>
        </div>
      );
    }
  }

  return <>{children}</>;
}
