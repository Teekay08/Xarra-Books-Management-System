import { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router';
import { usePermissions } from '../hooks/usePermissions';
import { useCompany } from '../hooks/useCompany';
import { useProducts } from '../hooks/useProducts';
import { COMPANIES } from '../stores/companyStore';
import type { Module } from '@xarra/shared';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SubItem {
  name:   string;
  href:   string;
  module?: Module;
}

interface NavGroup {
  id:     string;
  icon:   string;           // SVG path(s) for the icon
  label:  string;
  href?:  string;           // direct link (no expand/collapse)
  module?: Module;          // permission guard for direct links
  items?: SubItem[];        // sub-items
}

// ─── SVG icon paths (heroicons-style, 24×24 viewBox) ─────────────────────────

const ICONS: Record<string, string> = {
  home:        'M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25',
  books:       'M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25',
  orders:      'M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z',
  operations:  'M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z',
  partners:    'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z',
  finance:     'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z',
  sales:       'M9 14.25l6-6m4.5-3.493V21.75l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V4.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0c1.1.128 1.907 1.077 1.907 2.185zM9.75 9h.008v.008H9.75V9zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 4.5h.008v.008h-.008V13.5zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z',
  procurement: 'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z',
  pm:          'M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z',
  workspace:   'M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z',
  budgeting:   'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z',
  analytics:   'M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941',
  admin:       'M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
  // Billetterie-specific
  folder:      'M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z',
  checklist:   'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  chart:       'M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z',
};

// ─── Xarra Books nav groups ───────────────────────────────────────────────────

const XARRA_GROUPS: NavGroup[] = [
  {
    id: 'dashboard', icon: ICONS.home, label: 'Dashboard',
    href: '/', module: 'dashboard',
  },
  {
    id: 'catalog', icon: ICONS.books, label: 'Catalog',
    items: [
      { name: 'Authors', href: '/authors', module: 'authors' },
      { name: 'Titles',  href: '/titles',  module: 'titles' },
    ],
  },
  {
    id: 'orders', icon: ICONS.orders, label: 'Orders',
    items: [
      { name: 'Order Hub',          href: '/orders',            module: 'orderManagement' },
      { name: 'Processing Queue',   href: '/orders/processing', module: 'orderManagement' },
      { name: 'Account Settlement', href: '/settlement',        module: 'orderManagement' },
    ],
  },
  {
    id: 'operations', icon: ICONS.operations, label: 'Operations',
    items: [
      { name: 'Retail Partners', href: '/partners', module: 'partners' },
      { name: 'Inventory',       href: '/inventory', module: 'inventory' },
      { name: 'Partner Portal',  href: '/partners/portal-users', module: 'partnerPortal' },
      { name: 'Sync',            href: '/sync',      module: 'sync' },
    ],
  },
  {
    id: 'finance', icon: ICONS.finance, label: 'Finance',
    items: [
      { name: 'Invoices',        href: '/invoices',                module: 'invoices' },
      { name: 'Quotations',      href: '/quotations',              module: 'quotations' },
      { name: 'Credit Notes',    href: '/credit-notes',            module: 'creditNotes' },
      { name: 'Debit Notes',     href: '/debit-notes',             module: 'debitNotes' },
      { name: 'Payments',        href: '/payments',                module: 'payments' },
      { name: 'Remittances',     href: '/remittances',             module: 'remittances' },
      { name: 'Royalties',       href: '/royalties',               module: 'royalties' },
      { name: 'Expenses',        href: '/expenses',                module: 'expenses' },
      { name: 'Statements',      href: '/statements',              module: 'statements' },
      { name: 'Supplier Orders', href: '/finance/purchase-orders', module: 'purchaseOrders' },
    ],
  },
  {
    id: 'sales', icon: ICONS.sales, label: 'Sales & Procurement',
    items: [
      { name: 'Cash Sales',     href: '/sales/cash-sales',          module: 'cashSales' },
      { name: 'Expense Claims', href: '/expenses/claims',           module: 'expenseClaims' },
      { name: 'Requisitions',   href: '/procurement/requisitions',  module: 'requisitions' },
    ],
  },
  {
    id: 'pm', icon: ICONS.pm, label: 'Projects & Team',
    items: [
      { name: 'PM Dashboard',       href: '/pm',                     module: 'projectManagement' },
      { name: 'Projects',           href: '/pm/projects',            module: 'projectManagement' },
      { name: 'Staff Members',      href: '/pm/staff',               module: 'projectManagement' },
      { name: 'Resource Planning',  href: '/pm/capacity',            module: 'projectManagement' },
      { name: 'Task Requests',      href: '/pm/task-requests',       module: 'projectManagement' },
      { name: 'Deliverable Review', href: '/pm/deliverables/review', module: 'projectManagement' },
      { name: 'Timesheets',         href: '/budgeting/timesheets',   module: 'projectManagement' },
      { name: 'SOW Documents',      href: '/budgeting/sow',          module: 'projectManagement' },
    ],
  },
  {
    id: 'budgeting', icon: ICONS.budgeting, label: 'Budgeting',
    items: [
      { name: 'Budget Dashboard', href: '/budgeting',            module: 'budgeting' },
      { name: 'Projects',         href: '/budgeting/projects',   module: 'budgeting' },
      { name: 'Rate Cards',       href: '/budgeting/rate-cards', module: 'budgeting' },
    ],
  },
  {
    id: 'analytics', icon: ICONS.analytics, label: 'Analytics',
    items: [
      { name: 'Reports',               href: '/reports',                 module: 'reports' },
      { name: 'Cash Flow',             href: '/analytics/cash-flow',     module: 'reports' },
      { name: 'SOR Suspense',          href: '/analytics/suspense',      module: 'reports' },
      { name: 'Sell-Through',          href: '/analytics/predictions',   module: 'reports' },
      { name: 'Trend Analysis',        href: '/analytics/trends',        module: 'reports' },
    ],
  },
  {
    id: 'workspace', icon: ICONS.workspace, label: 'My Workspace',
    items: [
      { name: 'My Dashboard', href: '/employee',         module: 'employeePortal' },
      { name: 'My Planner',   href: '/employee/planner', module: 'employeePortal' },
    ],
  },
  {
    id: 'admin', icon: ICONS.admin, label: 'Admin',
    items: [
      { name: 'Settings',            href: '/settings',                     module: 'settings' },
      { name: 'User Management',     href: '/settings/users',               module: 'users' },
      { name: 'System Config',       href: '/settings/system',              module: 'settings' },
      { name: 'Email Settings',      href: '/settings/email',               module: 'settings' },
      { name: 'Document Series',     href: '/settings/document-series',     module: 'settings' },
      { name: 'Contract Templates',  href: '/settings/contract-templates',  module: 'settings' },
      { name: 'Notifications',       href: '/settings/notification-emails', module: 'settings' },
      { name: 'Scheduling',          href: '/settings/scheduling',          module: 'settings' },
      { name: 'Data Export',         href: '/settings/export',              module: 'settings' },
      { name: 'Audit Trail',         href: '/admin/audit-log',              module: 'auditLogs' },
      { name: 'System Health',       href: '/admin/system-health',          module: 'settings' },
      { name: 'Deletion Requests',   href: '/admin/deletion-requests',      module: 'deletionRequests' },
    ],
  },
];

// ─── Company switcher ─────────────────────────────────────────────────────────

function CompanySwitcher() {
  const navigate = useNavigate();
  const { company, setActiveCompany } = useCompany();
  const { hasMultiple } = useProducts();
  if (!hasMultiple) return null;
  const other = COMPANIES.find((c) => c.slug !== company.slug);
  if (!other) return null;
  function switchTo() {
    setActiveCompany(other!.slug);
    navigate(other!.slug === 'xarra' ? '/' : '/billetterie');
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

// ─── Icon component ───────────────────────────────────────────────────────────

function Icon({ path, className = 'w-4 h-4' }: { path: string; className?: string }) {
  // Support multiple paths separated by a space-M (treat as compound paths)
  const paths = path.split(' M ').map((p, i) => (i === 0 ? p : 'M ' + p));
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

// ─── Collapsible nav group ────────────────────────────────────────────────────

function NavGroupItem({
  group,
  isOpen,
  onToggle,
  accent,
  canAccess,
}: {
  group: NavGroup;
  isOpen: boolean;
  onToggle: () => void;
  accent: { active: string; icon: string; sub: string };
  canAccess: (m?: Module) => boolean;
}) {
  const location = useLocation();

  // Filter sub-items by permission
  const visibleItems = (group.items ?? []).filter(i => canAccess(i.module));
  if (group.items && visibleItems.length === 0) return null;
  if (!group.items && !canAccess(group.module)) return null;

  // Is any sub-item currently active?
  const hasActiveChild = visibleItems.some(i =>
    i.href === '/' ? location.pathname === '/' : location.pathname.startsWith(i.href),
  );

  // Direct link (no sub-items)
  if (group.href && !group.items) {
    return (
      <NavLink
        to={group.href}
        end={group.href === '/' || group.href === '/billetterie'}
        className={({ isActive }) =>
          `flex items-center gap-3 mx-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
            isActive
              ? `${accent.active} font-semibold`
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
          }`
        }
      >
        {({ isActive }) => (
          <>
            <span className={`shrink-0 ${isActive ? accent.icon : 'text-gray-400'}`}>
              <Icon path={group.icon} />
            </span>
            {group.label}
          </>
        )}
      </NavLink>
    );
  }

  return (
    <div>
      {/* Section header — clickable to expand/collapse */}
      <button
        onClick={onToggle}
        className={`w-full flex items-center gap-3 mx-0 px-5 py-2 text-xs font-medium transition-all rounded-none
          ${hasActiveChild
            ? `${accent.active} font-semibold`
            : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
          }`}
      >
        <span className={`shrink-0 ${hasActiveChild ? accent.icon : 'text-gray-400'}`}>
          <Icon path={group.icon} />
        </span>
        <span className="flex-1 text-left">{group.label}</span>
        {/* Chevron */}
        <svg
          className={`h-3 w-3 shrink-0 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''} ${hasActiveChild ? accent.icon : 'text-gray-400'}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {/* Sub-items */}
      {isOpen && (
        <div className="pb-1">
          {visibleItems.map(item => (
            <NavLink
              key={item.href}
              to={item.href}
              end={item.href === '/' || item.href === '/billetterie'}
              className={({ isActive }) =>
                `flex items-center gap-2 ml-9 mr-2 pl-3 pr-2 py-1.5 rounded-md text-xs transition-all border-l-2 ${
                  isActive
                    ? `${accent.sub} border-current font-medium`
                    : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50 border-transparent'
                }`
              }
            >
              {item.name}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Sidebar ─────────────────────────────────────────────────────────────

export function Sidebar() {
  const { canAccess, isXarraBusinessUser, isBilAdmin, isBilManager } = usePermissions();
  const { company, isBilletterie } = useCompany();
  const location = useLocation();

  // Build the groups list for the current product
  const groups: NavGroup[] = isBilletterie
    ? buildBilletterieGroups(isXarraBusinessUser, isBilAdmin, isBilManager)
    : XARRA_GROUPS;

  // Figure out which group contains the current route (to auto-open it)
  function getActiveGroupId(): string | null {
    for (const g of groups) {
      if (g.href && (g.href === '/' ? location.pathname === '/' : location.pathname.startsWith(g.href))) return g.id;
      if (g.items?.some(i => (i.href === '/' ? location.pathname === '/' : location.pathname.startsWith(i.href)))) return g.id;
    }
    return null;
  }

  const [openId, setOpenId] = useState<string | null>(() => getActiveGroupId());

  // Re-sync when route changes (e.g. navigating from outside)
  useEffect(() => {
    const active = getActiveGroupId();
    if (active) setOpenId(active);
  }, [location.pathname]);

  function toggle(id: string) {
    setOpenId(prev => (prev === id ? null : id));
  }

  // Accent colours per product
  const accent = isBilletterie
    ? { active: 'bg-blue-50 text-blue-700', icon: 'text-blue-600', sub: 'text-blue-700 bg-blue-50/60' }
    : { active: 'bg-red-50 text-xarra-red', icon: 'text-xarra-red', sub: 'text-xarra-red bg-red-50' };

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
      <nav className="flex-1 py-2 overflow-y-auto space-y-0.5">
        {groups.map(group => (
          <NavGroupItem
            key={group.id}
            group={group}
            isOpen={openId === group.id}
            onToggle={() => toggle(group.id)}
            accent={accent}
            canAccess={(m) => !m || canAccess(m)}
          />
        ))}
      </nav>

      <div className="px-5 pb-3 text-[9px] text-gray-300 font-mono">v0.3.0</div>
    </aside>
  );
}

// ─── Billetterie nav groups (built at render time — role-aware) ───────────────

function buildBilletterieGroups(
  isXarraBusinessUser: boolean,
  isBilAdmin: boolean,
  isBilManager: boolean,
): NavGroup[] {
  const groups: NavGroup[] = [
    {
      id: 'bil-home', icon: ICONS.home, label: 'Hub',
      href: '/billetterie',
    },
    {
      id: 'bil-projects', icon: ICONS.folder, label: 'Projects',
      items: [
        { name: 'All Projects', href: '/billetterie/projects' },
        { name: 'My Work',      href: '/billetterie/my-work' },
        ...(isXarraBusinessUser ? [
          { name: 'Team Members',     href: '/pm/staff' },
          { name: 'Task Requests',    href: '/pm/task-requests' },
          { name: 'Resource Planning', href: '/pm/capacity' },
        ] : []),
      ],
    },
    {
      id: 'bil-workspace', icon: ICONS.workspace, label: 'My Workspace',
      items: [
        { name: 'My Dashboard', href: '/employee' },
        { name: 'My Planner',   href: '/employee/planner' },
      ],
    },
  ];

  if (isXarraBusinessUser) {
    groups.push(
      {
        id: 'bil-finance', icon: ICONS.finance, label: 'Finance',
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
        id: 'bil-budgeting', icon: ICONS.budgeting, label: 'Project Budgeting',
        items: [
          { name: 'Budget Dashboard', href: '/budgeting' },
          { name: 'Projects',         href: '/budgeting/projects' },
          { name: 'Rate Cards',       href: '/budgeting/rate-cards' },
        ],
      },
      {
        id: 'bil-analytics', icon: ICONS.analytics, label: 'Analytics',
        items: [{ name: 'Reports', href: '/reports' }],
      },
    );
  }

  if (isBilAdmin) {
    groups.push({
      id: 'bil-admin', icon: ICONS.admin, label: 'Admin',
      items: [
        { name: 'Settings',        href: '/settings' },
        { name: 'User Management', href: '/settings/users' },
        { name: 'Audit Trail',     href: '/admin/audit-log' },
      ],
    });
  }

  return groups;
}
