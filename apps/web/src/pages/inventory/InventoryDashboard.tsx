import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api, type PaginatedResponse } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { SearchBar } from '../../components/SearchBar';
import { DataTable } from '../../components/DataTable';
import { Pagination } from '../../components/Pagination';

interface StockRow {
  titleId: string;
  title: string;
  isbn13: string | null;
  totalIn: number;
  totalOut: number;
  stockOnHand: number;
}

export function InventoryDashboard() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['inventory-stock', page, search],
    queryFn: () =>
      api<PaginatedResponse<StockRow>>(
        `/inventory/stock?page=${page}&limit=20&search=${encodeURIComponent(search)}`
      ),
  });

  const handleSearch = useCallback((v: string) => {
    setSearch(v);
    setPage(1);
  }, []);

  const columns = [
    { key: 'title', header: 'Title' },
    { key: 'isbn13', header: 'ISBN-13' },
    { key: 'totalIn', header: 'Total In', render: (r: StockRow) => (
      <span className="font-mono text-green-700">+{r.totalIn}</span>
    )},
    { key: 'totalOut', header: 'Total Out', render: (r: StockRow) => (
      <span className="font-mono text-red-600">-{r.totalOut}</span>
    )},
    { key: 'stockOnHand', header: 'Stock on Hand', render: (r: StockRow) => (
      <span className={`font-mono font-semibold ${
        r.stockOnHand <= 0 ? 'text-red-600' : r.stockOnHand < 10 ? 'text-amber-600' : 'text-gray-900'
      }`}>
        {r.stockOnHand}
      </span>
    )},
  ];

  return (
    <div>
      <PageHeader
        title="Inventory"
        subtitle="Stock levels per title"
        action={
          <div className="flex gap-2">
            <button
              onClick={() => navigate('/inventory/receive')}
              className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
            >
              + Receive Stock
            </button>
            <button
              onClick={() => navigate('/inventory/adjust')}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Adjust Stock
            </button>
          </div>
        }
      />

      <div className="mb-4">
        <SearchBar value={search} onChange={handleSearch} placeholder="Search by title or ISBN..." />
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-gray-400">Loading...</div>
      ) : (
        <>
          <DataTable
            columns={columns}
            data={data?.data ?? []}
            onRowClick={(r) => navigate(`/inventory/${r.titleId}/movements`)}
            emptyMessage="No inventory records yet. Receive stock to get started."
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
