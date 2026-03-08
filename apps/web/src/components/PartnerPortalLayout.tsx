import { NavLink, Navigate, Outlet, useNavigate } from 'react-router';
import { getPartnerToken, getPartnerUser, partnerLogout } from '../lib/partner-api';
import { PartnerNotificationBell } from './PartnerNotificationBell';

const navItems = [
  { name: 'Dashboard', href: '/partner', end: true },
  { name: 'Browse Catalog', href: '/partner/catalog' },
  { name: 'My Orders', href: '/partner/orders' },
];

const documentItems = [
  { name: 'Invoices', href: '/partner/invoices' },
  { name: 'Credit Notes', href: '/partner/credit-notes' },
  { name: 'Consignments', href: '/partner/consignments' },
  { name: 'Statements', href: '/partner/statements' },
];

const bottomNavItems = [
  { name: 'Returns', href: '/partner/returns' },
  { name: 'Shipment Tracking', href: '/partner/shipments' },
  { name: 'Account', href: '/partner/account' },
];

const activeCls = 'bg-[#8B1A1A]/10 text-[#8B1A1A] border-r-3 border-[#8B1A1A]';
const inactiveCls = 'text-gray-700 hover:text-[#8B1A1A] hover:bg-gray-50';

function SidebarLink({ href, name, end }: { href: string; name: string; end?: boolean }) {
  return (
    <NavLink
      to={href}
      end={end}
      className={({ isActive }) =>
        `block px-6 py-2.5 text-[13px] font-medium tracking-wide transition-colors ${
          isActive ? activeCls : inactiveCls
        }`
      }
    >
      {name}
    </NavLink>
  );
}

export function PartnerPortalLayout() {
  const navigate = useNavigate();
  const token = getPartnerToken();
  const user = getPartnerUser();

  if (!token) {
    return <Navigate to="/partner/login" replace />;
  }

  async function handleSignOut() {
    await partnerLogout();
    navigate('/partner/login');
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col shrink-0">
        <div className="p-5 border-b border-gray-100">
          <img src="/XarraBooks-logo.png" alt="Xarra Books" className="h-12 mb-1" />
          <p className="text-[10px] text-gray-400 font-mono tracking-widest uppercase mt-1">
            Partner Portal
          </p>
        </div>

        <nav className="flex-1 py-4 overflow-y-auto">
          {navItems.map((item) => (
            <SidebarLink key={item.href} href={item.href} name={item.name} end={item.end} />
          ))}

          {/* Documents group */}
          <div className="mt-4 mb-1 px-6">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              Documents
            </span>
          </div>
          {documentItems.map((item) => (
            <SidebarLink key={item.href} href={item.href} name={item.name} />
          ))}

          <div className="my-3 mx-6 border-t border-gray-100" />

          {bottomNavItems.map((item) => (
            <SidebarLink key={item.href} href={item.href} name={item.name} />
          ))}
        </nav>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 shrink-0 border-b border-gray-200 bg-white px-8 flex items-center justify-between">
          <div className="text-sm text-gray-700">
            <span className="font-semibold">{user?.partnerName ?? 'Partner'}</span>
            {user?.branchName && (
              <span className="text-gray-400 ml-1.5">/ {user.branchName}</span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <PartnerNotificationBell />
            <span className="text-sm text-gray-600">{user?.name}</span>
            <button
              onClick={handleSignOut}
              className="text-sm text-gray-500 hover:text-[#8B1A1A] transition-colors"
            >
              Sign Out
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
