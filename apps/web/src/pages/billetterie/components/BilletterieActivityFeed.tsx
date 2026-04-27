import { useQuery } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { formatRelativeTime } from '../billetterie-constants';

interface Props {
  projectId: string;
}

const VERB_ICON: Record<string, string> = {
  POST: '✦',
  PUT: '✎',
  DELETE: '✕',
  PATCH: '✎',
};

const VERB_COLOR: Record<string, string> = {
  POST:   'bg-blue-100 text-blue-600',
  PUT:    'bg-amber-100 text-amber-600',
  DELETE: 'bg-red-100 text-red-600',
  PATCH:  'bg-amber-100 text-amber-600',
};

function humanizeUrl(url: string, method: string): string {
  const clean = url.replace(/^\/billetterie\//, '');
  const parts = clean.split('/');

  // projects/:id/tasks/:taskId → "Task updated"
  if (parts[0] === 'projects' && parts[2] === 'team' && parts.length === 3 && method === 'POST') return 'Team member added';
  if (parts[0] === 'projects' && parts[2] === 'team' && parts.length === 4 && method === 'DELETE') return 'Team member removed';
  if (parts[0] === 'projects' && parts[2] === 'team' && parts.length === 4 && method === 'PUT') return 'Team role updated';
  if (parts[0] === 'projects' && parts[2] === 'tasks' && parts.length === 3 && method === 'POST') return 'Task created';
  if (parts[0] === 'projects' && parts[2] === 'tasks' && parts.length === 4 && method === 'PUT') return 'Task updated';
  if (parts[0] === 'projects' && parts[2] === 'tasks' && parts.length === 4 && method === 'DELETE') return 'Task deleted';
  if (parts[0] === 'projects' && parts[2] === 'tasks' && parts[4] === 'log-time') return 'Time logged';
  if (parts[0] === 'projects' && parts[2] === 'milestones' && method === 'POST') return 'Milestone created';
  if (parts[0] === 'projects' && parts[2] === 'milestones' && method === 'PUT') return 'Milestone updated';
  if (parts[0] === 'projects' && parts[2] === 'milestones' && method === 'DELETE') return 'Milestone removed';
  if (parts[0] === 'projects' && parts[2] === 'issues' && parts.length === 3 && method === 'POST') return 'Issue filed';
  if (parts[0] === 'projects' && parts[2] === 'issues' && parts.length === 4 && method === 'PUT') return 'Issue updated';
  if (parts[0] === 'projects' && parts[2] === 'issues' && parts[4] === 'comments' && method === 'POST') return 'Comment added';
  if (parts[0] === 'projects' && parts[2] === 'phases' && method === 'PUT') return `Phase updated`;
  if (parts[0] === 'projects' && parts[2] === 'phases' && parts[4] === 'advance') return 'Phase advanced';
  if (parts[0] === 'time-logs' && parts[2] === 'approve') return 'Timesheet approved';
  if (parts[0] === 'time-logs' && parts[2] === 'reject') return 'Timesheet rejected';
  if (parts[0] === 'projects' && parts[2] === 'meetings' && method === 'POST') return 'Meeting recorded';
  if (parts[0] === 'projects' && method === 'PUT' && parts.length === 2) return 'Project updated';
  return `${method} ${clean}`;
}

export function BilletterieActivityFeed({ projectId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['bil-activity', projectId],
    queryFn: () => api<{ data: any[] }>(`/billetterie/projects/${projectId}/activity`),
    refetchInterval: 60_000,
  });

  const logs = data?.data ?? [];

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3 animate-pulse">
            <div className="h-7 w-7 rounded-full bg-gray-100 flex-shrink-0" />
            <div className="flex-1 space-y-1.5 pt-1">
              <div className="h-3 bg-gray-100 rounded w-2/3" />
              <div className="h-2.5 bg-gray-50 rounded w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (logs.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-6">No activity yet.</p>;
  }

  return (
    <div className="relative">
      {/* vertical line */}
      <div className="absolute left-3.5 top-0 bottom-0 w-px bg-gray-100" />
      <div className="space-y-4">
        {logs.map((log: any) => {
          const method = log.method ?? 'PUT';
          const iconBg = VERB_COLOR[method] ?? 'bg-gray-100 text-gray-500';
          const icon = VERB_ICON[method] ?? '·';
          const label = humanizeUrl(log.url ?? '', method);

          return (
            <div key={log.id} className="flex gap-3 relative">
              <div className={`relative z-10 h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${iconBg}`}>
                {icon}
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <p className="text-sm text-gray-800">{label}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {log.userEmail ?? 'System'} · {formatRelativeTime(log.createdAt)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
