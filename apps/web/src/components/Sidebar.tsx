import { NavLink } from 'react-router';
import { usePermissions } from '../hooks/usePermissions';
import type { Module } from '@xarra/shared';

interface NavItem { name: string; href: string; module?: Module }
interface NavSection { label: string; items: NavItem[] }

const allSections: NavSection[] = [
  {
    label: '',
    items: [{ name: 'Dashboard', href: '/', module: 'dashboard' }],
  },
  {
    label: 'Catalog',
    items: [
      { name: 'Authors', href: '/authors', module: 'authors' },
      { name: 'Titles', href: '/titles', module: 'titles' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { name: 'Channel Partners', href: '/partners', module: 'partners' },
      { name: 'Inventory', href: '/inventory', module: 'inventory' },
      { name: 'Consignments', href: '/consignments', module: 'consignments' },
      { name: 'SOR Pro-formas', href: '/consignments/proformas', module: 'consignments' },
      { name: 'Returns', href: '/returns', module: 'returns' },
      { name: 'Sync', href: '/sync', module: 'sync' },
    ],
  },
  {
    label: 'Partner Portal',
    items: [
      { name: 'Portal Users', href: '/partners/portal-users', module: 'partnerPortal' },
      { name: 'Partner Book Orders', href: '/partners/portal-orders', module: 'partnerPortal' },
      { name: 'Return Requests', href: '/partners/return-requests', module: 'partnerPortal' },
      { name: 'Courier Shipments', href: '/partners/courier-shipments', module: 'courierShipments' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { name: 'Quotations', href: '/quotations', module: 'quotations' },
      { name: 'Invoices', href: '/invoices', module: 'invoices' },
      { name: 'Supplier Orders', href: '/finance/purchase-orders', module: 'purchaseOrders' },
      { name: 'Credit Notes', href: '/credit-notes', module: 'creditNotes' },
      { name: 'Debit Notes', href: '/debit-notes', module: 'debitNotes' },
      { name: 'Payments', href: '/payments', module: 'payments' },
      { name: 'Remittances', href: '/remittances', module: 'remittances' },
      { name: 'Royalties', href: '/royalties', module: 'royalties' },
      { name: 'Expenses', href: '/expenses', module: 'expenses' },
      { name: 'Statements', href: '/statements', module: 'statements' },
    ],
  },
  {
    label: 'Sales',
    items: [
      { name: 'Cash Sales', href: '/sales/cash-sales', module: 'cashSales' },
    ],
  },
  {
    label: 'Procurement',
    items: [
      { name: 'Expense Claims', href: '/expenses/claims', module: 'expenseClaims' },
      { name: 'Requisitions', href: '/procurement/requisitions', module: 'requisitions' },
    ],
  },
  {
    label: 'Project Budgeting',
    items: [
      { name: 'Budget Dashboard', href: '/budgeting', module: 'budgeting' },
      { name: 'Projects', href: '/budgeting/projects', module: 'budgeting' },
      { name: 'Rate Cards', href: '/budgeting/rate-cards', module: 'budgeting' },
      { name: 'Timesheets', href: '/budgeting/timesheets', module: 'budgeting' },
      { name: 'SOW Documents', href: '/budgeting/sow', module: 'budgeting' },
    ],
  },
  {
    label: 'Analytics',
    items: [{ name: 'Reports', href: '/reports', module: 'reports' }],
  },
  {
    label: 'Admin',
    items: [
      { name: 'Documents', href: '/documents', module: 'invoices' },
      { name: 'Settings', href: '/settings', module: 'settings' },
      { name: 'User Management', href: '/settings/users', module: 'users' },
      { name: 'System Config', href: '/settings/system', module: 'settings' },
      { name: 'Email Settings', href: '/settings/email', module: 'settings' },
      { name: 'Document Series', href: '/settings/document-series', module: 'settings' },
      { name: 'Contract Templates', href: '/settings/contract-templates', module: 'settings' },
      { name: 'Scheduling', href: '/settings/scheduling', module: 'settings' },
      { name: 'Data Export', href: '/settings/export', module: 'settings' },
      { name: 'Audit Trail', href: '/admin/audit-log', module: 'auditLogs' },
      { name: 'Deletion Requests', href: '/admin/deletion-requests', module: 'deletionRequests' },
    ],
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
  const { canAccess } = usePermissions();

  // Filter sections based on user's role permissions
  const sections = allSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.module || canAccess(item.module)),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <aside className="w-64 h-full bg-white border-r border-gray-200 flex flex-col shrink-0">
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
