import { Link, useParams } from 'react-router';
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

const stageStatusColors: Record<string, string> = {
  COMPLETED: 'border-green-200 bg-green-50',
  CURRENT: 'border-blue-200 bg-blue-50',
  BLOCKED: 'border-amber-200 bg-amber-50',
  UPCOMING: 'border-gray-200 bg-gray-50',
};

interface OverviewData {
  project: {
    id: string;
    number: string;
    name: string;
    status: string;
    projectType: string;
    startDate: string | null;
    targetCompletionDate: string | null;
    currency: string;
    authorId: string | null;
  };
  counts: {
    teamMembers: number;
    tasks: {
      total: number;
      byStatus: Record<string, number>;
    };
    sows: { total: number; accepted: number };
    milestones: number;
    budgetLines: number;
  };
  budget: {
    totalBudget: number;
    totalActual: number;
    percentSpent: number;
  };
}

interface WorkflowGuideData {
  data: Array<{
    projectId: string;
    stage: string;
    progressPercent: number;
    blockers: string[];
    stages: WorkflowStage[];
    nextAction: { code: string; label: string; href: string };
  }>;
}

function fmt(date: string | null | undefined) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtCurrency(amount: number, currency = 'ZAR') {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
}

export function ProjectOverview() {
  const { projectId } = useParams<{ projectId: string }>();

  const { data: overviewData, isLoading } = useQuery({
    queryKey: ['project-overview', projectId],
    queryFn: () => api<OverviewData>(`/project-management/projects/${projectId}/overview`),
    enabled: !!projectId,
  });

  const { data: workflowData } = useQuery({
    queryKey: ['workflow-guide-overview', projectId],
    queryFn: () => api<WorkflowGuideData>(`/project-management/projects/workflow-guide?projectIds=${projectId}`),
    enabled: !!projectId,
    staleTime: 30_000,
  });

  const guide = workflowData?.data?.[0];
  const currentStage = guide?.stages?.find(
    (s) => s.status === 'CURRENT' || s.status === 'BLOCKED',
  ) ?? guide?.stages?.[guide.stages.length - 1];
  const stageIndex = guide?.stages ? guide.stages.findIndex((s) => s === currentStage) + 1 : null;

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Project Overview" backTo={{ label: 'Projects', href: '/pm/projects' }} />
        <p className="text-sm text-gray-400 py-8 text-center">Loading...</p>
      </div>
    );
  }

  if (!overviewData) {
    return (
      <div>
        <PageHeader title="Project Overview" backTo={{ label: 'Projects', href: '/pm/projects' }} />
        <p className="text-sm text-red-500 py-8 text-center">Project not found.</p>
      </div>
    );
  }

  const { project, counts, budget } = overviewData;
  const tasks = counts.tasks;

  return (
    <div>
      <PageHeader
        title={project.name}
        subtitle={`${project.number} · ${project.projectType?.replace(/_/g, ' ')}`}
        backTo={{ label: 'Projects', href: '/pm/projects' }}
        action={
          <div className="flex items-center gap-2">
            <Link
              to={`/budgeting/projects/${projectId}/edit`}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Edit Project
            </Link>
            <Link
              to={`/budgeting/projects/${projectId}`}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Budget & Milestones
            </Link>
          </div>
        }
      />

      {/* Project header card */}
      <div className="card p-4 mb-4">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-lg font-semibold text-gray-900">{project.name}</h2>
              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[project.status] || 'bg-gray-100 text-gray-700'}`}>
                {project.status?.replace(/_/g, ' ')}
              </span>
            </div>
            <p className="text-sm text-gray-500">
              {project.number}
              {project.startDate && (
                <> &middot; {fmt(project.startDate)} → {fmt(project.targetCompletionDate)}</>
              )}
            </p>
          </div>

          {/* Quick stat pills */}
          <div className="flex items-center gap-3 flex-wrap text-sm">
            <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-700">
              <span className="font-semibold">{counts.teamMembers}</span> team member{counts.teamMembers !== 1 ? 's' : ''}
            </span>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-700">
              <span className="font-semibold">{tasks.total}</span> task{tasks.total !== 1 ? 's' : ''}
            </span>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-700">
              <span className="font-semibold">{counts.sows.accepted}/{counts.sows.total}</span> SOW{counts.sows.total !== 1 ? 's' : ''} accepted
            </span>
            {budget.totalBudget > 0 && (
              <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-700">
                <span className="font-semibold">{budget.percentSpent}%</span> budget spent
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Workflow stepper */}
      {guide?.stages && (
        <div className="card p-4 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Project Workflow</h3>
            <span className="text-xs text-gray-500">{guide.progressPercent}% complete</span>
          </div>
          {/* Progress bar */}
          <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden mb-5">
            <div
              className="h-full rounded-full bg-green-500 transition-all"
              style={{ width: `${guide.progressPercent}%` }}
            />
          </div>
          <WorkflowStepper stages={guide.stages} projectId={projectId!} showLabels />
        </div>
      )}

      {/* Current stage card */}
      {currentStage && (
        <div className={`rounded-lg border p-5 mb-4 ${stageStatusColors[currentStage.status] || 'border-gray-200 bg-white'}`}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500 mb-1">
                {stageIndex !== null ? `Stage ${stageIndex} of ${guide?.stages?.length ?? 8}` : 'Current Stage'}
              </p>
              <h3 className={[
                'text-base font-semibold mb-2',
                currentStage.status === 'BLOCKED' ? 'text-amber-900' :
                currentStage.status === 'COMPLETED' ? 'text-green-900' :
                'text-blue-900',
              ].join(' ')}>
                {currentStage.name}
              </h3>

              {currentStage.blockers.length > 0 ? (
                <ul className="space-y-1 mb-3">
                  {currentStage.blockers.map((b, i) => (
                    <li key={i} className="flex items-center gap-1.5 text-sm text-amber-800">
                      <svg className="w-4 h-4 flex-shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                      </svg>
                      {b}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-600 mb-3">
                  {currentStage.status === 'COMPLETED'
                    ? 'This stage is complete.'
                    : 'No blockers — ready to proceed.'}
                </p>
              )}
            </div>

            {currentStage.action?.href && (
              <Link
                to={currentStage.action.href}
                className={[
                  'flex-shrink-0 rounded-md px-4 py-2 text-sm font-medium text-white transition-colors',
                  currentStage.status === 'BLOCKED' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700',
                ].join(' ')}
              >
                {currentStage.action.label} →
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Stats + quick links row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        {/* Task breakdown */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-gray-900">Tasks</h4>
            <Link to={`/pm/projects/${projectId}/tasks`} className="text-xs text-blue-600 hover:underline">View all</Link>
          </div>
          {tasks.total === 0 ? (
            <p className="text-sm text-gray-400">No tasks yet.</p>
          ) : (
            <div className="space-y-1.5">
              {([
                ['DRAFT', 'Draft', 'text-gray-500'],
                ['ASSIGNED', 'Assigned', 'text-blue-600'],
                ['IN_PROGRESS', 'In Progress', 'text-yellow-600'],
                ['REVIEW', 'Under Review', 'text-purple-600'],
                ['COMPLETED', 'Completed', 'text-green-600'],
              ] as const).map(([key, label, color]) =>
                tasks.byStatus[key] > 0 ? (
                  <div key={key} className="flex items-center justify-between text-sm">
                    <span className={`text-xs ${color}`}>{label}</span>
                    <span className="font-medium text-gray-700">{tasks.byStatus[key]}</span>
                  </div>
                ) : null,
              )}
            </div>
          )}
          <Link
            to={`/pm/projects/${projectId}/tasks/new`}
            className="mt-3 block text-center rounded-md border border-dashed border-gray-300 px-3 py-1.5 text-xs text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
          >
            + New Task
          </Link>
        </div>

        {/* Budget */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-gray-900">Budget</h4>
            <Link to={`/budgeting/projects/${projectId}`} className="text-xs text-blue-600 hover:underline">View detail</Link>
          </div>
          {budget.totalBudget === 0 ? (
            <p className="text-sm text-gray-400">No budget defined.</p>
          ) : (
            <>
              <div className="space-y-1 mb-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Total Budget</span>
                  <span className="font-medium">{fmtCurrency(budget.totalBudget, project.currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Actuals</span>
                  <span className="font-medium">{fmtCurrency(budget.totalActual, project.currency)}</span>
                </div>
              </div>
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className={['h-full rounded-full transition-all', budget.percentSpent > 100 ? 'bg-red-500' : budget.percentSpent > 80 ? 'bg-amber-500' : 'bg-green-500'].join(' ')}
                  style={{ width: `${Math.min(budget.percentSpent, 100)}%` }}
                />
              </div>
              <p className="mt-1 text-right text-[11px] text-gray-500">{budget.percentSpent}% spent</p>
            </>
          )}
          <p className="text-xs text-gray-400 mt-2">{counts.milestones} milestone{counts.milestones !== 1 ? 's' : ''} · {counts.budgetLines} budget line{counts.budgetLines !== 1 ? 's' : ''}</p>
        </div>

        {/* Quick links */}
        <div className="card p-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Quick Links</h4>
          <div className="space-y-2">
            {([
              { label: 'Manage Team', href: `/pm/projects/${projectId}/team`, icon: '👥', desc: `${counts.teamMembers} member${counts.teamMembers !== 1 ? 's' : ''}` },
              { label: 'Tasks', href: `/pm/projects/${projectId}/tasks`, icon: '✅', desc: `${tasks.total} total` },
              { label: 'Budget & Milestones', href: `/budgeting/projects/${projectId}`, icon: '💰', desc: `${counts.milestones} milestone${counts.milestones !== 1 ? 's' : ''}` },
              { label: 'SOW Documents', href: `/pm/projects/${projectId}/team`, icon: '📄', desc: `${counts.sows.accepted}/${counts.sows.total} accepted` },
            ] as const).map((link) => (
              <Link
                key={link.href + link.label}
                to={link.href}
                className="flex items-center justify-between rounded-md border border-gray-100 px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <span>{link.icon}</span>
                  <span className="font-medium text-gray-800">{link.label}</span>
                </span>
                <span className="text-xs text-gray-400">{link.desc}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
