import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useSession } from '../../lib/auth-client';
import { WorkflowStepper } from './components/WorkflowStepper';
import type { WorkflowStage } from './components/WorkflowStepper';

const STATUS_BADGE: Record<string, string> = {
  PLANNING:    'bg-gray-100 text-gray-700',
  BUDGETED:    'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-amber-100 text-amber-800',
  COMPLETED:   'bg-green-100 text-green-700',
  CANCELLED:   'bg-red-100 text-red-600',
};

const STATIC_STEPS = [
  'Create Project',
  'Define Milestones & Budget',
  'Approve Budget',
  'Assign Team',
  'Create & Accept SOW',
  'Create Tasks from SOW',
  'Execute, Review, Complete',
  'Close Project',
];

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function Avatar({ name }: { name: string }) {
  const colors = ['bg-blue-100 text-blue-700', 'bg-green-100 text-green-700', 'bg-purple-100 text-purple-700', 'bg-amber-100 text-amber-700', 'bg-rose-100 text-rose-700'];
  let h = 0; for (const c of name) h = c.charCodeAt(0) + ((h << 5) - h);
  return (
    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${colors[Math.abs(h) % colors.length]}`}>
      {(name || '?')[0].toUpperCase()}
    </div>
  );
}

export function PMDashboard() {
  const { data: session } = useSession();
  const userName = session?.user?.name?.split(' ')[0] ?? '';

  const { data: projectsData } = useQuery({
    queryKey: ['pm-projects'],
    queryFn: () => api<{ data: any[] }>('/budgeting/projects?limit=100'),
  });

  const { data: staffData } = useQuery({
    queryKey: ['pm-staff-summary'],
    queryFn: () => api<{ data: any[] }>('/project-management/staff?limit=100'),
  });

  const projects      = projectsData?.data ?? [];
  const activeProjects = projects.filter((p: any) => ['IN_PROGRESS', 'BUDGETED', 'PLANNING'].includes(p.status));
  const staff          = staffData?.data ?? [];
  const activeStaff    = staff.filter((s: any) => s.isActive !== false);

  // Spotlight: most active project for live workflow stepper
  const spotlight = activeProjects[0] ?? projects[0] ?? null;
  const { data: workflowData } = useQuery({
    queryKey: ['pm-spotlight-workflow', spotlight?.id],
    queryFn: () => api<{ data: any[] }>(`/project-management/projects/workflow-guide?projectIds=${spotlight!.id}`),
    enabled: !!spotlight,
    staleTime: 60_000,
  });
  const guide = workflowData?.data?.[0];

  return (
    <div className="space-y-5">

      {/* ── Greeting + quick actions ─────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {greeting()}{userName ? `, ${userName}` : ''}
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">Project Management — overview and team</p>
        </div>
        <div className="flex gap-2">
          <Link to="/budgeting/projects/new" state={{ from: 'pm' }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-green-700 text-white text-xs font-semibold hover:bg-green-800 shadow-sm transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            New Project
          </Link>
          <Link to="/pm/staff/new"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white border border-gray-200 text-gray-700 text-xs font-semibold hover:bg-gray-50 shadow-sm transition-colors">
            + Add Staff
          </Link>
          <Link to="/pm/capacity"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white border border-gray-200 text-gray-700 text-xs font-semibold hover:bg-gray-50 shadow-sm transition-colors">
            Capacity
          </Link>
        </div>
      </div>

      {/* ── KPI strip ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Active Projects', value: activeProjects.length, icon: '▶', color: 'text-blue-700',  bg: 'bg-blue-50',  border: 'border-blue-100', link: '/pm/projects' },
          { label: 'Team Members',    value: activeStaff.length,    icon: '👥', color: 'text-green-700', bg: 'bg-green-50', border: 'border-green-100', link: '/pm/staff' },
          { label: 'Total Projects',  value: projects.length,       icon: '◈',  color: 'text-gray-800', bg: 'bg-white',    border: 'border-gray-100', link: '/pm/projects' },
          { label: 'Completed',       value: projects.filter((p: any) => p.status === 'COMPLETED').length, icon: '✓', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-100', link: '/pm/projects' },
        ].map(s => (
          <Link key={s.label} to={s.link}
            className={`rounded-xl border p-4 transition-shadow hover:shadow-sm ${s.bg} ${s.border}`}>
            <p className={`text-2xl font-black leading-none ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide mt-1">{s.label}</p>
          </Link>
        ))}
      </div>

      {/* ── Spotlight: live workflow stepper ─────────────────────── */}
      <div className="card p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">
              {spotlight ? (
                <>Project Workflow —{' '}
                  <Link to={`/pm/projects/${spotlight.id}`} className="text-blue-600 hover:underline">{spotlight.name}</Link>
                </>
              ) : 'Project Workflow'}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {spotlight
                ? `${guide?.progressPercent ?? 0}% complete · follow the steps to deliver consistently`
                : 'Create your first project and follow these steps for consistent delivery'}
            </p>
          </div>
          <Link to="/pm/projects" className="text-xs text-blue-600 hover:underline shrink-0">All projects →</Link>
        </div>

        {guide?.stages ? (
          <>
            <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden mb-5">
              <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${guide.progressPercent}%` }} />
            </div>
            <WorkflowStepper stages={guide.stages as WorkflowStage[]} projectId={spotlight!.id} showLabels />
            {guide.nextAction?.href && (
              <div className="mt-4 flex justify-end">
                <Link to={guide.nextAction.href}
                  className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700">
                  Next: {guide.nextAction.label} →
                </Link>
              </div>
            )}
          </>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {STATIC_STEPS.map((step, idx) => (
              <div key={step} className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2.5 text-xs text-gray-600">
                <span className="font-bold text-gray-300 mr-1">{idx + 1}.</span>{step}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Main grid: Projects + Team ───────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Projects — 3 cols */}
        <div className="lg:col-span-3 card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Projects ({projects.length})</h2>
            <Link to="/pm/projects" className="text-xs text-blue-600 hover:underline">View all →</Link>
          </div>

          {projects.length === 0 ? (
            <div className="p-10 text-center">
              <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"/></svg>
              </div>
              <p className="text-sm text-gray-400">No projects yet.</p>
              <Link to="/budgeting/projects/new" state={{ from: 'pm' }} className="text-xs text-green-700 hover:underline mt-1 inline-block">Create one →</Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {projects.slice(0, 15).map((p: any) => (
                <div key={p.id} className="group flex items-center gap-3 px-5 py-3 hover:bg-gray-50/60 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <Link to={`/pm/projects/${p.id}`}
                        className="text-xs font-semibold text-gray-900 hover:text-blue-700 transition-colors truncate">
                        {p.name}
                      </Link>
                      <span className={`pill shrink-0 ${STATUS_BADGE[p.status] || 'bg-gray-100 text-gray-500'}`}>
                        {p.status?.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-400">{p.number}</p>
                  </div>
                  <div className="flex gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Link to={`/pm/projects/${p.id}/team`}
                      className="px-2 py-1 rounded border border-gray-200 text-[10px] text-gray-600 hover:bg-white">Team</Link>
                    <Link to={`/pm/projects/${p.id}/tasks`}
                      className="px-2 py-1 rounded border border-gray-200 text-[10px] text-gray-600 hover:bg-white">Tasks</Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Team — 2 cols */}
        <div className="lg:col-span-2 card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Team ({activeStaff.length})</h2>
            <Link to="/pm/staff/new" className="text-xs text-blue-600 hover:underline">+ Add →</Link>
          </div>

          {activeStaff.length === 0 ? (
            <div className="p-10 text-center">
              <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"/></svg>
              </div>
              <p className="text-xs text-gray-400">No staff members yet</p>
              <Link to="/pm/staff/new" className="text-xs text-green-700 hover:underline mt-1 inline-block">Add first →</Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {activeStaff.slice(0, 12).map((s: any) => (
                <Link key={s.id} to={`/pm/staff/${s.id}/edit`}
                  className="flex items-center gap-3 px-5 py-2.5 hover:bg-gray-50/60 transition-colors">
                  <Avatar name={s.name || '?'} />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-900 truncate">{s.name}</p>
                    <p className="text-[10px] text-gray-400 truncate">{s.displayTitle || s.role}</p>
                  </div>
                  <div className="ml-auto shrink-0">
                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${
                      s.availabilityType === 'FULL_TIME' ? 'bg-green-50 text-green-700' :
                      s.availabilityType === 'PART_TIME' ? 'bg-amber-50 text-amber-700' :
                      'bg-gray-50 text-gray-500'
                    }`}>{s.availabilityType?.replace('_', ' ')}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
