import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type PaginatedResponse } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { Pagination } from '../../components/Pagination';

interface DeletionRequest {
  id: string;
  requestedBy: string;
  requesterName: string | null;
  approvedBy: string | null;
  approverName: string | null;
  rejectedBy: string | null;
  entityType: string;
  entityId: string;
  entitySnapshot: Record<string, unknown>;
  reason: string;
  status: string;
  rejectionReason: string | null;
  expiresAt: string;
  createdAt: string;
}

const statusColors: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  EXPIRED: 'bg-gray-100 text-gray-500',
};

export function DeletionRequests() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const queryParams = new URLSearchParams();
  queryParams.set('page', String(page));
  queryParams.set('limit', '20');
  if (statusFilter) queryParams.set('status', statusFilter);

  const { data, isLoading } = useQuery({
    queryKey: ['deletion-requests', page, statusFilter],
    queryFn: () => api<PaginatedResponse<DeletionRequest>>(`/audit/deletion-requests?${queryParams}`),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api(`/audit/deletion-requests/${id}/approve`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['deletion-requests'] }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api(`/audit/deletion-requests/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deletion-requests'] });
      setRejectingId(null);
      setRejectReason('');
    },
  });

  return (
    <div>
      <PageHeader
        title="Deletion Requests"
        subtitle="Two-admin approval required for all deletions. Self-approval is blocked."
      />

      <div className="flex gap-3 mb-4">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">All Statuses</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="EXPIRED">Expired</option>
        </select>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Requested By</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Entity</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Expires</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {isLoading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">Loading...</td></tr>
            ) : !data?.data.length ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">No deletion requests found</td></tr>
            ) : (
              data.data.map((dr) => (
                <tr key={dr.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-xs text-gray-500 font-mono whitespace-nowrap">
                    {new Date(dr.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{dr.requesterName || 'Unknown'}</td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-gray-900">
                      {dr.entityType.replace(/-/g, ' ').replace(/_/g, ' ')}
                    </div>
                    <div className="text-xs font-mono text-gray-400">{dr.entityId.substring(0, 8)}...</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 max-w-xs truncate">{dr.reason}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[dr.status] || 'bg-gray-100 text-gray-600'}`}>
                      {dr.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {dr.status === 'PENDING' ? (
                      <span className={new Date(dr.expiresAt) < new Date() ? 'text-red-500' : ''}>
                        {new Date(dr.expiresAt).toLocaleDateString()}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setExpandedId(expandedId === dr.id ? null : dr.id)}
                        className="text-xs text-gray-500 hover:text-gray-700"
                      >
                        {expandedId === dr.id ? 'Hide' : 'View'}
                      </button>
                      {dr.status === 'PENDING' && (
                        <>
                          <button
                            onClick={() => {
                              if (confirm('Are you sure you want to approve this deletion? This action is irreversible.')) {
                                approveMutation.mutate(dr.id);
                              }
                            }}
                            disabled={approveMutation.isPending}
                            className="text-xs text-green-700 hover:text-green-800 font-medium"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => setRejectingId(dr.id)}
                            className="text-xs text-red-600 hover:text-red-700 font-medium"
                          >
                            Reject
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Expanded snapshot */}
        {expandedId && data?.data.find((e) => e.id === expandedId) && (
          <div className="border-t border-gray-200 bg-gray-50 px-6 py-4">
            <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Entity Snapshot (data to be deleted)</h4>
            <pre className="text-xs font-mono text-gray-700 bg-white rounded p-3 border border-gray-200 max-h-64 overflow-auto">
              {JSON.stringify(data.data.find((e) => e.id === expandedId)?.entitySnapshot, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* Rejection modal */}
      {rejectingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Reject Deletion Request</h3>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason for rejection *</label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm mb-4"
              placeholder="Explain why this deletion should not proceed..."
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setRejectingId(null); setRejectReason(''); }}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => rejectMutation.mutate({ id: rejectingId, reason: rejectReason })}
                disabled={!rejectReason.trim() || rejectMutation.isPending}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {rejectMutation.isPending ? 'Rejecting...' : 'Reject'}
              </button>
            </div>
            {rejectMutation.isError && (
              <p className="mt-2 text-sm text-red-600">{(rejectMutation.error as Error).message}</p>
            )}
          </div>
        </div>
      )}

      {approveMutation.isError && (
        <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          {(approveMutation.error as Error).message}
        </div>
      )}

      {data && (
        <div className="mt-4">
          <Pagination page={page} totalPages={data.pagination.totalPages} total={data.pagination.total} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}
