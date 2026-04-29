import { Link } from 'react-router';
import { PageHeader } from '../../components/PageHeader';
import { usePermissions } from '../../hooks/usePermissions';

interface ReportCard {
  name: string;
  description: string;
  href: string;
  category: string;
  /** Which roles can see this report. Empty = all roles with reports access */
  roles?: ('admin' | 'finance' | 'pm')[];
}

const reports: ReportCard[] = [
  // Financial — Admin + Finance only
  { name: 'Profit & Loss', description: 'Revenue vs expenses by month with net profit', href: '/reports/profit-loss', category: 'Financial', roles: ['admin', 'finance'] },
  { name: 'Cash Flow Analysis', description: 'Inflows vs outflows, payment speed, and working capital', href: '/reports/cash-flow', category: 'Financial', roles: ['admin', 'finance'] },
  { name: 'Tax & VAT Report', description: 'Output VAT, input VAT, credit note adjustments — SARS-ready', href: '/reports/tax', category: 'Financial', roles: ['admin', 'finance'] },
  { name: 'Expense Trends', description: 'Spending analysis by category with monthly trends', href: '/reports/expense-trends', category: 'Financial', roles: ['admin', 'finance'] },
  { name: 'Overdue Aging', description: 'Outstanding invoices grouped by 30/60/90+ day buckets', href: '/reports/overdue-aging', category: 'Financial', roles: ['admin', 'finance'] },

  // Sales & Marketing — Admin, Finance, PM
  { name: 'Bestsellers & Performance', description: 'Top sellers, underperformers, top authors, and profitability ranking', href: '/reports/bestsellers', category: 'Sales & Marketing' },
  { name: 'Sales Report', description: 'Sales by title or channel partner with date filters', href: '/reports/sales', category: 'Sales & Marketing' },
  { name: 'Channel Revenue', description: 'Revenue breakdown by sales channel — website, KDP, Takealot, partners', href: '/reports/channel-revenue', category: 'Sales & Marketing' },
  { name: 'Title Performance', description: 'Revenue, units sold, stock levels, and avg price per book', href: '/reports/title-performance', category: 'Sales & Marketing' },
  { name: 'Partner Performance', description: 'Revenue, payment behaviour, return rates per channel partner', href: '/reports/partner-performance', category: 'Sales & Marketing' },

  // Operations — Admin, Finance, PM
  { name: 'Inventory', description: 'Stock levels, consignment history, and movement summary', href: '/reports/inventory', category: 'Operations' },
  { name: 'Print Runs', description: 'Print run history per title — copies ordered, received, costs, and status', href: '/reports/print-runs', category: 'Operations' },
  { name: 'SOR Reconciliation', description: 'Per-consignment breakdown of dispatched, sold, returned, and outstanding stock', href: '/reports/sor-reconciliation', category: 'Operations' },

  // Project Management — Admin, PM
  { name: 'Project Cost Summary', description: 'Budget vs actual costs across all projects with variance analysis', href: '/reports/project-costs', category: 'Project Management', roles: ['admin', 'pm'] },
  { name: 'Resource Utilization', description: 'Staff allocation, hours logged vs available, capacity overview', href: '/pm/capacity', category: 'Project Management', roles: ['admin', 'pm'] },
  { name: 'Task Completion', description: 'Task progress, on-time delivery, overdue tasks, and estimated vs actual hours', href: '/reports/task-completion', category: 'Project Management', roles: ['admin', 'pm'] },
  { name: 'Planned vs Actual', description: 'How accurately staff plan their work vs hours actually logged, with variance and accuracy %', href: '/reports/planned-vs-actual', category: 'Project Management', roles: ['admin', 'pm'] },

  // Authors — Admin, Finance
  { name: 'Author Royalties', description: 'Detailed sales and royalty calculations per author with PDF export', href: '/reports/author-royalty', category: 'Authors', roles: ['admin', 'finance'] },
  { name: 'Royalty Due Report', description: 'All authors with outstanding royalties — approved, pending approval, and overdue', href: '/reports/royalty-due', category: 'Authors', roles: ['admin', 'finance'] },
];

export function ReportsDashboard() {
  const { isAdmin, isFinance, isProjectManager } = usePermissions();

  // Filter reports based on role
  const visibleReports = reports.filter((r) => {
    if (!r.roles) return true; // no restriction = visible to all with reports access
    if (isAdmin && r.roles.includes('admin')) return true;
    if (isFinance && r.roles.includes('finance')) return true;
    if (isProjectManager && r.roles.includes('pm')) return true;
    return false;
  });

  const categories = [...new Set(visibleReports.map((r) => r.category))];

  return (
    <div>
      <PageHeader title="Reports" subtitle={
        isProjectManager && !isAdmin
          ? 'Project, sales, and operational reports'
          : 'Financial, sales, marketing and operational reports for management decision-making'
      } />

      {categories.map((cat) => (
        <div key={cat} className="mb-8">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">{cat}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleReports.filter((r) => r.category === cat).map((r) => (
              <Link
                key={r.href}
                to={r.href}
                className="card p-4 hover:border-green-300 hover:shadow-sm transition-all group"
              >
                <h3 className="text-sm font-semibold text-gray-900 group-hover:text-green-700 transition-colors">{r.name}</h3>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">{r.description}</p>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
