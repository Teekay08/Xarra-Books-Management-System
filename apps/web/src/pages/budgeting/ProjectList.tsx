import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { ActionMenu } from '../../components/ActionMenu';

interface Project {
  id: string;
  number: string;
  name: string;
  status: string;
  projectType: string;
  contractType: string;
  totalBudget: string;
  totalActual: string;
  startDate: string | null;
  targetCompletionDate: string | null;
  title?: { title: string } | null;
  author?: { legalName: string; penName?: string } | null;
  manager?: { name: string } | null;
}

const statusColors: Record<string, string> = {
  PLANNING: 'bg-gray-100 text-gray-700',
  BUDGETED: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

export function ProjectList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['budgeting-projects', page, search],
    queryFn: () =>
      api<{ data: Project[]; pagination: { page: number; totalPages: number; total: number } }>(
        `/budgeting/projects?page=${page}&limit=20&search=${search}`,
      ),
  });

  const deleteMutation = useMutation({
    mutationFn: (projectId: string) => api(`/budgeting/projects/${projectId}`, { method: 'DELETE' }),
    onSuccess: () => { setDeleteTarget(null); queryClient.invalidateQueries({ queryKey: ['budgeting-projects'] }); },
  });

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle="Book publishing project budgets"
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

      <div className="card overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Number</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Project Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Author</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Budget</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actual</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Variance</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {isLoading && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
            )}
            {data?.data?.map((p) => {
              const budget = Number(p.totalBudget);
              const actual = Number(p.totalActual);
              const variance = budget - actual;
              return (
                <tr key={p.id} className="cursor-pointer hover:bg-gray-50" onClick={() => navigate(`/budgeting/projects/${p.id}`)}>
                  <td className="px-4 py-3 text-sm font-mono text-gray-500">{p.number}</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {p.name}
                    {p.title && <span className="block text-xs text-gray-400">{p.title.title}</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{p.author?.penName || p.author?.legalName || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{p.projectType.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[p.status] || ''}`}>
                      {p.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-medium">R {budget.toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm text-right font-medium">R {actual.toFixed(2)}</td>
                  <td className={`px-4 py-3 text-sm text-right font-medium ${variance >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                    {variance >= 0 ? '' : '-'}R {Math.abs(variance).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right" onClick={(e) => e.stopPropagation()}>
                    <ActionMenu items={[
                      { label: 'View', onClick: () => navigate(`/budgeting/projects/${p.id}`) },
                      { label: 'Edit', onClick: () => navigate(`/budgeting/projects/${p.id}/edit`) },
                      { label: 'Delete', onClick: () => setDeleteTarget(p), variant: 'danger' as const, hidden: p.status !== 'PLANNING' },
                    ]} />
                  </td>
                </tr>
              );
            })}
            {!isLoading && data?.data?.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-500">No projects yet. Create your first project budget.</td></tr>
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

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg p-6 w-full max-w-sm shadow-lg">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Project</h3>
            <p className="text-sm text-gray-600 mb-1">
              Are you sure you want to delete <strong>{deleteTarget.name}</strong> ({deleteTarget.number})?
            </p>
            <p className="text-sm text-red-600 mb-4">
              This will permanently remove the project and all associated data. This cannot be undone.
            </p>
            {deleteMutation.isError && (
              <p className="text-sm text-red-600 mb-3">{(deleteMutation.error as Error)?.message || 'Failed to delete'}</p>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => { setDeleteTarget(null); deleteMutation.reset(); }}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm">Cancel</button>
              <button onClick={() => deleteMutation.mutate(deleteTarget.id)} disabled={deleteMutation.isPending}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
                {deleteMutation.isPending ? 'Deleting...' : 'Delete Project'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
