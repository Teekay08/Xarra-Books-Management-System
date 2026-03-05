import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api, type PaginatedResponse } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { SearchBar } from '../../components/SearchBar';
import { DataTable } from '../../components/DataTable';
import { Pagination } from '../../components/Pagination';

interface Payment {
  id: string;
  amount: string;
  paymentDate: string;
  paymentMethod: string | null;
  bankReference: string;
  partner?: { name: string };
  allocations?: { invoiceId: string; amount: string }[];
}

export function PaymentList() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['payments', page, search],
    queryFn: () =>
      api<PaginatedResponse<Payment>>(
        `/finance/payments?page=${page}&limit=20&search=${encodeURIComponent(search)}`
      ),
  });

  const handleSearch = useCallback((v: string) => {
    setSearch(v);
    setPage(1);
  }, []);

  const columns = [
    { key: 'paymentDate', header: 'Date', render: (p: Payment) =>
      new Date(p.paymentDate).toLocaleDateString('en-ZA')
    },
    { key: 'partner', header: 'Partner', render: (p: Payment) => p.partner?.name ?? '—' },
    { key: 'amount', header: 'Amount', render: (p: Payment) => (
      <span className="font-mono font-medium text-green-700">R {Number(p.amount).toFixed(2)}</span>
    )},
    { key: 'bankReference', header: 'Bank Reference' },
    { key: 'paymentMethod', header: 'Method' },
    { key: 'allocations', header: 'Allocated', render: (p: Payment) => (
      <span className="text-xs">
        {p.allocations?.length ? `${p.allocations.length} invoice(s)` : 'Unallocated'}
      </span>
    )},
  ];

  return (
    <div>
      <PageHeader
        title="Payments"
        subtitle="Partner payment records"
        action={
          <button
            onClick={() => navigate('/payments/new')}
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
          >
            + Record Payment
          </button>
        }
      />

      <div className="mb-4">
        <SearchBar value={search} onChange={handleSearch} placeholder="Search by bank reference..." />
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-gray-400">Loading...</div>
      ) : (
        <>
          <DataTable
            columns={columns}
            data={data?.data ?? []}
            emptyMessage="No payments recorded"
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
