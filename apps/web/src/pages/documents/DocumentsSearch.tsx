import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api, type PaginatedResponse } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { SearchBar } from '../../components/SearchBar';
import { Pagination } from '../../components/Pagination';
import { formatR } from '../../lib/format';

interface DocResult {
  type: string;
  number: string;
  entityName: string;
  date: string;
  amount: string;
  status: string;
  id: string;
  url: string;
}

const DOC_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'invoice', label: 'Invoices' },
  { value: 'credit_note', label: 'Credit Notes' },
  { value: 'debit_note', label: 'Debit Notes' },
  { value: 'quotation', label: 'Quotations' },
  { value: 'purchase_order', label: 'Purchase Orders' },
  { value: 'return', label: 'Returns' },
  { value: 'cash_sale', label: 'Cash Sales' },
  { value: 'royalty_payment', label: 'Royalty Payments' },
];

const TYPE_LABELS: Record<string, string> = {
  invoice: 'Invoice',
  credit_note: 'Credit Note',
  debit_note: 'Debit Note',
  quotation: 'Quotation',
  purchase_order: 'Purchase Order',
  return: 'Return',
  cash_sale: 'Cash Sale',
  royalty_payment: 'Royalty Payment',
};

const TYPE_COLORS: Record<string, string> = {
  invoice: 'bg-blue-50 text-blue-700',
  credit_note: 'bg-green-50 text-green-700',
  debit_note: 'bg-orange-50 text-orange-700',
  quotation: 'bg-purple-50 text-purple-700',
  purchase_order: 'bg-indigo-50 text-indigo-700',
  return: 'bg-amber-50 text-amber-700',
  cash_sale: 'bg-teal-50 text-teal-700',
  royalty_payment: 'bg-pink-50 text-pink-700',
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'text-amber-600',
  ISSUED: 'text-blue-600',
  PAID: 'text-green-600',
  PARTIAL: 'text-blue-500',
  OVERDUE: 'text-red-600',
  VOIDED: 'text-gray-400',
  ACTIVE: 'text-green-600',
  SENT: 'text-blue-600',
  ACCEPTED: 'text-green-600',
  EXPIRED: 'text-red-500',
  CONVERTED: 'text-purple-600',
  RECEIVED: 'text-green-600',
  COMPLETED: 'text-green-600',
  PENDING: 'text-amber-600',
  PROCESSING: 'text-blue-600',
};

export function DocumentsSearch() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);

  const handleSearch = useCallback((v: string) => {
    setSearch(v);
    setPage(1);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['documents-search', search, typeFilter, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search) params.set('q', search);
      if (typeFilter) params.set('type', typeFilter);
      return api<PaginatedResponse<DocResult>>(`/documents/search?${params}`);
    },
    enabled: search.length > 0 || typeFilter.length > 0,
  });

  const results = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div>
      <PageHeader
        title="Documents"
        subtitle="Search across all document types — invoices, credit notes, returns, payments, and more"
      />

      <div className="mb-5 flex gap-3 flex-wrap">
        <div className="flex-1 min-w-64">
          <SearchBar
            value={search}
            onChange={handleSearch}
            placeholder="Search by document number, partner, or author name..."
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          {DOC_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {!search && !typeFilter && (
        <div className="text-center py-16 text-gray-400">
          <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-sm font-medium text-gray-500">Search all documents</p>
          <p className="text-xs text-gray-400 mt-1">Enter a document number, partner name, or author name to search</p>

          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-xl mx-auto">
            {DOC_TYPES.slice(1).map((t) => (
              <button
                key={t.value}
                onClick={() => { setTypeFilter(t.value); setPage(1); }}
                className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300"
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {(search || typeFilter) && (
        <>
          {isLoading ? (
            <div className="rounded-lg border border-gray-200 p-8 text-center text-sm text-gray-400">
              Searching...
            </div>
          ) : results.length === 0 ? (
            <div className="rounded-lg border border-gray-200 p-8 text-center text-sm text-gray-400">
              No documents found matching your search
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Number</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Partner / Author</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Date</th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Amount</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
                    <th className="px-4 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {results.map((doc) => (
                    <tr
                      key={`${doc.type}-${doc.id}`}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => navigate(doc.url)}
                    >
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[doc.type] ?? 'bg-gray-50 text-gray-600'}`}>
                          {TYPE_LABELS[doc.type] ?? doc.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm font-mono font-medium text-gray-900">{doc.number}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{doc.entityName}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {doc.date ? new Date(doc.date).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-mono text-gray-700">
                        {Number(doc.amount) > 0 ? formatR(doc.amount) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium ${STATUS_COLORS[doc.status] ?? 'text-gray-600'}`}>
                          {doc.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {pagination && pagination.totalPages > 1 && (
            <div className="mt-4">
              <Pagination
                page={pagination.page}
                totalPages={pagination.totalPages}
                total={pagination.total}
                onPageChange={setPage}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
