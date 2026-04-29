import { useState } from 'react';
import { useParams, Link } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { ActionMenu } from '../../components/ActionMenu';
import { VoidReasonModal } from '../../components/VoidReasonModal';
import { InfoCard } from '../../components/InfoCard';
import { FinancialSummary } from '../../components/FinancialSummary';
import { VoidedBanner } from '../../components/VoidedBanner';

interface DebitNote {
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

export function DebitNoteDetail() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [showVoidModal, setShowVoidModal] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['debit-note', id],
    queryFn: () => api<{ data: DebitNote }>(`/finance/debit-notes/${id}`),
  });

  const voidMutation = useMutation({
    mutationFn: (reason: string) =>
      api(`/finance/debit-notes/${id}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['debit-note', id] });
      queryClient.invalidateQueries({ queryKey: ['debit-notes'] });
      setShowVoidModal(false);
    },
  });

  if (isLoading) return <div className="py-12 text-center text-gray-400">Loading...</div>;
  if (!data?.data) return <div className="py-12 text-center text-gray-400">Debit note not found.</div>;

  const dn = data.data;
  const isVoided = !!dn.voidedAt;

  return (
    <div>
      <PageHeader
        title={dn.number}
        subtitle={`Debit Note for ${dn.partner.name}`}
        backTo={{ label: 'Back to Debit Notes', href: '/debit-notes' }}
        action={
          <div className="flex gap-2 items-center">
            {dn.pdfUrl && (
              <a
                href={dn.pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                PDF
              </a>
            )}
            <ActionMenu items={[
              {
                label: 'Print',
                onClick: () => dn.pdfUrl && window.open(dn.pdfUrl, '_blank'),
                hidden: !dn.pdfUrl,
              },
              {
                label: 'Void Debit Note',
                onClick: () => setShowVoidModal(true),
                variant: 'danger',
                hidden: isVoided,
              },
            ]} />
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <InfoCard label="Partner" value={dn.partner.name} />
        <InfoCard label="Invoice" value={dn.invoice.number} />
        <InfoCard label="Date" value={new Date(dn.createdAt).toLocaleDateString('en-ZA')} />
        <InfoCard
          label="Status"
          value={isVoided ? 'Voided' : 'Active'}
          color={isVoided ? 'red' : 'green'}
        />
      </div>

      <FinancialSummary subtotal={dn.subtotal} vatAmount={dn.vatAmount} total={dn.total} />

      {/* Reason */}
      <div className="card p-4 mb-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Reason</h3>
        <p className="text-sm text-gray-600 whitespace-pre-wrap">{dn.reason}</p>
      </div>

      {isVoided && <VoidedBanner voidedAt={dn.voidedAt!} voidedReason={dn.voidedReason} />}

      {showVoidModal && (
        <VoidReasonModal
          title="Void Debit Note"
          description={`Void debit note ${dn.number}? This action cannot be undone.`}
          isPending={voidMutation.isPending}
          onClose={() => setShowVoidModal(false)}
          onConfirm={(reason) => voidMutation.mutate(reason)}
        />
      )}
    </div>
  );
}
