import { NavLink } from 'react-router-dom';
import { useHasRole } from '../auth/useAuth';

interface NavItem {
  label: string;
  path: string;
  minRole: 'owner' | 'manager' | 'analyst';
}

const navItems: NavItem[] = [
  { label: 'Dashboard', path: '/', minRole: 'analyst' },
  { label: 'Members', path: '/members', minRole: 'analyst' },
  { label: 'Transactions', path: '/transactions', minRole: 'analyst' },
  { label: 'Tiers', path: '/tiers', minRole: 'analyst' },
  { label: 'Offers', path: '/offers', minRole: 'manager' },
  { label: 'Program', path: '/program', minRole: 'manager' },
  { label: 'Analytics', path: '/analytics', minRole: 'analyst' },
  { label: 'Reports', path: '/reports', minRole: 'analyst' },
  { label: 'Webhooks', path: '/webhooks', minRole: 'manager' },
  { label: 'API Keys', path: '/apikeys', minRole: 'owner' },
  { label: 'Integrations', path: '/integrations', minRole: 'manager' },
  { label: 'Audit Log', path: '/audit', minRole: 'analyst' },
  { label: 'Settings', path: '/settings', minRole: 'manager' },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  return (
    <aside
      className={`fixed left-0 top-0 h-full text-white transition-all duration-200 z-40 ${
        collapsed ? 'w-16' : 'w-60'
      }`}
      style={{ background: 'linear-gradient(180deg, #5a0008 0%, #1e293b 100%)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-slate-700">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <img src="https://www.daisousa.com/cdn/shop/files/Daiso_Logo.png" alt="Daiso" className="h-7 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            <span className="text-lg font-bold tracking-tight">Daiso Rewards</span>
          </div>
        )}
        <button
          onClick={onToggle}
          className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
          aria-label="Toggle sidebar"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      {/* Nav */}
      <nav className="mt-4 px-2 space-y-1">
        {navItems.map((item) => (
          <SidebarLink key={item.path} item={item} collapsed={collapsed} />
        ))}
      </nav>

      {/* External links */}
      <div className="absolute bottom-4 left-0 right-0 px-2 space-y-1">
        <a
          href="https://loyaltydocs.z13.web.core.windows.net"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center px-3 py-2 rounded-md text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          title={collapsed ? 'Documentation' : undefined}
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
          </svg>
          {!collapsed && <span className="ml-2">Documentation</span>}
        </a>
        <a
          href="https://swagger-ui.blackgrass-225d994b.eastus.azurecontainerapps.io"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center px-3 py-2 rounded-md text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          title={collapsed ? 'API Reference' : undefined}
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
          </svg>
          {!collapsed && <span className="ml-2">API Reference</span>}
        </a>
      </div>
    </aside>
  );
}

function SidebarLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const visible = useHasRole(item.minRole);
  if (!visible) return null;

  return (
    <NavLink
      to={item.path}
      end={item.path === '/'}
      className={({ isActive }) =>
        `flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
          isActive
            ? 'bg-[#EB1256] text-white'
            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
        }`
      }
      title={collapsed ? item.label : undefined}
    >
      <span className={collapsed ? 'mx-auto' : ''}>
        {collapsed ? item.label.charAt(0) : item.label}
      </span>
    </NavLink>
  );
}
