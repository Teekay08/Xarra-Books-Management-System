import { NavLink, useNavigate } from 'react-router';
import { usePermissions } from '../hooks/usePermissions';
import { useCompany } from '../hooks/useCompany';
import { useProducts } from '../hooks/useProducts';
import { COMPANIES } from '../stores/companyStore';
import type { Module } from '@xarra/shared';

interface NavItem { name: string; href: string; module?: Module | undefined }
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

// ─── Billetterie Software navigation (computed — role-aware) ─────────────────
// Built at render time because visibility depends on Billetterie system roles
// which are not available at module-init time.

function useBilletterieSections(): NavSection[] {
  const { isXarraBusinessUser, isBilAdmin, isBilManager } = usePermissions();

  const sections: NavSection[] = [
    {
      label: '',
      items: [{ name: 'Dashboard', href: '/billetterie' }],
    },
    {
      // All billetterieAccess users can see projects (API scopes results by team membership)
      label: 'Project Management',
      items: [
        { name: 'All Projects', href: '/billetterie/projects' },
        { name: 'My Work',      href: '/billetterie/my-work' },
        // Xarra PM-level staff also get the broader PM tooling
        ...(isXarraBusinessUser ? [
          { name: 'Team Members',     href: '/pm/staff' },
          { name: 'Task Requests',    href: '/pm/task-requests' },
          { name: 'Resource Planning', href: '/pm/capacity' },
        ] : []),
      ],
    },
    {
      label: 'My Workspace',
      items: [
        { name: 'My Dashboard', href: '/employee' },
        { name: 'My Planner',   href: '/employee/planner' },
      ],
    },
  ];

  // Finance & budgeting — only for Xarra business users (admin, finance, projectManager)
  if (isXarraBusinessUser) {
    sections.push(
      {
        label: 'Finance',
        items: [
          { name: 'Timesheets',    href: '/budgeting/timesheets' },
          { name: 'SOW Documents', href: '/budgeting/sow' },
          { name: 'Invoices',      href: '/invoices' },
          { name: 'Quotations',    href: '/quotations' },
          { name: 'Expenses',      href: '/expenses' },
          { name: 'Expense Claims', href: '/expenses/claims' },
        ],
      },
      {
        label: 'Project Budgeting',
        items: [
          { name: 'Budget Dashboard', href: '/budgeting' },
          { name: 'Projects',         href: '/budgeting/projects' },
          { name: 'Rate Cards',       href: '/budgeting/rate-cards' },
        ],
      },
      {
        label: 'Reports',
        items: [{ name: 'Reports', href: '/reports' }],
      },
    );
  }

  // Admin section — BIL_ADMIN or Xarra admin only
  if (isBilAdmin) {
    sections.push({
      label: 'Admin',
      items: [
        { name: 'Settings',        href: '/settings' },
        { name: 'User Management', href: '/settings/users' },
        { name: 'Audit Trail',     href: '/admin/audit-log' },
      ],
    });
  }

  return sections;
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

const xarraLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center mx-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-fast ${
    isActive
      ? 'bg-xarra-red/10 text-xarra-red font-semibold'
      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
  }`;

const billetterieLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center mx-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-fast ${
    isActive
      ? 'bg-blue-50 text-blue-700 font-semibold'
      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
  }`;

function SectionGroup({
  section,
  linkClass,
}: {
  section: NavSection;
  linkClass: (p: { isActive: boolean }) => string;
}) {
  return (
    <div className="mb-1">
      {section.label && (
        <p className="px-5 pt-4 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400">
          {section.label}
        </p>
      )}
      <div className="space-y-0.5">
        {section.items.map((item) => (
          <NavLink
            key={item.href}
            to={item.href}
            end={item.href === '/' || item.href === '/billetterie'}
            className={linkClass}
          >
            {item.name}
          </NavLink>
        ))}
      </div>
    </div>
  );
}

// ─── Company switcher pill ────────────────────────────────────────────────────
// Only shown when the user actually has access to both products.

function CompanySwitcher() {
  const navigate = useNavigate();
  const { company, setActiveCompany } = useCompany();
  const { hasMultiple } = useProducts();

  // Only render the switcher when the user has access to multiple products
  if (!hasMultiple) return null;

  const other = COMPANIES.find((c) => c.slug !== company.slug);
  if (!other) return null;

  function switchTo() {
    setActiveCompany(other!.slug);
    if (other!.slug === 'xarra') navigate('/');
    else navigate('/billetterie');
  }

  return (
    <div className="px-3 py-2.5 border-b border-gray-100">
      <button
        onClick={switchTo}
        className="w-full flex items-center gap-2.5 rounded-lg border border-gray-200 bg-gray-50/80 hover:bg-white hover:border-gray-300 px-3 py-2 transition-all group shadow-xs"
      >
        <div className="h-5 w-5 rounded-full shrink-0 ring-2 ring-white shadow-sm" style={{ backgroundColor: other.accentColor }} />
        <span className="text-xs text-gray-600 font-medium group-hover:text-gray-900 transition-colors flex-1 text-left">
          Switch to {other.shortName}
        </span>
        <svg className="h-3 w-3 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
  const bilSections = useBilletterieSections();

  const linkClass = isBilletterie ? billetterieLinkClass : xarraLinkClass;

  // Xarra: filter by canAccess(module). Billetterie: already role-computed above.
  const sections = isBilletterie
    ? bilSections.filter((s) => s.items.length > 0)
    : xarraSections
        .map((section) => ({
          ...section,
          items: section.items.filter((item) => !item.module || canAccess(item.module)),
        }))
        .filter((section) => section.items.length > 0);

  return (
    <aside className="w-[220px] h-full bg-white border-r border-gray-100 flex flex-col shrink-0">
      {/* Branding */}
      <div className="px-4 py-3.5 border-b border-gray-100">
        <img
          src={company.logo}
          alt={company.name}
          className="h-8 object-contain object-left"
          onError={(e) => {
            const img = e.target as HTMLImageElement;
            img.style.display = 'none';
            const next = img.nextElementSibling as HTMLElement | null;
            if (next) next.style.display = 'block';
          }}
        />
        <span className="hidden text-sm font-bold text-gray-900">{company.name}</span>
        <p className="text-[9px] text-gray-400 font-mono tracking-widest uppercase mt-1.5">
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

      <div className="px-5 pb-3 text-[9px] text-gray-300 font-mono">v0.3.0</div>
    </aside>
  );
}
