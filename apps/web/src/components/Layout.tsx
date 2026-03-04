import { Outlet } from 'react-router';
import { Sidebar } from './Sidebar.js';

export function Layout() {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto p-8">
        <Outlet />
      </main>
    </div>
  );
}
