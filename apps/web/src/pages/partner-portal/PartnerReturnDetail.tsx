import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router';
import { partnerApi } from '../../lib/partner-api';

interface ReturnLineTitle {
  id: string;
  title: string;
  isbn13: string | null;
}

interface ReturnLine {
  id: string;
  titleId: string;
  quantity: number;
  qtyAccepted: number | null;
  condition: string;
  reason: string | null;
  title: ReturnLineTitle | null;
}

interface RequestedByUser {
  id: string;
  name: string;
}

interface ReviewedByUser {
  id: string;
  name: string;
}

interface ReturnDetail {
  id: string;
  number: string;
  createdAt: string;
  status: string;
  reason: string;
  notes: string | null;
  branchId: string | null;
  requestedBy: RequestedByUser | null;
  reviewedBy: ReviewedByUser | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  rejectionReason: string | null;
  lines: ReturnLine[];
  // Courier fields (flat)
  returnCourierCompany: string | null;
  returnCourierWaybill: string | null;
  returnCourierTrackingUrl: string | null;
  // Linked credit note ID only
  creditNoteId: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-800',
  SUBMITTED: 'bg-blue-100 text-blue-800',
  UNDER_REVIEW: 'bg-yellow-100 text-yellow-800',
  AUTHORIZED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
  AWAITING_PICKUP: 'bg-orange-100 text-orange-800',
  IN_TRANSIT: 'bg-purple-100 text-purple-800',
  RECEIVED: 'bg-teal-100 text-teal-800',
  INSPECTED: 'bg-indigo-100 text-indigo-800',
  CREDIT_ISSUED: 'bg-emerald-100 text-emerald-800',
};

const CONDITION_COLORS: Record<string, string> = {
  GOOD: 'bg-green-100 text-green-800',
  DAMAGED: 'bg-yellow-100 text-yellow-800',
  UNSALEABLE: 'bg-red-100 text-red-800',
};

function formatStatus(status: string): string {
  return status.replace(/_/g, ' ');
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function PartnerReturnDetail() {
  const { id } = useParams<{ id: string }>();
  const [returnReq, setReturnReq] = useState<ReturnDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchReturn() {
      try {
        const res = await partnerApi<{ data: ReturnDetail }>(`/returns/${id}`);
        setReturnReq(res.data);
      } catch (err: any) {
        setError(err.message || 'Failed to load return request.');
      } finally {
        setLoading(false);
      }
    }
    fetchReturn();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error || !returnReq) {
    return (
      <div className="space-y-4">
        <Link to="/partner/returns" className="text-sm font-medium text-primary hover:underline">
          &larr; Back to Returns
        </Link>
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error || 'Return request not found.'}
        </div>
      </div>
    );
  }

  const hasReview = returnReq.reviewedBy || returnReq.reviewedAt;
  const hasInspection = returnReq.lines?.some((l) => l.qtyAccepted !== null);
  const hasCourier = !!(returnReq.returnCourierCompany || returnReq.returnCourierWaybill);

  return (
    <div className="space-y-6">
      {/* Back Link & Header */}
      <div>
        <Link to="/partner/returns" className="text-sm font-medium text-primary hover:underline">
          &larr; Back to Returns
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-gray-900">{returnReq.number}</h1>
        <span
          className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${STATUS_COLORS[returnReq.status] ?? 'bg-gray-100 text-gray-800'}`}
        >
          {formatStatus(returnReq.status)}
        </span>
      </div>

      {/* Request Info */}
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Request Information</h2>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-medium text-gray-500">Date</dt>
            <dd className="mt-1 text-sm text-gray-900">{formatDate(returnReq.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Requested By</dt>
            <dd className="mt-1 text-sm text-gray-900">{returnReq.requestedBy?.name ?? '-'}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-sm font-medium text-gray-500">Reason</dt>
            <dd className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">{returnReq.reason}</dd>
          </div>
        </dl>
      </div>

      {/* Review Info */}
      {hasReview && (
        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Review Information</h2>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {returnReq.reviewedBy && (
              <div>
                <dt className="text-sm font-medium text-gray-500">Reviewed By</dt>
                <dd className="mt-1 text-sm text-gray-900">{returnReq.reviewedBy.name}</dd>
              </div>
            )}
            {returnReq.reviewedAt && (
              <div>
                <dt className="text-sm font-medium text-gray-500">Review Date</dt>
                <dd className="mt-1 text-sm text-gray-900">{formatDate(returnReq.reviewedAt)}</dd>
              </div>
            )}
            {returnReq.reviewNotes && (
              <div className="sm:col-span-2">
                <dt className="text-sm font-medium text-gray-500">Review Notes</dt>
                <dd className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">
                  {returnReq.reviewNotes}
                </dd>
              </div>
            )}
            {returnReq.rejectionReason && (
              <div className="sm:col-span-2">
                <dt className="text-sm font-medium text-gray-500">Rejection Reason</dt>
                <dd className="mt-1 text-sm text-red-700 whitespace-pre-wrap">
                  {returnReq.rejectionReason}
                </dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {/* Line Items */}
      <div className="rounded-lg border bg-white shadow-sm">
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Line Items</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-gray-600">
                <th className="px-6 py-3 font-medium">Title</th>
                <th className="px-6 py-3 font-medium">ISBN</th>
                <th className="px-6 py-3 font-medium text-right">Qty Requested</th>
                <th className="px-6 py-3 font-medium">Condition</th>
                {hasInspection && (
                  <th className="px-6 py-3 font-medium text-right">Qty Accepted</th>
                )}
                <th className="px-6 py-3 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody>
              {returnReq.lines?.map((line) => (
                <tr key={line.id} className="border-b last:border-0">
                  <td className="px-6 py-3 font-medium text-gray-900">{line.title?.title ?? '-'}</td>
                  <td className="px-6 py-3 text-gray-600">{line.title?.isbn13 ?? '-'}</td>
                  <td className="px-6 py-3 text-right text-gray-900">{line.quantity}</td>
                  <td className="px-6 py-3">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${CONDITION_COLORS[line.condition] ?? 'bg-gray-100 text-gray-800'}`}
                    >
                      {line.condition}
                    </span>
                  </td>
                  {hasInspection && (
                    <td className="px-6 py-3 text-right text-gray-900">
                      {line.qtyAccepted !== null ? line.qtyAccepted : '--'}
                    </td>
                  )}
                  <td className="px-6 py-3 text-gray-600">{line.reason || '--'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Courier Tracking */}
      {hasCourier && (
        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Courier Tracking</h2>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-gray-500">Courier</dt>
              <dd className="mt-1 text-sm text-gray-900">{returnReq.returnCourierCompany ?? '-'}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Tracking Number</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {returnReq.returnCourierTrackingUrl ? (
                  <a
                    href={returnReq.returnCourierTrackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    {returnReq.returnCourierWaybill}
                  </a>
                ) : (
                  returnReq.returnCourierWaybill ?? '-'
                )}
              </dd>
            </div>
          </dl>
        </div>
      )}

      {/* Linked Credit Note */}
      {returnReq.creditNoteId && (
        <div className="rounded-lg border bg-emerald-50 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Credit Note</h2>
          <p className="text-sm text-gray-700">
            A credit note has been issued for this return.
          </p>
        </div>
      )}

      {/* Notes */}
      {returnReq.notes && (
        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Notes</h2>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{returnReq.notes}</p>
        </div>
      )}

      {/* Bottom navigation */}
      <div className="flex justify-end pt-2">
        <Link
          to="/partner/returns"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primary/90"
        >
          Done — Back to Returns
        </Link>
      </div>
    </div>
  );
}
