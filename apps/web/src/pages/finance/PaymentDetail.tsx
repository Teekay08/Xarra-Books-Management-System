import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

interface PaymentAllocation {
  id: string;
  amount: string;
  invoice: {
    number: string;
  };
}

interface Payment {
  id: string;
  partnerId: string;
  branchId: string | null;
  amount: string;
  paymentDate: string;
  paymentMethod: string;
  bankReference: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  partner: { name: string };
  allocations: PaymentAllocation[];
}

export function PaymentDetail() {
  const { id } = useParams();

  const { data, isLoading } = useQuery({
    queryKey: ['payment', id],
    queryFn: () => api<{ data: Payment }>(`/finance/payments/${id}`),
  });

  if (isLoading) return <div className="py-12 text-center text-gray-400">Loading...</div>;
  if (!data?.data) return <div className="py-12 text-center text-gray-400">Payment not found.</div>;

  const p = data.data;

  return (
    <div>
      <PageHeader
        title="Payment Detail"
        subtitle={p.bankReference ? `Ref: ${p.bankReference}` : 'No reference'}
        backTo={{ label: 'Back to Payments', href: '/payments' }}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <InfoCard label="Partner" value={p.partner.name} />
        <InfoCard label="Payment Date" value={new Date(p.paymentDate).toLocaleDateString('en-ZA')} />
        <InfoCard label="Method" value={p.paymentMethod} />
        <InfoCard label="Amount" value={`R ${Number(p.amount).toFixed(2)}`} />
      </div>

      {p.bankReference && (
        <p className="text-sm text-gray-500 mb-2">Bank Reference: {p.bankReference}</p>
      )}

      {/* Allocations */}
      {p.allocations.length > 0 ? (
        <>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Allocations</h2>
          <div className="rounded-lg border border-gray-200 bg-white overflow-hidden mb-6">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Invoice #</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Amount Allocated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {p.allocations.map((alloc) => (
                  <tr key={alloc.id}>
                    <td className="px-4 py-2 text-sm text-green-700 font-medium">{alloc.invoice.number}</td>
                    <td className="px-4 py-2 text-sm text-gray-900 text-right font-mono">R {Number(alloc.amount).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-sm text-gray-500 mb-6">
          No allocations linked to this payment.
        </div>
      )}

      {/* Notes */}
      {p.notes && (
        <div className="rounded-lg border border-gray-200 bg-white p-5 mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Notes</h3>
          <p className="text-sm text-gray-600 whitespace-pre-wrap">{p.notes}</p>
        </div>
      )}

    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs text-gray-500 uppercase">{label}</p>
      <p className="text-lg font-bold mt-1 text-gray-900">{value}</p>
    </div>
  );
}
