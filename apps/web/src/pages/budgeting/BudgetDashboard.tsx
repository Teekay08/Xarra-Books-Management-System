import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

interface DashboardData {
  stats: {
    total_projects: string;
    in_progress: string;
    total_budgeted: string;
    total_actual: string;
  };
  overBudget: Array<{
    id: string;
    number: string;
    name: string;
    total_budget: string;
    total_actual: string;
  }>;
  recentProjects: Array<{
    id: string;
    number: string;
    name: string;
    status: string;
    projectType: string;
    totalBudget: string;
    totalActual: string;
    title?: { title: string } | null;
    author?: { legalName: string } | null;
  }>;
}

const statusColors: Record<string, string> = {
  PLANNING: 'bg-gray-100 text-gray-700',
  BUDGETED: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

export function BudgetDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['budgeting-dashboard'],
    queryFn: () => api<{ data: DashboardData }>('/budgeting/dashboard'),
  });

  const stats = data?.data?.stats;
  const totalBudgeted = Number(stats?.total_budgeted || 0);
  const totalActual = Number(stats?.total_actual || 0);
  const variance = totalBudgeted - totalActual;

  return (
    <div>
      <PageHeader
        title="Project Budgeting"
        subtitle="Overview of all book project budgets"
        action={
          <Link to="/budgeting/projects/new" className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800">
            New Project
          </Link>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard label="Total Projects" value={stats?.total_projects || '0'} />
        <StatCard label="In Progress" value={stats?.in_progress || '0'} />
        <StatCard label="Total Budgeted" value={`R ${totalBudgeted.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`} />
        <StatCard
          label="Variance"
          value={`R ${Math.abs(variance).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`}
          className={variance >= 0 ? 'text-green-700' : 'text-red-600'}
          subtitle={variance >= 0 ? 'Under budget' : 'Over budget'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Over Budget Projects */}
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Over Budget Projects</h3>
          {data?.data?.overBudget?.length === 0 && (
            <p className="text-sm text-gray-400">No projects are over budget.</p>
          )}
          <div className="space-y-3">
            {data?.data?.overBudget?.map((p) => {
              const over = Number(p.total_actual) - Number(p.total_budget);
              return (
                <Link key={p.id} to={`/budgeting/projects/${p.id}`} className="flex items-center justify-between p-3 rounded-md hover:bg-gray-50 border border-gray-100">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{p.name}</p>
                    <p className="text-xs text-gray-500">{p.number}</p>
                  </div>
                  <span className="text-sm font-semibold text-red-600">
                    +R {over.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Recent Projects */}
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Recent Projects</h3>
          {isLoading && <p className="text-sm text-gray-400">Loading...</p>}
          <div className="space-y-3">
            {data?.data?.recentProjects?.map((p) => (
              <Link key={p.id} to={`/budgeting/projects/${p.id}`} className="flex items-center justify-between p-3 rounded-md hover:bg-gray-50 border border-gray-100">
                <div>
                  <p className="text-sm font-medium text-gray-900">{p.name}</p>
                  <p className="text-xs text-gray-500">
                    {p.number} &middot; {p.author?.legalName || 'No author'} &middot; {p.projectType.replace(/_/g, ' ')}
                  </p>
                </div>
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[p.status] || 'bg-gray-100 text-gray-700'}`}>
                  {p.status.replace(/_/g, ' ')}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, className, subtitle }: { label: string; value: string; className?: string; subtitle?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${className || 'text-gray-900'}`}>{value}</p>
      {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
    </div>
  );
}
