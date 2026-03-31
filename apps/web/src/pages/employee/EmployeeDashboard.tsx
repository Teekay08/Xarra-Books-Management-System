import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

interface MyTask {
  id: string;
  taskNumber: string;
  title: string;
  status: string;
  priority: string;
  allocatedHours: number;
  loggedHours: number;
  dueDate: string | null;
  projectId: string;
  projectName: string;
  projectNumber: string;
}

interface TimeLogEntry {
  id: string;
  date: string;
  hours: number;
  description: string;
  status: string;
  taskTitle: string;
  projectName: string;
}

interface ExtensionEntry {
  id: string;
  requestedHours: number;
  reason: string;
  status: string;
  createdAt: string;
  taskTitle: string;
  projectName: string;
}

const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  ASSIGNED: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
  REVIEW: 'bg-purple-100 text-purple-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

const priorityColors: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-700',
  MEDIUM: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-orange-100 text-orange-700',
  URGENT: 'bg-red-100 text-red-700',
};

const timeLogStatusColors: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
};

const extensionStatusColors: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  APPROVED: 'bg-green-100 text-green-700',
  DECLINED: 'bg-red-100 text-red-700',
};

export function EmployeeDashboard() {
  const { data: tasksData, isLoading: tasksLoading } = useQuery({
    queryKey: ['my-tasks'],
    queryFn: () => api<{ data: MyTask[] }>('/project-management/my/tasks'),
  });

  const { data: logsData, isLoading: logsLoading } = useQuery({
    queryKey: ['my-time-logs'],
    queryFn: () => api<{ data: TimeLogEntry[] }>('/project-management/my/time-logs?limit=10'),
  });

  const { data: extensionsData, isLoading: extensionsLoading } = useQuery({
    queryKey: ['my-extensions'],
    queryFn: () => api<{ data: ExtensionEntry[] }>('/project-management/my/extensions?status=PENDING'),
  });

  const tasks = tasksData?.data ?? [];
  const logs = logsData?.data ?? [];
  const extensions = extensionsData?.data ?? [];

  return (
    <div>
      <PageHeader title="My Workspace" subtitle="Your tasks, time logs, and pending requests" />

      {/* My Tasks */}
      <div className="mb-8">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">My Tasks</h3>

        {tasksLoading && <p className="text-sm text-gray-400">Loading tasks...</p>}

        {!tasksLoading && tasks.length === 0 && (
          <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
            No tasks assigned to you.
          </div>
        )}

        {!tasksLoading && tasks.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tasks.map((t) => {
              const pct = t.allocatedHours > 0 ? Math.min((t.loggedHours / t.allocatedHours) * 100, 100) : 0;
              const overBudget = t.loggedHours > t.allocatedHours;
              return (
                <Link
                  key={t.id}
                  to={`/pm/tasks/${t.id}`}
                  className="block rounded-lg border border-gray-200 bg-white p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-xs font-mono text-gray-400">{t.taskNumber}</span>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[t.status] || ''}`}>
                      {t.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-gray-900 mb-1">{t.title}</p>
                  <p className="text-xs text-gray-500 mb-3">{t.projectNumber} — {t.projectName}</p>

                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                    <span>Hours: {t.loggedHours}/{t.allocatedHours}h</span>
                    <span className={`inline-flex rounded-full px-1.5 py-0.5 text-xs font-medium ${priorityColors[t.priority] || ''}`}>
                      {t.priority}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full rounded-full bg-gray-200 h-1.5">
                    <div
                      className={`h-1.5 rounded-full ${overBudget ? 'bg-red-500' : pct >= 80 ? 'bg-yellow-500' : 'bg-green-500'}`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>

                  {t.dueDate && (
                    <p className="text-xs text-gray-400 mt-2">
                      Due: {new Date(t.dueDate).toLocaleDateString()}
                    </p>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent Time Logs */}
      <div className="mb-8">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Recent Time Logs</h3>

        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Task</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Project</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Hours</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {logsLoading && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">Loading...</td></tr>
              )}
              {!logsLoading && logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-sm text-gray-700">{new Date(log.date).toLocaleDateString()}</td>
                  <td className="px-4 py-2 text-sm text-gray-900">{log.taskTitle}</td>
                  <td className="px-4 py-2 text-sm text-gray-600">{log.projectName}</td>
                  <td className="px-4 py-2 text-sm text-right font-mono">{log.hours}h</td>
                  <td className="px-4 py-2 text-sm text-gray-700 max-w-xs truncate">{log.description}</td>
                  <td className="px-4 py-2 text-sm">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${timeLogStatusColors[log.status] || ''}`}>
                      {log.status}
                    </span>
                  </td>
                </tr>
              ))}
              {!logsLoading && logs.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-400">No time logs yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pending Extensions */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Pending Extension Requests</h3>

        {extensionsLoading && <p className="text-sm text-gray-400">Loading...</p>}

        {!extensionsLoading && extensions.length === 0 && (
          <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
            No pending extension requests.
          </div>
        )}

        {!extensionsLoading && extensions.length > 0 && (
          <div className="space-y-3">
            {extensions.map((ext) => (
              <div key={ext.id} className="rounded-lg border border-gray-200 bg-white p-4 flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    +{ext.requestedHours}h for "{ext.taskTitle}"
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{ext.projectName}</p>
                  <p className="text-sm text-gray-600 mt-1">{ext.reason}</p>
                  <p className="text-xs text-gray-400 mt-1">{new Date(ext.createdAt).toLocaleDateString()}</p>
                </div>
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${extensionStatusColors[ext.status] || ''}`}>
                  {ext.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
