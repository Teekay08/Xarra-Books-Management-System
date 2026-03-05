import { useParams, Link } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

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

interface Remittance {
  id: string;
  partnerId: string;
  partnerRef: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  totalAmount: string;
  status: string;
  notes: string | null;
  createdAt: string;
  partner: { name: string };
  invoiceAllocations: InvoiceAllocation[];
}

export function RemittanceDetail() {
  const { id } = useParams();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['remittance', id],
    queryFn: () => api<{ data: Remittance }>(`/finance/remittances/${id}`),
  });

  const matchMutation = useMutation({
    mutationFn: (paymentId: string) =>
      api(`/finance/remittances/${id}/match`, {
        method: 'POST',
        body: JSON.stringify({ paymentId }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['remittance', id] }),
  });

  if (isLoading) return <div className="py-12 text-center text-gray-400">Loading...</div>;
  if (!data?.data) return <div className="py-12 text-center text-gray-400">Remittance not found.</div>;

  const r = data.data;
  const remittanceAmount = Number(r.totalAmount);
  const allocatedTotal = r.invoiceAllocations.reduce((s, a) => s + Number(a.amount), 0);
  const diff = remittanceAmount - allocatedTotal;

  return (
    <div>
      <PageHeader title="Remittance Detail" subtitle={`From ${r.partner.name}`} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <InfoCard label="Amount Received" value={`R ${remittanceAmount.toFixed(2)}`} />
        <InfoCard label="Date" value={new Date(r.createdAt).toLocaleDateString()} />
        <InfoCard label="Status" value={r.status} />
        <InfoCard
          label="Unallocated"
          value={`R ${Math.abs(diff).toFixed(2)}`}
          color={diff === 0 ? 'green' : 'amber'}
        />
      </div>

      {r.partnerRef && (
        <p className="text-sm text-gray-500 mb-2">Reference: {r.partnerRef}</p>
      )}
      {r.periodFrom && r.periodTo && (
        <p className="text-sm text-gray-500 mb-2">
          Period: {new Date(r.periodFrom).toLocaleDateString()} – {new Date(r.periodTo).toLocaleDateString()}
        </p>
      )}
      {r.notes && (
        <p className="text-sm text-gray-500 mb-6">Notes: {r.notes}</p>
      )}

      {r.invoiceAllocations.length > 0 && (
        <>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Linked Invoices</h2>
          <div className="space-y-4 mb-6">
            {r.invoiceAllocations.map((alloc) => (
              <div key={alloc.id} className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 flex items-center justify-between">
                  <div>
                    <Link to={`/invoices/${alloc.invoice.id}`} className="text-sm font-medium text-green-700 hover:underline">
                      {alloc.invoice.number}
                    </Link>
                    <span className="ml-2 text-xs text-gray-500">
                      {new Date(alloc.invoice.invoiceDate).toLocaleDateString()}
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
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-sm text-gray-500 mb-6">
          No invoices linked to this remittance.
        </div>
      )}

      <Link to="/remittances" className="text-sm text-green-700 hover:underline">
        &larr; Back to Remittances
      </Link>
    </div>
  );
}

function InfoCard({ label, value, color }: { label: string; value: string; color?: string }) {
  const textColor = color === 'green' ? 'text-green-600' : color === 'amber' ? 'text-amber-600' : 'text-gray-900';
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs text-gray-500 uppercase">{label}</p>
      <p className={`text-lg font-bold mt-1 ${textColor}`}>{value}</p>
    </div>
  );
}
