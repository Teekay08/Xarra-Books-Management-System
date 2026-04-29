import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

interface TaskSummary {
  id: string;
  number: string;
  title: string;
  status: string;
  priority: string;
  estimatedHours: string | null;
  allocatedHours: string;
  loggedHours: string;
  remainingHours: string;
  startDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  staffMember?: { name: string } | null;
  project?: { name: string; number: string } | null;
  taskCode?: { code: string; name: string } | null;
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
  LOW: 'text-gray-500',
  MEDIUM: 'text-blue-600',
  HIGH: 'text-orange-600',
  URGENT: 'text-red-600',
};

export function TaskCompletionReport() {
  const { data, isLoading } = useQuery({
    queryKey: ['report-task-completion'],
    queryFn: () => api<{ data: TaskSummary[] }>('/project-management/tasks?limit=500'),
  });

  const tasks = data?.data || [];
  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === 'COMPLETED').length;
  const inProgress = tasks.filter((t) => t.status === 'IN_PROGRESS').length;
  const inReview = tasks.filter((t) => t.status === 'REVIEW').length;
  const overdue = tasks.filter((t) => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'COMPLETED' && t.status !== 'CANCELLED').length;

  // Estimated vs actual analysis (only for tasks with both values)
  const tasksWithEstimates = tasks.filter((t) => t.estimatedHours && Number(t.estimatedHours) > 0 && Number(t.loggedHours) > 0);
  const totalEstimated = tasksWithEstimates.reduce((s, t) => s + Number(t.estimatedHours), 0);
  const totalLogged = tasksWithEstimates.reduce((s, t) => s + Number(t.loggedHours), 0);
  const estimateAccuracy = totalEstimated > 0 ? ((totalLogged / totalEstimated) * 100) : 0;

  const totalAllocated = tasks.reduce((s, t) => s + Number(t.allocatedHours), 0);
  const totalLoggedAll = tasks.reduce((s, t) => s + Number(t.loggedHours), 0);

  return (
    <div>
      <PageHeader
        title="Task Completion Report"
        subtitle="Task progress, delivery performance, and estimated vs actual hours"
        backTo={{ label: 'Reports', href: '/reports' }}
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
        <div className="card p-4">
          <p className="text-xs text-gray-500 uppercase">Total Tasks</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{total}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 uppercase">Completed</p>
          <p className="text-2xl font-bold text-green-700 mt-1">{completed}</p>
          <p className="text-xs text-gray-400">{total > 0 ? ((completed / total) * 100).toFixed(0) : 0}%</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 uppercase">In Progress</p>
          <p className="text-2xl font-bold text-yellow-600 mt-1">{inProgress}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 uppercase">In Review</p>
          <p className="text-2xl font-bold text-purple-600 mt-1">{inReview}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 uppercase">Overdue</p>
          <p className={`text-2xl font-bold mt-1 ${overdue > 0 ? 'text-red-600' : 'text-green-700'}`}>{overdue}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 uppercase">Estimate Accuracy</p>
          <p className={`text-2xl font-bold mt-1 ${estimateAccuracy > 120 ? 'text-red-600' : estimateAccuracy > 100 ? 'text-amber-600' : 'text-green-700'}`}>
            {estimateAccuracy > 0 ? `${estimateAccuracy.toFixed(0)}%` : '—'}
          </p>
          <p className="text-xs text-gray-400">{totalLogged.toFixed(0)}h / {totalEstimated.toFixed(0)}h est.</p>
        </div>
      </div>

      {/* Hours Summary */}
      <div className="card p-4 mb-6">
        <div className="flex items-center gap-8 text-sm">
          <div>
            <span className="text-gray-500">Total Allocated:</span>{' '}
            <span className="font-bold">{totalAllocated.toFixed(0)}h</span>
          </div>
          <div>
            <span className="text-gray-500">Total Logged:</span>{' '}
            <span className="font-bold">{totalLoggedAll.toFixed(0)}h</span>
          </div>
          <div>
            <span className="text-gray-500">Utilization:</span>{' '}
            <span className="font-bold">{totalAllocated > 0 ? ((totalLoggedAll / totalAllocated) * 100).toFixed(0) : 0}%</span>
          </div>
        </div>
      </div>

      {/* Task Table */}
      <div className="card overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Task</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Project</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Assigned To</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Priority</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Est.</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Allocated</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Logged</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Variance</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {isLoading && <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>}
            {tasks.map((t) => {
              const est = Number(t.estimatedHours) || 0;
              const logged = Number(t.loggedHours);
              const variance = est > 0 ? est - logged : null;
              const isOverdue = t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'COMPLETED' && t.status !== 'CANCELLED';
              return (
                <tr key={t.id} className={`hover:bg-gray-50 ${isOverdue ? 'bg-red-50/50' : ''}`}>
                  <td className="px-4 py-3 text-sm">
                    <span className="font-medium text-gray-900">{t.title}</span>
                    <span className="block text-xs text-gray-400 font-mono">{t.number}</span>
                    {t.taskCode && <span className="text-xs text-blue-600">{t.taskCode.code}</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{t.project?.name || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{t.staffMember?.name || '—'}</td>
                  <td className={`px-4 py-3 text-sm font-medium ${priorityColors[t.priority] || ''}`}>{t.priority}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[t.status] || ''}`}>
                      {t.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-500">{est > 0 ? `${est}h` : '—'}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-500">{Number(t.allocatedHours)}h</td>
                  <td className="px-4 py-3 text-sm text-right font-medium">{logged}h</td>
                  <td className={`px-4 py-3 text-sm text-right font-medium ${variance === null ? 'text-gray-400' : variance >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                    {variance === null ? '—' : `${variance >= 0 ? '' : '-'}${Math.abs(variance).toFixed(1)}h`}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {t.dueDate ? (
                      <span className={isOverdue ? 'text-red-600 font-medium' : 'text-gray-500'}>
                        {new Date(t.dueDate).toLocaleDateString('en-ZA')}
                        {isOverdue && ' (overdue)'}
                      </span>
                    ) : '—'}
                  </td>
                </tr>
              );
            })}
            {!isLoading && tasks.length === 0 && (
              <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-500">No tasks found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
