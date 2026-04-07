import { useState } from 'react';
import { useParams, Link } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { VoidReasonModal } from '../../components/VoidReasonModal';
import { InfoCard } from '../../components/InfoCard';
import { FinancialSummary } from '../../components/FinancialSummary';
import { VoidedBanner } from '../../components/VoidedBanner';

interface CreditNoteLine {
  id: string;
  lineNumber: number;
  titleId: string | null;
  description: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
  lineTax: string;
  title?: { title: string; isbn: string } | null;
}

interface CreditNote {
  id: string;
  number: string;
  invoiceId: string;
  partnerId: string;
  subtotal: string;
  vatAmount: string;
  total: string;
  applied: string;
  available: string;
  reason: string;
  status: string;
  pdfUrl: string | null;
  voidedAt: string | null;
  voidedReason: string | null;
  createdBy: string | null;
  createdAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  sentAt: string | null;
  sentTo: string | null;
  partner: { name: string };
  invoice: { number: string };
  lines: CreditNoteLine[];
}

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  PENDING_REVIEW: 'bg-yellow-100 text-yellow-800',
  APPROVED: 'bg-green-100 text-green-700',
  SENT: 'bg-blue-100 text-blue-700',
  VOIDED: 'bg-red-100 text-red-700',
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  PENDING_REVIEW: 'Pending Review',
  APPROVED: 'Approved',
  SENT: 'Sent to HQ',
  VOIDED: 'Voided',
};

export function CreditNoteDetail() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [reviewNotes, setReviewNotes] = useState('');

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['credit-note', id] });
    queryClient.invalidateQueries({ queryKey: ['credit-notes'] });
  };

  const { data, isLoading } = useQuery({
    queryKey: ['credit-note', id],
    queryFn: () => api<{ data: CreditNote }>(`/finance/credit-notes/${id}`),
  });

  const submitMutation = useMutation({
    mutationFn: () => api(`/finance/credit-notes/${id}/submit`, { method: 'POST' }),
    onSuccess: invalidate,
  });

  const reviewMutation = useMutation({
    mutationFn: (approve: boolean) =>
      api(`/finance/credit-notes/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({ approve, notes: reviewNotes }),
      }),
    onSuccess: () => { setReviewNotes(''); invalidate(); },
  });

  const sendMutation = useMutation({
    mutationFn: () => api(`/finance/credit-notes/${id}/send`, { method: 'POST' }),
    onSuccess: invalidate,
  });

  const voidMutation = useMutation({
    mutationFn: (reason: string) =>
      api(`/finance/credit-notes/${id}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => { setShowVoidModal(false); invalidate(); },
  });

  if (isLoading) return <div className="py-12 text-center text-gray-400">Loading...</div>;
  if (!data?.data) return <div className="py-12 text-center text-gray-400">Credit note not found.</div>;

  const cn = data.data;
  const status = cn.voidedAt ? 'VOIDED' : (cn.status || 'DRAFT');

  return (
    <div>
      <PageHeader
        title={cn.number}
        subtitle={`Credit Note for ${cn.partner.name}`}
        backTo={{ label: 'Back to Credit Notes', href: '/credit-notes' }}
        action={
          <div className="flex gap-2 items-center flex-wrap">
            <a href={`/api/v1/finance/credit-notes/${cn.id}/pdf`} target="_blank" rel="noopener noreferrer"
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
              Download PDF
            </a>
            {status !== 'VOIDED' && (
              <button onClick={() => setShowVoidModal(true)}
                className="rounded-md border border-red-300 px-4 py-2 text-sm text-red-700 hover:bg-red-50">
                Void
              </button>
            )}
          </div>
        }
      />

      {/* Status & Info cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <InfoCard label="Partner" value={cn.partner.name} />
        <InfoCard label="Invoice" value={cn.invoice?.number || '—'} />
        <InfoCard label="Date" value={new Date(cn.createdAt).toLocaleDateString('en-ZA')} />
        <InfoCard
          label="Status"
          value={STATUS_LABELS[status] || status}
          color={status === 'VOIDED' ? 'red' : status === 'APPROVED' || status === 'SENT' ? 'green' : undefined}
        />
        <InfoCard label="Lines" value={String(cn.lines?.length ?? 0)} />
      </div>

      {/* Workflow action panel */}
      {status === 'DRAFT' && (
        <div className="mb-6 rounded-lg border border-yellow-200 bg-yellow-50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-yellow-900">Draft Credit Note</h3>
              <p className="text-sm text-yellow-700 mt-0.5">Review the line items below and submit for approval when ready.</p>
            </div>
            <button
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending}
              className="rounded-md bg-yellow-600 px-4 py-2 text-sm font-medium text-white hover:bg-yellow-700 disabled:opacity-50"
            >
              {submitMutation.isPending ? 'Submitting...' : 'Submit for Review'}
            </button>
          </div>
        </div>
      )}

      {status === 'PENDING_REVIEW' && (
        <div className="mb-6 rounded-lg border border-orange-200 bg-orange-50 p-4">
          <h3 className="text-sm font-semibold text-orange-900 mb-2">Awaiting Review</h3>
          <p className="text-sm text-orange-700 mb-3">Review the credit note details and line items. Approve to allow sending to HQ, or return to draft for edits.</p>
          <textarea
            value={reviewNotes}
            onChange={(e) => setReviewNotes(e.target.value)}
            placeholder="Review notes (optional)..."
            className="w-full mb-3 rounded-md border border-orange-300 px-3 py-2 text-sm"
            rows={2}
          />
          <div className="flex gap-2">
            <button
              onClick={() => reviewMutation.mutate(true)}
              disabled={reviewMutation.isPending}
              className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {reviewMutation.isPending ? 'Processing...' : 'Approve'}
            </button>
            <button
              onClick={() => reviewMutation.mutate(false)}
              disabled={reviewMutation.isPending}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Return to Draft
            </button>
          </div>
        </div>
      )}

      {status === 'APPROVED' && (
        <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-green-900">Approved</h3>
              <p className="text-sm text-green-700 mt-0.5">This credit note has been approved. You can now send it to the partner/HQ.</p>
            </div>
            <button
              onClick={() => sendMutation.mutate()}
              disabled={sendMutation.isPending}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {sendMutation.isPending ? 'Sending...' : 'Mark as Sent'}
            </button>
          </div>
        </div>
      )}

      {status === 'SENT' && (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <h3 className="text-sm font-semibold text-blue-900">Sent</h3>
          <p className="text-sm text-blue-700 mt-0.5">
            This credit note was sent{cn.sentAt ? ` on ${new Date(cn.sentAt).toLocaleDateString('en-ZA')}` : ''}{cn.sentTo ? ` to ${cn.sentTo}` : ''}.
          </p>
        </div>
      )}

      {/* Financial Summary */}
      <FinancialSummary subtotal={cn.subtotal} vatAmount={cn.vatAmount} total={cn.total} />

      {/* Credit Balance */}
      {status !== 'VOIDED' && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white overflow-x-auto">
          <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-900">Credit Balance</h3>
          </div>
          <div className="grid grid-cols-3 divide-x divide-gray-200">
            <div className="px-5 py-4 text-center">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Credit</p>
              <p className="text-xl font-semibold text-gray-900">R {Number(cn.total).toFixed(2)}</p>
            </div>
            <div className="px-5 py-4 text-center">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Applied</p>
              <p className="text-xl font-semibold text-orange-600">R {Number(cn.applied).toFixed(2)}</p>
            </div>
            <div className="px-5 py-4 text-center">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Remaining</p>
              <p className={`text-xl font-semibold ${Number(cn.available) > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                R {Number(cn.available).toFixed(2)}
              </p>
            </div>
          </div>
          {Number(cn.available) > 0 && (
            <div className="px-5 py-2 bg-green-50 border-t border-green-100 text-xs text-green-700">
              R {Number(cn.available).toFixed(2)} available to apply against outstanding invoices
            </div>
          )}
          {Number(cn.available) === 0 && Number(cn.applied) > 0 && (
            <div className="px-5 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-500">
              This credit note has been fully applied
            </div>
          )}
        </div>
      )}

      {/* Line Items */}
      {cn.lines && cn.lines.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white mb-6 overflow-x-auto">
          <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-900">Line Items</h3>
          </div>
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Unit Price</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Tax</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Line Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {cn.lines.map((line) => (
                <tr key={line.id}>
                  <td className="px-4 py-2 text-sm text-gray-500">{line.lineNumber}</td>
                  <td className="px-4 py-2 text-sm text-gray-900">
                    {line.description}
                    {line.title && (
                      <span className="block text-xs text-gray-500">ISBN: {line.title.isbn}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-900 text-right">{Number(line.quantity)}</td>
                  <td className="px-4 py-2 text-sm text-gray-900 text-right">R {Number(line.unitPrice).toFixed(2)}</td>
                  <td className="px-4 py-2 text-sm text-gray-500 text-right">R {Number(line.lineTax).toFixed(2)}</td>
                  <td className="px-4 py-2 text-sm font-medium text-gray-900 text-right">R {Number(line.lineTotal).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Reason */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 mb-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Reason</h3>
        <p className="text-sm text-gray-600 whitespace-pre-wrap">{cn.reason}</p>
      </div>

      {/* Review info */}
      {cn.reviewedAt && (
        <div className="rounded-lg border border-gray-200 bg-white p-5 mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Review Details</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Reviewed by:</span>{' '}
              <span className="text-gray-900">{cn.reviewedBy || '—'}</span>
            </div>
            <div>
              <span className="text-gray-500">Reviewed on:</span>{' '}
              <span className="text-gray-900">{new Date(cn.reviewedAt).toLocaleDateString('en-ZA')}</span>
            </div>
            {cn.reviewNotes && (
              <div className="col-span-2">
                <span className="text-gray-500">Notes:</span>{' '}
                <span className="text-gray-900">{cn.reviewNotes}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {cn.voidedAt && <VoidedBanner voidedAt={cn.voidedAt} voidedReason={cn.voidedReason} />}

      {showVoidModal && (
        <VoidReasonModal
          title="Void Credit Note"
          description={`Void credit note ${cn.number}? This action cannot be undone.`}
          isPending={voidMutation.isPending}
          onClose={() => setShowVoidModal(false)}
          onConfirm={(reason) => voidMutation.mutate(reason)}
        />
      )}
    </div>
  );
}
