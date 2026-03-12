import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { ActionMenu } from '../../components/ActionMenu';
import { VoidReasonModal } from '../../components/VoidReasonModal';
import { InfoCard } from '../../components/InfoCard';
import { FinancialSummary } from '../../components/FinancialSummary';
import { VoidedBanner } from '../../components/VoidedBanner';

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
  status?: string;
  lines?: Array<{
    id: string;
    lineNumber: number;
    titleId: string | null;
    description: string;
    quantity: string;
    unitPrice: string;
    lineTotal: string;
    lineTax: string;
    title?: { title: string; isbn: string };
  }>;
}

export function CreditNoteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showVoidModal, setShowVoidModal] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['credit-note', id],
    queryFn: () => api<{ data: CreditNote }>(`/finance/credit-notes/${id}`),
  });

  const voidMutation = useMutation({
    mutationFn: (reason: string) =>
      api(`/finance/credit-notes/${id}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credit-note', id] });
      queryClient.invalidateQueries({ queryKey: ['credit-notes'] });
      setShowVoidModal(false);
    },
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
          <div className="flex gap-2 items-center">
            {cn.pdfUrl && (
              <a
                href={cn.pdfUrl}
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
                onClick: () => cn.pdfUrl && window.open(cn.pdfUrl, '_blank'),
                hidden: !cn.pdfUrl,
              },
              {
                label: 'Void Credit Note',
                onClick: () => setShowVoidModal(true),
                variant: 'danger',
                hidden: isVoided,
              },
            ]} />
          </div>
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

      <FinancialSummary subtotal={cn.subtotal} vatAmount={cn.vatAmount} total={cn.total} />

      {/* Reason */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 mb-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Reason</h3>
        <p className="text-sm text-gray-600 whitespace-pre-wrap">{cn.reason}</p>
      </div>

      {isVoided && <VoidedBanner voidedAt={cn.voidedAt!} voidedReason={cn.voidedReason} />}

      <Link to="/credit-notes" className="text-sm text-green-700 hover:underline">
        &larr; Back to Credit Notes
      </Link>

      {showVoidModal && (
        <VoidReasonModal
          title="Void Credit Note"
          description={`Void credit note ${cn.number}? This action cannot be undone.`}
          isPending={voidMutation.isPending}
          onClose={() => setShowVoidModal(false)}
          onConfirm={(reason) => voidMutation.mutate(reason)}
        />
      )}
    </div>
  );
}
