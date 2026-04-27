import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PROJECT_STATUS_BADGE, TASK_STATUS_BADGE, TASK_STATUS_LABEL, MILESTONE_STATUS_BADGE } from './billetterie-constants';

const PHASES = [
  { key: 'INITIATION', label: 'Initiation' }, { key: 'ELICITATION', label: 'Elicitation' },
  { key: 'ARCHITECTURE', label: 'Architecture' }, { key: 'DEVELOPMENT', label: 'Development' },
  { key: 'TESTING', label: 'Testing' }, { key: 'SIGN_OFF', label: 'Sign-off' },
  { key: 'CLOSURE', label: 'Closure' },
];

export default function BilletterieClientView() {
  const { token } = useParams<{ token: string }>();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['bil-client-portal', token],
    queryFn: () => api<{ data: any }>(`/billetterie/client-portal/${token}`),
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-sm text-gray-500">Loading project view...</p>
      </div>
    );
  }

  if (isError) {
    const msg = (error as any)?.message ?? '';
    const expired = msg.includes('expired') || msg.includes('401') || msg.includes('403');
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white border border-gray-200 rounded-xl p-10 text-center max-w-sm">
          <p className="text-4xl mb-3">{expired ? '⏱' : '🔒'}</p>
          <h1 className="text-lg font-bold text-gray-900 mb-2">
            {expired ? 'Link Expired' : 'Access Denied'}
          </h1>
          <p className="text-sm text-gray-500">
            {expired
              ? 'This client portal link has expired. Please contact the project manager to request a new link.'
              : 'This link is invalid or has been deactivated.'}
          </p>
        </div>
      </div>
    );
  }

  const portal = data?.data ?? {};
  const project: any    = portal.project ?? {};
  const perms: any      = portal.permissions ?? {};
  const phases: any[]   = portal.phases ?? [];
  const tasks: any[]    = portal.tasks ?? [];
  const milestones: any[] = portal.milestones ?? [];
  const timeline: any   = portal.timeline ?? {};

  const phaseMap = new Map(phases.map((p: any) => [p.phaseKey, p]));
  const currentPhaseIdx = PHASES.findIndex((p) => p.key === project.currentPhase);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">X</div>
          <div>
            <p className="text-xs text-gray-500 font-medium">Client Portal</p>
            <h1 className="text-sm font-bold text-gray-900">{project.name}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${PROJECT_STATUS_BADGE[project.status] ?? 'bg-gray-100 text-gray-600'}`}>
            {project.status}
          </span>
          <span className="text-xs text-gray-400">{project.projectNumber}</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {/* Project stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Current Phase</p>
            <p className="text-sm font-bold text-gray-900">{PHASES.find((p) => p.key === project.currentPhase)?.label ?? project.currentPhase}</p>
          </div>
          {project.targetEndDate && (
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Target End Date</p>
              <p className="text-sm font-bold text-gray-900">{project.targetEndDate}</p>
            </div>
          )}
          {project.budget != null && (
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Budget</p>
              <p className="text-sm font-bold text-gray-900">R {Number(project.budget).toLocaleString('en-ZA')}</p>
            </div>
          )}
        </div>

        {/* Phase progress */}
        {perms.viewPhases && (
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Project Lifecycle</h2>
            <div className="relative">
              <div className="absolute top-4 left-4 right-4 h-0.5 bg-gray-200" />
              <div className="relative flex justify-between">
                {PHASES.map((phase, idx) => {
                  const phaseData = phaseMap.get(phase.key);
                  const isCompleted = idx < currentPhaseIdx || phaseData?.status === 'APPROVED';
                  const isCurrent   = idx === currentPhaseIdx;
                  return (
                    <div key={phase.key} className="flex flex-col items-center gap-1" style={{ width: `${100 / PHASES.length}%` }}>
                      <div className={`relative z-10 h-8 w-8 rounded-full border-2 flex items-center justify-center text-xs font-bold ${isCompleted ? 'bg-green-500 border-green-500 text-white' : isCurrent ? 'bg-blue-500 border-blue-500 text-white' : 'bg-white border-gray-300 text-gray-400'}`}>
                        {isCompleted ? '✓' : idx + 1}
                      </div>
                      <span className={`text-[10px] font-medium text-center leading-tight ${isCurrent ? 'text-blue-700' : isCompleted ? 'text-green-700' : 'text-gray-400'}`}>
                        {phase.label}
                      </span>
                      {phaseData && (
                        <span className="text-[9px] text-gray-400">{phaseData.status}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Milestones */}
        {perms.viewTasks && milestones.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Milestones</h2>
            <div className="space-y-2">
              {milestones.map((m: any) => (
                <div key={m.id} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-800">{m.title}</p>
                    {m.dueDate && <p className="text-xs text-gray-400 mt-0.5">Due {m.dueDate}</p>}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${MILESTONE_STATUS_BADGE[m.status]}`}>{m.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Task summary */}
        {perms.viewTasks && tasks.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Task Progress</h2>
            {(() => {
              const total = tasks.length;
              const done  = tasks.filter((t: any) => t.status === 'DONE').length;
              const pct   = total > 0 ? Math.round((done / total) * 100) : 0;
              const byStatus: Record<string, number> = {};
              for (const t of tasks) byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
              return (
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-500">{done} / {total} tasks complete</span>
                      <span className="text-xs font-semibold text-gray-700">{pct}%</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <div className="flex gap-3 flex-wrap">
                    {Object.entries(byStatus).map(([status, count]) => (
                      <span key={status} className={`text-xs px-2 py-0.5 rounded-full font-medium ${TASK_STATUS_BADGE[status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {TASK_STATUS_LABEL[status] ?? status}: {count}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Issues summary */}
        {perms.viewIssues && portal.issues != null && (
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Issues</h2>
            <div className="flex gap-6 text-center">
              <div>
                <p className="text-2xl font-bold text-gray-900">{portal.issues.open ?? 0}</p>
                <p className="text-xs text-gray-500">Open</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">{portal.issues.resolved ?? 0}</p>
                <p className="text-xs text-gray-500">Resolved</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-400">{portal.issues.closed ?? 0}</p>
                <p className="text-xs text-gray-500">Closed</p>
              </div>
            </div>
          </div>
        )}

        {/* Deliverables approval */}
        {perms.approveDeliverables && phases.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Deliverable Sign-off</h2>
            <p className="text-xs text-gray-500">Contact the project manager to approve gate documents for each phase.</p>
          </div>
        )}

        <footer className="text-center text-xs text-gray-400 pb-4">
          Powered by Xarra Books Management System · Client Portal (read-only)
        </footer>
      </main>
    </div>
  );
}
