import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { ActionMenu } from '../../components/ActionMenu';

interface Task {
  id: string;
  taskNumber: string;
  title: string;
  assignedTo: { id: string; name: string } | null;
  milestone: { id: string; name: string } | null;
  priority: string;
  status: string;
  allocatedHours: number;
  loggedHours: number;
  remainingHours: number;
  dueDate: string | null;
}

interface Project {
  id: string;
  name: string;
  number: string;
}

const priorityColors: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-700',
  MEDIUM: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-orange-100 text-orange-700',
  URGENT: 'bg-red-100 text-red-700',
};

const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  ASSIGNED: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
  REVIEW: 'bg-purple-100 text-purple-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

const STATUS_OPTIONS = ['ALL', 'DRAFT', 'ASSIGNED', 'IN_PROGRESS', 'REVIEW', 'COMPLETED', 'CANCELLED'];

export function TaskList() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('ALL');

  const { data: projectData } = useQuery({
    queryKey: ['budgeting-project', projectId],
    queryFn: () => api<{ data: Project }>(`/budgeting/projects/${projectId}`),
    enabled: !!projectId,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['pm-tasks', projectId, page, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      return api<{ data: Task[]; pagination: { page: number; totalPages: number; total: number } }>(
        `/project-management/projects/${projectId}/tasks?${params}`,
      );
    },
    enabled: !!projectId,
  });

  const projectName = projectData?.data ? `${projectData.data.number} — ${projectData.data.name}` : 'Project';

  return (
    <div>
      <PageHeader
        title={`Tasks: ${projectName}`}
        backTo={{ label: 'Projects', href: '/pm/projects' }}
        action={
          <Link
            to={`/pm/projects/${projectId}/tasks/new`}
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
          >
            Create Task
          </Link>
        }
      />

      <div className="mb-4">
        <select value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm">
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s === 'ALL' ? 'All Statuses' : s.replace(/_/g, ' ')}</option>
          ))}
        </select>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Task #</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Assigned To</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Milestone</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Priority</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Allocated</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Logged</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Remaining</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {isLoading && (
              <tr><td colSpan={11} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
            )}
            {data?.data?.map((t) => (
              <tr
                key={t.id}
                className="cursor-pointer hover:bg-gray-50"
                onClick={() => navigate(`/pm/tasks/${t.id}`)}
              >
                <td className="px-4 py-3 text-sm font-mono text-gray-500">{t.taskNumber}</td>
                <td className="px-4 py-3 text-sm font-medium text-gray-900">{t.title}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{t.assignedTo?.name || '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{t.milestone?.name || '—'}</td>
                <td className="px-4 py-3 text-sm">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${priorityColors[t.priority] || ''}`}>
                    {t.priority}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[t.status] || ''}`}>
                    {t.status.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-right font-mono">{t.allocatedHours}h</td>
                <td className="px-4 py-3 text-sm text-right font-mono">{t.loggedHours}h</td>
                <td className={`px-4 py-3 text-sm text-right font-mono ${t.remainingHours < 0 ? 'text-red-600' : ''}`}>
                  {t.remainingHours}h
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {t.dueDate ? new Date(t.dueDate).toLocaleDateString() : '—'}
                </td>
                <td className="px-4 py-3 text-sm text-right" onClick={(e) => e.stopPropagation()}>
                  <ActionMenu items={[
                    { label: 'View', onClick: () => navigate(`/pm/tasks/${t.id}`) },
                  ]} />
                </td>
              </tr>
            ))}
            {!isLoading && data?.data?.length === 0 && (
              <tr><td colSpan={11} className="px-4 py-8 text-center text-gray-500">No tasks found. Create your first task.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {data?.pagination && data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-500">Page {data.pagination.page} of {data.pagination.totalPages} ({data.pagination.total} total)</p>
          <div className="flex gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50">Previous</button>
            <button onClick={() => setPage((p) => p + 1)} disabled={page >= data.pagination.totalPages}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
