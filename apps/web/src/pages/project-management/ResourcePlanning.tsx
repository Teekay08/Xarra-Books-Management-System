import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

interface ResourceRow {
  staffId: string;
  staffName: string;
  role: string;
  maxHoursPerWeek: number;
  allocatedThisWeek: number;
  availableThisWeek: number;
  utilizationPercent: number;
  status: string;
}

function utilizationColor(pct: number): string {
  if (pct > 100) return 'text-red-600 font-bold';
  if (pct >= 80) return 'text-yellow-600 font-medium';
  if (pct >= 50) return 'text-green-700 font-medium';
  return 'text-gray-500';
}

function utilizationBg(pct: number): string {
  if (pct > 100) return 'bg-red-50';
  if (pct >= 80) return 'bg-yellow-50';
  return '';
}

export function ResourcePlanning() {
  const { data, isLoading } = useQuery({
    queryKey: ['pm-resource-planning'],
    queryFn: () => api<{ data: ResourceRow[] }>('/project-management/capacity'),
  });

  return (
    <div>
      <PageHeader
        title="Resource Planning"
        subtitle="Staff capacity and allocation overview for the current week"
      />

      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Staff Member</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Max Hours/Week</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Allocated (This Week)</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Available</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Utilization %</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {isLoading && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
            )}
            {data?.data?.map((r) => (
              <tr key={r.staffId} className={`hover:bg-gray-50 ${utilizationBg(r.utilizationPercent)}`}>
                <td className="px-4 py-3 text-sm font-medium text-gray-900">{r.staffName}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{r.role}</td>
                <td className="px-4 py-3 text-sm text-right font-mono">{r.maxHoursPerWeek}h</td>
                <td className="px-4 py-3 text-sm text-right font-mono">{r.allocatedThisWeek}h</td>
                <td className="px-4 py-3 text-sm text-right font-mono">
                  {r.availableThisWeek > 0 ? `${r.availableThisWeek}h` : '0h'}
                </td>
                <td className={`px-4 py-3 text-sm text-right ${utilizationColor(r.utilizationPercent)}`}>
                  {r.utilizationPercent.toFixed(0)}%
                  {r.utilizationPercent > 100 && (
                    <span className="ml-1 text-xs">(overallocated)</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                    r.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {r.status}
                  </span>
                </td>
              </tr>
            ))}
            {!isLoading && data?.data?.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No staff members found. Add staff to see capacity planning.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
