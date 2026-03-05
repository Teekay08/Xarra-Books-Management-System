import { useState, type FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

interface InvoiceLine {
  id: string;
  lineNumber: number;
  description: string;
  quantity: string;
  unitPrice: string;
  discountPct: string;
  lineTotal: string;
  lineTax: string;
}

interface Invoice {
  id: string;
  number: string;
  invoiceDate: string;
  dueDate: string | null;
  subtotal: string;
  vatAmount: string;
  total: string;
  status: string;
  notes: string | null;
  issuedAt: string | null;
  voidedAt: string | null;
  voidedReason: string | null;
  partner: { name: string; contactName: string | null; contactEmail: string | null };
  lines: InvoiceLine[];
  creditNotes?: { id: string; number: string; total: string; reason: string }[];
}

const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  ISSUED: 'bg-blue-100 text-blue-700',
  PAID: 'bg-green-100 text-green-700',
  PARTIAL: 'bg-amber-100 text-amber-700',
  OVERDUE: 'bg-red-100 text-red-700',
  VOIDED: 'bg-red-50 text-red-400',
};

export function InvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => api<{ data: Invoice }>(`/finance/invoices/${id}`),
  });

  const issueMutation = useMutation({
    mutationFn: () => api(`/finance/invoices/${id}/issue`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invoice', id] }),
  });

  const voidMutation = useMutation({
    mutationFn: (reason: string) =>
      api(`/finance/invoices/${id}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invoice', id] }),
  });

  const [showCreditNoteModal, setShowCreditNoteModal] = useState(false);
  const [cnError, setCnError] = useState('');

  const creditNoteMutation = useMutation({
    mutationFn: (body: { reason: string; lines: { invoiceLineId: string; quantity: number }[] }) =>
      api(`/finance/invoices/${id}/credit-notes`, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'X-Idempotency-Key': crypto.randomUUID() },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      setShowCreditNoteModal(false);
    },
  });

  if (isLoading) return <div className="py-12 text-center text-gray-400">Loading...</div>;
  if (!data?.data) return <div className="py-12 text-center text-gray-400">Invoice not found</div>;

  const inv = data.data;

  return (
    <div>
      <PageHeader
        title={inv.number}
        subtitle={inv.partner.name}
        action={
          <div className="flex gap-2">
            {inv.status === 'DRAFT' && (
              <button
                onClick={() => issueMutation.mutate()}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Issue Invoice
              </button>
            )}
            <a
              href={`/api/v1/finance/invoices/${id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Download PDF
            </a>
            {inv.status !== 'VOIDED' && inv.status !== 'DRAFT' && (
              <button
                onClick={() => setShowCreditNoteModal(true)}
                className="rounded-md border border-amber-300 px-4 py-2 text-sm text-amber-700 hover:bg-amber-50"
              >
                Credit Note
              </button>
            )}
            {inv.status !== 'VOIDED' && (
              <button
                onClick={() => {
                  const reason = prompt('Reason for voiding this invoice:');
                  if (reason) voidMutation.mutate(reason);
                }}
                className="rounded-md border border-red-300 px-4 py-2 text-sm text-red-700 hover:bg-red-50"
              >
                Void
              </button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="grid grid-cols-4 gap-4 mb-6 text-sm">
              <div>
                <span className="text-xs text-gray-500 block">Status</span>
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium mt-1 ${statusColors[inv.status] ?? ''}`}>
                  {inv.status}
                </span>
              </div>
              <div>
                <span className="text-xs text-gray-500 block">Invoice Date</span>
                <span>{new Date(inv.invoiceDate).toLocaleDateString('en-ZA')}</span>
              </div>
              <div>
                <span className="text-xs text-gray-500 block">Due Date</span>
                <span>{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString('en-ZA') : '—'}</span>
              </div>
              <div>
                <span className="text-xs text-gray-500 block">Partner</span>
                <span>{inv.partner.name}</span>
              </div>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-gray-500">
                  <th className="pb-2">#</th>
                  <th className="pb-2">Description</th>
                  <th className="pb-2 text-right">Qty</th>
                  <th className="pb-2 text-right">Unit Price</th>
                  <th className="pb-2 text-right">Disc %</th>
                  <th className="pb-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {inv.lines.map((line) => (
                  <tr key={line.id}>
                    <td className="py-2">{line.lineNumber}</td>
                    <td className="py-2">{line.description}</td>
                    <td className="py-2 text-right font-mono">{line.quantity}</td>
                    <td className="py-2 text-right font-mono">R {Number(line.unitPrice).toFixed(2)}</td>
                    <td className="py-2 text-right">{Number(line.discountPct)}%</td>
                    <td className="py-2 text-right font-mono">R {Number(line.lineTotal).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex justify-end mt-4">
              <div className="w-64 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="font-mono">R {Number(inv.subtotal).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">VAT (15%)</span>
                  <span className="font-mono">R {Number(inv.vatAmount).toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-t pt-1 font-bold text-base">
                  <span>Total</span>
                  <span className="font-mono">R {Number(inv.total).toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {inv.voidedReason && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-medium text-red-700">Voided</p>
              <p className="text-sm text-red-600 mt-1">{inv.voidedReason}</p>
            </div>
          )}

          {inv.creditNotes && inv.creditNotes.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Credit Notes</h3>
              <div className="divide-y">
                {inv.creditNotes.map((cn) => (
                  <div key={cn.id} className="py-2 flex justify-between text-sm">
                    <div>
                      <span className="font-mono">{cn.number}</span>
                      <span className="text-gray-500 ml-2">{cn.reason}</span>
                    </div>
                    <span className="font-mono text-red-600">-R {Number(cn.total).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {inv.notes && (
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Notes</h3>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{inv.notes}</p>
          </div>
        )}
      </div>

      {showCreditNoteModal && (
        <CreditNoteModal
          lines={inv.lines}
          error={cnError}
          isPending={creditNoteMutation.isPending}
          onClose={() => { setShowCreditNoteModal(false); setCnError(''); }}
          onSubmit={(reason, lines) => {
            setCnError('');
            creditNoteMutation.mutate({ reason, lines }, { onError: (err) => setCnError(err.message) });
          }}
        />
      )}
    </div>
  );
}

function CreditNoteModal({ lines, error, isPending, onClose, onSubmit }: {
  lines: InvoiceLine[];
  error: string;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (reason: string, lines: { invoiceLineId: string; quantity: number }[]) => void;
}) {
  const [reason, setReason] = useState('');
  const [selectedLines, setSelectedLines] = useState<Record<string, number>>({});

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const cnLines = Object.entries(selectedLines)
      .filter(([, qty]) => qty > 0)
      .map(([invoiceLineId, quantity]) => ({ invoiceLineId, quantity }));
    if (cnLines.length === 0) return;
    onSubmit(reason, cnLines);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Create Credit Note</h3>
          {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason *</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="e.g. Damaged goods returned" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Select line items to credit</label>
            <div className="border rounded-md divide-y">
              {lines.map((line) => (
                <div key={line.id} className="flex items-center gap-3 px-3 py-2">
                  <input type="number" min={0} max={Number(line.quantity)}
                    value={selectedLines[line.id] ?? 0}
                    onChange={(e) => setSelectedLines((prev) => ({ ...prev, [line.id]: Number(e.target.value) }))}
                    className="w-16 rounded border border-gray-300 px-2 py-1 text-sm text-right" />
                  <div className="flex-1 text-sm">
                    <span className="text-gray-900">{line.description}</span>
                    <span className="text-gray-500 ml-2">({line.quantity} x R {Number(line.unitPrice).toFixed(2)})</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={isPending}
              className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">
              {isPending ? 'Creating...' : 'Create Credit Note'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
