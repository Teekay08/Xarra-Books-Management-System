import { useParams, Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

interface CreditNote {
  id: string;
  number: string;
  invoiceId: string;
  partnerId: string;
  subtotal: string;
  vatAmount: string;
  total: string;
  reason: string;
  pdfUrl: string | null;
  voidedAt: string | null;
  voidedReason: string | null;
  createdBy: string | null;
  createdAt: string;
  partner: { name: string };
  invoice: { number: string };
}

function InfoCard({ label, value, color }: { label: string; value: string; color?: string }) {
  const textColor = color === 'green' ? 'text-green-600' : color === 'red' ? 'text-red-600' : 'text-gray-900';
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs text-gray-500 uppercase">{label}</p>
      <p className={`text-lg font-bold mt-1 ${textColor}`}>{value}</p>
    </div>
  );
}

export function CreditNoteDetail() {
  const { id } = useParams();

  const { data, isLoading } = useQuery({
    queryKey: ['credit-note', id],
    queryFn: () => api<{ data: CreditNote }>(`/finance/credit-notes/${id}`),
  });

  if (isLoading) return <div className="py-12 text-center text-gray-400">Loading...</div>;
  if (!data?.data) return <div className="py-12 text-center text-gray-400">Credit note not found.</div>;

  const cn = data.data;
  const isVoided = !!cn.voidedAt;

  return (
    <div>
      <PageHeader
        title={cn.number}
        subtitle={`Credit Note for ${cn.partner.name}`}
        action={
          cn.pdfUrl ? (
            <a
              href={cn.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              PDF
            </a>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <InfoCard label="Partner" value={cn.partner.name} />
        <InfoCard label="Invoice" value={cn.invoice.number} />
        <InfoCard label="Date" value={new Date(cn.createdAt).toLocaleDateString('en-ZA')} />
        <InfoCard
          label="Status"
          value={isVoided ? 'Voided' : 'Active'}
          color={isVoided ? 'red' : 'green'}
        />
      </div>

      {/* Financial summary */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 mb-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Financial Summary</h3>
        <div className="w-72 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Subtotal</span>
            <span className="font-mono">R {Number(cn.subtotal).toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">VAT (15%)</span>
            <span className="font-mono">R {Number(cn.vatAmount).toFixed(2)}</span>
          </div>
          <div className="flex justify-between border-t pt-1 font-bold text-base">
            <span>Total</span>
            <span className="font-mono">R {Number(cn.total).toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Reason */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 mb-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Reason</h3>
        <p className="text-sm text-gray-600 whitespace-pre-wrap">{cn.reason}</p>
      </div>

      {/* Voided info */}
      {isVoided && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 mb-6">
          <p className="text-sm font-medium text-red-700">Voided</p>
          <p className="text-sm text-red-600 mt-1">
            {new Date(cn.voidedAt!).toLocaleDateString('en-ZA')}
          </p>
          {cn.voidedReason && (
            <p className="text-sm text-red-600 mt-1">{cn.voidedReason}</p>
          )}
        </div>
      )}

      <Link to="/credit-notes" className="text-sm text-green-700 hover:underline">
        &larr; Back to Credit Notes
      </Link>
    </div>
  );
}
