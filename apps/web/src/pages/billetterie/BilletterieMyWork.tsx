import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import {
  TASK_STATUS_BADGE, TASK_STATUS_LABEL, PRIORITY_DOT, ISSUE_STATUS_BADGE,
  ISSUE_TYPE_ICON, TIME_LOG_STATUS_BADGE, formatRelativeTime, isOverdue,
} from './billetterie-constants';

export default function BilletterieMyWork() {
  const { data, isLoading } = useQuery({
    queryKey: ['bil-my-work'],
    queryFn: () => api<{ data: any }>('/billetterie/my-work'),
    refetchInterval: 60_000,
  });

  const myWork = data?.data ?? {};
  const tasks: any[]     = myWork.tasks ?? [];
  const issues: any[]    = myWork.issues ?? [];
  const tickets: any[]   = myWork.tickets ?? [];
  const timeLogs: any[]  = myWork.pendingTimeLogs ?? [];
  const weekHours: number = myWork.weekHours ?? 0;

  const overdueTasks = tasks.filter((t) => isOverdue(t.dueDate) && t.status !== 'DONE');
  const dueSoonTasks = tasks.filter((t) => !isOverdue(t.dueDate) && t.dueDate && t.status !== 'DONE');
  const otherTasks   = tasks.filter((t) => !t.dueDate && t.status !== 'DONE');

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <PageHeader
        title="My Work"
        backTo={{ label: 'Billetterie', href: '/billetterie' }}
      />

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{tasks.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">My Tasks</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className={`text-2xl font-bold ${overdueTasks.length > 0 ? 'text-red-600' : 'text-gray-900'}`}>{overdueTasks.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Overdue</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{issues.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Issues</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className={`text-2xl font-bold ${tickets.length > 0 ? 'text-orange-700' : 'text-gray-900'}`}>{tickets.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Support Tickets</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">{weekHours.toFixed(1)}h</p>
          <p className="text-xs text-gray-500 mt-0.5">This Week</p>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-gray-500 text-center py-12">Loading your work...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ── Tasks ── */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">My Tasks</h2>

            {tasks.length === 0 && (
              <p className="text-sm text-gray-400 py-4 text-center">No tasks assigned to you.</p>
            )}

            {overdueTasks.length > 0 && (
              <TaskSection label="Overdue" tasks={overdueTasks} urgent />
            )}
            {dueSoonTasks.length > 0 && (
              <TaskSection label="Due Soon" tasks={dueSoonTasks} />
            )}
            {otherTasks.length > 0 && (
              <TaskSection label="Other" tasks={otherTasks} />
            )}
          </div>

          {/* ── Issues ── */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">Assigned Issues</h2>

            {issues.length === 0 && (
              <p className="text-sm text-gray-400 py-4 text-center">No open issues assigned to you.</p>
            )}

            <div className="space-y-2">
              {issues.map((issue: any) => (
                <Link
                  key={issue.id}
                  to={`/billetterie/projects/${issue.projectId}/issues/${issue.id}`}
                  className="flex items-start gap-3 p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <span className="text-base flex-shrink-0 mt-0.5">{ISSUE_TYPE_ICON[issue.type] ?? '●'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{issue.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      #{issue.issueNumber} · {issue.projectName ?? 'Project'} · {formatRelativeTime(issue.createdAt)}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${ISSUE_STATUS_BADGE[issue.status]}`}>
                    {issue.status.replace('_', ' ')}
                  </span>
                </Link>
              ))}
            </div>

            {/* ── Support tickets ── */}
            {tickets.length > 0 && (
              <div className="space-y-2 mt-6">
                <h2 className="text-sm font-semibold text-gray-900">My Support Tickets</h2>
                {tickets.map((t: any) => {
                  const breached = t.slaBreached || (t.slaResolutionDue && new Date(t.slaResolutionDue) < new Date());
                  return (
                    <Link key={t.id} to={`/billetterie/projects/${t.projectId}?view=support`}
                      className="flex items-start gap-3 p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="font-mono text-[10px] text-gray-400">#{t.ticketNumber}</span>
                          <span className={`text-[10px] font-bold px-1 py-0.5 rounded ${
                            t.priority === 'CRITICAL' ? 'bg-red-100 text-red-700' :
                            t.priority === 'HIGH' ? 'bg-orange-100 text-orange-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>{t.priority}</span>
                          {breached && <span className="text-[9px] font-bold px-1 bg-red-100 text-red-700 rounded">SLA BREACH</span>}
                        </div>
                        <p className="text-sm text-gray-800 truncate">{t.title}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{t.projectName ?? 'Project'}</p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                        t.status === 'OPEN' ? 'bg-red-100 text-red-700' :
                        t.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>{t.status.replace('_', ' ')}</span>
                    </Link>
                  );
                })}
              </div>
            )}

            {/* ── Pending time logs ── */}
            {timeLogs.length > 0 && (
              <div className="space-y-2 mt-6">
                <h2 className="text-sm font-semibold text-gray-900">Pending Time Logs</h2>
                {timeLogs.map((log: any) => (
                  <div key={log.id} className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800">{log.taskTitle}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{log.workDate} · {Number(log.hours).toFixed(1)}h</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TIME_LOG_STATUS_BADGE[log.status]}`}>
                      {log.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TaskSection({ label, tasks, urgent }: { label: string; tasks: any[]; urgent?: boolean }) {
  return (
    <div>
      <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${urgent ? 'text-red-600' : 'text-gray-500'}`}>{label}</p>
      <div className="space-y-2">
        {tasks.map((task: any) => (
          <Link
            key={task.id}
            to={`/billetterie/projects/${task.projectId}?view=board`}
            className="flex items-start gap-3 p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <span className={`h-2 w-2 rounded-full mt-1.5 flex-shrink-0 ${PRIORITY_DOT[task.priority] ?? 'bg-gray-400'}`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{task.title}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {task.projectName ?? 'Project'}
                {task.dueDate && ` · Due ${task.dueDate}`}
              </p>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${TASK_STATUS_BADGE[task.status]}`}>
              {TASK_STATUS_LABEL[task.status]}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
