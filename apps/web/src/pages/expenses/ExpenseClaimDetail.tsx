import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { formatR } from '../../lib/format';
import { EXPENSE_STATUS_COLORS as statusColors } from '../../lib/statusColors';

interface ClaimLine {
  id: string;
  categoryName: string;
  description: string;
  amount: string;
  taxAmount: string;
  receiptUrl: string | null;
  expenseDate: string | null;
}

interface ExpenseClaim {
  id: string;
  number: string;
  claimDate: string;
  total: string;
  status: string;
  notes: string | null;
  claimant: { name: string };
  approvedBy: string | null;
  approvedAt: string | null;
  rejectedReason: string | null;
  rejectedAt: string | null;
  paidAt: string | null;
  paidReference: string | null;
  lines: ClaimLine[];
}


export function ExpenseClaimDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showPaidModal, setShowPaidModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [paidReference, setPaidReference] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['expense-claim', id],
    queryFn: () => api<{ data: ExpenseClaim }>(`/expenses/claims/${id}`),
  });

  const submitMutation = useMutation({
    mutationFn: () =>
      api(`/expenses/claims/${id}/submit`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['expense-claim', id] }),
  });

  const approveMutation = useMutation({
    mutationFn: () =>
      api(`/expenses/claims/${id}/approve`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['expense-claim', id] }),
  });

  const rejectMutation = useMutation({
    mutationFn: (reason: string) =>
      api(`/expenses/claims/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense-claim', id] });
      setShowRejectModal(false);
      setRejectReason('');
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: (reference: string) =>
      api(`/expenses/claims/${id}/mark-paid`, {
        method: 'POST',
        body: JSON.stringify({ reference }),
        headers: { 'X-Idempotency-Key': crypto.randomUUID() },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense-claim', id] });
      setShowPaidModal(false);
      setPaidReference('');
    },
  });

  if (isLoading) return <div className="py-12 text-center text-gray-400">Loading...</div>;
  if (!data?.data) return <div className="py-12 text-center text-gray-400">Expense claim not found</div>;

  const claim = data.data;

  return (
    <div>
      <PageHeader
        title={claim.number}
        subtitle={claim.claimant.name}
        backTo={{ label: 'Back to Expense Claims', href: '/expenses/claims' }}
        action={
          <div className="flex gap-2">
            {claim.status === 'DRAFT' && (
              <>
                <button
                  onClick={() => navigate(`/expenses/claims/${id}/edit`)}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Edit
                </button>
                <button
                  onClick={() => submitMutation.mutate()}
                  disabled={submitMutation.isPending}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitMutation.isPending ? 'Submitting...' : 'Submit'}
                </button>
              </>
            )}
            {claim.status === 'SUBMITTED' && (
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
            {claim.status === 'APPROVED' && (
              <button
                onClick={() => setShowPaidModal(true)}
                className="rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
              >
                Mark as Paid
              </button>
            )}
          </div>
        }
      />

      <div className="max-w-3xl space-y-6">
        {/* Claim info */}
        <div className="card p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6 text-sm">
            <div>
              <span className="text-xs text-gray-500 block">Status</span>
              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium mt-1 ${statusColors[claim.status] ?? ''}`}>
                {claim.status}
              </span>
            </div>
            <div>
              <span className="text-xs text-gray-500 block">Claim Date</span>
              <span>{new Date(claim.claimDate).toLocaleDateString('en-ZA')}</span>
            </div>
            <div>
              <span className="text-xs text-gray-500 block">Claimant</span>
              <span>{claim.claimant.name}</span>
            </div>
            <div>
              <span className="text-xs text-gray-500 block">Total</span>
              <span className="font-mono font-bold">{formatR(claim.total)}</span>
            </div>
          </div>

          {/* Line items table */}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-gray-500">
                <th className="pb-2">Category</th>
                <th className="pb-2">Description</th>
                <th className="pb-2 text-right">Amount</th>
                <th className="pb-2 text-right">Tax</th>
                <th className="pb-2">Receipt</th>
                <th className="pb-2">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {claim.lines.map((line) => (
                <tr key={line.id}>
                  <td className="py-2">
                    <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                      {line.categoryName}
                    </span>
                  </td>
                  <td className="py-2">{line.description}</td>
                  <td className="py-2 text-right font-mono">{formatR(line.amount)}</td>
                  <td className="py-2 text-right font-mono">{formatR(line.taxAmount)}</td>
                  <td className="py-2">
                    {line.receiptUrl ? (
                      <a
                        href={line.receiptUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline text-xs"
                      >
                        View
                      </a>
                    ) : (
                      <span className="text-gray-400">--</span>
                    )}
                  </td>
                  <td className="py-2 text-gray-600">
                    {line.expenseDate ? new Date(line.expenseDate).toLocaleDateString('en-ZA') : '--'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Total */}
          <div className="flex justify-end mt-4">
            <div className="w-64 space-y-1 text-sm">
              <div className="flex justify-between border-t pt-1 font-bold text-base">
                <span>Total</span>
                <span className="font-mono">{formatR(claim.total)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Approval info */}
        {claim.approvedAt && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4">
            <p className="text-sm font-medium text-green-700">Approved</p>
            <p className="text-sm text-green-600 mt-1">
              {claim.approvedBy && <>By: {claim.approvedBy} &middot; </>}
              {new Date(claim.approvedAt).toLocaleDateString('en-ZA')}
            </p>
          </div>
        )}

        {/* Rejection info */}
        {claim.rejectedReason && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-medium text-red-700">Rejected</p>
            <p className="text-sm text-red-600 mt-1">{claim.rejectedReason}</p>
            {claim.rejectedAt && (
              <p className="text-xs text-red-400 mt-1">{new Date(claim.rejectedAt).toLocaleDateString('en-ZA')}</p>
            )}
          </div>
        )}

        {/* Paid info */}
        {claim.paidAt && (
          <div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
            <p className="text-sm font-medium text-purple-700">Paid</p>
            <p className="text-sm text-purple-600 mt-1">
              {claim.paidReference && <>Ref: {claim.paidReference} &middot; </>}
              {new Date(claim.paidAt).toLocaleDateString('en-ZA')}
            </p>
          </div>
        )}

        {/* Notes */}
        {claim.notes && (
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Notes</h3>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{claim.notes}</p>
          </div>
        )}
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Reject Expense Claim</h3>
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

      {/* Mark Paid Modal */}
      {showPaidModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Mark as Paid</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Reference</label>
              <input
                value={paidReference}
                onChange={(e) => setPaidReference(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                placeholder="e.g. EFT reference number"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => { setShowPaidModal(false); setPaidReference(''); }}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => markPaidMutation.mutate(paidReference)}
                disabled={markPaidMutation.isPending}
                className="rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
              >
                {markPaidMutation.isPending ? 'Processing...' : 'Confirm Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
