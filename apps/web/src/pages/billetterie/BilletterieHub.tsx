import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

const PHASE_COLORS: Record<string, string> = {
  INITIATION:   'bg-slate-100 text-slate-700',
  ELICITATION:  'bg-purple-100 text-purple-700',
  ARCHITECTURE: 'bg-indigo-100 text-indigo-700',
  DEVELOPMENT:  'bg-blue-100 text-blue-700',
  TESTING:      'bg-yellow-100 text-yellow-700',
  SIGN_OFF:     'bg-orange-100 text-orange-700',
  CLOSURE:      'bg-green-100 text-green-700',
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE:    'bg-green-100 text-green-700',
  ON_HOLD:   'bg-yellow-100 text-yellow-700',
  COMPLETED: 'bg-gray-100 text-gray-600',
  CANCELLED: 'bg-red-100 text-red-700',
};

export function BilletterieHub() {
  const { data, isLoading } = useQuery({
    queryKey: ['billetterie-projects'],
    queryFn: () => api<{ data: any[]; stats: any }>('/billetterie/projects?limit=50'),
  });

  const projects = data?.data ?? [];
  const stats = data?.stats ?? {};

  const active    = projects.filter((p: any) => p.status === 'ACTIVE');
  const onHold    = projects.filter((p: any) => p.status === 'ON_HOLD');
  const completed = projects.filter((p: any) => p.status === 'COMPLETED');

  return (
    <div>
      <PageHeader
        title="Billetterie Software"
        subtitle="Project management hub"
        action={
          <Link
            to="/billetterie/projects/new"
            className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
          >
            New Project
          </Link>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Active Projects',    value: active.length,    color: 'text-blue-700' },
          { label: 'On Hold',            value: onHold.length,    color: 'text-yellow-700' },
          { label: 'Completed',          value: completed.length, color: 'text-green-700' },
          { label: 'Total Projects',     value: projects.length,  color: 'text-gray-900' },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">{s.label}</p>
            <p className={`mt-1 text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Projects list */}
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">All Projects</h2>
          <Link to="/billetterie/projects" className="text-xs text-blue-600 hover:underline">View all</Link>
        </div>

        {isLoading && (
          <div className="p-8 text-center text-gray-400 text-sm">Loading projects…</div>
        )}

        {!isLoading && projects.length === 0 && (
          <div className="p-12 text-center">
            <p className="text-gray-500 text-sm mb-4">No projects yet</p>
            <Link
              to="/billetterie/projects/new"
              className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
            >
              Create First Project
            </Link>
          </div>
        )}

        {projects.length > 0 && (
          <div className="divide-y divide-gray-100">
            {projects.slice(0, 10).map((p: any) => (
              <Link
                key={p.id}
                to={`/billetterie/projects/${p.id}`}
                className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="shrink-0">
                    <p className="text-xs font-mono text-gray-400">{p.number}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                    <p className="text-xs text-gray-500">{p.client || '—'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${PHASE_COLORS[p.currentPhase] || 'bg-gray-100 text-gray-600'}`}>
                    {p.currentPhase?.replace(/_/g, ' ')}
                  </span>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[p.status] || 'bg-gray-100 text-gray-600'}`}>
                    {p.status}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
