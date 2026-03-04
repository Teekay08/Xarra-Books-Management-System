import { NavLink } from 'react-router';

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
      <div className="p-4 border-t border-gray-800 text-xs text-gray-600">
        v0.1.0 — MVP
      </div>
    </aside>
  );
}
