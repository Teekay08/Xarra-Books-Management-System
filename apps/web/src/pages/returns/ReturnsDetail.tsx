import { useState } from 'react';
import { useParams } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

interface ReturnLine {
  id: string;
  titleId: string;
  quantity: number;
  condition: string;
  notes: string | null;
  title: { title: string; isbn13: string | null };
}

interface InspectionLine {
  id: string;
  returnsAuthLineId: string;
  titleId: string;
  qtyReceived: number;
  qtyGood: number;
  qtyDamaged: number;
  qtyUnsaleable: number;
  notes: string | null;
  title: { title: string; isbn13: string | null };
}

interface ReturnAuth {
  id: string;
  number: string;
  returnDate: string;
  reason: string;
  status: string;
  notes: string | null;
  courierCompany: string | null;
  courierWaybill: string | null;
  receivedAt: string | null;
  receivedBy: string | null;
  deliverySignedBy: string | null;
  inspectedAt: string | null;
  inspectedBy: string | null;
  inspectionNotes: string | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
  processedAt: string | null;
  partner: { name: string };
  consignment: { id: string; dispatchDate: string } | null;
  lines: ReturnLine[];
  inspectionLines: InspectionLine[];
}

const STEPS = ['DRAFT', 'AUTHORIZED', 'IN_TRANSIT', 'RECEIVED', 'INSPECTED', 'VERIFIED', 'PROCESSED'] as const;

const STEP_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  AUTHORIZED: 'Authorized',
  IN_TRANSIT: 'In Transit',
  RECEIVED: 'Received',
  INSPECTED: 'Inspected',
  VERIFIED: 'Verified',
  PROCESSED: 'Processed',
};

const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  AUTHORIZED: 'bg-blue-100 text-blue-700',
  IN_TRANSIT: 'bg-indigo-100 text-indigo-700',
  RECEIVED: 'bg-yellow-100 text-yellow-700',
  INSPECTED: 'bg-purple-100 text-purple-700',
  VERIFIED: 'bg-teal-100 text-teal-700',
  PROCESSED: 'bg-green-100 text-green-700',
};

const conditionColors: Record<string, string> = {
  GOOD: 'text-green-700',
  DAMAGED: 'text-orange-600',
  UNSALEABLE: 'text-red-600',
};

function StatusStepper({ currentStatus }: { currentStatus: string }) {
  const currentIdx = STEPS.indexOf(currentStatus as (typeof STEPS)[number]);

  return (
    <div className="flex items-center gap-1">
      {STEPS.map((step, idx) => {
        const isComplete = idx < currentIdx;
        const isCurrent = idx === currentIdx;
        return (
          <div key={step} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
                  isComplete
                    ? 'bg-green-600 border-green-600 text-white'
                    : isCurrent
                      ? 'bg-white border-green-600 text-green-700'
                      : 'bg-white border-gray-300 text-gray-400'
                }`}
              >
                {isComplete ? '✓' : idx + 1}
              </div>
              <span
                className={`text-[10px] mt-1 whitespace-nowrap ${
                  isCurrent ? 'font-semibold text-green-700' : isComplete ? 'text-green-600' : 'text-gray-400'
                }`}
              >
                {STEP_LABELS[step]}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div className={`w-8 h-0.5 mx-1 mt-[-14px] ${idx < currentIdx ? 'bg-green-500' : 'bg-gray-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ReturnsDetail() {
  const { id } = useParams();
  const queryClient = useQueryClient();

  // Form state for transit/receive/inspect actions
  const [transitForm, setTransitForm] = useState({ courierCompany: '', courierWaybill: '' });
  const [receiveForm, setReceiveForm] = useState({ deliverySignedBy: '', courierCompany: '', courierWaybill: '' });
  const [inspectionNotes, setInspectionNotes] = useState('');
  const [inspectionLines, setInspectionLines] = useState<
    Array<{ returnsAuthLineId: string; qtyReceived: number; qtyGood: number; qtyDamaged: number; qtyUnsaleable: number; notes: string }>
  >([]);
  const [showInspectionForm, setShowInspectionForm] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['return', id],
    queryFn: () => api<{ data: ReturnAuth }>(`/returns/${id}`),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['return', id] });

  const transitMutation = useMutation({
    mutationFn: () => api(`/returns/${id}/in-transit`, { method: 'POST', body: JSON.stringify(transitForm) }),
    onSuccess: invalidate,
  });

  const receiveMutation = useMutation({
    mutationFn: () => api(`/returns/${id}/receive`, { method: 'POST', body: JSON.stringify(receiveForm) }),
    onSuccess: invalidate,
  });

  const inspectMutation = useMutation({
    mutationFn: () =>
      api(`/returns/${id}/inspect`, {
        method: 'POST',
        body: JSON.stringify({ inspectionNotes, lines: inspectionLines }),
      }),
    onSuccess: () => {
      setShowInspectionForm(false);
      invalidate();
    },
  });

  const verifyMutation = useMutation({
    mutationFn: () => api(`/returns/${id}/verify`, { method: 'POST' }),
    onSuccess: invalidate,
  });

  const processMutation = useMutation({
    mutationFn: () =>
      api(`/returns/${id}/process`, {
        method: 'POST',
        headers: { 'X-Idempotency-Key': crypto.randomUUID() },
      }),
    onSuccess: invalidate,
  });

  if (isLoading) return <div className="py-12 text-center text-gray-400">Loading...</div>;
  if (!data?.data) return <div className="py-12 text-center text-gray-400">Return not found</div>;

  const ra = data.data;
  const totalQty = ra.lines.reduce((sum, l) => sum + l.quantity, 0);

  function initInspectionLines() {
    setInspectionLines(
      ra.lines.map((l) => ({
        returnsAuthLineId: l.id,
        qtyReceived: l.quantity,
        qtyGood: l.quantity,
        qtyDamaged: 0,
        qtyUnsaleable: 0,
        notes: '',
      })),
    );
    setInspectionNotes('');
    setShowInspectionForm(true);
  }

  function updateInspectionLine(idx: number, field: string, value: number | string) {
    setInspectionLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  }

  return (
    <div>
      <PageHeader title={ra.number} subtitle={ra.partner.name} backTo={{ label: 'Back to Returns', href: '/returns' }} />

      <div className="max-w-4xl space-y-6">
        {/* Status stepper */}
        <div className="card p-4">
          <StatusStepper currentStatus={ra.status} />
        </div>

        {/* Summary info */}
        <div className="card p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4 text-sm">
            <div>
              <span className="text-xs text-gray-500 block">Status</span>
              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium mt-1 ${statusColors[ra.status] ?? ''}`}>
                {STEP_LABELS[ra.status] ?? ra.status}
              </span>
            </div>
            <div>
              <span className="text-xs text-gray-500 block">Return Date</span>
              <span>{new Date(ra.returnDate).toLocaleDateString('en-ZA')}</span>
            </div>
            <div>
              <span className="text-xs text-gray-500 block">Total Items</span>
              <span className="font-mono">{totalQty}</span>
            </div>
            <div>
              <span className="text-xs text-gray-500 block">Partner</span>
              <span>{ra.partner.name}</span>
            </div>
          </div>

          {ra.consignment && (
            <div className="mb-4 text-sm">
              <span className="text-xs text-gray-500 block">Linked Consignment</span>
              <span>Dispatched {new Date(ra.consignment.dispatchDate).toLocaleDateString('en-ZA')}</span>
            </div>
          )}

          {(ra.courierCompany || ra.courierWaybill) && (
            <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
              {ra.courierCompany && (
                <div>
                  <span className="text-xs text-gray-500 block">Courier</span>
                  <span>{ra.courierCompany}</span>
                </div>
              )}
              {ra.courierWaybill && (
                <div>
                  <span className="text-xs text-gray-500 block">Waybill Number</span>
                  <span className="font-mono">{ra.courierWaybill}</span>
                </div>
              )}
            </div>
          )}

          <div className="mb-4">
            <span className="text-xs text-gray-500 block mb-1">Reason</span>
            <p className="text-sm text-gray-900">{ra.reason}</p>
          </div>

          {/* Timeline details */}
          {ra.receivedAt && (
            <div className="text-sm text-gray-600 border-t pt-3 mt-3">
              <span className="text-xs text-gray-500">Received:</span>{' '}
              {new Date(ra.receivedAt).toLocaleDateString('en-ZA')}
              {ra.deliverySignedBy && <span className="ml-2">(signed by {ra.deliverySignedBy})</span>}
            </div>
          )}
          {ra.inspectedAt && (
            <div className="text-sm text-gray-600 mt-1">
              <span className="text-xs text-gray-500">Inspected:</span>{' '}
              {new Date(ra.inspectedAt).toLocaleDateString('en-ZA')}
              {ra.inspectionNotes && <span className="ml-2 text-gray-500">— {ra.inspectionNotes}</span>}
            </div>
          )}
          {ra.verifiedAt && (
            <div className="text-sm text-gray-600 mt-1">
              <span className="text-xs text-gray-500">Verified:</span>{' '}
              {new Date(ra.verifiedAt).toLocaleDateString('en-ZA')}
            </div>
          )}
          {ra.processedAt && (
            <div className="text-sm text-green-700 mt-1">
              <span className="text-xs text-gray-500">Processed:</span>{' '}
              {new Date(ra.processedAt).toLocaleDateString('en-ZA')} — inventory movements created
            </div>
          )}
        </div>

        {/* Return lines table */}
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Return Lines</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-gray-500">
                <th className="pb-2">Title</th>
                <th className="pb-2 text-right">Qty</th>
                <th className="pb-2">Condition</th>
                <th className="pb-2">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {ra.lines.map((line) => (
                <tr key={line.id}>
                  <td className="py-2">
                    <span className="font-medium">{line.title.title}</span>
                    {line.title.isbn13 && (
                      <span className="block text-xs text-gray-400 font-mono">{line.title.isbn13}</span>
                    )}
                  </td>
                  <td className="py-2 text-right font-mono">{line.quantity}</td>
                  <td className={`py-2 text-xs font-medium ${conditionColors[line.condition] ?? ''}`}>
                    {line.condition}
                  </td>
                  <td className="py-2 text-gray-500">{line.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Inspection results (if available) */}
        {ra.inspectionLines && ra.inspectionLines.length > 0 && (
          <div className="rounded-lg border border-purple-200 bg-purple-50/30 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Inspection Results</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-gray-500">
                  <th className="pb-2">Title</th>
                  <th className="pb-2 text-right">Received</th>
                  <th className="pb-2 text-right text-green-600">Good</th>
                  <th className="pb-2 text-right text-orange-600">Damaged</th>
                  <th className="pb-2 text-right text-red-600">Unsaleable</th>
                  <th className="pb-2">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {ra.inspectionLines.map((il) => (
                  <tr key={il.id}>
                    <td className="py-2">
                      <span className="font-medium">{il.title.title}</span>
                      {il.title.isbn13 && (
                        <span className="block text-xs text-gray-400 font-mono">{il.title.isbn13}</span>
                      )}
                    </td>
                    <td className="py-2 text-right font-mono">{il.qtyReceived}</td>
                    <td className="py-2 text-right font-mono text-green-700">{il.qtyGood}</td>
                    <td className="py-2 text-right font-mono text-orange-600">{il.qtyDamaged}</td>
                    <td className="py-2 text-right font-mono text-red-600">{il.qtyUnsaleable}</td>
                    <td className="py-2 text-gray-500">{il.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Action panels based on status */}

        {/* AUTHORIZED → Mark In Transit */}
        {ra.status === 'AUTHORIZED' && (
          <div className="rounded-lg border border-blue-200 bg-blue-50/30 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">Mark as In Transit</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Courier Company</label>
                <input
                  type="text"
                  value={transitForm.courierCompany}
                  onChange={(e) => setTransitForm((f) => ({ ...f, courierCompany: e.target.value }))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  placeholder="e.g. The Courier Guy"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Waybill Number</label>
                <input
                  type="text"
                  value={transitForm.courierWaybill}
                  onChange={(e) => setTransitForm((f) => ({ ...f, courierWaybill: e.target.value }))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  placeholder="Waybill number"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => transitMutation.mutate()}
                disabled={transitMutation.isPending}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {transitMutation.isPending ? 'Updating...' : 'Mark In Transit'}
              </button>
              <button
                onClick={() => {
                  setReceiveForm({
                    deliverySignedBy: '',
                    courierCompany: transitForm.courierCompany || ra.courierCompany || '',
                    courierWaybill: transitForm.courierWaybill || ra.courierWaybill || '',
                  });
                  receiveMutation.mutate();
                }}
                disabled={receiveMutation.isPending}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Skip to Receive
              </button>
            </div>
            {transitMutation.isError && (
              <p className="text-sm text-red-600">{(transitMutation.error as any)?.message ?? 'Failed to update'}</p>
            )}
          </div>
        )}

        {/* IN_TRANSIT → Receive Goods */}
        {ra.status === 'IN_TRANSIT' && (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50/30 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">Receive Goods at Warehouse</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Delivery Signed By</label>
                <input
                  type="text"
                  value={receiveForm.deliverySignedBy}
                  onChange={(e) => setReceiveForm((f) => ({ ...f, deliverySignedBy: e.target.value }))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  placeholder="Name of person receiving"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Courier Company</label>
                <input
                  type="text"
                  value={receiveForm.courierCompany}
                  onChange={(e) => setReceiveForm((f) => ({ ...f, courierCompany: e.target.value }))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Waybill Number</label>
                <input
                  type="text"
                  value={receiveForm.courierWaybill}
                  onChange={(e) => setReceiveForm((f) => ({ ...f, courierWaybill: e.target.value }))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  defaultValue={ra.courierWaybill ?? ''}
                />
              </div>
            </div>
            <button
              onClick={() => receiveMutation.mutate()}
              disabled={receiveMutation.isPending}
              className="rounded-md bg-yellow-600 px-4 py-2 text-sm font-medium text-white hover:bg-yellow-700 disabled:opacity-50"
            >
              {receiveMutation.isPending ? 'Receiving...' : 'Confirm Receipt'}
            </button>
            {receiveMutation.isError && (
              <p className="text-sm text-red-600">{(receiveMutation.error as any)?.message ?? 'Failed to receive'}</p>
            )}
          </div>
        )}

        {/* RECEIVED → Record Inspection */}
        {ra.status === 'RECEIVED' && !showInspectionForm && (
          <div className="rounded-lg border border-purple-200 bg-purple-50/30 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Ready for Inspection</h3>
            <p className="text-sm text-gray-600 mb-4">
              Goods have been received. Record the inspection results for each line — categorize items by condition.
            </p>
            <button
              onClick={initInspectionLines}
              className="rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
            >
              Begin Inspection
            </button>
          </div>
        )}

        {ra.status === 'RECEIVED' && showInspectionForm && (
          <div className="rounded-lg border border-purple-200 bg-purple-50/30 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">Record Inspection</h3>
            <p className="text-xs text-gray-500">
              For each line, enter the quantity received and break it down by condition. Good + Damaged + Unsaleable must equal Received.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-gray-500">
                    <th className="pb-2">Title</th>
                    <th className="pb-2 text-right w-20">Expected</th>
                    <th className="pb-2 text-right w-20">Received</th>
                    <th className="pb-2 text-right w-20">Good</th>
                    <th className="pb-2 text-right w-20">Damaged</th>
                    <th className="pb-2 text-right w-20">Unsaleable</th>
                    <th className="pb-2 w-32">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {ra.lines.map((line, idx) => {
                    const il = inspectionLines[idx];
                    if (!il) return null;
                    const total = il.qtyGood + il.qtyDamaged + il.qtyUnsaleable;
                    const valid = total === il.qtyReceived;
                    return (
                      <tr key={line.id} className={!valid ? 'bg-red-50/50' : ''}>
                        <td className="py-2">
                          <span className="font-medium">{line.title.title}</span>
                          {line.title.isbn13 && (
                            <span className="block text-xs text-gray-400 font-mono">{line.title.isbn13}</span>
                          )}
                        </td>
                        <td className="py-2 text-right font-mono text-gray-400">{line.quantity}</td>
                        <td className="py-2 text-right">
                          <input
                            type="number"
                            min={0}
                            value={il.qtyReceived}
                            onChange={(e) => updateInspectionLine(idx, 'qtyReceived', Number(e.target.value))}
                            className="w-16 rounded border border-gray-300 px-2 py-1 text-right text-sm font-mono"
                          />
                        </td>
                        <td className="py-2 text-right">
                          <input
                            type="number"
                            min={0}
                            value={il.qtyGood}
                            onChange={(e) => updateInspectionLine(idx, 'qtyGood', Number(e.target.value))}
                            className="w-16 rounded border border-gray-300 px-2 py-1 text-right text-sm font-mono"
                          />
                        </td>
                        <td className="py-2 text-right">
                          <input
                            type="number"
                            min={0}
                            value={il.qtyDamaged}
                            onChange={(e) => updateInspectionLine(idx, 'qtyDamaged', Number(e.target.value))}
                            className="w-16 rounded border border-gray-300 px-2 py-1 text-right text-sm font-mono"
                          />
                        </td>
                        <td className="py-2 text-right">
                          <input
                            type="number"
                            min={0}
                            value={il.qtyUnsaleable}
                            onChange={(e) => updateInspectionLine(idx, 'qtyUnsaleable', Number(e.target.value))}
                            className="w-16 rounded border border-gray-300 px-2 py-1 text-right text-sm font-mono"
                          />
                        </td>
                        <td className="py-2">
                          <input
                            type="text"
                            value={il.notes}
                            onChange={(e) => updateInspectionLine(idx, 'notes', e.target.value)}
                            className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                            placeholder="Notes"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">General Inspection Notes</label>
              <textarea
                value={inspectionNotes}
                onChange={(e) => setInspectionNotes(e.target.value)}
                rows={2}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                placeholder="Overall observations..."
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => inspectMutation.mutate()}
                disabled={
                  inspectMutation.isPending ||
                  inspectionLines.some((l) => l.qtyGood + l.qtyDamaged + l.qtyUnsaleable !== l.qtyReceived)
                }
                className="rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
              >
                {inspectMutation.isPending ? 'Saving...' : 'Submit Inspection'}
              </button>
              <button
                onClick={() => setShowInspectionForm(false)}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
            {inspectMutation.isError && (
              <p className="text-sm text-red-600">{(inspectMutation.error as any)?.message ?? 'Failed to save inspection'}</p>
            )}
          </div>
        )}

        {/* INSPECTED → Verify (Manager sign-off) */}
        {ra.status === 'INSPECTED' && (
          <div className="rounded-lg border border-teal-200 bg-teal-50/30 p-5 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">Manager Verification</h3>
            <p className="text-sm text-gray-600">
              Review the inspection results above and approve to proceed with inventory adjustments.
            </p>
            <button
              onClick={() => {
                if (confirm('Verify this inspection? This confirms the condition assessment is accurate.'))
                  verifyMutation.mutate();
              }}
              disabled={verifyMutation.isPending}
              className="rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {verifyMutation.isPending ? 'Verifying...' : 'Approve Inspection'}
            </button>
            {verifyMutation.isError && (
              <p className="text-sm text-red-600">{(verifyMutation.error as any)?.message ?? 'Failed to verify'}</p>
            )}
          </div>
        )}

        {/* VERIFIED → Process Return */}
        {ra.status === 'VERIFIED' && (
          <div className="rounded-lg border border-green-200 bg-green-50/30 p-5 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">Process Return</h3>
            <p className="text-sm text-gray-600">
              Finalize this return. Good items will be returned to warehouse stock, damaged items to the damaged
              location, and unsaleable items will be written off.
            </p>
            <button
              onClick={() => {
                if (confirm('Process this return? This will create inventory movements based on the inspection results.'))
                  processMutation.mutate();
              }}
              disabled={processMutation.isPending}
              className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
            >
              {processMutation.isPending ? 'Processing...' : 'Process Return'}
            </button>
            {processMutation.isError && (
              <p className="text-sm text-red-600">{(processMutation.error as any)?.message ?? 'Failed to process'}</p>
            )}
          </div>
        )}

        {/* Notes */}
        {ra.notes && (
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Notes</h3>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{ra.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}
