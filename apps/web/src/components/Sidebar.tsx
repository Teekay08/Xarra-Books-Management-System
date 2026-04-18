import { NavLink, useNavigate } from 'react-router';
import { usePermissions } from '../hooks/usePermissions';
import { useCompany } from '../hooks/useCompany';
import { COMPANIES } from '../stores/companyStore';
import type { Module } from '@xarra/shared';

interface NavItem { name: string; href: string; module?: Module }
interface NavSection { label: string; items: NavItem[] }

// ─── Xarra Books navigation ──────────────────────────────────────────────────

const xarraSections: NavSection[] = [
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
    label: 'Order Management',
    items: [
      { name: 'Order Hub',          href: '/orders',            module: 'orderManagement' },
      { name: 'Processing Queue',   href: '/orders/processing', module: 'orderManagement' },
      { name: 'Account Settlement', href: '/settlement',        module: 'orderManagement' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { name: 'Retail Partners', href: '/partners', module: 'partners' },
      { name: 'Inventory',       href: '/inventory', module: 'inventory' },
      { name: 'Sync',            href: '/sync',      module: 'sync' },
    ],
  },
  {
    label: 'Partner Portal',
    items: [
      { name: 'Portal Users', href: '/partners/portal-users', module: 'partnerPortal' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { name: 'Quotations',      href: '/quotations',              module: 'quotations' },
      { name: 'Invoices',        href: '/invoices',                module: 'invoices' },
      { name: 'Supplier Orders', href: '/finance/purchase-orders', module: 'purchaseOrders' },
      { name: 'Credit Notes',    href: '/credit-notes',            module: 'creditNotes' },
      { name: 'Debit Notes',     href: '/debit-notes',             module: 'debitNotes' },
      { name: 'Payments',        href: '/payments',                module: 'payments' },
      { name: 'Remittances',     href: '/remittances',             module: 'remittances' },
      { name: 'Royalties',       href: '/royalties',               module: 'royalties' },
      { name: 'Expenses',        href: '/expenses',                module: 'expenses' },
      { name: 'Statements',      href: '/statements',              module: 'statements' },
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
      { name: 'Expense Claims', href: '/expenses/claims',           module: 'expenseClaims' },
      { name: 'Requisitions',   href: '/procurement/requisitions',  module: 'requisitions' },
    ],
  },
  {
    label: 'Project Management',
    items: [
      { name: 'PM Dashboard',      href: '/pm',                      module: 'projectManagement' },
      { name: 'Projects',          href: '/pm/projects',             module: 'projectManagement' },
      { name: 'Staff Members',     href: '/pm/staff',                module: 'projectManagement' },
      { name: 'Resource Planning', href: '/pm/capacity',             module: 'projectManagement' },
      { name: 'Task Requests',     href: '/pm/task-requests',        module: 'projectManagement' },
      { name: 'Deliverable Review',href: '/pm/deliverables/review',  module: 'projectManagement' },
      { name: 'Timesheets',        href: '/budgeting/timesheets',    module: 'projectManagement' },
      { name: 'SOW Documents',     href: '/budgeting/sow',           module: 'projectManagement' },
    ],
  },
  {
    label: 'My Workspace',
    items: [
      { name: 'My Dashboard', href: '/employee',         module: 'employeePortal' },
      { name: 'My Planner',   href: '/employee/planner', module: 'employeePortal' },
    ],
  },
  {
    label: 'Project Budgeting',
    items: [
      { name: 'Budget Dashboard', href: '/budgeting',             module: 'budgeting' },
      { name: 'Projects',         href: '/budgeting/projects',    module: 'budgeting' },
      { name: 'Rate Cards',       href: '/budgeting/rate-cards',  module: 'budgeting' },
    ],
  },
  {
    label: 'Analytics',
    items: [
      { name: 'Reports',                href: '/reports',                  module: 'reports' },
      { name: 'SOR Suspense',           href: '/analytics/suspense',       module: 'reports' },
      { name: 'Cash Flow',              href: '/analytics/cash-flow',      module: 'reports' },
      { name: 'Sell-Through Predictions',href: '/analytics/predictions',   module: 'reports' },
      { name: 'Trend Analysis',         href: '/analytics/trends',         module: 'reports' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { name: 'Documents',          href: '/documents',                    module: 'invoices' },
      { name: 'Settings',           href: '/settings',                     module: 'settings' },
      { name: 'User Management',    href: '/settings/users',               module: 'users' },
      { name: 'System Config',      href: '/settings/system',              module: 'settings' },
      { name: 'Email Settings',     href: '/settings/email',               module: 'settings' },
      { name: 'Document Series',    href: '/settings/document-series',     module: 'settings' },
      { name: 'Contract Templates', href: '/settings/contract-templates',  module: 'settings' },
      { name: 'Email Notifications',href: '/settings/notification-emails', module: 'settings' },
      { name: 'Scheduling',         href: '/settings/scheduling',          module: 'settings' },
      { name: 'Data Export',        href: '/settings/export',              module: 'settings' },
      { name: 'Audit Trail',        href: '/admin/audit-log',              module: 'auditLogs' },
      { name: 'System Health',      href: '/admin/system-health',          module: 'settings' },
      { name: 'Deletion Requests',  href: '/admin/deletion-requests',      module: 'deletionRequests' },
    ],
  },
];

// ─── Billetterie Software navigation ─────────────────────────────────────────

const billetterieSections: NavSection[] = [
  {
    label: '',
    items: [{ name: 'Dashboard', href: '/billetterie', module: 'dashboard' }],
  },
  {
    label: 'Project Management',
    items: [
      { name: 'All Projects',    href: '/billetterie/projects',       module: 'projectManagement' },
      { name: 'Staff Members',   href: '/pm/staff',                   module: 'projectManagement' },
      { name: 'Task Requests',   href: '/pm/task-requests',           module: 'projectManagement' },
      { name: 'Resource Planning',href: '/pm/capacity',               module: 'projectManagement' },
    ],
  },
  {
    label: 'My Workspace',
    items: [
      { name: 'My Dashboard', href: '/employee',          module: 'employeePortal' },
      { name: 'My Planner',   href: '/employee/planner',  module: 'employeePortal' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { name: 'Timesheets',   href: '/budgeting/timesheets',   module: 'projectManagement' },
      { name: 'SOW Documents',href: '/budgeting/sow',          module: 'projectManagement' },
      { name: 'Invoices',     href: '/invoices',               module: 'invoices' },
      { name: 'Quotations',   href: '/quotations',             module: 'quotations' },
      { name: 'Expenses',     href: '/expenses',               module: 'expenses' },
      { name: 'Expense Claims',href: '/expenses/claims',       module: 'expenseClaims' },
    ],
  },
  {
    label: 'Project Budgeting',
    items: [
      { name: 'Budget Dashboard', href: '/budgeting',            module: 'budgeting' },
      { name: 'Projects',         href: '/budgeting/projects',   module: 'budgeting' },
      { name: 'Rate Cards',       href: '/budgeting/rate-cards', module: 'budgeting' },
    ],
  },
  {
    label: 'Reports',
    items: [
      { name: 'Reports', href: '/reports', module: 'reports' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { name: 'Settings',        href: '/settings',          module: 'settings' },
      { name: 'User Management', href: '/settings/users',    module: 'users' },
      { name: 'Audit Trail',     href: '/admin/audit-log',   module: 'auditLogs' },
    ],
  },
];

// ─── Shared helpers ───────────────────────────────────────────────────────────

const xarraLinkClass = ({ isActive }: { isActive: boolean }) =>
  `block px-6 py-2 text-[13px] font-medium tracking-wide transition-colors ${
    isActive
      ? 'bg-xarra-red/10 text-xarra-red border-r-3 border-xarra-red'
      : 'text-gray-700 hover:text-xarra-red hover:bg-gray-50'
  }`;

const billetterieLinkClass = ({ isActive }: { isActive: boolean }) =>
  `block px-6 py-2 text-[13px] font-medium tracking-wide transition-colors ${
    isActive
      ? 'bg-blue-50 text-blue-700 border-r-3 border-blue-700'
      : 'text-gray-700 hover:text-blue-700 hover:bg-blue-50/50'
  }`;

function SectionGroup({
  section,
  linkClass,
}: {
  section: NavSection;
  linkClass: (p: { isActive: boolean }) => string;
}) {
  return (
    <div>
      {section.label && (
        <p className="px-6 pt-5 pb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">
          {section.label}
        </p>
      )}
      {section.items.map((item) => (
        <NavLink key={item.href} to={item.href} end={item.href === '/' || item.href === '/billetterie'} className={linkClass}>
          {item.name}
        </NavLink>
      ))}
    </div>
  );
}

// ─── Company switcher pill ────────────────────────────────────────────────────

function CompanySwitcher() {
  const navigate = useNavigate();
  const { company, companies, setActiveCompany } = useCompany();
  const other = companies.find((c) => c.slug !== company.slug);

  if (!other) return null;

  function switchTo() {
    setActiveCompany(other!.slug);
    if (other!.slug === 'xarra') navigate('/');
    else navigate('/billetterie');
  }

  return (
    <div className="px-4 pb-2 pt-3 border-b border-gray-100">
      <button
        onClick={switchTo}
        className="w-full flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 px-3 py-2 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded-full" style={{ backgroundColor: other.accentColor }} />
          <span className="text-xs text-gray-600 font-medium">Switch to {other.shortName}</span>
        </div>
        <svg className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
      </button>
    </div>
  );
}

// ─── Main sidebar ─────────────────────────────────────────────────────────────

export function Sidebar() {
  const { canAccess } = usePermissions();
  const { company, isBilletterie } = useCompany();

  const rawSections = isBilletterie ? billetterieSections : xarraSections;
  const linkClass = isBilletterie ? billetterieLinkClass : xarraLinkClass;

  const sections = rawSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.module || canAccess(item.module)),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <aside className="w-64 h-full bg-white border-r border-gray-200 flex flex-col shrink-0">
      {/* Branding */}
      <div className="p-5 border-b border-gray-100">
        <img
          src={company.logo}
          alt={company.name}
          className="h-12 mb-1 object-contain"
          onError={(e) => {
            const img = e.target as HTMLImageElement;
            img.style.display = 'none';
            img.nextElementSibling?.classList.remove('hidden');
          }}
        />
        <span className="hidden text-base font-bold text-gray-900">{company.name}</span>
        <p className="text-[10px] text-gray-400 font-mono tracking-widest uppercase mt-1">
          {company.tagline}
        </p>
      </div>

      {/* Company switcher */}
      <CompanySwitcher />

      {/* Navigation */}
      <nav className="flex-1 py-2 overflow-y-auto">
        {sections.map((section) => (
          <SectionGroup key={section.label || 'top'} section={section} linkClass={linkClass} />
        ))}
      </nav>

      <div className="px-4 pb-3 text-[10px] text-gray-300">v0.3.0</div>
    </aside>
  );
}
