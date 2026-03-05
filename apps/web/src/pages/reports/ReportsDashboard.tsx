import { Link } from 'react-router';
import { PageHeader } from '../../components/PageHeader';

interface ReportCard {
  name: string;
  description: string;
  href: string;
  category: string;
}

const reports: ReportCard[] = [
  // Financial
  { name: 'Profit & Loss', description: 'Revenue vs expenses by month with net profit', href: '/reports/profit-loss', category: 'Financial' },
  { name: 'Cash Flow Analysis', description: 'Inflows vs outflows, payment speed, and working capital', href: '/reports/cash-flow', category: 'Financial' },
  { name: 'Tax & VAT Report', description: 'Output VAT, input VAT, credit note adjustments — SARS-ready', href: '/reports/tax', category: 'Financial' },
  { name: 'Expense Trends', description: 'Spending analysis by category with monthly trends', href: '/reports/expense-trends', category: 'Financial' },
  { name: 'Overdue Aging', description: 'Outstanding invoices grouped by 30/60/90+ day buckets', href: '/reports/overdue-aging', category: 'Financial' },

  // Sales & Marketing
  { name: 'Bestsellers & Performance', description: 'Top sellers, underperformers, top authors, and profitability ranking', href: '/reports/bestsellers', category: 'Sales & Marketing' },
  { name: 'Sales Report', description: 'Sales by title or channel partner with date filters', href: '/reports/sales', category: 'Sales & Marketing' },
  { name: 'Channel Revenue', description: 'Revenue breakdown by sales channel — website, KDP, Takealot, partners', href: '/reports/channel-revenue', category: 'Sales & Marketing' },
  { name: 'Title Performance', description: 'Revenue, units sold, stock levels, and avg price per book', href: '/reports/title-performance', category: 'Sales & Marketing' },
  { name: 'Partner Performance', description: 'Revenue, payment behaviour, return rates per channel partner', href: '/reports/partner-performance', category: 'Sales & Marketing' },

  // Operations
  { name: 'Inventory', description: 'Stock levels, consignment history, and movement summary', href: '/reports/inventory', category: 'Operations' },
  { name: 'Author Royalties', description: 'Detailed sales and royalty calculations per author with PDF export', href: '/reports/author-royalty', category: 'Authors' },
];

const categories = [...new Set(reports.map((r) => r.category))];

export function ReportsDashboard() {
  return (
    <div>
      <PageHeader title="Reports" subtitle="Financial, sales, marketing and operational reports for management decision-making" />

      {categories.map((cat) => (
        <div key={cat} className="mb-8">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">{cat}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {reports.filter((r) => r.category === cat).map((r) => (
              <Link
                key={r.href}
                to={r.href}
                className="rounded-lg border border-gray-200 bg-white p-5 hover:border-green-300 hover:shadow-sm transition-all group"
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
