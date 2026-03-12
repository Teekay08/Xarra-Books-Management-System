import { useState, type FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { RecipientEditModal } from '../../components/RecipientEditModal';
import { DocumentEmailModal } from '../../components/DocumentEmailModal';
import { formatR } from '../../lib/format';

interface PurchaseOrderLine {
  id: string;
  lineNumber: number;
  description: string;
  quantity: string;
  unitPrice: string;
  discountPct: string;
  lineTotal: string;
  lineTax: string;
  quantityReceived: string;
}

interface PurchaseOrder {
  id: string;
  number: string;
  supplierName: string;
  supplierId: string | null;
  contactName: string | null;
  contactEmail: string | null;
  orderDate: string;
  supplier?: {
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
  expectedDeliveryDate: string | null;
  deliveryAddress: string | null;
  subtotal: string;
  vatAmount: string;
  total: string;
  status: string;
  notes: string | null;
  issuedAt: string | null;
  cancelledAt: string | null;
  cancelledReason: string | null;
  lines: PurchaseOrderLine[];
}

const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  ISSUED: 'bg-blue-100 text-blue-700',
  RECEIVED: 'bg-green-100 text-green-700',
  PARTIAL: 'bg-amber-100 text-amber-700',
  CLOSED: 'bg-gray-200 text-gray-700',
  CANCELLED: 'bg-red-100 text-red-700',
};


export function PurchaseOrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showActions, setShowActions] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showRecipientModal, setShowRecipientModal] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['purchase-order', id],
    queryFn: () => api<{ data: PurchaseOrder }>(`/finance/purchase-orders/${id}`),
  });

  const issueMutation = useMutation({
    mutationFn: () => api(`/finance/purchase-orders/${id}/issue`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['purchase-order', id] }),
  });

  const cancelMutation = useMutation({
    mutationFn: (reason: string) =>
      api(`/finance/purchase-orders/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['purchase-order', id] }),
  });

  const duplicateMutation = useMutation({
    mutationFn: () => api<{ data: { id: string } }>(`/finance/purchase-orders/${id}/duplicate`, { method: 'POST' }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      navigate(`/finance/purchase-orders/${res.data.id}`);
    },
  });

  const sendMutation = useMutation({
    mutationFn: (data: { email: string; cc: string; bcc: string; subject: string; message: string }) =>
      api(`/finance/purchase-orders/${id}/send`, {
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
      queryClient.invalidateQueries({ queryKey: ['purchase-order', id] });
      setShowSendModal(false);
    },
  });

  const receiveMutation = useMutation({
    mutationFn: (body: { lines: { lineId: string; quantityReceived: number }[] }) =>
      api(`/finance/purchase-orders/${id}/receive`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-order', id] });
      setShowReceiveModal(false);
    },
  });

  if (isLoading) return <div className="py-12 text-center text-gray-400">Loading...</div>;
  if (!data?.data) return <div className="py-12 text-center text-gray-400">Purchase order not found</div>;

  const po = data.data;

  return (
    <div>
      <PageHeader
        title={po.number}
        subtitle={po.supplierName}
        backTo={{ label: 'Back to Purchase Orders', href: '/finance/purchase-orders' }}
        action={
          <div className="flex gap-2 items-center">
            {po.status === 'DRAFT' && (
              <>
                <button onClick={() => navigate(`/finance/purchase-orders/${id}/edit`)}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                  Edit
                </button>
                <button onClick={() => issueMutation.mutate()}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                  Issue PO
                </button>
              </>
            )}

            <a href={`/api/v1/finance/purchase-orders/${id}/pdf`} target="_blank" rel="noopener noreferrer"
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
              PDF
            </a>

            {/* More actions dropdown */}
            <div className="relative">
              <button onClick={() => setShowActions(!showActions)}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01" />
                </svg>
              </button>

              {showActions && (
                <div className="absolute right-0 mt-1 w-48 rounded-md bg-white shadow-lg border border-gray-200 z-50"
                  onMouseLeave={() => setShowActions(false)}>
                  {po.status !== 'CANCELLED' && (
                    <button onClick={() => { setShowSendModal(true); setShowActions(false); }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                      Send Email
                    </button>
                  )}
                  {['ISSUED', 'PARTIAL'].includes(po.status) && (
                    <button onClick={() => { setShowReceiveModal(true); setShowActions(false); }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                      Receive Goods
                    </button>
                  )}
                  <button onClick={() => { duplicateMutation.mutate(); setShowActions(false); }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                    Duplicate
                  </button>
                  {po.status !== 'CANCELLED' && po.status !== 'CLOSED' && (
                    <button onClick={() => {
                      const reason = prompt('Reason for cancelling this purchase order:');
                      if (reason) { cancelMutation.mutate(reason); setShowActions(false); }
                    }}
                      className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">
                      Cancel PO
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* PO meta */}
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6 text-sm">
              <div>
                <span className="text-xs text-gray-500 block">Status</span>
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium mt-1 ${statusColors[po.status] ?? ''}`}>
                  {po.status}
                </span>
              </div>
              <div>
                <span className="text-xs text-gray-500 block">Order Date</span>
                <span>{new Date(po.orderDate).toLocaleDateString('en-ZA')}</span>
              </div>
              <div>
                <span className="text-xs text-gray-500 block">Expected Delivery</span>
                <span>{po.expectedDeliveryDate ? new Date(po.expectedDeliveryDate).toLocaleDateString('en-ZA') : '—'}</span>
              </div>
              <div>
                <span className="text-xs text-gray-500 block">Supplier</span>
                <span className="flex items-center gap-1.5">
                  {po.supplierName}
                  {po.supplierId && (
                    <button onClick={() => setShowRecipientModal(true)} title="Edit supplier details"
                      className="text-gray-400 hover:text-green-700 transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                  )}
                </span>
                {po.contactName && (
                  <span className="text-xs text-gray-400 block">{po.contactName}</span>
                )}
                {po.contactEmail && (
                  <span className="text-xs text-gray-400 block">{po.contactEmail}</span>
                )}
              </div>
              {po.issuedAt && (
                <div>
                  <span className="text-xs text-gray-500 block">Issued</span>
                  <span>{new Date(po.issuedAt).toLocaleDateString('en-ZA')}</span>
                </div>
              )}
            </div>

            {/* Line items table */}
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-gray-500">
                  <th className="pb-2">#</th>
                  <th className="pb-2">Description</th>
                  <th className="pb-2 text-right">Qty</th>
                  <th className="pb-2 text-right">Received</th>
                  <th className="pb-2 text-right">Unit Price</th>
                  <th className="pb-2 text-right">Disc %</th>
                  <th className="pb-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {po.lines.map((line) => (
                  <tr key={line.id}>
                    <td className="py-2">{line.lineNumber}</td>
                    <td className="py-2">{line.description}</td>
                    <td className="py-2 text-right font-mono">{line.quantity}</td>
                    <td className="py-2 text-right font-mono">
                      <span className={Number(line.quantityReceived) >= Number(line.quantity) ? 'text-green-600' : Number(line.quantityReceived) > 0 ? 'text-amber-600' : ''}>
                        {line.quantityReceived}
                      </span>
                    </td>
                    <td className="py-2 text-right font-mono">{formatR(line.unitPrice)}</td>
                    <td className="py-2 text-right">{Number(line.discountPct)}%</td>
                    <td className="py-2 text-right font-mono">{formatR(line.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals */}
            <div className="flex justify-end mt-4">
              <div className="w-72 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="font-mono">{formatR(po.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">VAT (15%)</span>
                  <span className="font-mono">{formatR(po.vatAmount)}</span>
                </div>
                <div className="flex justify-between border-t pt-1 font-bold text-base">
                  <span>Total</span>
                  <span className="font-mono">{formatR(po.total)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Cancelled notice */}
          {po.cancelledReason && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-medium text-red-700">Cancelled</p>
              <p className="text-sm text-red-600 mt-1">{po.cancelledReason}</p>
            </div>
          )}

          {/* Delivery address */}
          {po.deliveryAddress && (
            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Delivery Address</h3>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{po.deliveryAddress}</p>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {po.notes && (
            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Notes</h3>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{po.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Send Email Modal */}
      {showSendModal && (
        <DocumentEmailModal
          title="Send Purchase Order via Email"
          documentNumber={po.number}
          pdfUrl={`/api/v1/finance/purchase-orders/${id}/pdf`}
          defaultEmail={po.contactEmail ?? ''}
          defaultSubject={`Purchase Order ${po.number} from Xarra Books`}
          isPending={sendMutation.isPending}
          error={sendMutation.isError ? (sendMutation.error as Error).message : undefined}
          onClose={() => setShowSendModal(false)}
          onSend={(data) => sendMutation.mutate(data)}
        />
      )}

      {/* Receive Goods Modal */}
      {showReceiveModal && (
        <ReceiveGoodsModal
          lines={po.lines}
          isPending={receiveMutation.isPending}
          error={receiveMutation.isError ? (receiveMutation.error as Error).message : ''}
          onClose={() => setShowReceiveModal(false)}
          onSubmit={(lines) => receiveMutation.mutate({ lines })}
        />
      )}

      {/* Recipient Edit Modal */}
      {showRecipientModal && po.supplierId && po.supplier && (
        <RecipientEditModal
          recipient={{
            partnerId: po.supplierId,
            partnerName: po.supplier.name,
            contactName: po.supplier.contactName,
            contactEmail: po.supplier.contactEmail,
            contactPhone: po.supplier.contactPhone,
            addressLine1: po.supplier.addressLine1,
            addressLine2: po.supplier.addressLine2,
            city: po.supplier.city,
            province: po.supplier.province,
            postalCode: po.supplier.postalCode,
            vatNumber: po.supplier.vatNumber,
          }}
          onClose={() => setShowRecipientModal(false)}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ['purchase-order', id] })}
        />
      )}
    </div>
  );
}

function ReceiveGoodsModal({ lines, isPending, error, onClose, onSubmit }: {
  lines: PurchaseOrderLine[];
  isPending: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (lines: { lineId: string; quantityReceived: number }[]) => void;
}) {
  const [quantities, setQuantities] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const line of lines) {
      const remaining = Number(line.quantity) - Number(line.quantityReceived);
      init[line.id] = Math.max(0, remaining);
    }
    return init;
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const receiveLines = Object.entries(quantities)
      .filter(([, qty]) => qty > 0)
      .map(([lineId, quantityReceived]) => ({ lineId, quantityReceived }));
    if (receiveLines.length === 0) return;
    onSubmit(receiveLines);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Receive Goods</h3>
          {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Quantity received per line item</label>
            <div className="border rounded-md divide-y">
              {lines.map((line) => {
                const ordered = Number(line.quantity);
                const alreadyReceived = Number(line.quantityReceived);
                const remaining = ordered - alreadyReceived;
                return (
                  <div key={line.id} className="flex items-center gap-3 px-3 py-2">
                    <input type="number" min={0} max={remaining}
                      value={quantities[line.id] ?? 0}
                      onChange={(e) => setQuantities((prev) => ({ ...prev, [line.id]: Number(e.target.value) }))}
                      className="w-16 rounded border border-gray-300 px-2 py-1 text-sm text-right" />
                    <div className="flex-1 text-sm">
                      <span className="text-gray-900">{line.description}</span>
                      <span className="text-gray-500 ml-2">
                        (ordered: {ordered}, received: {alreadyReceived}, remaining: {remaining})
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={isPending}
              className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50">
              {isPending ? 'Recording...' : 'Receive Goods'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
