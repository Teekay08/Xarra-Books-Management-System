import { useState } from 'react';
import { useParams, Link } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

interface TitleSale {
  titleId: string;
  description: string;
  quantity: number;
  consignmentLineIds: string[];
}

interface ReconciliationData {
  remittanceId: string;
  status: string;
  titleSales: TitleSale[];
  invoiceStatuses: Array<{
    invoiceId: string;
    invoiceNumber: string;
    status: string;
    amount: string;
  }>;
}

interface InvoiceLine {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
}

interface InvoiceAllocation {
  id: string;
  amount: string;
  invoice: {
    id: string;
    number: string;
    total: string;
    status: string;
    invoiceDate: string;
    lines: InvoiceLine[];
  };
}

interface CreditNoteAllocation {
  id: string;
  amount: string;
  creditNote: {
    id: string;
    number: string;
    total: string;
    reason: string;
  };
  invoice: {
    id: string;
    number: string;
  };
}

interface Remittance {
  id: string;
  partnerId: string;
  partnerRef: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  totalAmount: string;
  status: string;
  notes: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  approvedAt: string | null;
  createdAt: string;
  partner: { name: string };
  invoiceAllocations: InvoiceAllocation[];
  creditNoteAllocations?: CreditNoteAllocation[];
}

const STATUS_STEPS = ['PENDING', 'UNDER_REVIEW', 'APPROVED'] as const;
const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  UNDER_REVIEW: 'Under Review',
  APPROVED: 'Approved',
  MATCHED: 'Matched',
  DISPUTED: 'Disputed',
};
import { STATUS_COLORS } from '../../lib/statusColors';

export function RemittanceDetail() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [disputeReason, setDisputeReason] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [showDisputeForm, setShowDisputeForm] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['remittance', id],
    queryFn: () => api<{ data: Remittance }>(`/finance/remittances/${id}`),
  });

  const { data: reconData } = useQuery({
    queryKey: ['remittance-reconciliation', id],
    queryFn: () => api<{ data: ReconciliationData }>(`/finance/remittances/${id}/reconciliation`),
    enabled: !!data?.data && ['MATCHED', 'APPROVED'].includes(data.data.status),
  });

  const reviewMutation = useMutation({
    mutationFn: () =>
      api(`/finance/remittances/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({ notes: reviewNotes || undefined }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remittance', id] });
      setReviewNotes('');
    },
  });

  const approveMutation = useMutation({
    mutationFn: () =>
      api(`/finance/remittances/${id}/approve`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remittance', id] });
      queryClient.invalidateQueries({ queryKey: ['remittance-reconciliation', id] });
    },
  });

  const disputeMutation = useMutation({
    mutationFn: () =>
      api(`/finance/remittances/${id}/dispute`, {
        method: 'POST',
        body: JSON.stringify({ reason: disputeReason }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remittance', id] });
      setShowDisputeForm(false);
      setDisputeReason('');
    },
  });

  if (isLoading) return <div className="py-12 text-center text-gray-400">Loading...</div>;
  if (!data?.data) return <div className="py-12 text-center text-gray-400">Remittance not found.</div>;

  const r = data.data;
  const remittanceAmount = Number(r.totalAmount);
  const allocatedTotal = r.invoiceAllocations.reduce((s, a) => s + Number(a.amount), 0);
  const creditsTotal = (r.creditNoteAllocations ?? []).reduce((s, a) => s + Number(a.amount), 0);
  const netInvoices = allocatedTotal - creditsTotal;
  const diff = remittanceAmount - netInvoices;

  const currentStepIndex = STATUS_STEPS.indexOf(r.status as typeof STATUS_STEPS[number]);
  const isDisputed = r.status === 'DISPUTED';

  return (
    <div>
      <PageHeader title="Remittance Detail" subtitle={`From ${r.partner.name}`} backTo={{ label: 'Back to Remittances', href: '/remittances' }} />

      {/* Status Stepper */}
      <div className="mb-6">
        {isDisputed ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <div className="flex items-center gap-2">
              <span className="inline-block rounded-full bg-red-100 px-3 py-1 text-sm font-bold text-red-800">DISPUTED</span>
              {r.reviewNotes && <span className="text-sm text-red-700">Reason: {r.reviewNotes}</span>}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-0">
            {STATUS_STEPS.map((step, i) => {
              const isActive = i === currentStepIndex;
              const isDone = i < currentStepIndex || r.status === 'APPROVED' || r.status === 'MATCHED';
              const isMatchedStep = step === 'APPROVED' && (r.status === 'MATCHED' || r.status === 'APPROVED');
              return (
                <div key={step} className="flex items-center">
                  <div className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium ${
                    isDone || isMatchedStep
                      ? 'bg-green-100 text-green-800'
                      : isActive
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-gray-100 text-gray-400'
                  }`}>
                    {isDone || isMatchedStep ? (
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <span className="flex h-4 w-4 items-center justify-center rounded-full border text-xs">
                        {i + 1}
                      </span>
                    )}
                    {STATUS_LABELS[step] ?? step}
                  </div>
                  {i < STATUS_STEPS.length - 1 && (
                    <div className={`h-0.5 w-8 ${isDone ? 'bg-green-300' : 'bg-gray-200'}`} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <InfoCard label="Amount Declared" value={`R ${remittanceAmount.toFixed(2)}`} />
        <InfoCard label="Date" value={new Date(r.createdAt).toLocaleDateString()} />
        <InfoCard
          label="Status"
          value={STATUS_LABELS[r.status] ?? r.status}
          badge={STATUS_COLORS[r.status]}
        />
        <InfoCard
          label={diff === 0 ? 'Fully Reconciled' : 'Variance'}
          value={`R ${Math.abs(diff).toFixed(2)}`}
          color={Math.abs(diff) < 1 ? 'green' : 'amber'}
        />
      </div>

      {r.partnerRef && (
        <p className="text-sm text-gray-500 mb-2">Reference: {r.partnerRef}</p>
      )}
      {r.periodFrom && r.periodTo && (
        <p className="text-sm text-gray-500 mb-2">
          Period: {new Date(r.periodFrom).toLocaleDateString()} &ndash; {new Date(r.periodTo).toLocaleDateString()}
        </p>
      )}
      {r.notes && (
        <p className="text-sm text-gray-500 mb-2">Notes: {r.notes}</p>
      )}
      {r.reviewedAt && (
        <p className="text-sm text-gray-500 mb-2">
          Reviewed: {new Date(r.reviewedAt).toLocaleDateString()}
          {r.reviewNotes && !isDisputed && ` — ${r.reviewNotes}`}
        </p>
      )}
      {r.approvedAt && (
        <p className="text-sm text-green-600 mb-2">
          Approved: {new Date(r.approvedAt).toLocaleDateString()}
        </p>
      )}

      {/* Action Buttons */}
      {r.status === 'PENDING' && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 mb-6">
          <h3 className="text-sm font-semibold text-blue-800 mb-2">Begin Review</h3>
          <p className="text-xs text-blue-600 mb-3">
            Review the invoice allocations and credit note applications below before proceeding.
          </p>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Review notes (optional)"
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                className="w-full rounded-md border border-blue-200 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <button
              onClick={() => reviewMutation.mutate()}
              disabled={reviewMutation.isPending}
              className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {reviewMutation.isPending ? 'Submitting...' : 'Start Review'}
            </button>
          </div>
        </div>
      )}

      {r.status === 'UNDER_REVIEW' && (
        <div className="card p-4 mb-6">
          <h3 className="text-sm font-semibold text-gray-800 mb-2">Review Actions</h3>
          <p className="text-xs text-gray-500 mb-3">
            Verify that the invoice allocations, credit notes, and declared amount are correct. The net amount
            (invoices less credits) should match the declared payment amount within R 1.00.
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => approveMutation.mutate()}
              disabled={approveMutation.isPending}
              className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
            >
              {approveMutation.isPending ? 'Approving...' : 'Approve Remittance'}
            </button>
            {!showDisputeForm ? (
              <button
                onClick={() => setShowDisputeForm(true)}
                className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                Dispute
              </button>
            ) : (
              <div className="flex flex-1 items-center gap-2">
                <input
                  type="text"
                  placeholder="Reason for dispute *"
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value)}
                  className="flex-1 rounded-md border border-red-200 px-3 py-1.5 text-sm focus:border-red-500 focus:outline-none"
                />
                <button
                  onClick={() => disputeMutation.mutate()}
                  disabled={disputeMutation.isPending || !disputeReason.trim()}
                  className="rounded-md bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {disputeMutation.isPending ? 'Submitting...' : 'Confirm Dispute'}
                </button>
                <button
                  onClick={() => { setShowDisputeForm(false); setDisputeReason(''); }}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
          {approveMutation.isError && (
            <div className="mt-2 text-sm text-red-600">{(approveMutation.error as Error).message}</div>
          )}
        </div>
      )}

      {/* Linked Invoices */}
      {r.invoiceAllocations.length > 0 && (
        <>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Linked Invoices</h2>
          <div className="space-y-4 mb-6">
            {r.invoiceAllocations.map((alloc) => (
              <div key={alloc.id} className="card overflow-x-auto">
                <div className="px-4 py-3 bg-gray-50 flex items-center justify-between">
                  <div>
                    <Link to={`/invoices/${alloc.invoice.id}`} className="text-sm font-medium text-green-700 hover:underline">
                      {alloc.invoice.number}
                    </Link>
                    <span className="ml-2 text-xs text-gray-500">
                      {new Date(alloc.invoice.invoiceDate).toLocaleDateString()}
                    </span>
                    <span className={`ml-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      alloc.invoice.status === 'PAID' ? 'bg-green-100 text-green-700' :
                      alloc.invoice.status === 'PARTIAL' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {alloc.invoice.status}
                    </span>
                  </div>
                  <div className="text-sm">
                    <span className="text-gray-500">Allocated: </span>
                    <span className="font-medium">R {Number(alloc.amount).toFixed(2)}</span>
                    <span className="text-gray-400"> / R {Number(alloc.invoice.total).toFixed(2)}</span>
                  </div>
                </div>
                {alloc.invoice.lines.length > 0 && (
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Book / Item</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Unit Price</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {alloc.invoice.lines.map((line) => (
                        <tr key={line.id}>
                          <td className="px-4 py-2 text-sm text-gray-900">{line.description}</td>
                          <td className="px-4 py-2 text-sm text-gray-900 text-right">{Number(line.quantity)}</td>
                          <td className="px-4 py-2 text-sm text-gray-900 text-right">R {Number(line.unitPrice).toFixed(2)}</td>
                          <td className="px-4 py-2 text-sm font-medium text-gray-900 text-right">R {Number(line.lineTotal).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {r.invoiceAllocations.length === 0 && (
        <div className="card p-5 text-center text-sm text-gray-500 mb-6">
          No invoices linked to this remittance.
        </div>
      )}

      {/* Credit Note Allocations */}
      {(r.creditNoteAllocations ?? []).length > 0 && (
        <>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Credit Notes Applied</h2>
          <div className="rounded-lg border border-green-200 bg-green-50/30 overflow-hidden mb-6">
            <table className="min-w-full divide-y divide-green-100">
              <thead className="bg-green-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Credit Note</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Applied to Invoice</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-green-100">
                {r.creditNoteAllocations!.map((alloc) => (
                  <tr key={alloc.id}>
                    <td className="px-4 py-2 text-sm font-medium text-green-700">{alloc.creditNote.number}</td>
                    <td className="px-4 py-2 text-sm text-gray-700">{alloc.invoice.number}</td>
                    <td className="px-4 py-2 text-sm text-gray-500 max-w-[200px] truncate">{alloc.creditNote.reason}</td>
                    <td className="px-4 py-2 text-sm font-medium text-green-700 text-right">
                      - R {Number(alloc.amount).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-2 bg-green-50 border-t border-green-100 text-right text-sm font-bold text-green-700">
              Total Credits: - R {creditsTotal.toFixed(2)}
            </div>
          </div>
        </>
      )}

      {/* Net Reconciliation Summary */}
      {r.invoiceAllocations.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Reconciliation Summary</h3>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Invoice Allocations</span>
              <span className="font-medium text-gray-900">R {allocatedTotal.toFixed(2)}</span>
            </div>
            {creditsTotal > 0 && (
              <div className="flex justify-between">
                <span className="text-green-700">Less: Credit Notes</span>
                <span className="font-medium text-green-700">- R {creditsTotal.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-gray-200 pt-1">
              <span className="font-bold text-gray-800">Net Amount</span>
              <span className="font-bold text-gray-900">R {netInvoices.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Declared Payment</span>
              <span className="font-medium text-gray-900">R {remittanceAmount.toFixed(2)}</span>
            </div>
            <div className={`flex justify-between border-t border-gray-200 pt-1 font-bold ${
              Math.abs(diff) < 1 ? 'text-green-700' : 'text-amber-600'
            }`}>
              <span>Variance</span>
              <span>{diff >= 0 ? '' : '-'} R {Math.abs(diff).toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Sales Reconciliation */}
      {reconData?.data?.titleSales && reconData.data.titleSales.length > 0 && (
        <>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Sales Reconciliation</h2>
          <div className="rounded-lg border border-green-200 bg-green-50/30 overflow-hidden mb-6">
            <table className="min-w-full divide-y divide-green-100">
              <thead>
                <tr className="bg-green-50">
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qty Sold</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Consignment Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-green-50">
                {reconData.data.titleSales.map((ts) => (
                  <tr key={ts.titleId}>
                    <td className="px-4 py-2 text-sm text-gray-900">{ts.description}</td>
                    <td className="px-4 py-2 text-sm font-mono text-gray-900 text-right">{ts.quantity}</td>
                    <td className="px-4 py-2 text-sm text-gray-500">
                      {ts.consignmentLineIds.length > 0
                        ? `${ts.consignmentLineIds.length} consignment line(s) updated`
                        : 'Direct sale'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-2 bg-green-50 border-t border-green-100 text-sm text-green-700">
              Total: {reconData.data.titleSales.reduce((s, t) => s + t.quantity, 0)} items reconciled across{' '}
              {reconData.data.titleSales.length} title(s)
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function InfoCard({ label, value, color, badge }: { label: string; value: string; color?: string; badge?: string }) {
  const textColor = badge
    ? ''
    : color === 'green' ? 'text-green-600' : color === 'amber' ? 'text-amber-600' : 'text-gray-900';
  return (
    <div className="card p-4">
      <p className="text-xs text-gray-500 uppercase">{label}</p>
      {badge ? (
        <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-sm font-bold ${badge}`}>{value}</span>
      ) : (
        <p className={`text-lg font-bold mt-1 ${textColor}`}>{value}</p>
      )}
    </div>
  );
}
