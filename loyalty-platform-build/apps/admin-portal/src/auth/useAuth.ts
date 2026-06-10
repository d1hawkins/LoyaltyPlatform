import { useContext } from 'react';
import { AuthContext } from './AuthProvider';

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

/**
 * Check if the current user has at least the given role.
 * Role hierarchy: owner > manager > analyst.
 */
export function useHasRole(minRole: 'owner' | 'manager' | 'analyst'): boolean {
  const { user } = useAuth();
  if (!user) return false;

  const hierarchy: Record<string, number> = { owner: 3, manager: 2, analyst: 1 };
  const userLevel = Math.max(...user.roles.map((r) => hierarchy[r] ?? 0));
  return userLevel >= (hierarchy[minRole] ?? 99);
}
