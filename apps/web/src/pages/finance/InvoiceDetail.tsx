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
    </div>
  );
}
