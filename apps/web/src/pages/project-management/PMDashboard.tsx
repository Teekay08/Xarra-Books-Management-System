import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { WorkflowStepper } from './components/WorkflowStepper';
import type { WorkflowStage } from './components/WorkflowStepper';

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

const STATIC_WORKFLOW_STEPS = [
  'Create Project',
  'Define Milestones & Budget',
  'Approve Budget',
  'Assign Team',
  'Create & Accept SOW',
  'Create Tasks from SOW',
  'Execute, Review, Complete',
  'Close Project',
];

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

  // Fetch workflow guide for the most recently active project to show live stepper
  const spotlightProject = activeProjects[0] ?? projects[0] ?? null;
  const { data: spotlightWorkflow } = useQuery({
    queryKey: ['pm-dashboard-spotlight-workflow', spotlightProject?.id],
    queryFn: () =>
      api<{ data: Array<{ projectId: string; progressPercent: number; stages: WorkflowStage[]; nextAction: { code: string; label: string; href: string } }> }>(
        `/project-management/projects/workflow-guide?projectIds=${spotlightProject!.id}`,
      ),
    enabled: !!spotlightProject,
    staleTime: 60_000,
  });
  const spotlightGuide = spotlightWorkflow?.data?.[0];

  return (
    <div>
      <PageHeader
        title="Project Management"
        subtitle="Manage projects, teams, tasks, and resource allocation"
        action={
          <Link to="/budgeting/projects/new" state={{ from: 'pm' }} className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800">
            New Project
          </Link>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Link to="/pm/projects" className="card p-4 hover:shadow-md transition-shadow">
          <p className="text-xs font-medium text-gray-500 uppercase">Active Projects</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{activeProjects.length}</p>
        </Link>
        <Link to="/pm/staff" className="card p-4 hover:shadow-md transition-shadow">
          <p className="text-xs font-medium text-gray-500 uppercase">Team Members</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{activeStaff.length}</p>
        </Link>
        <Link to="/pm/capacity" className="card p-4 hover:shadow-md transition-shadow">
          <p className="text-xs font-medium text-gray-500 uppercase">Resource Planning</p>
          <p className="mt-2 text-3xl font-bold text-blue-600">View Capacity</p>
        </Link>
        <div className="card p-4">
          <p className="text-xs font-medium text-gray-500 uppercase">Total Projects</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{projects.length}</p>
        </div>
      </div>

      {/* Guided Workflow — live stepper for most active project, static if no projects */}
      <div className="card p-4 mb-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              {spotlightProject ? (
                <>Project Workflow — <Link to={`/pm/projects/${spotlightProject.id}`} className="text-blue-600 hover:underline">{spotlightProject.name}</Link></>
              ) : (
                'Project Workflow'
              )}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {spotlightProject
                ? `${spotlightGuide?.progressPercent ?? 0}% complete · Follow the steps to deliver consistently`
                : 'Create your first project and follow these steps for consistent delivery.'}
            </p>
          </div>
          <Link to="/pm/projects" className="flex-shrink-0 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
            All Projects
          </Link>
        </div>

        {spotlightGuide?.stages ? (
          <>
            {/* Progress bar */}
            <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden mb-5">
              <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${spotlightGuide.progressPercent}%` }} />
            </div>
            <WorkflowStepper stages={spotlightGuide.stages} projectId={spotlightProject!.id} showLabels />
            {spotlightGuide.nextAction?.href && (
              <div className="mt-4 flex justify-end">
                <Link to={spotlightGuide.nextAction.href}
                  className="rounded-md bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700">
                  Next: {spotlightGuide.nextAction.label} →
                </Link>
              </div>
            )}
          </>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
            {STATIC_WORKFLOW_STEPS.map((step, idx) => (
              <div key={step} className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                <span className="font-semibold text-gray-400">{idx + 1}.</span> {step}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Active Projects with Quick Actions */}
      <div className="card p-4 mb-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Projects</h3>
        {activeProjects.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-6">No active projects. <Link to="/budgeting/projects/new" className="text-green-700 hover:underline">Create one</Link></p>
        )}
        <div className="space-y-3">
          {projects.slice(0, 20).map((p: any) => (
            <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:bg-gray-50">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Link to={`/pm/projects/${p.id}`} className="text-sm font-medium text-gray-900 hover:text-blue-700 hover:underline">{p.name}</Link>
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
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Team Overview */}
      <div className="card p-4">
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
