import { useAuth } from '../auth/useAuth';

interface TopBarProps {
  sidebarCollapsed: boolean;
}

export function TopBar({ sidebarCollapsed }: TopBarProps) {
  const { user, logout, authMode } = useAuth();

  return (
    <header
      className={`fixed top-0 right-0 h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 z-30 transition-all duration-200 ${
        sidebarCollapsed ? 'left-16' : 'left-60'
      }`}
    >
      <div className="flex items-center gap-3">
        <img src="https://www.daisousa.com/cdn/shop/files/Daiso_Logo.png" alt="Daiso" className="h-6 object-contain" onError={(e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.style.display = 'none'; }} />
        <span className="text-sm font-semibold text-slate-900">Daiso Rewards Admin</span>
      </div>

      <div className="flex items-center gap-4">
        {user && (
          <>
            <div className="text-right">
              <div className="text-sm font-medium text-slate-900">{user.displayName}</div>
              <div className="text-xs text-slate-500">
                {user.roles.join(', ')} &middot; {user.tenantId.slice(0, 8)}...
              </div>
            </div>
            <button
              onClick={logout}
              className="px-3 py-1.5 text-xs border border-slate-300 rounded-md text-slate-600 hover:bg-slate-50"
            >
              Logout
            </button>
          </>
        )}
      </div>
    </header>
  );
}
