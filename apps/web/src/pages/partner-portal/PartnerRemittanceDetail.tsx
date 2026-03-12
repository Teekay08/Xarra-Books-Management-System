import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router';
import { partnerApi, getPartnerUser } from '../../lib/partner-api';

interface InvoiceAllocation {
  id: string;
  amount: string;
  invoice: {
    id: string;
    number: string;
    total: string;
    invoiceDate: string;
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

interface RemittanceDetail {
  id: string;
  partnerRef: string | null;
  totalAmount: string;
  status: string;
  periodFrom: string | null;
  periodTo: string | null;
  notes: string | null;
  reviewNotes: string | null;
  createdAt: string;
  invoiceAllocations: InvoiceAllocation[];
  creditNoteAllocations: CreditNoteAllocation[];
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  UNDER_REVIEW: 'bg-blue-100 text-blue-800',
  VERIFIED: 'bg-teal-100 text-teal-800',
  APPROVED: 'bg-green-100 text-green-800',
  MATCHED: 'bg-green-100 text-green-800',
  DISPUTED: 'bg-red-100 text-red-800',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  UNDER_REVIEW: 'Under Review',
  VERIFIED: 'Verified',
  APPROVED: 'Approved',
  MATCHED: 'Matched',
  DISPUTED: 'Disputed',
};

export function PartnerRemittanceDetail() {
  const { id } = useParams();
  const user = getPartnerUser();
  const isHq = !user?.branchId;

  const [remittance, setRemittance] = useState<RemittanceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isHq) return;
    async function fetchData() {
      try {
        const res = await partnerApi<{ data: RemittanceDetail }>(`/remittances/${id}`);
        setRemittance(res.data);
      } catch (err: any) {
        setError(err.message || 'Failed to load remittance');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [id, isHq]);

  if (!isHq) {
    return (
      <div className="rounded-lg border bg-white p-8 text-center">
        <p className="text-sm text-gray-500">Remittances are managed by your head office.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error || !remittance) {
    return (
      <div className="space-y-4">
        <Link to="/partner/remittances" className="text-sm font-medium text-primary hover:underline">
          &larr; Back to Remittances
        </Link>
        <div className="rounded-lg border bg-white p-8 text-center">
          <p className="text-sm text-red-600">{error || 'Remittance not found'}</p>
        </div>
      </div>
    );
  }

  const invoiceTotal = remittance.invoiceAllocations.reduce(
    (s, a) => s + Number(a.amount),
    0,
  );
  const creditTotal = remittance.creditNoteAllocations.reduce(
    (s, a) => s + Number(a.amount),
    0,
  );
  const netPayable = invoiceTotal - creditTotal;

  return (
    <div className="space-y-6">
      <Link to="/partner/remittances" className="text-sm font-medium text-primary hover:underline">
        &larr; Back to Remittances
      </Link>

      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-gray-900">
          Remittance {remittance.partnerRef ? `— ${remittance.partnerRef}` : ''}
        </h1>
        <span
          className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${STATUS_COLORS[remittance.status] ?? 'bg-gray-100 text-gray-800'}`}
        >
          {STATUS_LABELS[remittance.status] ?? remittance.status}
        </span>
      </div>

      {/* Info */}
      <div className="rounded-lg border bg-white shadow-sm">
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Payment Details</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 px-6 py-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase">Payment Amount</p>
            <p className="mt-1 text-sm font-medium text-gray-900">
              R {Number(remittance.totalAmount).toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase">Reference</p>
            <p className="mt-1 text-sm text-gray-900">{remittance.partnerRef ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase">Period</p>
            <p className="mt-1 text-sm text-gray-900">
              {remittance.periodFrom && remittance.periodTo
                ? `${new Date(remittance.periodFrom).toLocaleDateString('en-ZA')} — ${new Date(remittance.periodTo).toLocaleDateString('en-ZA')}`
                : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase">Submitted</p>
            <p className="mt-1 text-sm text-gray-900">
              {new Date(remittance.createdAt).toLocaleDateString('en-ZA', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          </div>
        </div>
      </div>

      {/* Review notes / dispute */}
      {remittance.reviewNotes && (
        <div
          className={`rounded-lg border p-4 ${
            remittance.status === 'DISPUTED'
              ? 'border-red-200 bg-red-50'
              : 'border-blue-200 bg-blue-50'
          }`}
        >
          <p className="text-sm font-medium text-gray-700 mb-1">
            {remittance.status === 'DISPUTED' ? 'Dispute Reason' : 'Review Notes'}
          </p>
          <p className="text-sm text-gray-600">{remittance.reviewNotes}</p>
        </div>
      )}

      {/* Invoice allocations */}
      <div className="rounded-lg border bg-white shadow-sm">
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Allocated Invoices</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-gray-600">
                <th className="px-6 py-3 font-medium">Invoice</th>
                <th className="px-6 py-3 font-medium">Date</th>
                <th className="px-6 py-3 font-medium text-right">Invoice Total</th>
                <th className="px-6 py-3 font-medium text-right">Allocated</th>
              </tr>
            </thead>
            <tbody>
              {remittance.invoiceAllocations.map((a) => (
                <tr key={a.id} className="border-b last:border-0">
                  <td className="px-6 py-3 font-medium text-gray-900">{a.invoice.number}</td>
                  <td className="px-6 py-3 text-gray-500">
                    {new Date(a.invoice.invoiceDate).toLocaleDateString('en-ZA')}
                  </td>
                  <td className="px-6 py-3 text-right text-gray-600">
                    R {Number(a.invoice.total).toFixed(2)}
                  </td>
                  <td className="px-6 py-3 text-right font-medium text-gray-900">
                    R {Number(a.amount).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Credit note allocations */}
      {remittance.creditNoteAllocations.length > 0 && (
        <div className="rounded-lg border bg-white shadow-sm">
          <div className="border-b px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Applied Credit Notes</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-gray-600">
                  <th className="px-6 py-3 font-medium">Credit Note</th>
                  <th className="px-6 py-3 font-medium">Applied to Invoice</th>
                  <th className="px-6 py-3 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {remittance.creditNoteAllocations.map((a) => (
                  <tr key={a.id} className="border-b last:border-0">
                    <td className="px-6 py-3 font-medium text-green-700">
                      {a.creditNote.number}
                    </td>
                    <td className="px-6 py-3 text-gray-600">{a.invoice.number}</td>
                    <td className="px-6 py-3 text-right font-medium text-green-700">
                      - R {Number(a.amount).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Reconciliation summary */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Reconciliation Summary</h3>
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Total Invoices</span>
            <span className="font-medium text-gray-900">R {invoiceTotal.toFixed(2)}</span>
          </div>
          {creditTotal > 0 && (
            <div className="flex justify-between">
              <span className="text-green-700">Less: Credit Notes Applied</span>
              <span className="font-medium text-green-700">- R {creditTotal.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-gray-300 pt-2 text-base font-bold">
            <span className="text-gray-800">Net Payment Due</span>
            <span className="text-gray-900">R {netPayable.toFixed(2)}</span>
          </div>
          <div className="flex justify-between pt-1">
            <span className="text-gray-600">Declared Payment</span>
            <span className="font-medium text-gray-900">
              R {Number(remittance.totalAmount).toFixed(2)}
            </span>
          </div>
          {Math.abs(Number(remittance.totalAmount) - netPayable) > 1 && (
            <div className="mt-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
              The declared payment amount differs from the calculated net by R{' '}
              {Math.abs(Number(remittance.totalAmount) - netPayable).toFixed(2)}.
            </div>
          )}
        </div>
      </div>

      {/* Notes */}
      {remittance.notes && (
        <div className="rounded-lg border bg-white shadow-sm">
          <div className="border-b px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Notes</h2>
          </div>
          <div className="px-6 py-4">
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{remittance.notes}</p>
          </div>
        </div>
      )}
    </div>
  );
}
