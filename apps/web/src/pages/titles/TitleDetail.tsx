import { useState, type FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { formatR } from '../../lib/format';

interface TitlePLData {
  titleId: string;
  title: string;
  isbn13: string | null;
  rrp: number;
  grossRevenue: number;
  channelDiscounts: number;
  netRevenue: number;
  creditNotes: number;
  adjustedNetRevenue: number;
  productionCosts: number;
  printRunCosts: number;
  authorAdvance: number;
  royaltiesPaid: number;
  totalCosts: number;
  netProfit: number;
  breakdown: {
    salesByChannel: Array<{
      partnerId: string | null;
      partnerName: string;
      discountPct: number;
      grossAmount: number;
      discountAmount: number;
      netAmount: number;
      unitsSold: number;
    }>;
    costItems: Array<{
      category: string;
      description: string;
      amount: number;
      vendor: string | null;
    }>;
  };
}

interface ProductionCost {
  id: string;
  category: string;
  description: string;
  amount: string;
  vendor: string | null;
  paidDate: string | null;
}

interface PrintRun {
  id: string;
  printRunNumber: number;
  number: string;
  printerName: string;
  quantityOrdered: number;
  totalCost: string;
  expectedDeliveryDate: string | null;
  status: string;
  quantityReceived: number | null;
  receivedAt: string | null;
  notes: string | null;
  createdAt: string;
}

interface Title {
  id: string;
  title: string;
  subtitle: string | null;
  isbn13: string | null;
  asin: string | null;
  rrpZar: string;
  costPriceZar: string | null;
  formats: string[];
  status: string;
  description: string | null;
  publishDate: string | null;
  pageCount: number | null;
  weightGrams: number | null;
  primaryAuthor?: { legalName: string; penName: string | null } | null;
  productionCosts?: ProductionCost[];
  printRuns?: PrintRun[];
}

const statusColors: Record<string, string> = {
  PRODUCTION: 'bg-amber-100 text-amber-700',
  ACTIVE: 'bg-green-100 text-green-700',
  OUT_OF_PRINT: 'bg-gray-100 text-gray-500',
};

const COST_CATEGORIES = ['EDITORIAL', 'TYPESETTING', 'COVER', 'PRINT', 'ISBN', 'OTHER'] as const;

const printRunStatusColors: Record<string, string> = {
  ORDERED: 'bg-blue-100 text-blue-700',
  IN_PRODUCTION: 'bg-amber-100 text-amber-700',
  SHIPPED: 'bg-purple-100 text-purple-700',
  RECEIVED: 'bg-green-100 text-green-700',
  PARTIAL: 'bg-orange-100 text-orange-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
};

export function TitleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showAddCost, setShowAddCost] = useState(false);
  const [showAddPrintRun, setShowAddPrintRun] = useState(false);
  const [receivingRunId, setReceivingRunId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['title', id],
    queryFn: () => api<{ data: Title }>(`/titles/${id}`),
  });

  const addCostMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/titles/${id}/costs`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['title', id] });
      setShowAddCost(false);
    },
  });

  const deleteCostMutation = useMutation({
    mutationFn: (costId: string) =>
      api(`/titles/${id}/costs/${costId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['title', id] });
    },
  });

  const addPrintRunMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/titles/${id}/print-runs`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['title', id] });
      setShowAddPrintRun(false);
    },
  });

  const receivePrintRunMutation = useMutation({
    mutationFn: ({ runId, ...body }: { runId: string; quantityReceived: number; notes?: string }) =>
      api(`/titles/${id}/print-runs/${runId}/receive`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['title', id] });
      setReceivingRunId(null);
    },
  });

  const deletePrintRunMutation = useMutation({
    mutationFn: (runId: string) =>
      api(`/titles/${id}/print-runs/${runId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['title', id] });
    },
  });

  if (isLoading) return <div className="py-12 text-center text-gray-400">Loading...</div>;
  if (!data?.data) return <div className="py-12 text-center text-gray-400">Title not found</div>;

  const title = data.data;
  const costs = title.productionCosts ?? [];
  const printRuns = title.printRuns ?? [];

  function handleAddCost(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    addCostMutation.mutate({
      category: fd.get('category'),
      description: fd.get('description'),
      amount: Number(fd.get('amount')),
      vendor: fd.get('vendor') || undefined,
      paidDate: fd.get('paidDate') || undefined,
    });
  }

  function handleAddPrintRun(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    addPrintRunMutation.mutate({
      printerName: fd.get('printerName'),
      quantityOrdered: Number(fd.get('quantityOrdered')),
      totalCost: Number(fd.get('totalCost')),
      expectedDeliveryDate: fd.get('expectedDeliveryDate') || undefined,
      notes: fd.get('notes') || undefined,
    });
  }

  function handleReceive(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!receivingRunId) return;
    const fd = new FormData(e.currentTarget);
    receivePrintRunMutation.mutate({
      runId: receivingRunId,
      quantityReceived: Number(fd.get('quantityReceived')),
      notes: (fd.get('notes') as string) || undefined,
    });
  }

  return (
    <div>
      <PageHeader
        title={title.title}
        subtitle={title.subtitle ?? undefined}
        action={
          <button
            onClick={() => navigate(`/titles/${id}/edit`)}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Edit
          </button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card title="Book Details">
            <dl className="grid grid-cols-2 gap-3">
              <DI label="ISBN-13" value={title.isbn13} />
              <DI label="ASIN" value={title.asin} />
              <DI label="RRP" value={title.rrpZar ? `R ${Number(title.rrpZar).toFixed(2)}` : null} />
              <DI label="Cost Price" value={title.costPriceZar ? `R ${Number(title.costPriceZar).toFixed(2)}` : null} />
              <DI label="Formats" value={title.formats.join(', ')} />
              <DI label="Status" value={title.status} badge={statusColors[title.status]} />
              <DI label="Publish Date" value={title.publishDate?.split('T')[0]} />
              <DI label="Pages" value={title.pageCount?.toString()} />
              <DI label="Weight" value={title.weightGrams ? `${title.weightGrams}g` : null} />
              {title.primaryAuthor && (
                <DI label="Primary Author" value={title.primaryAuthor.penName || title.primaryAuthor.legalName} />
              )}
            </dl>
          </Card>

          {title.description && (
            <Card title="Description">
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{title.description}</p>
            </Card>
          )}

          <Card
            title="Production Costs"
            action={
              <button
                onClick={() => setShowAddCost(true)}
                className="rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800"
              >
                + Add Cost
              </button>
            }
          >
            {costs.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-gray-500">
                    <th className="pb-2">Category</th>
                    <th className="pb-2">Description</th>
                    <th className="pb-2">Vendor</th>
                    <th className="pb-2 text-right">Amount</th>
                    <th className="pb-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {costs.map((c) => (
                    <tr key={c.id}>
                      <td className="py-2">{c.category}</td>
                      <td className="py-2">{c.description}</td>
                      <td className="py-2 text-gray-500">{c.vendor ?? '—'}</td>
                      <td className="py-2 text-right font-mono">R {Number(c.amount).toFixed(2)}</td>
                      <td className="py-2 text-right">
                        <button
                          onClick={() => { if (confirm('Delete this cost?')) deleteCostMutation.mutate(c.id); }}
                          className="text-xs text-red-600 hover:text-red-800"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t font-medium">
                    <td colSpan={4} className="py-2">Total</td>
                    <td className="py-2 text-right font-mono">
                      R {costs.reduce((sum, c) => sum + Number(c.amount), 0).toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            ) : (
              <p className="text-sm text-gray-400">No production costs recorded yet.</p>
            )}
          </Card>

          {showAddCost && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
                <h3 className="text-lg font-semibold mb-4">Add Production Cost</h3>
                <form onSubmit={handleAddCost} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                    <select name="category" required className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
                      {COST_CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <input name="description" required className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Amount (ZAR)</label>
                    <input name="amount" type="number" step="0.01" min="0" required className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Vendor</label>
                    <input name="vendor" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Paid Date</label>
                    <input name="paidDate" type="date" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
                  </div>
                  {addCostMutation.isError && (
                    <p className="text-sm text-red-600">Failed to add cost. Please try again.</p>
                  )}
                  <div className="flex justify-end gap-3 pt-2">
                    <button type="button" onClick={() => setShowAddCost(false)} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                      Cancel
                    </button>
                    <button type="submit" disabled={addCostMutation.isPending} className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
                      {addCostMutation.isPending ? 'Adding...' : 'Add Cost'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          <Card
            title="Print Runs"
            action={
              <button
                onClick={() => setShowAddPrintRun(true)}
                className="rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800"
              >
                + New Print Run
              </button>
            }
          >
            {printRuns.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-gray-500">
                      <th className="pb-2">Run #</th>
                      <th className="pb-2">GRN #</th>
                      <th className="pb-2">Printer</th>
                      <th className="pb-2 text-right">Ordered</th>
                      <th className="pb-2 text-right">Received</th>
                      <th className="pb-2 text-right">Cost</th>
                      <th className="pb-2">Expected</th>
                      <th className="pb-2">Status</th>
                      <th className="pb-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {printRuns.map((r) => (
                      <tr key={r.id}>
                        <td className="py-2 font-semibold">{r.printRunNumber}</td>
                        <td className="py-2 font-mono text-xs">{r.number}</td>
                        <td className="py-2">{r.printerName}</td>
                        <td className="py-2 text-right">{r.quantityOrdered}</td>
                        <td className="py-2 text-right">{r.quantityReceived ?? '—'}</td>
                        <td className="py-2 text-right font-mono">R {Number(r.totalCost).toFixed(2)}</td>
                        <td className="py-2 text-gray-500">{r.expectedDeliveryDate ? r.expectedDeliveryDate.split('T')[0] : '—'}</td>
                        <td className="py-2">
                          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${printRunStatusColors[r.status] || 'bg-gray-100 text-gray-600'}`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="py-2 text-right space-x-2">
                          {r.status !== 'RECEIVED' && r.status !== 'CANCELLED' && (
                            <button
                              onClick={() => setReceivingRunId(r.id)}
                              className="text-xs text-blue-600 hover:text-blue-800"
                            >
                              Mark Received
                            </button>
                          )}
                          {r.status !== 'RECEIVED' && r.status !== 'PARTIAL' && (
                            <button
                              onClick={() => { if (confirm('Delete this print run?')) deletePrintRunMutation.mutate(r.id); }}
                              className="text-xs text-red-600 hover:text-red-800"
                            >
                              Delete
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-gray-400">No print runs recorded yet.</p>
            )}
          </Card>

          {showAddPrintRun && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
                <h3 className="text-lg font-semibold mb-4">New Print Run</h3>
                <form onSubmit={handleAddPrintRun} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Printer Name</label>
                    <input name="printerName" required className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Quantity Ordered</label>
                    <input name="quantityOrdered" type="number" min="1" required className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Total Cost (ZAR)</label>
                    <input name="totalCost" type="number" step="0.01" min="0" required className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Expected Delivery Date</label>
                    <input name="expectedDeliveryDate" type="date" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                    <textarea name="notes" rows={2} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
                  </div>
                  {addPrintRunMutation.isError && (
                    <p className="text-sm text-red-600">Failed to create print run. Please try again.</p>
                  )}
                  <div className="flex justify-end gap-3 pt-2">
                    <button type="button" onClick={() => setShowAddPrintRun(false)} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                      Cancel
                    </button>
                    <button type="submit" disabled={addPrintRunMutation.isPending} className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
                      {addPrintRunMutation.isPending ? 'Creating...' : 'Create Print Run'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          <TitleProfitLoss titleId={id!} />

          {receivingRunId && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
                <h3 className="text-lg font-semibold mb-4">Mark as Received</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Enter the actual quantity received. If less than ordered, the print run will be marked as Partial.
                  The received quantity will be added to warehouse inventory automatically.
                </p>
                <form onSubmit={handleReceive} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Quantity Received</label>
                    <input
                      name="quantityReceived"
                      type="number"
                      min="1"
                      defaultValue={printRuns.find((r) => r.id === receivingRunId)?.quantityOrdered}
                      required
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                    <textarea name="notes" rows={2} placeholder="e.g. 5 copies damaged in transit" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
                  </div>
                  {receivePrintRunMutation.isError && (
                    <p className="text-sm text-red-600">Failed to mark as received. Please try again.</p>
                  )}
                  <div className="flex justify-end gap-3 pt-2">
                    <button type="button" onClick={() => setReceivingRunId(null)} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                      Cancel
                    </button>
                    <button type="submit" disabled={receivePrintRunMutation.isPending} className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
                      {receivePrintRunMutation.isPending ? 'Saving...' : 'Confirm Receipt'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function DI({ label, value, badge }: { label: string; value: string | null | undefined; badge?: string }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900">
        {badge && value ? (
          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badge}`}>{value}</span>
        ) : (
          value ?? '—'
        )}
      </dd>
    </div>
  );
}

function PLRow({ label, value, indent = false, bold = false, border = false, positive }: {
  label: string; value: number; indent?: boolean; bold?: boolean; border?: boolean; positive?: boolean;
}) {
  const color = positive !== undefined
    ? (positive ? 'text-green-700' : 'text-red-600')
    : 'text-gray-900';
  return (
    <div className={`flex justify-between py-1.5 ${border ? 'border-t border-gray-200 mt-1 pt-2' : ''} ${indent ? 'pl-4' : ''}`}>
      <span className={`text-sm ${bold ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>{label}</span>
      <span className={`text-sm font-mono ${bold ? 'font-semibold' : ''} ${color}`}>{formatR(value)}</span>
    </div>
  );
}

function TitleProfitLoss({ titleId }: { titleId: string }) {
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['title-pl', titleId],
    queryFn: () => api<{ data: TitlePLData }>(`/reports/title-pl/${titleId}`),
    enabled: expanded,
  });

  const pl = data?.data;

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50"
      >
        <h3 className="text-sm font-semibold text-gray-900">Title Profit & Loss</h3>
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="px-5 pb-5 border-t border-gray-100">
          {isLoading && <p className="text-sm text-gray-500 py-4">Calculating...</p>}
          {isError && <p className="text-sm text-red-600 py-4">Failed to load P&L data.</p>}
          {pl && (
            <div className="mt-3 space-y-0">
              {/* Revenue */}
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mt-3 mb-1">Revenue</p>
              <PLRow label="Gross Revenue (at RRP)" value={pl.grossRevenue} />
              <PLRow label="Channel Discounts" value={-pl.channelDiscounts} indent />
              <PLRow label="Net Revenue" value={pl.netRevenue} bold />
              {pl.creditNotes > 0 && <PLRow label="Credit Notes" value={-pl.creditNotes} indent />}
              {pl.creditNotes > 0 && <PLRow label="Adjusted Net Revenue" value={pl.adjustedNetRevenue} bold />}

              {/* Costs */}
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mt-4 mb-1">Costs</p>
              <PLRow label="Production Costs" value={-pl.productionCosts} indent />
              {pl.printRunCosts > 0 && <PLRow label="Print Run Costs" value={-pl.printRunCosts} indent />}
              {pl.authorAdvance > 0 && <PLRow label="Author Advance" value={-pl.authorAdvance} indent />}
              {pl.royaltiesPaid > 0 && <PLRow label="Royalties Paid" value={-pl.royaltiesPaid} indent />}
              <PLRow label="Total Costs" value={-pl.totalCosts} bold />

              {/* Net Profit */}
              <PLRow
                label="Net Profit"
                value={pl.netProfit}
                bold
                border
                positive={pl.netProfit >= 0}
              />

              {/* Channel breakdown */}
              {pl.breakdown.salesByChannel.length > 0 && (
                <details className="mt-4">
                  <summary className="text-xs font-semibold uppercase tracking-wider text-gray-400 cursor-pointer hover:text-gray-600">
                    Sales by Channel
                  </summary>
                  <div className="mt-2 rounded-md border border-gray-100 overflow-hidden">
                    <table className="min-w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Partner</th>
                          <th className="px-3 py-2 text-right font-medium text-gray-500">Units</th>
                          <th className="px-3 py-2 text-right font-medium text-gray-500">Gross</th>
                          <th className="px-3 py-2 text-right font-medium text-gray-500">Net</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {pl.breakdown.salesByChannel.map((ch, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-3 py-1.5 text-gray-700">{ch.partnerName}</td>
                            <td className="px-3 py-1.5 text-right font-mono text-gray-700">{ch.unitsSold}</td>
                            <td className="px-3 py-1.5 text-right font-mono text-gray-700">{formatR(ch.grossAmount)}</td>
                            <td className="px-3 py-1.5 text-right font-mono text-gray-700">{formatR(ch.netAmount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
