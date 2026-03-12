import { NavLink, Outlet } from 'react-router';
import { UserMenu } from './UserMenu.js';
import { MobileSidebar } from './MobileSidebar.js';

const portalNav = [
  { name: 'Dashboard', href: '/portal' },
  { name: 'Sales Summary', href: '/portal/sales' },
  { name: 'Royalties', href: '/portal/royalties' },
  { name: 'Contracts', href: '/portal/contracts' },
  { name: 'Payments', href: '/portal/payments' },
  { name: 'Contact Xarra', href: '/portal/contact' },
];

export function PortalLayout() {
  return (
    <div className="flex h-screen bg-gray-50">
      <MobileSidebar>
        <aside className="w-64 h-full bg-white border-r border-gray-200 flex flex-col shrink-0">
          <div className="p-5 border-b border-gray-100">
            <img src="/XarraBooks-logo.png" alt="Xarra Books" className="h-12 mb-1" />
            <p className="text-[10px] text-gray-400 font-mono tracking-widest uppercase mt-1">Author Portal</p>
          </div>
          <nav className="flex-1 py-4">
            {portalNav.map((item) => (
              <NavLink
                key={item.href}
                to={item.href}
                end={item.href === '/portal'}
                className={({ isActive }) =>
                  `block px-6 py-2.5 text-[13px] font-medium tracking-wide transition-colors ${
                    isActive
                      ? 'bg-xarra-red/10 text-xarra-red border-r-3 border-xarra-red'
                      : 'text-gray-700 hover:text-xarra-red hover:bg-gray-50'
                  }`
                }
              >
                {item.name}
              </NavLink>
            ))}
          </nav>
        </aside>
      </MobileSidebar>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 shrink-0 border-b border-gray-200 bg-white px-4 sm:px-8 flex items-center justify-end gap-3 sm:gap-4 pl-14 lg:pl-8">
          <UserMenu variant="portal" />
        </header>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
        <footer className="shrink-0 border-t border-gray-200 bg-white px-4 sm:px-8 py-3 text-center pl-14 lg:pl-8">
          <p className="text-xs text-gray-500">
            Powered by <a href="https://www.tsedemeko.africa" target="_blank" rel="noopener noreferrer" className="font-bold text-blue-600 hover:text-blue-800 transition-colors">Tsedemeko</a>
          </p>
        </footer>
      </div>
    </div>
  );
}
