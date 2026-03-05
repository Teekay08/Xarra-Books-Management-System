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

interface ReportData {
  authorName: string;
  lines: RoyaltyLine[];
  totals: Omit<RoyaltyLine, 'bookTitle' | 'authorName' | 'retailPrice' | 'salesPeriod'>;
  periodFrom: string;
  periodTo: string;
}

function fmt(v: number) {
  return `R ${v.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

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
      <PageHeader title="Author Sales & Royalty Report" subtitle="Detailed royalty calculations per title for an author" />

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

      {report && report.lines.length === 0 && (
        <p className="text-sm text-gray-500">No data found for the selected period.</p>
      )}

      {report && report.lines.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-green-700">
                {[
                  'Book Title', 'Author', 'Retail Price', 'Sales Period',
                  'Qty Supplied SOR', 'Qty Sold', 'Qty Returned', 'Kindle Sales Qty',
                  'Rand Amount Received', 'Total Ebook Sales', 'Total Physical Sales',
                  'Royalty Physical (5%)', 'Royalty E-Book (25%)', 'Less Advance', 'Disbursement',
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
                  <td className="px-3 py-2 text-right whitespace-nowrap">{fmt(line.royaltyPayoutPhysical)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{fmt(line.royaltyPayoutEbook)}</td>
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
      )}

      {report && report.lines.length > 0 && (
        <div className="mt-8 max-w-3xl rounded-lg border border-gray-200 bg-gray-50 p-6">
          <h3 className="text-sm font-semibold text-green-800 mb-3">Notes — Royalty Terms</h3>
          <div className="space-y-3 text-sm text-gray-700">
            <p><span className="font-semibold text-green-800">7.1</span> The Author shall receive a royalty of <strong>5%</strong> of the Total Sales of each copy of the Work sold in print format for the first 2,000 copies sold. For the next tranche, the royalty increases to <strong>10%</strong>, and thereafter to <strong>15%</strong> of Total Sales.</p>
            <p><span className="font-semibold text-green-800">7.2</span> The Author shall receive a royalty of <strong>25%</strong> of Net Receipts from E-Book sales. The e-book royalty rate shall be subject to annual review.</p>
            <p><span className="font-semibold text-green-800">7.3</span> The Advance (if applicable) is payable in three equal parts: upon signature of the Agreement, upon delivery of the final manuscript, and upon publication. Royalties shall not be payable until the Advance has been fully recouped from earned royalties.</p>
            <p><span className="font-semibold text-green-800">7.4</span> No royalty shall be payable on copies used for promotional purposes, review copies, or copies lost or damaged in transit or storage.</p>
          </div>
        </div>
      )}
    </div>
  );
}
