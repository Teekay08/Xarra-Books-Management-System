import { useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api, type PaginatedResponse } from '../../lib/api';
import { formatR } from '../../lib/format';
import { ExportButton } from '../../components/ExportButton';
import { downloadFromApi, exportUrl } from '../../lib/export';
import { DateRangeExportModal } from '../../components/DateRangeExportModal';
import { Pagination } from '../../components/Pagination';
import { ActionMenu } from '../../components/ActionMenu';

interface Invoice {
  id: string; number: string; invoiceDate: string; dueDate: string | null;
  subtotal: string; vatAmount: string; total: string; status: string;
  amountDue?: string;
  partner?: { name: string };
}

const STATUS_TABS = [
  { value: '',        label: 'All'     },
  { value: 'DRAFT',   label: 'Draft'   },
  { value: 'ISSUED',  label: 'Issued'  },
  { value: 'OVERDUE', label: 'Overdue' },
  { value: 'PARTIAL', label: 'Partial' },
  { value: 'PAID',    label: 'Paid'    },
  { value: 'VOIDED',  label: 'Voided'  },
];

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  DRAFT:     { label: 'Draft',     color: 'text-gray-600',   bg: 'bg-gray-100'   },
  ISSUED:    { label: 'Issued',    color: 'text-blue-700',   bg: 'bg-blue-50'    },
  SENT:      { label: 'Sent',      color: 'text-indigo-700', bg: 'bg-indigo-50'  },
  OVERDUE:   { label: 'Overdue',   color: 'text-red-700',    bg: 'bg-red-50'     },
  PARTIAL:   { label: 'Partial',   color: 'text-amber-700',  bg: 'bg-amber-50'   },
  PAID:      { label: 'Paid',      color: 'text-green-700',  bg: 'bg-green-50'   },
  VOIDED:    { label: 'Voided',    color: 'text-gray-500',   bg: 'bg-gray-100'   },
  CANCELLED: { label: 'Cancelled', color: 'text-gray-400',   bg: 'bg-gray-50'    },
};

function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function InvoiceList() {
  const navigate = useNavigate();
  const [page,          setPage]          = useState(1);
  const [search,        setSearch]        = useState('');
  const [statusFilter,  setStatusFilter]  = useState('');
  const [exportOpen,    setExportOpen]    = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', page, search, statusFilter],
    queryFn: () => api<PaginatedResponse<Invoice>>(
      `/finance/invoices?page=${page}&limit=25&search=${encodeURIComponent(search)}${statusFilter ? `&status=${statusFilter}` : ''}`
    ),
  });

  const handleSearch = useCallback((v: string) => { setSearch(v); setPage(1); }, []);
  const handleTab    = (v: string) => { setStatusFilter(v); setPage(1); };

  const invoices = data?.data ?? [];
  const pagination = data?.pagination;

  // Quick summary from current page (rough indicator)
  const overdueCount = invoices.filter(i => i.status === 'OVERDUE').length;

  return (
    <div className="space-y-5">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Invoices</h1>
          <p className="text-xs text-gray-400 mt-0.5">Tax invoices · billing · payments</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton options={[{ label: 'Export CSV', onClick: () => setExportOpen(true) }]} />
          <Link to="/finance/invoices/new"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#c0392b] text-white text-xs font-semibold hover:bg-[#a93226] shadow-sm transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
            New Invoice
          </Link>
        </div>
      </div>

      {/* ── Overdue alert ────────────────────────────────────────── */}
      {overdueCount > 0 && statusFilter === '' && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-3 flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-red-500 shrink-0" />
          <p className="text-sm font-semibold text-red-800">
            {overdueCount} overdue invoice{overdueCount > 1 ? 's' : ''} on this page
          </p>
          <button onClick={() => handleTab('OVERDUE')} className="ml-auto text-xs font-semibold text-red-700 underline hover:no-underline">
            View Overdue →
          </button>
        </div>
      )}

      {/* ── Filters ─────────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        {/* Tab bar */}
        <div className="flex items-center gap-0 px-4 border-b border-gray-100 overflow-x-auto">
          {STATUS_TABS.map(tab => (
            <button key={tab.value} onClick={() => handleTab(tab.value)}
              className={`px-4 py-3 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors ${
                statusFilter === tab.value
                  ? 'border-[#c0392b] text-[#c0392b]'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {tab.label}
            </button>
          ))}
          {/* Search on the right */}
          <div className="ml-auto shrink-0 py-2 pl-4">
            <div className="relative">
              <svg className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"/></svg>
              <input
                value={search}
                onChange={e => handleSearch(e.target.value)}
                placeholder="Search invoices…"
                className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 w-52"
              />
            </div>
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="py-14 text-center text-sm text-gray-400">Loading invoices…</div>
        ) : invoices.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <div className="text-4xl opacity-20">🧾</div>
            <p className="text-sm font-medium text-gray-400">No invoices found</p>
            {statusFilter || search ? (
              <button onClick={() => { setStatusFilter(''); setSearch(''); }} className="text-xs text-blue-600 hover:underline">
                Clear filters
              </button>
            ) : (
              <Link to="/finance/invoices/new" className="text-xs text-[#c0392b] hover:underline">
                Create your first invoice →
              </Link>
            )}
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-gray-50/50 border-b border-gray-100">
              <tr>
                <th className="text-left px-5 py-3 font-semibold text-gray-400 uppercase tracking-wide text-[10px]">Invoice #</th>
                <th className="text-left px-5 py-3 font-semibold text-gray-400 uppercase tracking-wide text-[10px]">Partner</th>
                <th className="text-left px-5 py-3 font-semibold text-gray-400 uppercase tracking-wide text-[10px]">Date</th>
                <th className="text-left px-5 py-3 font-semibold text-gray-400 uppercase tracking-wide text-[10px]">Due</th>
                <th className="text-left px-5 py-3 font-semibold text-gray-400 uppercase tracking-wide text-[10px]">Status</th>
                <th className="text-right px-5 py-3 font-semibold text-gray-400 uppercase tracking-wide text-[10px]">Total</th>
                <th className="text-right px-5 py-3 font-semibold text-gray-400 uppercase tracking-wide text-[10px]">Balance</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {invoices.map(inv => {
                const st = STATUS_CONFIG[inv.status] ?? STATUS_CONFIG.DRAFT;
                const isOverdue = inv.status === 'OVERDUE';
                const amtDue = Number(inv.amountDue ?? (inv.status === 'PAID' ? 0 : inv.total));
                return (
                  <tr key={inv.id}
                    onClick={() => navigate(`/finance/invoices/${inv.id}`)}
                    className="group hover:bg-gray-50/60 cursor-pointer transition-colors">
                    <td className="px-5 py-3.5">
                      <span className="font-mono font-semibold text-gray-900 group-hover:text-blue-700 transition-colors">{inv.number}</span>
                    </td>
                    <td className="px-5 py-3.5 text-gray-700 max-w-[160px] truncate">{inv.partner?.name ?? '—'}</td>
                    <td className="px-5 py-3.5 text-gray-500">{fmtDate(inv.invoiceDate)}</td>
                    <td className="px-5 py-3.5">
                      {inv.dueDate ? (
                        <span className={isOverdue ? 'text-red-600 font-semibold' : 'text-gray-500'}>
                          {fmtDate(inv.dueDate)}
                        </span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${st.bg} ${st.color}`}>
                        {st.label}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono font-medium text-gray-900">{formatR(inv.total)}</td>
                    <td className="px-5 py-3.5 text-right">
                      {amtDue > 0 && inv.status !== 'VOIDED' ? (
                        <span className={`font-mono font-semibold ${isOverdue ? 'text-red-600' : 'text-amber-700'}`}>
                          {formatR(amtDue)}
                        </span>
                      ) : inv.status === 'PAID' ? (
                        <span className="text-green-600 font-semibold text-[10px]">Paid</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                      <ActionMenu items={[
                        { label: 'View Details', onClick: () => navigate(`/finance/invoices/${inv.id}`) },
                        { label: 'Download PDF', onClick: () => window.open(`/api/v1/finance/invoices/${inv.id}/pdf`, '_blank') },
                        { label: 'Print', onClick: () => window.open(`/api/v1/finance/invoices/${inv.id}/pdf`, '_blank') },
                        { label: 'Duplicate', onClick: () => navigate(`/finance/invoices/new?from=${inv.id}`) },
                      ]} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="border-t border-gray-100 px-5 py-3">
            <Pagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} onPageChange={setPage} />
          </div>
        )}
      </div>

      <DateRangeExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        onExport={(from, to) => downloadFromApi(exportUrl('/export/invoices', from, to), 'invoices.csv')}
        title="Export Invoices"
      />
    </div>
  );
}
