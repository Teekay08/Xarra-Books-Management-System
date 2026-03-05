import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type PaginatedResponse } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { Pagination } from '../../components/Pagination';

interface AuditEntry {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  changes: { before?: Record<string, unknown>; after?: Record<string, unknown> } | null;
  ipAddress: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

const actionColors: Record<string, string> = {
  CREATE: 'bg-green-100 text-green-700',
  UPDATE: 'bg-blue-100 text-blue-700',
  DELETE: 'bg-red-100 text-red-700',
  VOID: 'bg-red-100 text-red-600',
  APPROVE: 'bg-emerald-100 text-emerald-700',
  REJECT: 'bg-amber-100 text-amber-700',
  LOGIN: 'bg-gray-100 text-gray-600',
  LOGOUT: 'bg-gray-100 text-gray-500',
  EXPORT: 'bg-purple-100 text-purple-700',
  PDF_GENERATE: 'bg-indigo-100 text-indigo-700',
  STATUS_CHANGE: 'bg-cyan-100 text-cyan-700',
};

export function AuditLog() {
  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const queryParams = new URLSearchParams();
  queryParams.set('page', String(page));
  queryParams.set('limit', '25');
  if (entityType) queryParams.set('entityType', entityType);
  if (action) queryParams.set('action', action);

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', page, entityType, action],
    queryFn: () => api<PaginatedResponse<AuditEntry>>(`/audit/logs?${queryParams}`),
  });

  const handleFilterChange = useCallback(() => setPage(1), []);

  const entityTypes = [
    'invoices', 'payments', 'consignments', 'partners', 'authors', 'titles',
    'credit-notes', 'debit-notes', 'quotations', 'remittances', 'expenses',
    'inventory', 'returns', 'statements', 'settings', 'users', 'deletion_requests',
  ];

  const actions = [
    'CREATE', 'UPDATE', 'DELETE', 'VOID', 'APPROVE', 'REJECT',
    'LOGIN', 'LOGOUT', 'EXPORT', 'PDF_GENERATE', 'STATUS_CHANGE',
  ];

  return (
    <div>
      <PageHeader title="Audit Trail" subtitle="Complete log of all system actions by internal users" />

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <select
          value={entityType}
          onChange={(e) => { setEntityType(e.target.value); handleFilterChange(); }}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">All Modules</option>
          {entityTypes.map((t) => (
            <option key={t} value={t}>{t.replace(/-/g, ' ').replace(/_/g, ' ')}</option>
          ))}
        </select>
        <select
          value={action}
          onChange={(e) => { setAction(e.target.value); handleFilterChange(); }}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">All Actions</option>
          {actions.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Timestamp</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Module</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Entity ID</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">IP</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {isLoading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">Loading...</td></tr>
            ) : !data?.data.length ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">No audit entries found</td></tr>
            ) : (
              data.data.map((entry) => (
                <tr key={entry.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-xs text-gray-500 font-mono whitespace-nowrap">
                    {new Date(entry.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="font-medium text-gray-900">{entry.userName || 'Unknown'}</div>
                    <div className="text-xs text-gray-400">{entry.userEmail}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${actionColors[entry.action] || 'bg-gray-100 text-gray-600'}`}>
                      {entry.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {entry.entityType.replace(/-/g, ' ').replace(/_/g, ' ')}
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-gray-500">
                    {entry.entityId ? entry.entityId.substring(0, 8) + '...' : '-'}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400 font-mono">{entry.ipAddress || '-'}</td>
                  <td className="px-4 py-3">
                    {(entry.changes || entry.metadata) && (
                      <button
                        onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                        className="text-xs text-green-700 hover:text-green-800"
                      >
                        {expandedId === entry.id ? 'Hide' : 'View'}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Expanded detail */}
        {expandedId && data?.data.find((e) => e.id === expandedId) && (
          <div className="border-t border-gray-200 bg-gray-50 px-6 py-4">
            <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Change Details</h4>
            <pre className="text-xs font-mono text-gray-700 bg-white rounded p-3 border border-gray-200 max-h-64 overflow-auto">
              {JSON.stringify(
                {
                  changes: data.data.find((e) => e.id === expandedId)?.changes,
                  metadata: data.data.find((e) => e.id === expandedId)?.metadata,
                },
                null,
                2,
              )}
            </pre>
          </div>
        )}
      </div>

      {data && (
        <div className="mt-4">
          <Pagination
            page={page}
            totalPages={data.pagination.totalPages}
            total={data.pagination.total}
            onPageChange={setPage}
          />
        </div>
      )}
    </div>
  );
}
