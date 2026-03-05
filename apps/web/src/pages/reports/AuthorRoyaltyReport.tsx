import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

interface Author {
  id: string;
  legalName: string;
  penName: string | null;
}

interface RoyaltyLine {
  bookTitle: string;
  authorName: string;
  retailPrice: number;
  salesPeriod: string;
  printRoyaltyRate?: number;
  ebookRoyaltyRate?: number;
  qtySorSupplied: number;
  qtySold: number;
  qtyReturned: number;
  kindleSalesQty: number;
  randAmountReceived: number;
  totalEbookSalesAmount: number;
  totalPhysicalSalesAmount: number;
  royaltyPayoutPhysical: number;
  royaltyPayoutEbook: number;
  lessOwingAdvance: number;
  disbursement: number;
}

interface BalanceSummary {
  lifetimeGrossRoyalty: number;
  lifetimeAdvanceDeducted: number;
  lifetimeNetPayable: number;
  totalPaid: number;
  totalUnpaid: number;
  totalAdvanceOriginal: number;
  totalAdvanceRecovered: number;
}

interface PaymentHistoryItem {
  id: string;
  number: string;
  periodFrom: string;
  periodTo: string;
  grossRoyalty: number;
  advanceDeducted: number;
  netPayable: number;
  previouslyPaid: number;
  amountDue: number;
  amountPaid: number;
  status: string;
  paymentMethod?: string | null;
  bankReference?: string | null;
  paidAt?: string | null;
  createdAt: string;
}

interface PaymentScheduleItem {
  titleId: string;
  bookTitle: string;
  frequency: string;
  minimumPayment: number;
  nextPeriodFrom: string;
  nextPeriodTo: string;
  nextDueDate: string;
  isOverdue: boolean;
}

interface ReportData {
  authorName: string;
  lines: RoyaltyLine[];
  totals: Omit<RoyaltyLine, 'bookTitle' | 'authorName' | 'retailPrice' | 'salesPeriod' | 'printRoyaltyRate' | 'ebookRoyaltyRate'>;
  balanceSummary?: BalanceSummary;
  paymentHistory?: PaymentHistoryItem[];
  paymentSchedule?: PaymentScheduleItem[];
  periodFrom: string;
  periodTo: string;
}

function fmt(v: number) {
  return `R ${v.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(v: number) {
  return `${(v * 100).toFixed(1)}%`;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

const statusColors: Record<string, string> = {
  COMPLETED: 'bg-green-100 text-green-800',
  PAID: 'bg-green-100 text-green-800',
  PENDING: 'bg-amber-100 text-amber-800',
  PROCESSING: 'bg-blue-100 text-blue-800',
  FAILED: 'bg-red-100 text-red-800',
  REVERSED: 'bg-red-100 text-red-800',
  APPROVED: 'bg-blue-100 text-blue-800',
  CALCULATED: 'bg-gray-100 text-gray-800',
};

const currentYear = new Date().getFullYear();

export function AuthorRoyaltyReport() {
  const [authorId, setAuthorId] = useState('');
  const [from, setFrom] = useState(`${currentYear}-01-01`);
  const [to, setTo] = useState(new Date().toISOString().split('T')[0]);

  const { data: authorsData } = useQuery({
    queryKey: ['authors-list'],
    queryFn: () => api<{ data: Author[] }>('/authors?limit=500'),
  });

  const { data: reportData, isLoading, isFetching } = useQuery({
    queryKey: ['author-royalty', authorId, from, to],
    queryFn: () => api<{ data: ReportData }>(`/reports/author-royalty?authorId=${authorId}&from=${from}&to=${to}`),
    enabled: !!authorId,
  });

  const report = reportData?.data;
  const cls = 'rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500';

  function handleDownloadPdf() {
    window.open(`/api/v1/reports/author-royalty/pdf?authorId=${authorId}&from=${from}&to=${to}`, '_blank');
  }

  return (
    <div>
      <PageHeader title="Author Sales & Royalty Report" subtitle="Detailed royalty calculations, payment history, and upcoming schedule" />

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6 items-end">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Author</label>
          <select value={authorId} onChange={e => setAuthorId(e.target.value)} className={cls}>
            <option value="">Select author...</option>
            {authorsData?.data?.map((a) => (
              <option key={a.id} value={a.id}>{a.penName || a.legalName}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">From</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={cls} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className={cls} />
        </div>
        {report && (
          <button
            onClick={handleDownloadPdf}
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
          >
            Download PDF
          </button>
        )}
      </div>

      {!authorId && (
        <p className="text-sm text-gray-500">Select an author to generate the report.</p>
      )}

      {(isLoading || isFetching) && authorId && (
        <p className="text-sm text-gray-500">Loading report...</p>
      )}

      {report && (
        <>
          {/* ===== BALANCE SUMMARY ===== */}
          {report.balanceSummary && (
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-green-800 mb-4">Lifetime Balance Summary</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                  <p className="text-xs font-medium uppercase text-gray-500">Lifetime Gross Royalty</p>
                  <p className="text-xl font-bold text-green-800">{fmt(report.balanceSummary.lifetimeGrossRoyalty)}</p>
                </div>
                <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                  <p className="text-xs font-medium uppercase text-gray-500">Lifetime Net Payable</p>
                  <p className="text-xl font-bold text-green-800">{fmt(report.balanceSummary.lifetimeNetPayable)}</p>
                </div>
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                  <p className="text-xs font-medium uppercase text-gray-500">Total Paid to Date</p>
                  <p className="text-xl font-bold text-blue-800">{fmt(report.balanceSummary.totalPaid)}</p>
                </div>
                <div className={`rounded-lg border p-4 ${report.balanceSummary.totalUnpaid > 0 ? 'border-amber-200 bg-amber-50' : 'border-green-200 bg-green-50'}`}>
                  <p className="text-xs font-medium uppercase text-gray-500">Outstanding / Unpaid</p>
                  <p className={`text-xl font-bold ${report.balanceSummary.totalUnpaid > 0 ? 'text-amber-700' : 'text-green-800'}`}>
                    {fmt(report.balanceSummary.totalUnpaid)}
                  </p>
                </div>
              </div>
              {/* Advance info */}
              {report.balanceSummary.totalAdvanceOriginal > 0 && (
                <div className="mt-3 flex gap-4 text-sm text-gray-600">
                  <span>Advance: {fmt(report.balanceSummary.totalAdvanceOriginal)}</span>
                  <span>Recovered: {fmt(report.balanceSummary.totalAdvanceRecovered)}</span>
                  <span className="font-medium">
                    ({report.balanceSummary.totalAdvanceOriginal > 0
                      ? Math.round(report.balanceSummary.totalAdvanceRecovered / report.balanceSummary.totalAdvanceOriginal * 100)
                      : 100}% recovered)
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ===== SALES & ROYALTY TABLE ===== */}
          {report.lines.length === 0 ? (
            <p className="text-sm text-gray-500 mb-6">No sales data found for the selected period.</p>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-green-800 mb-3">Sales & Royalty Breakdown — Current Period</h2>
              <div className="overflow-x-auto mb-8">
                <table className="min-w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b-2 border-green-700">
                      {[
                        'Book Title', 'Author', 'Retail Price', 'Sales Period',
                        'Qty Supplied SOR', 'Qty Sold', 'Qty Returned', 'Kindle Sales Qty',
                        'Rand Amount Received', 'Total Ebook Sales', 'Total Physical Sales',
                        'Royalty Physical', 'Royalty E-Book', 'Less Advance', 'Disbursement',
                      ].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500 whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.lines.map((line, i) => (
                      <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-3 py-2 whitespace-nowrap">{line.bookTitle}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{line.authorName}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">{fmt(line.retailPrice)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{line.salesPeriod}</td>
                        <td className="px-3 py-2 text-right">{line.qtySorSupplied}</td>
                        <td className="px-3 py-2 text-right">{line.qtySold}</td>
                        <td className="px-3 py-2 text-right">{line.qtyReturned}</td>
                        <td className="px-3 py-2 text-right">{line.kindleSalesQty}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">{fmt(line.randAmountReceived)}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">{fmt(line.totalEbookSalesAmount)}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">{fmt(line.totalPhysicalSalesAmount)}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {fmt(line.royaltyPayoutPhysical)}
                          <span className="ml-1 text-xs text-gray-400">({line.printRoyaltyRate ? fmtPct(line.printRoyaltyRate) : '5%'})</span>
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {fmt(line.royaltyPayoutEbook)}
                          <span className="ml-1 text-xs text-gray-400">({line.ebookRoyaltyRate ? fmtPct(line.ebookRoyaltyRate) : '25%'})</span>
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">{fmt(line.lessOwingAdvance)}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap font-semibold">{fmt(line.disbursement)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-green-700 font-bold">
                      <td colSpan={4} className="px-3 py-2">TOTALS</td>
                      <td className="px-3 py-2 text-right">{report.totals.qtySorSupplied}</td>
                      <td className="px-3 py-2 text-right">{report.totals.qtySold}</td>
                      <td className="px-3 py-2 text-right">{report.totals.qtyReturned}</td>
                      <td className="px-3 py-2 text-right">{report.totals.kindleSalesQty}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">{fmt(report.totals.randAmountReceived)}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">{fmt(report.totals.totalEbookSalesAmount)}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">{fmt(report.totals.totalPhysicalSalesAmount)}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">{fmt(report.totals.royaltyPayoutPhysical)}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">{fmt(report.totals.royaltyPayoutEbook)}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">{fmt(report.totals.lessOwingAdvance)}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap text-green-800">{fmt(report.totals.disbursement)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}

          {/* ===== PAYMENT HISTORY ===== */}
          {report.paymentHistory && report.paymentHistory.length > 0 && (
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-green-800 mb-3">Payment History</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b-2 border-green-700">
                      {['Payment #', 'Period', 'Gross Royalty', 'Advance Deducted', 'Net Payable', 'Amount Paid', 'Status', 'Bank Ref', 'Paid Date'].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.paymentHistory.map((p) => (
                      <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-3 py-2 font-semibold whitespace-nowrap">{p.number}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs">{fmtDate(p.periodFrom)} — {fmtDate(p.periodTo)}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">{fmt(p.grossRoyalty)}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">{fmt(p.advanceDeducted)}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">{fmt(p.netPayable)}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap font-semibold">{fmt(p.amountPaid)}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${statusColors[p.status] || 'bg-gray-100 text-gray-800'}`}>
                            {p.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-600">{p.bankReference || '—'}</td>
                        <td className="px-3 py-2 text-xs text-gray-600">{p.paidAt ? fmtDate(p.paidAt) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {report.paymentHistory && report.paymentHistory.length === 0 && (
            <p className="text-sm text-gray-500 mb-6">No payment history recorded for this author.</p>
          )}

          {/* ===== PAYMENT SCHEDULE ===== */}
          {report.paymentSchedule && report.paymentSchedule.length > 0 && (
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-green-800 mb-3">Upcoming Payment Schedule</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b-2 border-green-700">
                      {['Title', 'Frequency', 'Min. Payment', 'Next Period', 'Due Date', 'Status'].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.paymentSchedule.map((s) => (
                      <tr key={s.titleId} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-3 py-2 whitespace-nowrap">{s.bookTitle}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{s.frequency.replace('_', ' ')}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">{fmt(s.minimumPayment)}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs">{fmtDate(s.nextPeriodFrom)} — {fmtDate(s.nextPeriodTo)}</td>
                        <td className={`px-3 py-2 whitespace-nowrap ${s.isOverdue ? 'text-red-600 font-bold' : ''}`}>
                          {fmtDate(s.nextDueDate)}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${s.isOverdue ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                            {s.isOverdue ? 'OVERDUE' : 'UPCOMING'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ===== ROYALTY TERMS NOTES ===== */}
          {report.lines.length > 0 && (
            <div className="mt-4 max-w-3xl rounded-lg border border-gray-200 bg-gray-50 p-6">
              <h3 className="text-sm font-semibold text-green-800 mb-3">Notes — Royalty Terms</h3>
              <div className="space-y-3 text-sm text-gray-700">
                <p><span className="font-semibold text-green-800">7.1</span> The Author shall receive a royalty of <strong>5%</strong> of the Total Sales of each copy of the Work sold in print format for the first 2,000 copies sold. For the next tranche, the royalty increases to <strong>10%</strong>, and thereafter to <strong>15%</strong> of Total Sales.</p>
                <p><span className="font-semibold text-green-800">7.2</span> The Author shall receive a royalty of <strong>25%</strong> of Net Receipts from E-Book sales. The e-book royalty rate shall be subject to annual review.</p>
                <p><span className="font-semibold text-green-800">7.3</span> The Advance (if applicable) is payable in three equal parts: upon signature of the Agreement, upon delivery of the final manuscript, and upon publication. Royalties shall not be payable until the Advance has been fully recouped from earned royalties.</p>
                <p><span className="font-semibold text-green-800">7.4</span> No royalty shall be payable on copies used for promotional purposes, review copies, or copies lost or damaged in transit or storage.</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
