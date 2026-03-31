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
            {data?.data?.map((r: any) => {
              const maxHours = Number(r.maxHoursPerWeek ?? r.max_hours_per_week ?? 40);
              const allocated = Number(r.allocatedThisWeek ?? r.allocated_this_week ?? 0);
              const available = maxHours - allocated;
              const utilPct = maxHours > 0 ? (allocated / maxHours) * 100 : 0;
              const name = r.staffName ?? r.staff_name ?? r.name ?? '—';
              const role = r.role ?? '—';
              const status = r.isActive === false ? 'INACTIVE' : 'ACTIVE';

              return (
                <tr key={r.staffId ?? r.id} className={`hover:bg-gray-50 ${utilizationBg(utilPct)}`}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{name}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{role}</td>
                  <td className="px-4 py-3 text-sm text-right font-mono">{maxHours}h</td>
                  <td className="px-4 py-3 text-sm text-right font-mono">{allocated}h</td>
                  <td className="px-4 py-3 text-sm text-right font-mono">
                    {available > 0 ? `${available}h` : '0h'}
                  </td>
                  <td className={`px-4 py-3 text-sm text-right ${utilizationColor(utilPct)}`}>
                    {utilPct.toFixed(0)}%
                    {utilPct > 100 && (
                      <span className="ml-1 text-xs">(overallocated)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {status}
                    </span>
                  </td>
                </tr>
              );
            })}
            {!isLoading && data?.data?.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No staff members found. Add staff to see capacity planning.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
