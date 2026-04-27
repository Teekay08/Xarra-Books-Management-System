import { useState } from 'react';
import { useParams, Link } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

interface ReturnLine {
  id: string;
  titleId: string;
  title?: { title: string; isbn13?: string | null };
  quantity: number;
  condition: string;
  notes?: string | null;
  qtyAccepted?: number | null;
}

interface ReturnDetail {
  id: string;
  number: string;
  status: string;
  reason: string;
  partnerId: string;
  partner?: { name: string; contactEmail?: string | null };
  consignment?: { number: string } | null;
  invoiceId?: string | null;
  rejectionReason?: string | null;
  courierCompany?: string | null;
  courierWaybill?: string | null;
  authorisedAt?: string | null;
  receivedAt?: string | null;
  inspectedAt?: string | null;
  creditNoteId?: string | null;
  creditNote?: { number: string } | null;
  notes?: string | null;
  grnNumber?: string | null;
  grnIssuedAt?: string | null;
  deliverySignedBy?: string | null;
  lines: ReturnLine[];
  createdAt: string;
}

// 7-step workflow definition
const STEPS = [
  { key: 'DRAFT',      label: 'Return Logged',           description: 'Return request received and logged' },
  { key: 'AUTHORIZED', label: 'Authorised',               description: 'Reviewed and authorised, RA sent to partner' },
  { key: 'IN_TRANSIT', label: 'Goods In Transit',         description: 'Partner has shipped goods back' },
  { key: 'RECEIVED',   label: 'Goods Received',           description: 'Warehouse received and signed for goods' },
  { key: 'INSPECTED',  label: 'Inspected',                description: 'Per-title condition assessed' },
  { key: 'VERIFIED',   label: 'Verified',                 description: 'Manager verified inspection results' },
  { key: 'PROCESSED',  label: 'Credit Issued',            description: 'Credit note generated and partner notified' },
] as const;

type StepKey = (typeof STEPS)[number]['key'];

const STEP_ORDER: StepKey[] = STEPS.map(s => s.key);

const REJECTED_STATUSES = ['REJECTED'];

function getStepIndex(status: string): number {
  const map: Record<string, number> = {
    DRAFT: 0, SUBMITTED: 0, UNDER_REVIEW: 0,
    AUTHORIZED: 1,
    IN_TRANSIT: 2,
    RECEIVED: 3,
    INSPECTED: 4,
    VERIFIED: 5,
    PROCESSED: 6, CREDIT_ISSUED: 6,
  };
  return map[status] ?? 0;
}

export function ReturnDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [authoriseModalOpen, setAuthoriseModalOpen] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [inTransitData, setInTransitData] = useState({ courierCompany: '', courierWaybill: '' });
  const [receiveData, setReceiveData] = useState({ deliverySignedBy: '' });
  const [showInTransitForm, setShowInTransitForm] = useState(false);
  const [showReceiveForm, setShowReceiveForm] = useState(false);

  const { data: raData, isLoading } = useQuery({
    queryKey: ['return-detail', id],
    queryFn: () => api<{ data: ReturnDetail }>(`/returns/${id}`),
  });

  const ra = raData?.data;

  const authoriseMutation = useMutation({
    mutationFn: (body: object) => api(`/returns/${id}/authorise`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['return-detail', id] }); setAuthoriseModalOpen(false); },
  });

  const rejectMutation = useMutation({
    mutationFn: () => api(`/returns/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason: rejectionReason }) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['return-detail', id] }); setRejectModalOpen(false); },
  });

  const inTransitMutation = useMutation({
    mutationFn: () => api(`/returns/${id}/in-transit`, { method: 'POST', body: JSON.stringify(inTransitData) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['return-detail', id] }); setShowInTransitForm(false); },
  });

  const receiveMutation = useMutation({
    mutationFn: () => api(`/returns/${id}/receive`, { method: 'POST', body: JSON.stringify(receiveData) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['return-detail', id] }); setShowReceiveForm(false); },
  });

  const inspectMutation = useMutation({
    mutationFn: () => api(`/returns/${id}/inspect`, { method: 'POST', body: '{}' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['return-detail', id] }),
  });

  const processMutation = useMutation({
    mutationFn: () => api(`/returns/${id}/process`, { method: 'POST', body: '{}' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['return-detail', id] }),
  });

  if (isLoading) return <div className="p-8 text-center text-gray-400">Loading...</div>;
  if (!ra) return <div className="p-8 text-center text-gray-400">Return not found</div>;

  const currentStepIdx = getStepIndex(ra.status);
  const isRejected = REJECTED_STATUSES.includes(ra.status);

  // CTA for current step
  const renderCTA = () => {
    if (isRejected) return null;
    switch (ra.status) {
      case 'DRAFT':
      case 'SUBMITTED':
      case 'UNDER_REVIEW':
        return (
          <div className="flex gap-3">
            <button onClick={() => setAuthoriseModalOpen(true)} className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700">
              ✓ Authorise Return
            </button>
            <button onClick={() => setRejectModalOpen(true)} className="px-4 py-2 border border-red-300 text-red-600 text-sm rounded-lg hover:bg-red-50">
              ✕ Reject
            </button>
          </div>
        );
      case 'AUTHORIZED':
        return showInTransitForm ? (
          <div className="flex flex-col gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl max-w-md">
            <p className="text-sm font-medium text-blue-800">Log Return Shipment</p>
            <input type="text" placeholder="Courier company" value={inTransitData.courierCompany}
              onChange={e => setInTransitData(d => ({ ...d, courierCompany: e.target.value }))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <input type="text" placeholder="Waybill number" value={inTransitData.courierWaybill}
              onChange={e => setInTransitData(d => ({ ...d, courierWaybill: e.target.value }))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <div className="flex gap-2">
              <button onClick={() => inTransitMutation.mutate()} disabled={inTransitMutation.isPending}
                className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg disabled:opacity-50">
                {inTransitMutation.isPending ? 'Saving...' : 'Mark In Transit'}
              </button>
              <button onClick={() => setShowInTransitForm(false)} className="px-3 py-1.5 border border-gray-300 text-gray-600 text-sm rounded-lg">Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowInTransitForm(true)} className="px-4 py-2 bg-[#8B1A1A] text-white text-sm rounded-lg hover:bg-[#7a1717]">
            Log Return Shipment
          </button>
        );
      case 'IN_TRANSIT':
        return showReceiveForm ? (
          <div className="flex flex-col gap-3 p-4 bg-indigo-50 border border-indigo-200 rounded-xl max-w-md">
            <p className="text-sm font-medium text-indigo-800">Confirm Goods Received</p>
            <input type="text" placeholder="Signed by (warehouse staff name)" value={receiveData.deliverySignedBy}
              onChange={e => setReceiveData(d => ({ ...d, deliverySignedBy: e.target.value }))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <div className="flex gap-2">
              <button onClick={() => receiveMutation.mutate()} disabled={receiveMutation.isPending}
                className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg disabled:opacity-50">
                {receiveMutation.isPending ? 'Saving...' : 'Confirm Received'}
              </button>
              <button onClick={() => setShowReceiveForm(false)} className="px-3 py-1.5 border border-gray-300 text-gray-600 text-sm rounded-lg">Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowReceiveForm(true)} className="px-4 py-2 bg-[#8B1A1A] text-white text-sm rounded-lg hover:bg-[#7a1717]">
            Confirm Goods Received
          </button>
        );
      case 'RECEIVED':
        return (
          <div className="space-y-3">
            {ra.grnNumber && (
              <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                <div>
                  <p className="text-xs font-semibold text-green-800">
                    GRN issued: <span className="font-mono">{ra.grnNumber}</span>
                    {ra.deliverySignedBy && <span className="font-normal text-green-700"> · Signed by {ra.deliverySignedBy}</span>}
                  </p>
                </div>
                <a href={`/api/v1/returns/${id}/grn`} target="_blank" rel="noopener noreferrer"
                  className="ml-auto text-xs text-green-700 underline whitespace-nowrap">
                  Print GRN →
                </a>
              </div>
            )}
            <p className="text-xs text-gray-500">Inspect each line item below, then mark as inspected.</p>
            <button onClick={() => inspectMutation.mutate()} disabled={inspectMutation.isPending}
              className="px-4 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 disabled:opacity-50">
              {inspectMutation.isPending ? 'Saving...' : 'Mark as Inspected'}
            </button>
          </div>
        );
      case 'INSPECTED':
        return (
          <button onClick={() => processMutation.mutate()} disabled={processMutation.isPending}
            className="px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-50">
            {processMutation.isPending ? 'Processing...' : 'Verify & Generate Credit Note'}
          </button>
        );
      case 'VERIFIED':
        return (
          <button onClick={() => processMutation.mutate()} disabled={processMutation.isPending}
            className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50">
            {processMutation.isPending ? 'Processing...' : 'Issue Credit Note'}
          </button>
        );
      default:
        return null;
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <PageHeader
        title={ra.number}
        subtitle={`Return from ${ra.partner?.name ?? '—'} · ${ra.reason}`}
        backTo={{ href: '/orders/returns', label: 'Returns' }}
        action={
          <div className="flex items-center gap-2">
            {ra.grnNumber && (
              <a
                href={`/api/v1/returns/${id}/grn`}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                GRN {ra.grnNumber}
              </a>
            )}
            <a
              href={`/api/v1/returns/${id}/pdf`}
              target="_blank" rel="noopener noreferrer"
              className="px-3 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 transition-colors"
            >
              RA PDF
            </a>
          </div>
        }
      />

      {/* 7-step workflow stepper */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-5">Returns Workflow</h2>

        {isRejected ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm font-semibold text-red-700">Return Rejected</p>
            {ra.rejectionReason && <p className="text-xs text-red-600 mt-1">Reason: {ra.rejectionReason}</p>}
          </div>
        ) : (
          <div className="space-y-3">
            {STEPS.map((step, idx) => {
              const isCompleted = idx < currentStepIdx;
              const isCurrent = idx === currentStepIdx;
              const isUpcoming = idx > currentStepIdx;

              return (
                <div key={step.key} className={`flex items-start gap-4 p-3 rounded-xl transition-colors ${
                  isCurrent ? 'bg-[#8B1A1A]/5 border border-[#8B1A1A]/20' :
                  isCompleted ? 'bg-green-50' : 'bg-gray-50 opacity-60'
                }`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ${
                    isCompleted ? 'bg-green-500 text-white' :
                    isCurrent ? 'bg-[#8B1A1A] text-white ring-2 ring-[#8B1A1A] ring-offset-1' :
                    'bg-gray-200 text-gray-500'
                  }`}>
                    {isCompleted ? '✓' : idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${isCurrent ? 'text-[#8B1A1A]' : isCompleted ? 'text-green-700' : 'text-gray-400'}`}>
                      {step.label}
                    </p>
                    <p className={`text-xs mt-0.5 ${isCurrent ? 'text-gray-600' : isCompleted ? 'text-green-600' : 'text-gray-400'}`}>
                      {step.description}
                    </p>
                    {/* Show GRN reference on the RECEIVED step whether current or completed */}
                    {step.key === 'RECEIVED' && ra.grnNumber && (isCompleted || isCurrent) && (
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs font-mono font-semibold text-green-700">{ra.grnNumber}</span>
                        <a href={`/api/v1/returns/${id}/grn`} target="_blank" rel="noopener noreferrer"
                          className="text-[10px] text-green-600 hover:underline">Print GRN</a>
                      </div>
                    )}
                    {isCurrent && (
                      <div className="mt-3">{renderCTA()}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Line items */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Line Items</h2>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Title</th>
              <th className="text-center py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Qty</th>
              <th className="text-center py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Condition</th>
              <th className="text-center py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Accepted</th>
              <th className="py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {ra.lines.map(line => (
              <tr key={line.id} className="hover:bg-gray-50">
                <td className="py-2.5 px-2">
                  <p className="font-medium">{line.title?.title ?? '—'}</p>
                  {line.title?.isbn13 && <p className="text-xs text-gray-400">{line.title.isbn13}</p>}
                </td>
                <td className="py-2.5 px-2 text-center font-semibold">{line.quantity}</td>
                <td className="py-2.5 px-2 text-center">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                    line.condition === 'GOOD' ? 'bg-green-100 text-green-700' :
                    line.condition === 'DAMAGED' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {line.condition}
                  </span>
                </td>
                <td className="py-2.5 px-2 text-center">
                  {line.qtyAccepted != null ? (
                    <span className="text-sm font-semibold text-green-700">{line.qtyAccepted}</span>
                  ) : (
                    <span className="text-gray-400 text-xs">Pending</span>
                  )}
                </td>
                <td className="py-2.5 px-2 text-xs text-gray-500">{line.notes ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cross-references */}
      {(ra.consignment || ra.creditNote || ra.grnNumber) && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Documents &amp; References</h2>
          <div className="flex flex-wrap gap-2">
            {ra.grnNumber && (
              <a href={`/api/v1/returns/${id}/grn`} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-800 border border-green-200 rounded-lg text-xs font-semibold hover:bg-green-100 transition-colors">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                GRN: {ra.grnNumber} ↗
              </a>
            )}
            {ra.consignment && (
              <Link to={`/consignments?search=${ra.consignment.number}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-yellow-50 text-yellow-800 border border-yellow-200 rounded-lg text-xs font-semibold hover:bg-yellow-100 transition-colors">
                SOR: {ra.consignment.number} →
              </Link>
            )}
            {ra.creditNote && (
              <Link to={`/credit-notes?search=${ra.creditNote.number}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-50 text-teal-800 border border-teal-200 rounded-lg text-xs font-semibold hover:bg-teal-100 transition-colors">
                Credit Note: {ra.creditNote.number} →
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Authorise modal */}
      {authoriseModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full space-y-4">
            <h2 className="text-lg font-bold">Authorise Return</h2>
            <p className="text-sm text-gray-600">
              Authorising will generate a Return Authorisation (RA) document and email it to the partner with return instructions.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => authoriseMutation.mutate({ sendEmail: true })}
                disabled={authoriseMutation.isPending}
                className="flex-1 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
              >
                {authoriseMutation.isPending ? 'Authorising...' : '✓ Authorise & Email Partner'}
              </button>
              <button onClick={() => setAuthoriseModalOpen(false)} className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-600">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Reject modal */}
      {rejectModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full space-y-4">
            <h2 className="text-lg font-bold text-red-700">Reject Return</h2>
            <textarea
              value={rejectionReason}
              onChange={e => setRejectionReason(e.target.value)}
              rows={3}
              placeholder="Reason for rejection (sent to partner)"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <div className="flex gap-3">
              <button
                onClick={() => rejectMutation.mutate()}
                disabled={!rejectionReason || rejectMutation.isPending}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {rejectMutation.isPending ? 'Rejecting...' : 'Reject Return'}
              </button>
              <button onClick={() => setRejectModalOpen(false)} className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-600">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
