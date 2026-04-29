import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { usePermissions } from '../../hooks/usePermissions';

const taskStatusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  ASSIGNED: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
  REVIEW: 'bg-purple-100 text-purple-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

const priorityColors: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-600',
  MEDIUM: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-orange-100 text-orange-700',
  URGENT: 'bg-red-100 text-red-700',
};

export function StaffDetail() {
  const { id } = useParams();
  const { isAdmin, isFinance } = usePermissions();
  const showFinancialData = isAdmin || isFinance;

  const { data: staffData, isLoading } = useQuery({
    queryKey: ['pm-staff-member', id],
    queryFn: () => api<{ data: any }>(`/project-management/staff/${id}`),
    enabled: !!id,
  });

  const { data: tasksData } = useQuery({
    queryKey: ['pm-staff-tasks', id],
    queryFn: () => api<{ data: any[] }>(`/project-management/staff/${id}/tasks?limit=50`),
    enabled: !!id,
  });

  const { data: utilizationData } = useQuery({
    queryKey: ['pm-staff-utilization', id],
    queryFn: () => api<{ data: any }>(`/project-management/staff/${id}/utilization`),
    enabled: !!id,
  });

  if (isLoading) return <div className="p-8 text-gray-400">Loading...</div>;

  const staff = staffData?.data;
  if (!staff) return <div className="p-8 text-gray-500">Staff member not found.</div>;

  const tasks = tasksData?.data || [];
  const utilization = utilizationData?.data;
  const activeTasks = tasks.filter((t: any) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED');
  const completedTasks = tasks.filter((t: any) => t.status === 'COMPLETED');

  // Calculate total hours across all projects
  const totalAllocated = tasks.reduce((s: number, t: any) => s + Number(t.allocatedHours || 0), 0);
  const totalLogged = tasks.reduce((s: number, t: any) => s + Number(t.loggedHours || 0), 0);
  const totalRemaining = tasks.reduce((s: number, t: any) => s + Number(t.remainingHours || 0), 0);

  // Group tasks by project
  const projectMap = new Map<string, { name: string; number: string; tasks: any[] }>();
  for (const t of tasks) {
    const projId = t.project?.id || t.projectId || 'unknown';
    const projName = t.project?.name || 'Unknown Project';
    const projNumber = t.project?.number || '';
    if (!projectMap.has(projId)) {
      projectMap.set(projId, { name: projName, number: projNumber, tasks: [] });
    }
    projectMap.get(projId)!.tasks.push(t);
  }

  const skills = Array.isArray(staff.skills) ? staff.skills : [];

  return (
    <div>
      <PageHeader
        title={staff.name}
        subtitle={`${staff.role} — ${staff.availabilityType?.replace(/_/g, ' ') || 'Full Time'}`}
        backTo={{ label: 'Staff Members', href: '/pm/staff' }}
        action={
          <div className="flex gap-2">
            <Link to={`/pm/staff/${id}/edit`}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
              Edit Profile
            </Link>
          </div>
        }
      />

      {/* Profile + Availability Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {showFinancialData && (
          <div className="card p-4">
            <p className="text-xs text-gray-500 uppercase">Hourly Rate</p>
            <p className="mt-1 text-xl font-bold text-gray-900">R {Number(staff.hourlyRate || 0).toFixed(2)}/hr</p>
          </div>
        )}
        <div className="card p-4">
          <p className="text-xs text-gray-500 uppercase">Max Hours/Month</p>
          <p className="mt-1 text-xl font-bold text-gray-900">{staff.maxHoursPerMonth || 160}h</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 uppercase">Active Tasks</p>
          <p className="mt-1 text-xl font-bold text-blue-700">{activeTasks.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 uppercase">Hours Remaining</p>
          <p className={`mt-1 text-xl font-bold ${totalRemaining > 0 ? 'text-green-700' : 'text-red-600'}`}>
            {totalRemaining.toFixed(1)}h
          </p>
        </div>
      </div>

      {/* Contact + Skills */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Contact Details</h3>
          <div className="space-y-2 text-sm">
            <p><span className="text-gray-500">Email:</span> <span className="font-medium">{staff.email}</span></p>
            <p><span className="text-gray-500">Phone:</span> <span className="font-medium">{staff.phone || '—'}</span></p>
            <p><span className="text-gray-500">Type:</span> <span className="font-medium">{staff.isInternal ? 'Internal Staff' : 'External Contractor'}</span></p>
            <p><span className="text-gray-500">Status:</span>
              <span className={`ml-1 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${staff.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {staff.isActive ? 'Active' : 'Inactive'}
              </span>
            </p>
          </div>
        </div>

        <div className="card p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Skills</h3>
          {skills.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {skills.map((skill: string) => (
                <span key={skill} className="inline-flex rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-xs font-medium text-blue-700">
                  {skill.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">No skills recorded</p>
          )}
        </div>
      </div>

      {/* Hours Summary */}
      <div className="card p-4 mb-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Hours Summary (All Projects)</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900">{totalAllocated.toFixed(1)}h</p>
            <p className="text-xs text-gray-500">Total Allocated</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-700">{totalLogged.toFixed(1)}h</p>
            <p className="text-xs text-gray-500">Total Logged</p>
          </div>
          <div className="text-center">
            <p className={`text-2xl font-bold ${totalRemaining > 0 ? 'text-green-700' : 'text-red-600'}`}>{totalRemaining.toFixed(1)}h</p>
            <p className="text-xs text-gray-500">Remaining</p>
          </div>
        </div>
        {totalAllocated > 0 && (
          <div className="mt-4">
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div className={`h-3 rounded-full ${totalLogged / totalAllocated > 1 ? 'bg-red-500' : totalLogged / totalAllocated > 0.8 ? 'bg-yellow-500' : 'bg-green-500'}`}
                style={{ width: `${Math.min(100, (totalLogged / totalAllocated) * 100)}%` }} />
            </div>
            <p className="text-xs text-gray-400 mt-1">{((totalLogged / totalAllocated) * 100).toFixed(0)}% of allocated hours used</p>
          </div>
        )}
      </div>

      {/* Tasks by Project */}
      <div className="card p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Tasks Across Projects</h3>
        {projectMap.size === 0 && (
          <p className="text-sm text-gray-400 text-center py-6">No tasks assigned to this staff member yet.</p>
        )}
        {Array.from(projectMap.entries()).map(([projId, proj]) => (
          <div key={projId} className="mb-6 last:mb-0">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm font-semibold text-gray-900">{proj.name}</p>
                <p className="text-xs text-gray-500">{proj.number}</p>
              </div>
              <div className="flex gap-2">
                <Link to={`/pm/staff/${id}/sow?projectId=${projId}`}
                  className="rounded-md border border-purple-300 bg-purple-50 px-3 py-1 text-xs font-medium text-purple-700 hover:bg-purple-100">
                  Create SOW
                </Link>
                <Link to={`/pm/projects/${projId}/tasks`} className="text-xs text-green-700 hover:underline leading-6">View All Tasks</Link>
              </div>
            </div>
            <div className="space-y-2">
              {proj.tasks.map((t: any) => {
                const allocated = Number(t.allocatedHours || 0);
                const logged = Number(t.loggedHours || 0);
                const remaining = Number(t.remainingHours || 0);
                const pct = allocated > 0 ? (logged / allocated) * 100 : 0;
                return (
                  <Link key={t.id} to={`/pm/tasks/${t.id}`}
                    className="block p-3 rounded-lg border border-gray-100 hover:bg-gray-50">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-gray-400">{t.number || t.taskNumber || ''}</span>
                        <span className="text-sm font-medium text-gray-900">{t.title}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${priorityColors[t.priority] || ''}`}>
                          {t.priority}
                        </span>
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${taskStatusColors[t.status] || ''}`}>
                          {t.status?.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>{logged.toFixed(1)}h / {allocated.toFixed(1)}h</span>
                      <span>{remaining.toFixed(1)}h remaining</span>
                      {t.dueDate && <span>Due: {new Date(t.dueDate).toLocaleDateString('en-ZA')}</span>}
                      {t.timeExhausted && <span className="text-red-600 font-medium">TIME EXHAUSTED</span>}
                    </div>
                    <div className="mt-1.5 w-full bg-gray-200 rounded-full h-1.5">
                      <div className={`h-1.5 rounded-full ${pct > 100 ? 'bg-red-500' : pct > 80 ? 'bg-yellow-500' : 'bg-green-500'}`}
                        style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
