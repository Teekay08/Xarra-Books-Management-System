import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api, type PaginatedResponse } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { SearchBar } from '../../components/SearchBar';
import { DataTable } from '../../components/DataTable';
import { Pagination } from '../../components/Pagination';

interface CashSaleLine {
  id: string;
  quantity: number;
  unitPrice: string;
  discount: string;
  lineTotal: string;
  title?: { title: string };
}

interface CashSale {
  id: string;
  saleNumber: string;
  customerName: string | null;
  saleDate: string;
  paymentMethod: string;
  paymentReference: string | null;
  subtotal: string;
  vatAmount: string;
  total: string;
  taxInclusive: boolean;
  notes: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  lines?: CashSaleLine[];
}

const PAYMENT_METHODS = ['ALL', 'CASH', 'CARD', 'EFT', 'MOBILE'] as const;

function formatCurrency(val: string | number): string {
  return `R ${Number(val).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function CashSaleList() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<string>('ALL');

  const { data, isLoading } = useQuery({
    queryKey: ['cash-sales', page, search, paymentMethod],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
        search,
      });
      if (paymentMethod !== 'ALL') params.set('paymentMethod', paymentMethod);
      return api<PaginatedResponse<CashSale>>(`/sales/cash-sales?${params.toString()}`);
    },
  });

  const handleSearch = useCallback((v: string) => {
    setSearch(v);
    setPage(1);
  }, []);

  const handlePaymentMethodChange = useCallback((method: string) => {
    setPaymentMethod(method);
    setPage(1);
  }, []);

  const columns = [
    {
      key: 'saleNumber',
      header: 'Sale #',
      render: (s: CashSale) => <span className="font-mono">{s.saleNumber}</span>,
    },
    {
      key: 'customerName',
      header: 'Customer',
      render: (s: CashSale) => s.customerName || 'Walk-in',
    },
    {
      key: 'saleDate',
      header: 'Date',
      render: (s: CashSale) => new Date(s.saleDate).toLocaleDateString('en-ZA'),
    },
    {
      key: 'paymentMethod',
      header: 'Payment Method',
      render: (s: CashSale) => s.paymentMethod,
    },
    {
      key: 'total',
      header: 'Total',
      render: (s: CashSale) => <span className="font-mono">{formatCurrency(s.total)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (s: CashSale) => {
        const voided = !!s.voidedAt;
        return (
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
              voided ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
            }`}
          >
            {voided ? 'VOIDED' : 'COMPLETED'}
          </span>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader
        title="Cash Sales"
        subtitle="Walk-in and counter sales"
        action={
          <button
            onClick={() => navigate('/sales/cash-sales/new')}
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
          >
            + New Sale
          </button>
        }
      />

      <div className="mb-4 flex items-center gap-4">
        <div className="flex-1">
          <SearchBar value={search} onChange={handleSearch} placeholder="Search by sale #, customer..." />
        </div>
        <div className="flex gap-1">
          {PAYMENT_METHODS.map((method) => (
            <button
              key={method}
              onClick={() => handlePaymentMethodChange(method)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                paymentMethod === method
                  ? 'bg-green-700 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {method}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-gray-400">Loading...</div>
      ) : (
        <>
          <DataTable
            columns={columns}
            data={data?.data ?? []}
            onRowClick={(s) => navigate(`/sales/cash-sales/${s.id}`)}
            emptyMessage="No cash sales yet"
          />
          {data?.pagination && (
            <Pagination
              page={data.pagination.page}
              totalPages={data.pagination.totalPages}
              total={data.pagination.total}
              onPageChange={setPage}
            />
          )}
        </>
      )}
    </div>
  );
}
