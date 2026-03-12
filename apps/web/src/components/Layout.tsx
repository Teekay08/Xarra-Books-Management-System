import { Outlet } from 'react-router';
import { Sidebar } from './Sidebar.js';
import { UserMenu } from './UserMenu.js';
import { NotificationBell } from './NotificationBell.js';
import { MobileSidebar } from './MobileSidebar.js';

export function Layout() {
  return (
    <div className="flex h-screen">
      <MobileSidebar>
        <Sidebar />
      </MobileSidebar>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 shrink-0 border-b border-gray-200 bg-white px-4 sm:px-8 flex items-center justify-end gap-3 sm:gap-4 pl-14 lg:pl-8">
          <NotificationBell />
          <UserMenu />
        </header>
        <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
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
