import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

interface ProjectCost {
  id: string;
  number: string;
  name: string;
  status: string;
  projectType: string;
  contractType: string;
  totalBudget: string;
  totalActual: string;
  title?: { title: string } | null;
  author?: { legalName: string; penName?: string } | null;
}

const statusColors: Record<string, string> = {
  PLANNING: 'bg-gray-100 text-gray-700',
  BUDGETED: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

export function ProjectCostSummary() {
  const { data, isLoading } = useQuery({
    queryKey: ['report-project-costs'],
    queryFn: () => api<{ data: ProjectCost[] }>('/budgeting/projects?limit=200'),
  });

  const projects = data?.data || [];
  const totalBudget = projects.reduce((s, p) => s + Number(p.totalBudget), 0);
  const totalActual = projects.reduce((s, p) => s + Number(p.totalActual), 0);
  const totalVariance = totalBudget - totalActual;
  const overBudgetCount = projects.filter((p) => Number(p.totalActual) > Number(p.totalBudget) && Number(p.totalBudget) > 0).length;
  const activeCount = projects.filter((p) => p.status === 'IN_PROGRESS').length;

  return (
    <div>
      <PageHeader
        title="Project Cost Summary"
        subtitle="Budget vs actual costs across all projects"
        backTo={{ label: 'Reports', href: '/reports' }}
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500 uppercase">Total Projects</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{projects.length}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500 uppercase">Active</p>
          <p className="text-2xl font-bold text-yellow-600 mt-1">{activeCount}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500 uppercase">Total Budget</p>
          <p className="text-lg font-bold text-gray-900 mt-1">R {totalBudget.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500 uppercase">Total Spent</p>
          <p className="text-lg font-bold text-gray-900 mt-1">R {totalActual.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500 uppercase">Over Budget</p>
          <p className={`text-2xl font-bold mt-1 ${overBudgetCount > 0 ? 'text-red-600' : 'text-green-700'}`}>{overBudgetCount}</p>
        </div>
      </div>

      {/* Variance Summary */}
      <div className={`rounded-lg border p-4 mb-6 ${totalVariance >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
        <p className="text-sm font-medium">
          Overall Variance: <span className={`text-lg font-bold ${totalVariance >= 0 ? 'text-green-700' : 'text-red-600'}`}>
            {totalVariance >= 0 ? '' : '-'}R {Math.abs(totalVariance).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
          </span>
          <span className="text-xs text-gray-500 ml-2">
            ({totalBudget > 0 ? ((totalVariance / totalBudget) * 100).toFixed(1) : 0}% {totalVariance >= 0 ? 'under' : 'over'} budget)
          </span>
        </p>
      </div>

      {/* Project Table */}
      <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Project</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Budget</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actual</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Variance</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">% Used</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {isLoading && <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>}
            {projects.map((p) => {
              const budget = Number(p.totalBudget);
              const actual = Number(p.totalActual);
              const variance = budget - actual;
              const pctUsed = budget > 0 ? (actual / budget) * 100 : 0;
              return (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm">
                    <span className="font-medium text-gray-900">{p.name}</span>
                    <span className="block text-xs text-gray-400 font-mono">{p.number}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{p.title?.title || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{p.contractType}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[p.status] || ''}`}>
                      {p.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-medium">R {budget.toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm text-right font-medium">R {actual.toFixed(2)}</td>
                  <td className={`px-4 py-3 text-sm text-right font-medium ${variance >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                    {variance >= 0 ? '' : '-'}R {Math.abs(variance).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${pctUsed > 100 ? 'bg-red-500' : pctUsed > 80 ? 'bg-yellow-500' : 'bg-green-500'}`}
                          style={{ width: `${Math.min(pctUsed, 100)}%` }}
                        />
                      </div>
                      <span className={`text-xs font-mono ${pctUsed > 100 ? 'text-red-600' : 'text-gray-500'}`}>
                        {pctUsed.toFixed(0)}%
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
