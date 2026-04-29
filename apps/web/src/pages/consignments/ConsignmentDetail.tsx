import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { ActionMenu } from '../../components/ActionMenu';
import { DocumentEmailModal } from '../../components/DocumentEmailModal';
import { CONSIGNMENT_STATUS_COLORS as statusColors } from '../../lib/statusColors';

interface ConLine {
  id: string;
  qtyDispatched: number;
  qtySold: number;
  qtyReturned: number;
  qtyDamaged: number;
  unitRrp: string;
  discountPct: string;
  title?: { title: string; isbn13: string | null };
}

interface Consignment {
  id: string;
  proformaNumber: string | null;
  partnerPoNumber: string | null;
  dispatchDate: string | null;
  deliveryDate: string | null;
  sorExpiryDate: string | null;
  acknowledgedAt: string | null;
  reconciledAt: string | null;
  courierCompany: string | null;
  courierWaybill: string | null;
  status: string;
  notes: string | null;
  partner: { name: string; discountPct: string; contactEmail: string | null };
  lines: ConLine[];
}

interface SalesEntry {
  lineId: string;
  qtySold: number;
  qtyReturned: number;
  qtyDamaged: number;
}

const nextAction: Record<string, { label: string; endpoint: string; color: string }> = {
  DRAFT: { label: 'Dispatch', endpoint: 'dispatch', color: 'bg-blue-600 hover:bg-blue-700' },
  DISPATCHED: { label: 'Mark Delivered', endpoint: 'deliver', color: 'bg-indigo-600 hover:bg-indigo-700' },
  DELIVERED: { label: 'Acknowledge', endpoint: 'acknowledge', color: 'bg-green-600 hover:bg-green-700' },
  PARTIAL_RETURN: { label: 'Reconcile', endpoint: 'reconcile', color: 'bg-purple-600 hover:bg-purple-700' },
  RECONCILED: { label: 'Close', endpoint: 'close', color: 'bg-gray-600 hover:bg-gray-700' },
};

export function ConsignmentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [showSalesModal, setShowSalesModal] = useState(false);
  const [showExtendSorModal, setShowExtendSorModal] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['consignment', id],
    queryFn: () => api<{ data: Consignment }>(`/consignments/${id}`),
  });

  // Fetch system configuration for SOR alert period
  const { data: systemConfig } = useQuery({
    queryKey: ['system-config'],
    queryFn: () => api<{ data: { sorAlertDays: number } }>('/settings/system-config'),
  });

  const sorAlertDays = systemConfig?.data?.sorAlertDays ?? 30;
  const sorCriticalDays = Math.floor(sorAlertDays / 2); // Red alert at half the alert period

  const advanceMutation = useMutation({
    mutationFn: (endpoint: string) =>
      api(`/consignments/${id}/${endpoint}`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['consignment', id] }),
  });

  const returnsMutation = useMutation({
    mutationFn: () =>
      api(`/consignments/${id}/process-returns`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['consignment', id] }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api(`/consignments/${id}`, { method: 'DELETE' }),
    onSuccess: () => navigate('/consignments'),
  });

  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const emailMutation = useMutation({
    mutationFn: (data: { email: string; cc: string; bcc: string; subject: string; message: string }) =>
      api<{ data: { message: string } }>(`/consignments/${id}/send-proforma`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      setEmailSent(true);
      setShowEmailModal(false);
    },
  });

  if (isLoading) return <div className="py-12 text-center text-gray-400">Loading...</div>;
  if (!data?.data) return <div className="py-12 text-center text-gray-400">Consignment not found</div>;

  const con = data.data;
  const action = nextAction[con.status];
  const canRecordSales = ['DELIVERED', 'ACKNOWLEDGED', 'PARTIAL_RETURN'].includes(con.status);
  const canExtendSor = ['DELIVERED', 'ACKNOWLEDGED'].includes(con.status) && !!con.sorExpiryDate;
  const hasReturnsToProcess = con.lines.some((l) => l.qtyReturned > 0 || l.qtyDamaged > 0);

  const totalDispatched = con.lines.reduce((s, l) => s + l.qtyDispatched, 0);
  const totalSold = con.lines.reduce((s, l) => s + l.qtySold, 0);
  const totalReturned = con.lines.reduce((s, l) => s + l.qtyReturned, 0);
  const totalDamaged = con.lines.reduce((s, l) => s + l.qtyDamaged, 0);
  const outstanding = totalDispatched - totalSold - totalReturned - totalDamaged;

  return (
    <div>
      <PageHeader
        title={`Sales PO — ${con.partner.name}`}
        subtitle={con.dispatchDate ? `Dispatched ${new Date(con.dispatchDate).toLocaleDateString('en-ZA')}` : 'Draft'}
        backTo={{ label: 'Back to Sales POs', href: '/consignments' }}
        action={
          <div className="flex gap-2">
            <button
              onClick={() => window.open(`/api/v1/consignments/${id}/proforma-pdf`, '_blank')}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Download PDF
            </button>
            <button
              onClick={() => {
                const w = window.open(`/api/v1/consignments/${id}/proforma-pdf`, '_blank');
                w?.addEventListener('load', () => w.print());
              }}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Print
            </button>
            <button
              onClick={() => setShowEmailModal(true)}
              disabled={emailMutation.isPending}
              className="rounded-md border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
            >
              {emailMutation.isPending ? 'Sending...' : emailSent ? 'Resend Email' : 'Email to Partner'}
            </button>
            {canRecordSales && (
              <button
                onClick={() => setShowSalesModal(true)}
                className="rounded-md border border-green-300 bg-green-50 px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-100"
              >
                Record Sales
              </button>
            )}
            {canExtendSor && (
              <button
                onClick={() => setShowExtendSorModal(true)}
                className="rounded-md border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
              >
                Extend SOR
              </button>
            )}
            {action && (
              <button
                onClick={() => advanceMutation.mutate(action.endpoint)}
                disabled={advanceMutation.isPending}
                className={`rounded-md px-4 py-2 text-sm font-medium text-white ${action.color} disabled:opacity-50`}
              >
                {action.label}
              </button>
            )}
            {['ACKNOWLEDGED', 'PARTIAL_RETURN'].includes(con.status) && hasReturnsToProcess && (
              <button
                onClick={() => returnsMutation.mutate()}
                disabled={returnsMutation.isPending}
                className="rounded-md border border-amber-300 px-4 py-2 text-sm text-amber-700 hover:bg-amber-50"
              >
                Process Returns
              </button>
            )}
            <ActionMenu items={[
              {
                label: 'Edit',
                onClick: () => navigate(`/consignments/${id}/edit`),
                hidden: con.status !== 'DRAFT',
              },
              {
                label: 'Delete',
                onClick: () => {
                  if (confirm('Delete this draft consignment? This cannot be undone.')) {
                    deleteMutation.mutate();
                  }
                },
                variant: 'danger',
                hidden: con.status !== 'DRAFT',
              },
            ]} />
          </div>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <SummaryCard label="Status" value={con.status.replace(/_/g, ' ')} color={statusColors[con.status]} />
        <SummaryCard label="Dispatched" value={String(totalDispatched)} />
        <SummaryCard label="Sold" value={String(totalSold)} />
        <SummaryCard label="Returned" value={String(totalReturned + totalDamaged)} />
        <SummaryCard label="Outstanding" value={String(outstanding)} highlight={outstanding > 0} />
      </div>

      {/* Proforma & PO info */}
      {(con.proformaNumber || con.partnerPoNumber) && (
        <div className="mb-6 card p-4 text-sm">
          <div className="flex gap-6">
            {con.proformaNumber && (
              <div>
                <span className="text-gray-500 font-medium">Pro-forma: </span>
                <span className="font-mono font-semibold">{con.proformaNumber}</span>
              </div>
            )}
            {con.partnerPoNumber && (
              <div>
                <span className="text-gray-500 font-medium">Partner PO: </span>
                <span className="font-mono font-semibold">{con.partnerPoNumber}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SOR info */}
      {con.sorExpiryDate && (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm">
          <div className="flex gap-6">
            <div>
              <span className="text-blue-600 font-medium">SOR Expiry: </span>
              {new Date(con.sorExpiryDate).toLocaleDateString('en-ZA')}
              {(() => {
                const days = Math.ceil((new Date(con.sorExpiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                return <span className={`ml-1 ${days <= sorCriticalDays ? 'text-red-600 font-bold' : ''}`}>({days} days)</span>;
              })()}
            </div>
            {con.courierCompany && <div><span className="text-blue-600 font-medium">Courier: </span>{con.courierCompany}</div>}
            {con.courierWaybill && <div><span className="text-blue-600 font-medium">Waybill: </span>{con.courierWaybill}</div>}
          </div>
        </div>
      )}

      {/* Line items */}
      <div className="card p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Line Items</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-gray-500">
              <th className="pb-2">Title</th>
              <th className="pb-2 text-right">RRP</th>
              <th className="pb-2 text-right">Disc %</th>
              <th className="pb-2 text-right">Dispatched</th>
              <th className="pb-2 text-right">Sold</th>
              <th className="pb-2 text-right">Returned</th>
              <th className="pb-2 text-right">Damaged</th>
              <th className="pb-2 text-right">Outstanding</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {con.lines.map((line) => {
              const lineOutstanding = line.qtyDispatched - line.qtySold - line.qtyReturned - line.qtyDamaged;
              return (
                <tr key={line.id}>
                  <td className="py-2">
                    <p className="font-medium">{line.title?.title ?? '—'}</p>
                    {line.title?.isbn13 && <p className="text-xs text-gray-400">{line.title.isbn13}</p>}
                  </td>
                  <td className="py-2 text-right font-mono">R {Number(line.unitRrp).toFixed(2)}</td>
                  <td className="py-2 text-right">{Number(line.discountPct)}%</td>
                  <td className="py-2 text-right font-mono">{line.qtyDispatched}</td>
                  <td className="py-2 text-right font-mono text-green-700">{line.qtySold}</td>
                  <td className="py-2 text-right font-mono text-blue-600">{line.qtyReturned}</td>
                  <td className="py-2 text-right font-mono text-red-600">{line.qtyDamaged}</td>
                  <td className={`py-2 text-right font-mono font-semibold ${lineOutstanding > 0 ? 'text-amber-600' : 'text-gray-500'}`}>
                    {lineOutstanding}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {con.notes && (
        <div className="mt-6 card p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Notes</h3>
          <p className="text-sm text-gray-600 whitespace-pre-wrap">{con.notes}</p>
        </div>
      )}

      {/* Email Modal */}
      {showEmailModal && (
        <DocumentEmailModal
          title="Send SOR Pro-Forma Invoice"
          documentNumber={con.proformaNumber ?? 'SOR-Proforma'}
          pdfUrl={`/api/v1/consignments/${id}/proforma-pdf`}
          defaultEmail={con.partner.contactEmail ?? ''}
          defaultSubject={`SOR Pro-Forma Invoice ${con.proformaNumber ?? ''} — Xarra Books`}
          isPending={emailMutation.isPending}
          error={emailMutation.isError ? (emailMutation.error as Error).message : undefined}
          onClose={() => setShowEmailModal(false)}
          onSend={(data) => emailMutation.mutate(data)}
        />
      )}

      {/* Record Sales Modal */}
      {showSalesModal && (
        <RecordSalesModal
          consignmentId={id!}
          lines={con.lines}
          onClose={() => setShowSalesModal(false)}
        />
      )}

      {/* Extend SOR Modal */}
      {showExtendSorModal && con.sorExpiryDate && (
        <ExtendSorModal
          consignmentId={id!}
          currentExpiryDate={con.sorExpiryDate}
          onClose={() => setShowExtendSorModal(false)}
        />
      )}
    </div>
  );
}

function SummaryCard({ label, value, color, highlight }: {
  label: string; value: string; color?: string; highlight?: boolean;
}) {
  return (
    <div className={`rounded-lg border p-4 ${highlight ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'}`}>
      <p className="text-xs text-gray-500">{label}</p>
      {color ? (
        <span className={`inline-block mt-1 rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>{value}</span>
      ) : (
        <p className={`text-xl font-bold mt-1 ${highlight ? 'text-amber-700' : 'text-gray-900'}`}>{value}</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Record Sales Modal                                                */
/* ------------------------------------------------------------------ */

function RecordSalesModal({
  consignmentId,
  lines,
  onClose,
}: {
  consignmentId: string;
  lines: ConLine[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();

  // Initialize form state from existing line data
  const [salesData, setSalesData] = useState<SalesEntry[]>(
    lines.map((l) => ({
      lineId: l.id,
      qtySold: l.qtySold,
      qtyReturned: l.qtyReturned,
      qtyDamaged: l.qtyDamaged,
    }))
  );

  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: { lines: SalesEntry[] }) =>
      api(`/consignments/${consignmentId}/report-sales`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consignment', consignmentId] });
      onClose();
    },
    onError: (err: Error) => {
      setError(err.message || 'Failed to record sales. Please try again.');
    },
  });

  const updateLine = (lineId: string, field: 'qtySold' | 'qtyReturned' | 'qtyDamaged', value: number) => {
    setSalesData((prev) =>
      prev.map((entry) =>
        entry.lineId === lineId ? { ...entry, [field]: value } : entry
      )
    );
  };

  const handleSubmit = () => {
    setError(null);

    // Validate: qtySold + qtyReturned cannot exceed qtyDispatched for any line
    for (const entry of salesData) {
      const line = lines.find((l) => l.id === entry.lineId);
      if (!line) continue;
      const total = entry.qtySold + entry.qtyReturned + entry.qtyDamaged;
      if (total > line.qtyDispatched) {
        const titleName = line.title?.title ?? 'Unknown';
        setError(
          `"${titleName}": Sold (${entry.qtySold}) + Returned (${entry.qtyReturned}) + Damaged (${entry.qtyDamaged}) = ${total} exceeds dispatched quantity of ${line.qtyDispatched}.`
        );
        return;
      }
      if (entry.qtySold < 0 || entry.qtyReturned < 0 || entry.qtyDamaged < 0) {
        setError('Quantities cannot be negative.');
        return;
      }
    }

    // Only send lines that have changed
    const changedLines = salesData.filter((entry) => {
      const original = lines.find((l) => l.id === entry.lineId);
      if (!original) return false;
      return entry.qtySold !== original.qtySold || entry.qtyReturned !== original.qtyReturned || entry.qtyDamaged !== original.qtyDamaged;
    });

    if (changedLines.length === 0) {
      setError('No changes to save.');
      return;
    }

    mutation.mutate({ lines: changedLines });
  };

  // Calculate totals for the new values
  const newTotalSold = salesData.reduce((s, e) => s + e.qtySold, 0);
  const newTotalReturned = salesData.reduce((s, e) => s + e.qtyReturned, 0);
  const newTotalDamaged = salesData.reduce((s, e) => s + e.qtyDamaged, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-4xl rounded-lg bg-white shadow-xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Record Sales</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Update sold and returned quantities for each line item.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-auto flex-1 px-6 py-4">
          {error && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-gray-500">
                <th className="pb-2">Title</th>
                <th className="pb-2 text-right">Dispatched</th>
                <th className="pb-2 text-right">Already Sold</th>
                <th className="pb-2 text-center">New Sold Qty</th>
                <th className="pb-2 text-center">Returned Qty</th>
                <th className="pb-2 text-center">Damaged Qty</th>
                <th className="pb-2 text-right">Remaining</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {lines.map((line) => {
                const entry = salesData.find((e) => e.lineId === line.id)!;
                const remaining = line.qtyDispatched - entry.qtySold - entry.qtyReturned - entry.qtyDamaged;
                const isOverflow = remaining < 0;

                return (
                  <tr key={line.id} className={isOverflow ? 'bg-red-50' : ''}>
                    <td className="py-3">
                      <p className="font-medium">{line.title?.title ?? '—'}</p>
                      {line.title?.isbn13 && (
                        <p className="text-xs text-gray-400">{line.title.isbn13}</p>
                      )}
                    </td>
                    <td className="py-3 text-right font-mono">{line.qtyDispatched}</td>
                    <td className="py-3 text-right font-mono text-gray-400">{line.qtySold}</td>
                    <td className="py-3">
                      <input
                        type="number"
                        min={0}
                        max={line.qtyDispatched}
                        value={entry.qtySold}
                        onChange={(e) =>
                          updateLine(line.id, 'qtySold', Math.max(0, parseInt(e.target.value) || 0))
                        }
                        className={`mx-auto block w-20 rounded-md border px-2 py-1 text-center text-sm font-mono ${
                          isOverflow ? 'border-red-300 bg-red-50' : 'border-gray-300'
                        } focus:border-blue-400 focus:ring-1 focus:ring-blue-400 focus:outline-none`}
                      />
                    </td>
                    <td className="py-3">
                      <input
                        type="number"
                        min={0}
                        max={line.qtyDispatched}
                        value={entry.qtyReturned}
                        onChange={(e) =>
                          updateLine(line.id, 'qtyReturned', Math.max(0, parseInt(e.target.value) || 0))
                        }
                        className={`mx-auto block w-20 rounded-md border px-2 py-1 text-center text-sm font-mono ${
                          isOverflow ? 'border-red-300 bg-red-50' : 'border-gray-300'
                        } focus:border-blue-400 focus:ring-1 focus:ring-blue-400 focus:outline-none`}
                      />
                    </td>
                    <td className="py-3">
                      <input
                        type="number"
                        min={0}
                        max={line.qtyDispatched}
                        value={entry.qtyDamaged}
                        onChange={(e) =>
                          updateLine(line.id, 'qtyDamaged', Math.max(0, parseInt(e.target.value) || 0))
                        }
                        className={`mx-auto block w-20 rounded-md border px-2 py-1 text-center text-sm font-mono ${
                          isOverflow ? 'border-red-300 bg-red-50' : 'border-gray-300'
                        } focus:border-blue-400 focus:ring-1 focus:ring-blue-400 focus:outline-none`}
                      />
                    </td>
                    <td className={`py-3 text-right font-mono font-semibold ${
                      isOverflow ? 'text-red-600' : remaining > 0 ? 'text-amber-600' : 'text-gray-500'
                    }`}>
                      {remaining}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t font-semibold text-xs text-gray-600">
                <td className="pt-3">Totals</td>
                <td className="pt-3 text-right font-mono">
                  {lines.reduce((s, l) => s + l.qtyDispatched, 0)}
                </td>
                <td className="pt-3 text-right font-mono text-gray-400">
                  {lines.reduce((s, l) => s + l.qtySold, 0)}
                </td>
                <td className="pt-3 text-center font-mono text-green-700">{newTotalSold}</td>
                <td className="pt-3 text-center font-mono text-blue-600">{newTotalReturned}</td>
                <td className="pt-3 text-center font-mono text-red-600">{newTotalDamaged}</td>
                <td className="pt-3 text-right font-mono">
                  {lines.reduce((s, l) => s + l.qtyDispatched, 0) -
                    newTotalSold -
                    newTotalReturned -
                    newTotalDamaged}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={mutation.isPending}
            className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {mutation.isPending ? 'Saving...' : 'Save Sales'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Extend SOR Modal                                                  */
/* ------------------------------------------------------------------ */

function ExtendSorModal({
  consignmentId,
  currentExpiryDate,
  onClose,
}: {
  consignmentId: string;
  currentExpiryDate: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const currentDate = new Date(currentExpiryDate);

  // Default new expiry: 30 days after current expiry
  const defaultNew = new Date(currentDate);
  defaultNew.setDate(defaultNew.getDate() + 30);
  const [newDate, setNewDate] = useState(defaultNew.toISOString().split('T')[0]);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: { newExpiryDate: string }) =>
      api(`/consignments/${consignmentId}/extend-sor`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consignment', consignmentId] });
      onClose();
    },
    onError: (err: Error) => {
      setError(err.message || 'Failed to extend SOR. Please try again.');
    },
  });

  const handleSubmit = () => {
    setError(null);

    const parsed = new Date(newDate);
    if (isNaN(parsed.getTime())) {
      setError('Please enter a valid date.');
      return;
    }

    if (parsed <= currentDate) {
      setError('New expiry date must be after the current expiry date.');
      return;
    }

    mutation.mutate({ newExpiryDate: newDate });
  };

  const daysExtension = Math.ceil(
    (new Date(newDate).getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Extend SOR Period</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Set a new expiry date for this consignment.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Current Expiry Date
            </label>
            <p className="text-sm font-mono text-gray-600 bg-gray-50 rounded-md px-3 py-2 border border-gray-200">
              {currentDate.toLocaleDateString('en-ZA', {
                day: '2-digit',
                month: 'long',
                year: 'numeric',
              })}
            </p>
          </div>

          <div>
            <label htmlFor="new-expiry" className="block text-sm font-medium text-gray-700 mb-1">
              New Expiry Date
            </label>
            <input
              id="new-expiry"
              type="date"
              value={newDate}
              min={currentDate.toISOString().split('T')[0]}
              onChange={(e) => setNewDate(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-400 focus:outline-none"
            />
          </div>

          {newDate && !isNaN(new Date(newDate).getTime()) && daysExtension > 0 && (
            <div className="rounded-md bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700">
              Extension of <span className="font-semibold">{daysExtension} days</span> from current expiry.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={mutation.isPending}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {mutation.isPending ? 'Saving...' : 'Extend SOR'}
          </button>
        </div>
      </div>
    </div>
  );
}
