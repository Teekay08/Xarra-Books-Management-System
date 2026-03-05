import { NavLink } from 'react-router';

interface NavItem { name: string; href: string }
interface NavSection { label: string; items: NavItem[] }

const sections: NavSection[] = [
  {
    label: '',
    items: [{ name: 'Dashboard', href: '/' }],
  },
  {
    label: 'Catalog',
    items: [
      { name: 'Authors', href: '/authors' },
      { name: 'Titles', href: '/titles' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { name: 'Channel Partners', href: '/partners' },
      { name: 'Inventory', href: '/inventory' },
      { name: 'Consignments', href: '/consignments' },
      { name: 'Returns', href: '/returns' },
      { name: 'Sync', href: '/sync' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { name: 'Quotations', href: '/quotations' },
      { name: 'Invoices', href: '/invoices' },
      { name: 'Credit Notes', href: '/credit-notes' },
      { name: 'Debit Notes', href: '/debit-notes' },
      { name: 'Payments', href: '/payments' },
      { name: 'Remittances', href: '/remittances' },
      { name: 'Expenses', href: '/expenses' },
      { name: 'Statements', href: '/statements' },
    ],
  },
  {
    label: 'Analytics',
    items: [{ name: 'Reports', href: '/reports' }],
  },
];

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `block px-6 py-2 text-[13px] font-medium tracking-wide transition-colors ${
    isActive
      ? 'bg-xarra-red/10 text-xarra-red border-r-3 border-xarra-red'
      : 'text-gray-700 hover:text-xarra-red hover:bg-gray-50'
  }`;

function SectionGroup({ section }: { section: NavSection }) {
  return (
    <div>
      {section.label && (
        <p className="px-6 pt-5 pb-1 text-[10px] font-bold uppercase tracking-widest text-xarra-gold-dark">
          {section.label}
        </p>
      )}
      {section.items.map((item) => (
        <NavLink key={item.href} to={item.href} end={item.href === '/'} className={linkClass}>
          {item.name}
        </NavLink>
      ))}
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col shrink-0">
      <div className="p-5 border-b border-gray-100">
        <img src="/XarraBooks-logo.png" alt="Xarra Books" className="h-12 mb-1" />
        <p className="text-[10px] text-gray-400 font-mono tracking-widest uppercase mt-1">Management System</p>
      </div>
      <nav className="flex-1 py-2 overflow-y-auto">
        {sections.map((section) => (
          <SectionGroup key={section.label || 'top'} section={section} />
        ))}
      </nav>
      <div className="px-4 pb-3 text-[10px] text-gray-300">
        v0.2.0
      </div>
    </aside>
  );
}
