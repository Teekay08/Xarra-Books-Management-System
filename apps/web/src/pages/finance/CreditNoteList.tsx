import { useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { formatR } from '../../lib/format';
import { ExportButton } from '../../components/ExportButton';
import { downloadFromApi, exportUrl } from '../../lib/export';
import { DateRangeExportModal } from '../../components/DateRangeExportModal';
import { Pagination } from '../../components/Pagination';
import { ActionMenu } from '../../components/ActionMenu';

interface CreditNote {
  id: string; number: string; total: string; reason: string;
  status: string; voidedAt: string | null; createdAt: string;
  partner: { name: string }; invoice: { number: string };
}

const STATUS_TABS = [
  { value: '',               label: 'All'            },
  { value: 'DRAFT',         label: 'Draft'          },
  { value: 'PENDING_REVIEW',label: 'Pending Review' },
  { value: 'APPROVED',      label: 'Approved'       },
  { value: 'SENT',          label: 'Sent'           },
  { value: 'VOIDED',        label: 'Voided'         },
];

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  DRAFT:          { label: 'Draft',          color: 'text-gray-600',  bg: 'bg-gray-100'  },
  PENDING_REVIEW: { label: 'Pending Review', color: 'text-amber-700', bg: 'bg-amber-50'  },
  APPROVED:       { label: 'Approved',       color: 'text-green-700', bg: 'bg-green-50'  },
  SENT:           { label: 'Sent',           color: 'text-blue-700',  bg: 'bg-blue-50'   },
  VOIDED:         { label: 'Voided',         color: 'text-red-600',   bg: 'bg-red-50'    },
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function CreditNoteList() {
  const navigate = useNavigate();
  const [page,         setPage]        = useState(1);
  const [search,       setSearch]      = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [exportOpen,   setExportOpen]  = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['credit-notes', page, search, statusFilter],
    queryFn: () => api<{ data: { items: CreditNote[]; total: number; page: number; limit: number } }>(
      `/finance/credit-notes?page=${page}&limit=25&search=${encodeURIComponent(search)}${statusFilter ? `&status=${statusFilter}` : ''}`
    ),
  });

  const handleSearch = useCallback((v: string) => { setSearch(v); setPage(1); }, []);
  const handleTab    = (v: string) => { setStatusFilter(v); setPage(1); };

  const items      = data?.data?.items ?? [];
  const totalPages = data?.data ? Math.ceil(data.data.total / data.data.limit) : 1;
  const total      = data?.data?.total ?? 0;
  const pending    = items.filter(cn => (cn.voidedAt ? 'VOIDED' : cn.status) === 'PENDING_REVIEW').length;

  return (
    <div className="space-y-5">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Credit Notes</h1>
          <p className="text-xs text-gray-400 mt-0.5">Returns · adjustments · corrections</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton options={[{ label: 'Export CSV', onClick: () => setExportOpen(true) }]} />
          <Link to="/credit-notes/new"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#c0392b] text-white text-xs font-semibold hover:bg-[#a93226] shadow-sm transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
            New Credit Note
          </Link>
        </div>
      </div>

      {/* ── Pending review alert ─────────────────────────────────── */}
      {pending > 0 && statusFilter === '' && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
          <p className="text-sm font-semibold text-amber-800">
            {pending} credit note{pending > 1 ? 's' : ''} awaiting review
          </p>
          <button onClick={() => handleTab('PENDING_REVIEW')} className="ml-auto text-xs font-semibold text-amber-700 underline hover:no-underline">
            Review now →
          </button>
        </div>
      )}

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
          <div className="ml-auto shrink-0 py-2 pl-4">
            <div className="relative">
              <svg className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"/></svg>
              <input value={search} onChange={e => handleSearch(e.target.value)} placeholder="Search credit notes…"
                className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 w-52"/>
            </div>
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="py-14 text-center text-sm text-gray-400">Loading credit notes…</div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <div className="text-4xl opacity-20">📄</div>
            <p className="text-sm font-medium text-gray-400">No credit notes found</p>
            {statusFilter || search ? (
              <button onClick={() => { setStatusFilter(''); setSearch(''); }} className="text-xs text-blue-600 hover:underline">Clear filters</button>
            ) : (
              <Link to="/credit-notes/new" className="text-xs text-[#c0392b] hover:underline">Create your first credit note →</Link>
            )}
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-gray-50/50 border-b border-gray-100">
              <tr>
                <th className="text-left px-5 py-3 font-semibold text-gray-400 uppercase tracking-wide text-[10px]">Number</th>
                <th className="text-left px-5 py-3 font-semibold text-gray-400 uppercase tracking-wide text-[10px]">Invoice</th>
                <th className="text-left px-5 py-3 font-semibold text-gray-400 uppercase tracking-wide text-[10px]">Partner</th>
                <th className="text-left px-5 py-3 font-semibold text-gray-400 uppercase tracking-wide text-[10px]">Reason</th>
                <th className="text-left px-5 py-3 font-semibold text-gray-400 uppercase tracking-wide text-[10px]">Status</th>
                <th className="text-left px-5 py-3 font-semibold text-gray-400 uppercase tracking-wide text-[10px]">Date</th>
                <th className="text-right px-5 py-3 font-semibold text-gray-400 uppercase tracking-wide text-[10px]">Total</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map(cn => {
                const status = cn.voidedAt ? 'VOIDED' : (cn.status || 'DRAFT');
                const st = STATUS_CONFIG[status] ?? STATUS_CONFIG.DRAFT;
                return (
                  <tr key={cn.id} onClick={() => navigate(`/credit-notes/${cn.id}`)}
                    className="group hover:bg-gray-50/60 cursor-pointer transition-colors">
                    <td className="px-5 py-3.5">
                      <span className="font-mono font-semibold text-gray-900 group-hover:text-blue-700 transition-colors">{cn.number}</span>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-gray-500">{cn.invoice?.number ?? '—'}</td>
                    <td className="px-5 py-3.5 text-gray-700 max-w-[140px] truncate">{cn.partner?.name ?? '—'}</td>
                    <td className="px-5 py-3.5 text-gray-500 max-w-[180px] truncate">{cn.reason}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${st.bg} ${st.color}`}>
                        {st.label}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-gray-500">{fmtDate(cn.createdAt)}</td>
                    <td className="px-5 py-3.5 text-right font-mono font-semibold text-gray-900">{formatR(cn.total)}</td>
                    <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                      <ActionMenu items={[
                        { label: 'View Details',  onClick: () => navigate(`/credit-notes/${cn.id}`) },
                        { label: 'Download PDF',  onClick: () => window.open(`/api/v1/finance/credit-notes/${cn.id}/pdf`, '_blank') },
                      ]} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {totalPages > 1 && (
          <div className="border-t border-gray-100 px-5 py-3">
            <Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />
          </div>
        )}
      </div>

      <DateRangeExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        onExport={(from, to) => downloadFromApi(exportUrl('/export/credit-notes', from, to), 'credit-notes.csv')}
        title="Export Credit Notes"
      />
    </div>
  );
}
