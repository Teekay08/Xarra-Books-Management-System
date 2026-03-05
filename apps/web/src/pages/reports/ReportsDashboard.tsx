import { Link } from 'react-router';
import { PageHeader } from '../../components/PageHeader';

const reports = [
  { name: 'Profit & Loss', description: 'Revenue vs expenses by month with net profit', href: '/reports/profit-loss', icon: '📈' },
  { name: 'Sales Report', description: 'Sales by title or channel partner with date filters', href: '/reports/sales', icon: '💰' },
  { name: 'Overdue Aging', description: 'Outstanding invoices grouped by 30/60/90+ day buckets', href: '/reports/overdue-aging', icon: '⏰' },
  { name: 'Inventory', description: 'Stock levels, consignment history, and movement summary', href: '/reports/inventory', icon: '📦' },
  { name: 'Author Royalties', description: 'Detailed sales and royalty calculations per author with PDF export', href: '/reports/author-royalty', icon: '✍️' },
];

export function ReportsDashboard() {
  return (
    <div>
      <PageHeader title="Reports" subtitle="Financial and operational reports" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
        {reports.map((r) => (
          <Link
            key={r.href}
            to={r.href}
            className="rounded-lg border border-gray-200 bg-white p-5 hover:border-green-300 hover:shadow-sm transition-all"
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl">{r.icon}</span>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">{r.name}</h3>
                <p className="text-xs text-gray-500 mt-1">{r.description}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
