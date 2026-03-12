import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { ActionMenu } from '../../components/ActionMenu';
import { RecipientEditModal, type RecipientDetails } from '../../components/RecipientEditModal';
import { DocumentEmailModal } from '../../components/DocumentEmailModal';

interface QuotationLine {
  id: string;
  lineNumber: number;
  description: string;
  quantity: string;
  unitPrice: string;
  discountPct: string;
  lineTotal: string;
  lineTax: string;
}

interface Quotation {
  id: string;
  number: string;
  quotationDate: string;
  validUntil: string | null;
  subtotal: string;
  vatAmount: string;
  total: string;
  status: string;
  notes: string | null;
  partnerId: string;
  partner: {
    id: string;
    name: string;
    contactName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    province: string | null;
    postalCode: string | null;
    vatNumber: string | null;
  };
  lines: QuotationLine[];
  convertedInvoice: { id: string; number: string } | null;
}

const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  SENT: 'bg-blue-100 text-blue-700',
  ACCEPTED: 'bg-green-100 text-green-700',
  EXPIRED: 'bg-red-100 text-red-700',
  CONVERTED: 'bg-purple-100 text-purple-700',
};

export function QuotationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [showRecipientModal, setShowRecipientModal] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['quotation', id],
    queryFn: () => api<{ data: Quotation }>(`/finance/quotations/${id}`),
  });

  const convertMutation = useMutation({
    mutationFn: () =>
      api(`/finance/quotations/${id}/convert`, {
        method: 'POST',
        headers: { 'X-Idempotency-Key': crypto.randomUUID() },
      }),
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ['quotation', id] });
      navigate(`/invoices/${result.data.id}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api(`/finance/quotations/${id}`, { method: 'DELETE' }),
    onSuccess: () => navigate('/quotations'),
  });

  const sendMutation = useMutation({
    mutationFn: (data: { email: string; cc: string; bcc: string; subject: string; message: string }) =>
      api(`/finance/quotations/${id}/send`, {
        method: 'POST',
        body: JSON.stringify({
          recipientEmail: data.email,
          cc: data.cc || undefined,
          bcc: data.bcc || undefined,
          subject: data.subject,
          message: data.message || undefined,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotation', id] });
      setShowSendModal(false);
    },
  });

  if (isLoading) return <div className="py-12 text-center text-gray-400">Loading...</div>;
  if (!data?.data) return <div className="py-12 text-center text-gray-400">Quotation not found</div>;

  const q = data.data;
  const canConvert = q.status !== 'CONVERTED' && q.status !== 'EXPIRED';

  return (
    <div>
      <PageHeader
        title={q.number}
        subtitle={q.partner.name}
        action={
          <div className="flex gap-2">
            <a href={`/api/v1/finance/quotations/${id}/pdf`} target="_blank" rel="noopener noreferrer"
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
              PDF
            </a>
            <button
              onClick={() => {
                const w = window.open(`/api/v1/finance/quotations/${id}/pdf`, '_blank');
                w?.addEventListener('load', () => w.print());
              }}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Print
            </button>
            <button
              onClick={() => setShowSendModal(true)}
              className="rounded-md border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
            >
              Email to Partner
            </button>
            {canConvert && (
              <button
                onClick={() => {
                  if (confirm('Convert this quotation to an invoice?')) convertMutation.mutate();
                }}
                disabled={convertMutation.isPending}
                className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
              >
                {convertMutation.isPending ? 'Converting...' : 'Convert to Invoice'}
              </button>
            )}
            <ActionMenu items={[
              {
                label: 'Edit',
                onClick: () => navigate(`/quotations/${id}/edit`),
                hidden: q.status !== 'DRAFT',
              },
              {
                label: 'Delete',
                onClick: () => {
                  if (confirm('Delete this draft quotation? This cannot be undone.')) {
                    deleteMutation.mutate();
                  }
                },
                variant: 'danger',
                hidden: q.status !== 'DRAFT',
              },
            ]} />
          </div>
        }
      />

      <div className="max-w-3xl space-y-6">
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="grid grid-cols-4 gap-4 mb-6 text-sm">
            <div>
              <span className="text-xs text-gray-500 block">Status</span>
              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium mt-1 ${statusColors[q.status] ?? ''}`}>
                {q.status}
              </span>
            </div>
            <div>
              <span className="text-xs text-gray-500 block">Date</span>
              <span>{new Date(q.quotationDate).toLocaleDateString('en-ZA')}</span>
            </div>
            <div>
              <span className="text-xs text-gray-500 block">Valid Until</span>
              <span>{q.validUntil ? new Date(q.validUntil).toLocaleDateString('en-ZA') : '—'}</span>
            </div>
            <div>
              <span className="text-xs text-gray-500 block">Partner</span>
              <span className="flex items-center gap-1.5">
                {q.partner.name}
                <button onClick={() => setShowRecipientModal(true)} title="Edit recipient details"
                  className="text-gray-400 hover:text-green-700 transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
              </span>
              {q.partner.contactName && (
                <span className="text-xs text-gray-400 block">{q.partner.contactName}</span>
              )}
              {q.partner.contactEmail && (
                <span className="text-xs text-gray-400 block">{q.partner.contactEmail}</span>
              )}
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
              {q.lines.map((line) => (
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
                <span className="font-mono">R {Number(q.subtotal).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">VAT (15%)</span>
                <span className="font-mono">R {Number(q.vatAmount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t pt-1 font-bold text-base">
                <span>Total</span>
                <span className="font-mono">R {Number(q.total).toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        {q.convertedInvoice && (
          <div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
            <p className="text-sm text-purple-700">
              Converted to invoice{' '}
              <button onClick={() => navigate(`/invoices/${q.convertedInvoice!.id}`)}
                className="font-mono font-medium underline">{q.convertedInvoice.number}</button>
            </p>
          </div>
        )}

        {q.notes && (
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Notes</h3>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{q.notes}</p>
          </div>
        )}
      </div>

      {/* Send Email Modal */}
      {showSendModal && (
        <DocumentEmailModal
          title="Send Quotation via Email"
          documentNumber={q.number}
          pdfUrl={`/api/v1/finance/quotations/${id}/pdf`}
          defaultEmail={q.partner.contactEmail ?? ''}
          defaultSubject={`Quotation ${q.number} from Xarra Books`}
          isPending={sendMutation.isPending}
          error={sendMutation.isError ? (sendMutation.error as Error).message : undefined}
          onClose={() => setShowSendModal(false)}
          onSend={(data) => sendMutation.mutate(data)}
        />
      )}

      {/* Recipient Edit Modal */}
      {showRecipientModal && (
        <RecipientEditModal
          recipient={{
            partnerId: q.partnerId ?? q.partner.id,
            partnerName: q.partner.name,
            contactName: q.partner.contactName,
            contactEmail: q.partner.contactEmail,
            contactPhone: q.partner.contactPhone,
            addressLine1: q.partner.addressLine1,
            addressLine2: q.partner.addressLine2,
            city: q.partner.city,
            province: q.partner.province,
            postalCode: q.partner.postalCode,
            vatNumber: q.partner.vatNumber,
          }}
          onClose={() => setShowRecipientModal(false)}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ['quotation', id] })}
        />
      )}
    </div>
  );
}
