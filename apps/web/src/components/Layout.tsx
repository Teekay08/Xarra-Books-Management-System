import { Outlet } from 'react-router';
import { Sidebar } from './Sidebar.js';
import { UserMenu } from './UserMenu.js';

export function Layout() {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 shrink-0 border-b border-gray-200 bg-white px-8 flex items-center justify-end gap-4">
          <UserMenu />
        </header>
        <main className="flex-1 overflow-auto p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
