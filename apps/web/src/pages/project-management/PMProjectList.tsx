import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { ActionMenu } from '../../components/ActionMenu';

const statusColors: Record<string, string> = {
  PLANNING: 'bg-gray-100 text-gray-700',
  BUDGETED: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

export function PMProjectList() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['pm-all-projects', page, search],
    queryFn: () => api<{ data: any[]; pagination: any }>(`/budgeting/projects?page=${page}&limit=20&search=${search}`),
  });

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle="All book projects — manage teams, tasks, and progress"
        backTo={{ label: 'PM Dashboard', href: '/pm' }}
        action={
          <Link to="/budgeting/projects/new" className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800">
            New Project
          </Link>
        }
      />

      <div className="mb-4">
        <input type="text" placeholder="Search projects..." value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-full max-w-sm rounded-md border border-gray-300 px-3 py-2 text-sm" />
      </div>

      <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Project</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Author</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Quick Actions</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {isLoading && <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>}
            {data?.data?.map((p: any) => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <p className="text-sm font-medium text-gray-900">{p.name}</p>
                  <p className="text-xs text-gray-500">{p.number}</p>
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">{p.author?.penName || p.author?.legalName || '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{p.projectType?.replace(/_/g, ' ')}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[p.status] || ''}`}>
                    {p.status?.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-center gap-2">
                    <Link to={`/pm/projects/${p.id}/team`}
                      className="rounded-md border border-blue-300 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100">
                      Team
                    </Link>
                    <Link to={`/pm/projects/${p.id}/tasks`}
                      className="rounded-md border border-green-300 bg-green-50 px-3 py-1 text-xs font-medium text-green-700 hover:bg-green-100">
                      Tasks
                    </Link>
                    <Link to={`/budgeting/projects/${p.id}`}
                      className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100">
                      Budget
                    </Link>
                  </div>
                </td>
                <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                  <ActionMenu items={[
                    { label: 'View Project', onClick: () => navigate(`/budgeting/projects/${p.id}?from=pm`) },
                    { label: 'Edit Project', onClick: () => navigate(`/budgeting/projects/${p.id}/edit?from=pm`) },
                    { label: 'Manage Team', onClick: () => navigate(`/pm/projects/${p.id}/team`) },
                    { label: 'Manage Tasks', onClick: () => navigate(`/pm/projects/${p.id}/tasks`) },
                  ]} />
                </td>
              </tr>
            ))}
            {!isLoading && (!data?.data || data.data.length === 0) && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No projects yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {data?.pagination && data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-500">Page {page} of {data.pagination.totalPages}</p>
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
