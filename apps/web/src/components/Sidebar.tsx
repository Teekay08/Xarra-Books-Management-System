import { NavLink, useNavigate } from 'react-router';
import { useSession, signOut } from '../lib/auth-client';

const navigation = [
  { name: 'Dashboard', href: '/', icon: '📊' },
  { name: 'Authors', href: '/authors', icon: '✍️' },
  { name: 'Titles', href: '/titles', icon: '📚' },
  { name: 'Channel Partners', href: '/partners', icon: '🤝' },
  { name: 'Inventory', href: '/inventory', icon: '📦' },
  { name: 'Consignments', href: '/consignments', icon: '🚚' },
  { name: 'Invoices', href: '/invoices', icon: '🧾' },
  { name: 'Payments', href: '/payments', icon: '💳' },
];

export function Sidebar() {
  const { data: session } = useSession();
  const navigate = useNavigate();

  async function handleLogout() {
    await signOut();
    navigate('/login');
  }

  return (
    <aside className="w-64 bg-gray-900 text-gray-100 flex flex-col">
      <div className="p-6 border-b border-gray-800">
        <h1 className="text-xl font-bold tracking-tight">Xarra Books</h1>
        <p className="text-xs text-gray-500 mt-1 font-mono">Management System</p>
      </div>
      <nav className="flex-1 py-4">
        {navigation.map((item) => (
          <NavLink
            key={item.href}
            to={item.href}
            className={({ isActive }) =>
              `flex items-center gap-3 px-6 py-2.5 text-sm transition-colors ${
                isActive
                  ? 'bg-brand-600/20 text-brand-400 border-r-2 border-brand-400'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
              }`
            }
          >
            <span className="text-base">{item.icon}</span>
            {item.name}
          </NavLink>
        ))}
      </nav>
      {session?.user && (
        <div className="p-4 border-t border-gray-800">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-200 truncate">{session.user.name}</p>
              <p className="text-xs text-gray-500 truncate">{session.user.role}</p>
            </div>
            <button
              onClick={handleLogout}
              className="text-xs text-gray-500 hover:text-gray-300 shrink-0 ml-2"
            >
              Logout
            </button>
          </div>
        </div>
      )}
      <div className="px-4 pb-3 text-xs text-gray-600">
        v0.1.0 — MVP
      </div>
    </aside>
  );
}
