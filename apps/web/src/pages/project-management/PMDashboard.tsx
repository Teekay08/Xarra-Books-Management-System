import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

const statusColors: Record<string, string> = {
  PLANNING: 'bg-gray-100 text-gray-700',
  BUDGETED: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

const taskStatusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  ASSIGNED: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
  REVIEW: 'bg-purple-100 text-purple-700',
  COMPLETED: 'bg-green-100 text-green-700',
};

export function PMDashboard() {
  // Projects
  const { data: projectsData } = useQuery({
    queryKey: ['pm-projects'],
    queryFn: () => api<{ data: any[] }>('/budgeting/projects?limit=100'),
  });

  // Staff
  const { data: staffData } = useQuery({
    queryKey: ['pm-staff-summary'],
    queryFn: () => api<{ data: any[] }>('/project-management/staff?limit=100'),
  });

  // Capacity
  const { data: capacityData } = useQuery({
    queryKey: ['pm-capacity'],
    queryFn: () => api<{ data: any[] }>('/project-management/capacity'),
  });

  const projects = projectsData?.data || [];
  const activeProjects = projects.filter((p: any) => p.status === 'IN_PROGRESS' || p.status === 'BUDGETED' || p.status === 'PLANNING');
  const staff = staffData?.data || [];
  const activeStaff = staff.filter((s: any) => s.isActive !== false);

  return (
    <div>
      <PageHeader
        title="Project Management"
        subtitle="Manage projects, teams, tasks, and resource allocation"
        action={
          <Link to="/budgeting/projects/new" className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800">
            New Project
          </Link>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Link to="/pm/projects" className="rounded-lg border border-gray-200 bg-white p-5 hover:shadow-md transition-shadow">
          <p className="text-xs font-medium text-gray-500 uppercase">Active Projects</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{activeProjects.length}</p>
        </Link>
        <Link to="/pm/staff" className="rounded-lg border border-gray-200 bg-white p-5 hover:shadow-md transition-shadow">
          <p className="text-xs font-medium text-gray-500 uppercase">Team Members</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{activeStaff.length}</p>
        </Link>
        <Link to="/pm/capacity" className="rounded-lg border border-gray-200 bg-white p-5 hover:shadow-md transition-shadow">
          <p className="text-xs font-medium text-gray-500 uppercase">Resource Planning</p>
          <p className="mt-2 text-3xl font-bold text-blue-600">View Capacity</p>
        </Link>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-xs font-medium text-gray-500 uppercase">Total Projects</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{projects.length}</p>
        </div>
      </div>

      {/* Active Projects with Quick Actions */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 mb-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Projects</h3>
        {activeProjects.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-6">No active projects. <Link to="/budgeting/projects/new" className="text-green-700 hover:underline">Create one</Link></p>
        )}
        <div className="space-y-3">
          {projects.slice(0, 20).map((p: any) => (
            <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:bg-gray-50">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-900">{p.name}</p>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColors[p.status] || 'bg-gray-100'}`}>
                    {p.status?.replace(/_/g, ' ')}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {p.number} &middot; {p.author?.legalName || p.author?.penName || 'No author'} &middot; {p.projectType?.replace(/_/g, ' ')}
                </p>
              </div>
              <div className="flex gap-2">
                <Link to={`/pm/projects/${p.id}/team`}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100">
                  Team
                </Link>
                <Link to={`/pm/projects/${p.id}/tasks`}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100">
                  Tasks
                </Link>
                <Link to={`/budgeting/projects/${p.id}`}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100">
                  Budget
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Team Overview */}
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900">Team Members</h3>
          <Link to="/pm/staff/new" className="text-xs text-green-700 hover:underline">+ Add Staff</Link>
        </div>
        {activeStaff.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">No staff members yet. <Link to="/pm/staff/new" className="text-green-700 hover:underline">Add your first team member</Link></p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {activeStaff.slice(0, 12).map((s: any) => (
            <Link key={s.id} to={`/pm/staff/${s.id}/edit`}
              className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold text-sm">
                {(s.name || '?')[0].toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{s.name}</p>
                <p className="text-xs text-gray-500">{s.role}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
