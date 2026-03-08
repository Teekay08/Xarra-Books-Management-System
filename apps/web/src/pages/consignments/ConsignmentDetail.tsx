import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

interface ConLine {
  id: string;
  qtyDispatched: number;
  qtySold: number;
  qtyReturned: number;
  qtyDamaged: number;
  unitRrp: string;
  discountPct: string;
  title?: { title: string; isbn13: string | null };
}

interface Consignment {
  id: string;
  proformaNumber: string | null;
  partnerPoNumber: string | null;
  dispatchDate: string | null;
  deliveryDate: string | null;
  sorExpiryDate: string | null;
  acknowledgedAt: string | null;
  reconciledAt: string | null;
  courierCompany: string | null;
  courierWaybill: string | null;
  status: string;
  notes: string | null;
  partner: { name: string; discountPct: string; contactEmail: string | null };
  lines: ConLine[];
}

const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  DISPATCHED: 'bg-blue-100 text-blue-700',
  DELIVERED: 'bg-indigo-100 text-indigo-700',
  ACKNOWLEDGED: 'bg-green-100 text-green-700',
  PARTIAL_RETURN: 'bg-amber-100 text-amber-700',
  RECONCILED: 'bg-purple-100 text-purple-700',
  CLOSED: 'bg-gray-100 text-gray-500',
};

const nextAction: Record<string, { label: string; endpoint: string; color: string }> = {
  DRAFT: { label: 'Dispatch', endpoint: 'dispatch', color: 'bg-blue-600 hover:bg-blue-700' },
  DISPATCHED: { label: 'Mark Delivered', endpoint: 'deliver', color: 'bg-indigo-600 hover:bg-indigo-700' },
  DELIVERED: { label: 'Acknowledge', endpoint: 'acknowledge', color: 'bg-green-600 hover:bg-green-700' },
  PARTIAL_RETURN: { label: 'Reconcile', endpoint: 'reconcile', color: 'bg-purple-600 hover:bg-purple-700' },
  RECONCILED: { label: 'Close', endpoint: 'close', color: 'bg-gray-600 hover:bg-gray-700' },
};

export function ConsignmentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['consignment', id],
    queryFn: () => api<{ data: Consignment }>(`/consignments/${id}`),
  });

  const advanceMutation = useMutation({
    mutationFn: (endpoint: string) =>
      api(`/consignments/${id}/${endpoint}`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['consignment', id] }),
  });

  const returnsMutation = useMutation({
    mutationFn: () =>
      api(`/consignments/${id}/process-returns`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['consignment', id] }),
  });

  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailAddress, setEmailAddress] = useState('');
  const [emailSent, setEmailSent] = useState(false);

  const emailMutation = useMutation({
    mutationFn: (email: string) =>
      api<{ data: { message: string } }>(`/consignments/${id}/send-proforma`, {
        method: 'POST',
        body: JSON.stringify({ email }),
      }),
    onSuccess: (res) => {
      setEmailSent(true);
      setShowEmailModal(false);
      alert(res.data.message);
    },
    onError: (err: any) => {
      alert(err.message || 'Failed to send email');
    },
  });

  if (isLoading) return <div className="py-12 text-center text-gray-400">Loading...</div>;
  if (!data?.data) return <div className="py-12 text-center text-gray-400">Consignment not found</div>;

  const con = data.data;
  const action = nextAction[con.status];

  const totalDispatched = con.lines.reduce((s, l) => s + l.qtyDispatched, 0);
  const totalSold = con.lines.reduce((s, l) => s + l.qtySold, 0);
  const totalReturned = con.lines.reduce((s, l) => s + l.qtyReturned, 0);
  const totalDamaged = con.lines.reduce((s, l) => s + l.qtyDamaged, 0);
  const outstanding = totalDispatched - totalSold - totalReturned - totalDamaged;

  return (
    <div>
      <PageHeader
        title={`Consignment — ${con.partner.name}`}
        subtitle={con.dispatchDate ? `Dispatched ${new Date(con.dispatchDate).toLocaleDateString('en-ZA')}` : 'Draft'}
        action={
          <div className="flex gap-2">
            <button
              onClick={() => window.open(`/api/v1/consignments/${id}/proforma-pdf`, '_blank')}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Download PDF
            </button>
            <button
              onClick={() => {
                const w = window.open(`/api/v1/consignments/${id}/proforma-pdf`, '_blank');
                w?.addEventListener('load', () => w.print());
              }}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Print
            </button>
            <button
              onClick={() => {
                setEmailAddress(con.partner.contactEmail ?? '');
                setShowEmailModal(true);
              }}
              disabled={emailMutation.isPending}
              className="rounded-md border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
            >
              {emailMutation.isPending ? 'Sending...' : emailSent ? 'Resend Email' : 'Email to Partner'}
            </button>
            {action && (
              <button
                onClick={() => advanceMutation.mutate(action.endpoint)}
                disabled={advanceMutation.isPending}
                className={`rounded-md px-4 py-2 text-sm font-medium text-white ${action.color} disabled:opacity-50`}
              >
                {action.label}
              </button>
            )}
            {['ACKNOWLEDGED', 'PARTIAL_RETURN'].includes(con.status) && (
              <button
                onClick={() => returnsMutation.mutate()}
                disabled={returnsMutation.isPending}
                className="rounded-md border border-amber-300 px-4 py-2 text-sm text-amber-700 hover:bg-amber-50"
              >
                Process Returns
              </button>
            )}
          </div>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <SummaryCard label="Status" value={con.status.replace(/_/g, ' ')} color={statusColors[con.status]} />
        <SummaryCard label="Dispatched" value={String(totalDispatched)} />
        <SummaryCard label="Sold" value={String(totalSold)} />
        <SummaryCard label="Returned" value={String(totalReturned + totalDamaged)} />
        <SummaryCard label="Outstanding" value={String(outstanding)} highlight={outstanding > 0} />
      </div>

      {/* Proforma & PO info */}
      {(con.proformaNumber || con.partnerPoNumber) && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 text-sm">
          <div className="flex gap-6">
            {con.proformaNumber && (
              <div>
                <span className="text-gray-500 font-medium">Pro-forma: </span>
                <span className="font-mono font-semibold">{con.proformaNumber}</span>
              </div>
            )}
            {con.partnerPoNumber && (
              <div>
                <span className="text-gray-500 font-medium">Partner PO: </span>
                <span className="font-mono font-semibold">{con.partnerPoNumber}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SOR info */}
      {con.sorExpiryDate && (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm">
          <div className="flex gap-6">
            <div>
              <span className="text-blue-600 font-medium">SOR Expiry: </span>
              {new Date(con.sorExpiryDate).toLocaleDateString('en-ZA')}
              {(() => {
                const days = Math.ceil((new Date(con.sorExpiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                return <span className={`ml-1 ${days <= 14 ? 'text-red-600 font-bold' : ''}`}>({days} days)</span>;
              })()}
            </div>
            {con.courierCompany && <div><span className="text-blue-600 font-medium">Courier: </span>{con.courierCompany}</div>}
            {con.courierWaybill && <div><span className="text-blue-600 font-medium">Waybill: </span>{con.courierWaybill}</div>}
          </div>
        </div>
      )}

      {/* Line items */}
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Line Items</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-gray-500">
              <th className="pb-2">Title</th>
              <th className="pb-2 text-right">RRP</th>
              <th className="pb-2 text-right">Disc %</th>
              <th className="pb-2 text-right">Dispatched</th>
              <th className="pb-2 text-right">Sold</th>
              <th className="pb-2 text-right">Returned</th>
              <th className="pb-2 text-right">Damaged</th>
              <th className="pb-2 text-right">Outstanding</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {con.lines.map((line) => {
              const lineOutstanding = line.qtyDispatched - line.qtySold - line.qtyReturned - line.qtyDamaged;
              return (
                <tr key={line.id}>
                  <td className="py-2">
                    <p className="font-medium">{line.title?.title ?? '—'}</p>
                    {line.title?.isbn13 && <p className="text-xs text-gray-400">{line.title.isbn13}</p>}
                  </td>
                  <td className="py-2 text-right font-mono">R {Number(line.unitRrp).toFixed(2)}</td>
                  <td className="py-2 text-right">{Number(line.discountPct)}%</td>
                  <td className="py-2 text-right font-mono">{line.qtyDispatched}</td>
                  <td className="py-2 text-right font-mono text-green-700">{line.qtySold}</td>
                  <td className="py-2 text-right font-mono text-blue-600">{line.qtyReturned}</td>
                  <td className="py-2 text-right font-mono text-red-600">{line.qtyDamaged}</td>
                  <td className={`py-2 text-right font-mono font-semibold ${lineOutstanding > 0 ? 'text-amber-600' : 'text-gray-500'}`}>
                    {lineOutstanding}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {con.notes && (
        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Notes</h3>
          <p className="text-sm text-gray-600 whitespace-pre-wrap">{con.notes}</p>
        </div>
      )}

      {/* Email Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              Email SOR Pro-Forma
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Send <span className="font-mono font-medium">{con.proformaNumber}</span> to the partner as a PDF attachment.
            </p>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Recipient Email
            </label>
            <input
              type="email"
              value={emailAddress}
              onChange={(e) => setEmailAddress(e.target.value)}
              placeholder="partner@example.com"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setShowEmailModal(false)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => emailMutation.mutate(emailAddress)}
                disabled={!emailAddress || emailMutation.isPending}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {emailMutation.isPending ? 'Sending...' : 'Send Email'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, color, highlight }: {
  label: string; value: string; color?: string; highlight?: boolean;
}) {
  return (
    <div className={`rounded-lg border p-4 ${highlight ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'}`}>
      <p className="text-xs text-gray-500">{label}</p>
      {color ? (
        <span className={`inline-block mt-1 rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>{value}</span>
      ) : (
        <p className={`text-xl font-bold mt-1 ${highlight ? 'text-amber-700' : 'text-gray-900'}`}>{value}</p>
      )}
    </div>
  );
}
