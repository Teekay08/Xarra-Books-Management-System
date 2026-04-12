import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { StockCheckModal } from './components/StockCheckModal';

// ── Types ────────────────────────────────────────────────────────────────────

interface OrderLine {
  id: string;
  titleId: string;
  title?: { id: string; title: string; isbn13: string | null };
  quantity: number;
  unitPrice: string;
  discountPct: string;
  lineTotal: string;
  qtyConfirmed?: number | null;
  qtyDispatched?: number | null;
  lineStatus: string;
  backorderQty: number;
  backorderEta?: string | null;
}

interface Order {
  id: string;
  number: string;
  customerPoNumber?: string | null;
  status: string;
  source: string;
  orderDate: string;
  expectedDeliveryDate?: string | null;
  deliveryAddress?: string | null;
  subtotal: string;
  vatAmount: string;
  total: string;
  courierCompany?: string | null;
  courierWaybill?: string | null;
  courierTrackingUrl?: string | null;
  dispatchedAt?: string | null;
  deliveredAt?: string | null;
  deliverySignedBy?: string | null;
  confirmedAt?: string | null;
  cancelledAt?: string | null;
  cancelReason?: string | null;
  notes?: string | null;
  internalNotes?: string | null;
  consignmentId?: string | null;
  invoiceId?: string | null;
  currentPipelineStep: number;
  backorderEta?: string | null;
  backorderNotes?: string | null;
  partner?: { id: string; name: string } | null;
  branch?: { id: string; name: string } | null;
  placedBy?: { id: string; name?: string | null; email?: string | null } | null;
  confirmedBy?: { id: string; name?: string | null; email?: string | null } | null;
  enteredBy?: { id: string; name?: string | null } | null;
  lines: OrderLine[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: string | number) =>
  'R\u00a0' + Number(n).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const fmtDateTime = (d?: string | null) =>
  d ? new Date(d).toLocaleString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  DRAFT:       { label: 'Draft',       color: 'text-gray-600',  bg: 'bg-gray-100' },
  SUBMITTED:   { label: 'Received',    color: 'text-blue-700',  bg: 'bg-blue-100' },
  RECEIVED:    { label: 'Received',    color: 'text-blue-700',  bg: 'bg-blue-100' },
  CONFIRMED:   { label: 'Confirmed',   color: 'text-indigo-700', bg: 'bg-indigo-100' },
  PROCESSING:  { label: 'Processing',  color: 'text-amber-700', bg: 'bg-amber-100' },
  DISPATCHED:  { label: 'Dispatched',  color: 'text-purple-700',bg: 'bg-purple-100' },
  DELIVERED:   { label: 'Delivered',   color: 'text-green-700', bg: 'bg-green-100' },
  BACK_ORDER:  { label: 'Back Order',  color: 'text-orange-700',bg: 'bg-orange-100' },
  CANCELLED:   { label: 'Cancelled',   color: 'text-red-700',   bg: 'bg-red-100' },
};

const PIPELINE_STAGES = [
  { key: 'RECEIVED',   label: 'Received',   statuses: ['DRAFT','SUBMITTED','RECEIVED','CONFIRMED'] },
  { key: 'PROCESSING', label: 'Processing', statuses: ['PROCESSING'] },
  { key: 'DISPATCHED', label: 'Dispatched', statuses: ['DISPATCHED'] },
  { key: 'DELIVERED',  label: 'Delivered',  statuses: ['DELIVERED'] },
];

function getStageIndex(status: string) {
  return PIPELINE_STAGES.findIndex(s => s.statuses.includes(status));
}

// ── Dispatch Modal ─────────────────────────────────────────────────────────────

interface DispatchModalProps {
  onClose: () => void;
  onSubmit: (data: { courierCompany: string; courierWaybill: string; courierTrackingUrl: string }) => void;
  isPending: boolean;
}

function DispatchModal({ onClose, onSubmit, isPending }: DispatchModalProps) {
  const [courierCompany, setCourierCompany] = useState('');
  const [courierWaybill, setCourierWaybill] = useState('');
  const [courierTrackingUrl, setCourierTrackingUrl] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Mark as Dispatched</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Courier Company
            </label>
            <input
              type="text"
              value={courierCompany}
              onChange={e => setCourierCompany(e.target.value)}
              placeholder="e.g. Fastway, CourierIT, DHL"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]/30 focus:border-[#8B1A1A]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Waybill Number <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={courierWaybill}
              onChange={e => setCourierWaybill(e.target.value)}
              placeholder="e.g. FW123456789"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]/30 focus:border-[#8B1A1A]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Tracking URL <span className="text-xs text-gray-400 font-normal normal-case">(optional)</span>
            </label>
            <input
              type="url"
              value={courierTrackingUrl}
              onChange={e => setCourierTrackingUrl(e.target.value)}
              placeholder="https://..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]/30 focus:border-[#8B1A1A]"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 pb-5">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            disabled={!courierWaybill || isPending}
            onClick={() => onSubmit({ courierCompany, courierWaybill, courierTrackingUrl })}
            className="px-5 py-2 bg-purple-600 text-white rounded-lg text-sm font-semibold hover:bg-purple-700 disabled:opacity-50"
          >
            {isPending ? 'Dispatching…' : 'Confirm Dispatch'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Deliver Modal ──────────────────────────────────────────────────────────────

interface DeliverModalProps {
  onClose: () => void;
  onSubmit: (data: { deliverySignedBy: string }) => void;
  isPending: boolean;
}

function DeliverModal({ onClose, onSubmit, isPending }: DeliverModalProps) {
  const [signedBy, setSignedBy] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Confirm Delivery</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Signed By <span className="text-xs text-gray-400 font-normal normal-case">(optional)</span>
            </label>
            <input
              type="text"
              value={signedBy}
              onChange={e => setSignedBy(e.target.value)}
              placeholder="Name of person who signed"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]/30 focus:border-[#8B1A1A]"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 pb-5">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50">
            Cancel
          </button>
          <button
            disabled={isPending}
            onClick={() => onSubmit({ deliverySignedBy: signedBy })}
            className="px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50"
          >
            {isPending ? 'Confirming…' : 'Confirm Delivery'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Cancel Modal ───────────────────────────────────────────────────────────────

interface CancelModalProps {
  onClose: () => void;
  onSubmit: (reason: string) => void;
  isPending: boolean;
}

function CancelModal({ onClose, onSubmit, isPending }: CancelModalProps) {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Cancel Order</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-600">This action cannot be undone. The partner will be notified.</p>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Cancellation Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              placeholder="Why is this order being cancelled?"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 pb-5">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50">
            Keep Order
          </button>
          <button
            disabled={!reason.trim() || isPending}
            onClick={() => onSubmit(reason)}
            className="px-5 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
          >
            {isPending ? 'Cancelling…' : 'Cancel Order'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [showDispatch, setShowDispatch] = useState(false);
  const [showDeliver, setShowDeliver] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [showStockCheck, setShowStockCheck] = useState(false);
  const [actionError, setActionError] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['order-detail', id],
    queryFn: () => api<{ data: Order }>(`/partner-admin/orders/${id}`),
    enabled: !!id,
  });
  const order = data?.data;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['order-detail', id] });
    queryClient.invalidateQueries({ queryKey: ['orders-hub'] });
  };

  const confirmMutation = useMutation({
    mutationFn: () => api(`/partner-admin/orders/${id}/confirm`, { method: 'POST' }),
    onSuccess: invalidate,
    onError: (err: any) => setActionError(err.message ?? 'Failed to confirm order'),
  });

  const processMutation = useMutation({
    mutationFn: () => api(`/partner-admin/orders/${id}/process`, { method: 'POST' }),
    onSuccess: invalidate,
    onError: (err: any) => setActionError(err.message ?? 'Failed to start processing'),
  });

  const pickingMutation = useMutation({
    mutationFn: () => api(`/order-tracking/orders/${id}/picking`, { method: 'POST' }),
    onSuccess: invalidate,
    onError: (err: any) => setActionError(err.message ?? 'Failed to mark picking'),
  });

  const packingMutation = useMutation({
    mutationFn: () => api(`/order-tracking/orders/${id}/packing`, { method: 'POST' }),
    onSuccess: invalidate,
    onError: (err: any) => setActionError(err.message ?? 'Failed to mark packing'),
  });

  const dispatchMutation = useMutation({
    mutationFn: (body: object) => api(`/partner-admin/orders/${id}/dispatch`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => { invalidate(); setShowDispatch(false); },
    onError: (err: any) => setActionError(err.message ?? 'Failed to dispatch order'),
  });

  const deliverMutation = useMutation({
    mutationFn: (body: object) => api(`/partner-admin/orders/${id}/deliver`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => { invalidate(); setShowDeliver(false); },
    onError: (err: any) => setActionError(err.message ?? 'Failed to confirm delivery'),
  });

  const cancelMutation = useMutation({
    mutationFn: (reason: string) => api(`/partner-admin/orders/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),
    onSuccess: () => { invalidate(); setShowCancel(false); },
    onError: (err: any) => setActionError(err.message ?? 'Failed to cancel order'),
  });

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3" />
          <div className="h-32 bg-gray-200 rounded-xl" />
          <div className="h-64 bg-gray-200 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="max-w-5xl mx-auto">
        <PageHeader title="Order Not Found" backTo={{ href: '/orders', label: 'Order Management' }} />
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700 text-sm">
          {(error as any)?.message ?? 'This order could not be found.'}
        </div>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[order.status] ?? { label: order.status, color: 'text-gray-600', bg: 'bg-gray-100' };
  const stageIdx = getStageIndex(order.status);
  const isCancelled = order.status === 'CANCELLED';
  const isBackorder = order.status === 'BACK_ORDER';
  const canConfirm = ['DRAFT','SUBMITTED','RECEIVED'].includes(order.status);
  const canProcess = order.status === 'CONFIRMED';
  const canStartPicking = order.status === 'PROCESSING' && order.currentPipelineStep < 2;
  const canStartPacking = order.status === 'PROCESSING' && order.currentPipelineStep === 2;
  const canDispatch = order.status === 'PROCESSING' && order.currentPipelineStep >= 3;
  const canDeliver = order.status === 'DISPATCHED';
  const canCancel = !['DELIVERED','CANCELLED'].includes(order.status);
  const showPickingSlip = order.currentPipelineStep >= 2;
  const showPackingList = order.currentPipelineStep >= 3;
  const showDeliveryNote = order.status === 'DISPATCHED' || order.status === 'DELIVERED';

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <PageHeader
        title={order.number}
        subtitle={`${order.partner?.name ?? '—'}${order.branch ? ` · ${order.branch.name}` : ''}`}
        backTo={{ href: '/orders', label: 'Order Management' }}
        action={
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${statusCfg.bg} ${statusCfg.color}`}>
              {statusCfg.label}
            </span>
          </div>
        }
      />

      {actionError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-center gap-2">
          <span className="text-red-400 shrink-0">⚠</span>
          {actionError}
          <button onClick={() => setActionError('')} className="ml-auto text-red-400 hover:text-red-600">×</button>
        </div>
      )}

      {/* ── Workflow Banner ─────────────────────────────────────────────────── */}
      {!isCancelled && !isBackorder && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700">Order Progress</h2>
          </div>

          {/* Stage stepper */}
          <div className="flex items-center">
            {PIPELINE_STAGES.map((stage, i) => {
              const done = stageIdx > i;
              const active = stageIdx === i;
              return (
                <div key={stage.key} className="flex items-center flex-1">
                  <div className="flex flex-col items-center flex-1">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                      done ? 'bg-green-500 text-white' :
                      active ? 'bg-[#8B1A1A] text-white ring-4 ring-[#8B1A1A]/20' :
                      'bg-gray-200 text-gray-400'
                    }`}>
                      {done ? (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        i + 1
                      )}
                    </div>
                    <span className={`mt-1.5 text-xs font-medium ${
                      done ? 'text-green-600' : active ? 'text-[#8B1A1A]' : 'text-gray-400'
                    }`}>
                      {stage.label}
                    </span>
                  </div>
                  {i < PIPELINE_STAGES.length - 1 && (
                    <div className={`h-0.5 flex-1 mx-2 transition-colors ${done ? 'bg-green-400' : 'bg-gray-200'}`} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Pipeline sub-steps (only visible in PROCESSING) */}
          {order.status === 'PROCESSING' && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-2">Processing pipeline</p>
              <div className="flex items-center gap-2 text-xs">
                {['Confirmed', 'Picking', 'Packing', 'Ready to Dispatch'].map((step, i) => (
                  <div key={step} className="flex items-center gap-1.5">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md font-medium ${
                      order.currentPipelineStep > i + 1 ? 'bg-green-50 text-green-700' :
                      order.currentPipelineStep === i + 1 ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' :
                      'bg-gray-50 text-gray-400'
                    }`}>
                      {order.currentPipelineStep > i + 1 && '✓ '}{step}
                    </span>
                    {i < 3 && <span className="text-gray-300">→</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap gap-2">
            {canConfirm && (
              <button
                onClick={() => { setActionError(''); setShowStockCheck(true); }}
                disabled={confirmMutation.isPending}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
              >
                {confirmMutation.isPending ? 'Confirming…' : '✓ Confirm Order'}
              </button>
            )}
            {canProcess && (
              <button
                onClick={() => { setActionError(''); processMutation.mutate(); }}
                disabled={processMutation.isPending}
                className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-semibold hover:bg-amber-600 disabled:opacity-50"
              >
                {processMutation.isPending ? 'Starting…' : '→ Start Processing'}
              </button>
            )}
            {canStartPicking && (
              <button
                onClick={() => { setActionError(''); pickingMutation.mutate(); }}
                disabled={pickingMutation.isPending}
                className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-semibold hover:bg-amber-600 disabled:opacity-50"
              >
                {pickingMutation.isPending ? 'Updating…' : '→ Start Picking'}
              </button>
            )}
            {canStartPacking && (
              <button
                onClick={() => { setActionError(''); packingMutation.mutate(); }}
                disabled={packingMutation.isPending}
                className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-semibold hover:bg-amber-600 disabled:opacity-50"
              >
                {packingMutation.isPending ? 'Updating…' : '→ Start Packing'}
              </button>
            )}
            {canDispatch && (
              <button
                onClick={() => { setActionError(''); setShowDispatch(true); }}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-semibold hover:bg-purple-700"
              >
                → Mark as Dispatched
              </button>
            )}
            {canDeliver && (
              <button
                onClick={() => { setActionError(''); setShowDeliver(true); }}
                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700"
              >
                ✓ Confirm Delivery
              </button>
            )}

            {/* Document downloads */}
            {showPickingSlip && (
              <a
                href={`/api/v1/order-tracking/orders/${id}/picking-slip`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 border border-gray-300 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-50 flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Picking Slip
              </a>
            )}
            {showPackingList && (
              <a
                href={`/api/v1/order-tracking/orders/${id}/packing-list`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 border border-gray-300 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-50 flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                Packing List
              </a>
            )}
            {showDeliveryNote && (
              <a
                href={`/api/v1/order-tracking/orders/${id}/delivery-note`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 border border-gray-300 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-50 flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                </svg>
                Delivery Note
              </a>
            )}

            {canCancel && (
              <button
                onClick={() => { setActionError(''); setShowCancel(true); }}
                className="px-3 py-2 border border-red-200 text-red-600 rounded-lg text-xs font-medium hover:bg-red-50 ml-auto"
              >
                Cancel Order
              </button>
            )}
          </div>
        </div>
      )}

      {/* Cancelled banner */}
      {isCancelled && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <svg className="w-5 h-5 text-red-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-red-700">Order Cancelled</p>
            {order.cancelReason && <p className="text-sm text-red-600 mt-0.5">{order.cancelReason}</p>}
            {order.cancelledAt && <p className="text-xs text-red-400 mt-1">{fmtDateTime(order.cancelledAt)}</p>}
          </div>
        </div>
      )}

      {/* Back-order banner */}
      {isBackorder && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-start gap-3">
          <svg className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-orange-700">Back Order</p>
            {order.backorderNotes && <p className="text-sm text-orange-600 mt-0.5">{order.backorderNotes}</p>}
            {order.backorderEta && <p className="text-xs text-orange-500 mt-1">Expected: {fmtDate(order.backorderEta)}</p>}
          </div>
        </div>
      )}

      {/* ── Details grid ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Order info */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-700">Order Details</h2>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 p-5 text-sm">
            <div>
              <dt className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Retail Partner</dt>
              <dd className="mt-0.5 font-semibold text-gray-900">
                {order.partner ? (
                  <Link to={`/partners/${order.partner.id}`} className="hover:text-[#8B1A1A] transition-colors">
                    {order.partner.name}
                  </Link>
                ) : '—'}
              </dd>
              {order.branch && <dd className="text-xs text-gray-500">{order.branch.name}</dd>}
            </div>
            <div>
              <dt className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Partner PO</dt>
              <dd className="mt-0.5 font-mono font-medium text-gray-900">{order.customerPoNumber ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Order Date</dt>
              <dd className="mt-0.5 text-gray-900">{fmtDateTime(order.orderDate)}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Expected Delivery</dt>
              <dd className="mt-0.5 text-gray-900">{fmtDate(order.expectedDeliveryDate)}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Order Source</dt>
              <dd className="mt-0.5 text-gray-900 capitalize">{order.source.toLowerCase()}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Status</dt>
              <dd className="mt-0.5">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${statusCfg.bg} ${statusCfg.color}`}>
                  {statusCfg.label}
                </span>
              </dd>
            </div>
            {order.deliveryAddress && (
              <div className="col-span-2">
                <dt className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Delivery Address</dt>
                <dd className="mt-0.5 text-gray-900">{order.deliveryAddress}</dd>
              </div>
            )}
            {order.confirmedAt && (
              <div>
                <dt className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Confirmed</dt>
                <dd className="mt-0.5 text-gray-900">{fmtDateTime(order.confirmedAt)}</dd>
              </div>
            )}
            {order.dispatchedAt && (
              <div>
                <dt className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Dispatched</dt>
                <dd className="mt-0.5 text-gray-900">{fmtDateTime(order.dispatchedAt)}</dd>
              </div>
            )}
            {order.deliveredAt && (
              <div>
                <dt className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Delivered</dt>
                <dd className="mt-0.5 text-gray-900">{fmtDateTime(order.deliveredAt)}</dd>
              </div>
            )}
            {order.deliverySignedBy && (
              <div>
                <dt className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Signed By</dt>
                <dd className="mt-0.5 text-gray-900">{order.deliverySignedBy}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Right column */}
        <div className="space-y-5">
          {/* Financials */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-5 py-3.5 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-700">Financials</h2>
            </div>
            <div className="p-5 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Subtotal (excl. VAT)</span>
                <span className="font-medium text-gray-800">{fmt(order.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">VAT (15%)</span>
                <span className="font-medium text-gray-800">{fmt(order.vatAmount)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-gray-100 font-bold text-gray-900">
                <span>Total</span>
                <span>{fmt(order.total)}</span>
              </div>
            </div>
          </div>

          {/* Linked documents */}
          {(order.consignmentId || order.invoiceId) && (
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-5 py-3.5 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-700">Linked Documents</h2>
              </div>
              <div className="p-5 space-y-2 text-sm">
                {order.consignmentId && (
                  <Link
                    to={`/consignments/${order.consignmentId}`}
                    className="flex items-center gap-2 text-blue-600 hover:text-blue-800"
                  >
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    SOR / Consignment
                  </Link>
                )}
                {order.invoiceId && (
                  <Link
                    to={`/finance/invoices/${order.invoiceId}`}
                    className="flex items-center gap-2 text-blue-600 hover:text-blue-800"
                  >
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    Invoice
                  </Link>
                )}
              </div>
            </div>
          )}

          {/* Courier */}
          {(order.courierCompany || order.courierWaybill) && (
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-5 py-3.5 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-700">Courier</h2>
              </div>
              <dl className="p-5 space-y-2 text-sm">
                {order.courierCompany && (
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Company</dt>
                    <dd className="font-medium text-gray-900">{order.courierCompany}</dd>
                  </div>
                )}
                {order.courierWaybill && (
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Waybill</dt>
                    <dd className="font-mono font-medium text-gray-900">
                      {order.courierTrackingUrl ? (
                        <a href={order.courierTrackingUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800">
                          {order.courierWaybill} ↗
                        </a>
                      ) : order.courierWaybill}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          )}
        </div>
      </div>

      {/* ── Order Lines ──────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Order Lines</h2>
          <span className="text-xs text-gray-400">{order.lines.length} title{order.lines.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Title</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ordered</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Confirmed</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Dispatched</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Unit Price</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Line Total</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {order.lines.map(line => (
                <tr key={line.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-gray-900">{line.title?.title ?? '—'}</p>
                    {line.title?.isbn13 && <p className="text-xs text-gray-400 mt-0.5">{line.title.isbn13}</p>}
                    {line.backorderQty > 0 && (
                      <p className="text-xs text-orange-600 mt-0.5">
                        {line.backorderQty} on backorder{line.backorderEta ? ` · ETA ${fmtDate(line.backorderEta)}` : ''}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-center text-gray-700">{line.quantity}</td>
                  <td className="px-4 py-3.5 text-center text-gray-700">
                    {line.qtyConfirmed != null ? line.qtyConfirmed : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3.5 text-center text-gray-700">
                    {line.qtyDispatched != null ? line.qtyDispatched : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-xs text-gray-700">{fmt(line.unitPrice)}</td>
                  <td className="px-5 py-3.5 text-right font-mono text-sm font-semibold text-gray-900">{fmt(line.lineTotal)}</td>
                  <td className="px-4 py-3.5 text-center">
                    {line.lineStatus !== 'CONFIRMED' && (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                        line.lineStatus === 'BACKORDERED' ? 'bg-orange-100 text-orange-700' :
                        line.lineStatus === 'REMOVED' ? 'bg-red-100 text-red-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {line.lineStatus}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-gray-200 bg-gray-50">
              <tr>
                <td colSpan={4} className="px-5 py-3 text-right text-xs text-gray-500 font-medium">
                  {order.lines.reduce((s, l) => s + l.quantity, 0)} total units
                </td>
                <td className="px-4 py-3 text-right text-xs text-gray-500">Subtotal</td>
                <td className="px-5 py-3 text-right font-mono font-semibold text-gray-900">{fmt(order.subtotal)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ── Notes ───────────────────────────────────────────────────────────── */}
      {(order.notes || order.internalNotes) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {order.notes && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Partner Notes</h3>
              <p className="text-sm text-gray-700">{order.notes}</p>
            </div>
          )}
          {order.internalNotes && (
            <div className="bg-amber-50 rounded-xl border border-amber-200 p-5">
              <h3 className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2">Internal Notes (staff only)</h3>
              <p className="text-sm text-amber-800">{order.internalNotes}</p>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showDispatch && (
        <DispatchModal
          onClose={() => setShowDispatch(false)}
          onSubmit={data => dispatchMutation.mutate(data)}
          isPending={dispatchMutation.isPending}
        />
      )}
      {showDeliver && (
        <DeliverModal
          onClose={() => setShowDeliver(false)}
          onSubmit={data => deliverMutation.mutate(data)}
          isPending={deliverMutation.isPending}
        />
      )}
      {showCancel && (
        <CancelModal
          onClose={() => setShowCancel(false)}
          onSubmit={reason => cancelMutation.mutate(reason)}
          isPending={cancelMutation.isPending}
        />
      )}
      {showStockCheck && order && (
        <StockCheckModal
          lines={(order.lines ?? []).map(l => ({
            titleId: l.titleId,
            titleLabel: l.title?.title ?? '',
            quantity: l.quantity,
          }))}
          onProceed={() => {
            setShowStockCheck(false);
            confirmMutation.mutate();
          }}
          onCancel={() => setShowStockCheck(false)}
        />
      )}
    </div>
  );
}
