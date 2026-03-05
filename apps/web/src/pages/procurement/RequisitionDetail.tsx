import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

interface ReqLine {
  id: string;
  description: string;
  quantity: string;
  estimatedUnitPrice: string;
  estimatedTotal: string;
  notes: string | null;
}

interface Requisition {
  id: string;
  number: string;
  department: string;
  requiredByDate: string | null;
  totalEstimate: string;
  status: string;
  notes: string | null;
  requestedBy: { name: string };
  approvedBy: string | null;
  approvedAt: string | null;
  rejectedReason: string | null;
  rejectedAt: string | null;
  convertedPo: { id: string; number: string } | null;
  lines: ReqLine[];
}

const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  SUBMITTED: 'bg-blue-100 text-blue-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  ORDERED: 'bg-purple-100 text-purple-700',
};

function formatR(val: string | number) {
  return `R ${Number(val).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function RequisitionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['requisition', id],
    queryFn: () => api<{ data: Requisition }>(`/expenses/requisitions/${id}`),
  });

  const submitMutation = useMutation({
    mutationFn: () =>
      api(`/expenses/requisitions/${id}/submit`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['requisition', id] }),
  });

  const approveMutation = useMutation({
    mutationFn: () =>
      api(`/expenses/requisitions/${id}/approve`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['requisition', id] }),
  });

  const rejectMutation = useMutation({
    mutationFn: (reason: string) =>
      api(`/expenses/requisitions/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requisition', id] });
      setShowRejectModal(false);
      setRejectReason('');
    },
  });

  const convertMutation = useMutation({
    mutationFn: () =>
      api<{ data: { id: string } }>(`/expenses/requisitions/${id}/convert-to-po`, {
        method: 'POST',
        headers: { 'X-Idempotency-Key': crypto.randomUUID() },
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['requisition', id] });
      navigate(`/finance/purchase-orders/${result.data.id}`);
    },
  });

  if (isLoading) return <div className="py-12 text-center text-gray-400">Loading...</div>;
  if (!data?.data) return <div className="py-12 text-center text-gray-400">Requisition not found</div>;

  const req = data.data;

  return (
    <div>
      <PageHeader
        title={req.number}
        subtitle={`Requisition by ${req.requestedBy.name}`}
        action={
          <div className="flex gap-2">
            {req.status === 'DRAFT' && (
              <button
                onClick={() => submitMutation.mutate()}
                disabled={submitMutation.isPending}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {submitMutation.isPending ? 'Submitting...' : 'Submit'}
              </button>
            )}
            {req.status === 'SUBMITTED' && (
              <>
                <button
                  onClick={() => approveMutation.mutate()}
                  disabled={approveMutation.isPending}
                  className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
                >
                  {approveMutation.isPending ? 'Approving...' : 'Approve'}
                </button>
                <button
                  onClick={() => setShowRejectModal(true)}
                  className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                >
                  Reject
                </button>
              </>
            )}
            {req.status === 'APPROVED' && (
              <button
                onClick={() => {
                  if (confirm('Convert this requisition to a Purchase Order?')) convertMutation.mutate();
                }}
                disabled={convertMutation.isPending}
                className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
              >
                {convertMutation.isPending ? 'Converting...' : 'Convert to PO'}
              </button>
            )}
          </div>
        }
      />

      <div className="max-w-3xl space-y-6">
        {/* Requisition info */}
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6 text-sm">
            <div>
              <span className="text-xs text-gray-500 block">Status</span>
              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium mt-1 ${statusColors[req.status] ?? ''}`}>
                {req.status}
              </span>
            </div>
            <div>
              <span className="text-xs text-gray-500 block">Department</span>
              <span>{req.department}</span>
            </div>
            <div>
              <span className="text-xs text-gray-500 block">Required By</span>
              <span>{req.requiredByDate ? new Date(req.requiredByDate).toLocaleDateString('en-ZA') : '--'}</span>
            </div>
            <div>
              <span className="text-xs text-gray-500 block">Requested By</span>
              <span>{req.requestedBy.name}</span>
            </div>
          </div>

          {/* Line items table */}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-gray-500">
                <th className="pb-2">Description</th>
                <th className="pb-2 text-right">Qty</th>
                <th className="pb-2 text-right">Est. Unit Price</th>
                <th className="pb-2 text-right">Est. Total</th>
                <th className="pb-2">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {req.lines.map((line) => (
                <tr key={line.id}>
                  <td className="py-2">{line.description}</td>
                  <td className="py-2 text-right font-mono">{line.quantity}</td>
                  <td className="py-2 text-right font-mono">{formatR(line.estimatedUnitPrice)}</td>
                  <td className="py-2 text-right font-mono">{formatR(line.estimatedTotal)}</td>
                  <td className="py-2 text-gray-500">{line.notes ?? '--'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Total */}
          <div className="flex justify-end mt-4">
            <div className="w-64 space-y-1 text-sm">
              <div className="flex justify-between border-t pt-1 font-bold text-base">
                <span>Total Estimate</span>
                <span className="font-mono">{formatR(req.totalEstimate)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Approval info */}
        {req.approvedAt && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4">
            <p className="text-sm font-medium text-green-700">Approved</p>
            <p className="text-sm text-green-600 mt-1">
              {req.approvedBy && <>By: {req.approvedBy} &middot; </>}
              {new Date(req.approvedAt).toLocaleDateString('en-ZA')}
            </p>
          </div>
        )}

        {/* Rejection info */}
        {req.rejectedReason && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-medium text-red-700">Rejected</p>
            <p className="text-sm text-red-600 mt-1">{req.rejectedReason}</p>
            {req.rejectedAt && (
              <p className="text-xs text-red-400 mt-1">{new Date(req.rejectedAt).toLocaleDateString('en-ZA')}</p>
            )}
          </div>
        )}

        {/* Converted PO */}
        {req.convertedPo && (
          <div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
            <p className="text-sm text-purple-700">
              Converted to Purchase Order{' '}
              <button
                onClick={() => navigate(`/finance/purchase-orders/${req.convertedPo!.id}`)}
                className="font-mono font-medium underline"
              >
                {req.convertedPo.number}
              </button>
            </p>
          </div>
        )}

        {/* Notes */}
        {req.notes && (
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Notes</h3>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{req.notes}</p>
          </div>
        )}
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Reject Requisition</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason *</label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                placeholder="Provide a reason for rejection..."
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => { setShowRejectModal(false); setRejectReason(''); }}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => rejectReason && rejectMutation.mutate(rejectReason)}
                disabled={!rejectReason || rejectMutation.isPending}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {rejectMutation.isPending ? 'Rejecting...' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
