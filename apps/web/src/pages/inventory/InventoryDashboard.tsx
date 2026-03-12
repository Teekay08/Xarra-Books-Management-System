import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api, type PaginatedResponse } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { SearchBar } from '../../components/SearchBar';
import { ExportButton } from '../../components/ExportButton';
import { downloadFromApi, exportUrl } from '../../lib/export';
import { DateRangeExportModal } from '../../components/DateRangeExportModal';
import { DataTable } from '../../components/DataTable';
import { Pagination } from '../../components/Pagination';

interface StockRow {
  titleId: string;
  title: string;
  isbn13: string | null;
  totalIn: number;
  totalOut: number;
  stockOnHand: number;
  warehouseStock?: number;
  storeStock?: number;
  inTransit?: number;
  consigned?: number;
  takealot?: number;
  returnsPending?: number;
  damaged?: number;
}

interface StockSummary {
  totalInSystem: number;
  availableToDispatch: number;
  atRisk: number;
  soldToDate: number;
}

export function InventoryDashboard() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [exportMovementsModalOpen, setExportMovementsModalOpen] = useState(false);
  const [showLocations, setShowLocations] = useState(false);

  // Fetch system configuration for low stock threshold
  const { data: systemConfig } = useQuery({
    queryKey: ['system-config'],
    queryFn: () => api<{ data: { lowStockThreshold: number } }>('/settings/system-config'),
  });

  const lowStockThreshold = systemConfig?.data?.lowStockThreshold ?? 10;

  const { data, isLoading } = useQuery({
    queryKey: ['inventory-stock', page, search],
    queryFn: () =>
      api<PaginatedResponse<StockRow>>(
        `/inventory/stock?page=${page}&limit=20&search=${encodeURIComponent(search)}`
      ),
  });

  const { data: summary } = useQuery({
    queryKey: ['inventory-summary'],
    queryFn: () => api<{ data: StockSummary }>('/inventory/stock/summary'),
  });

  const { data: locationData } = useQuery({
    queryKey: ['inventory-by-location', page, search],
    queryFn: () =>
      api<PaginatedResponse<StockRow>>(
        `/inventory/stock/by-location?page=${page}&limit=20&search=${encodeURIComponent(search)}`
      ),
    enabled: showLocations,
  });

  const handleSearch = useCallback((v: string) => {
    setSearch(v);
    setPage(1);
  }, []);

  const s = summary?.data;

  const baseColumns = [
    { key: 'title', header: 'Title', render: (r: StockRow) => (
      <div>
        <span className="font-medium">{r.title}</span>
        {r.isbn13 && <span className="ml-2 text-xs text-gray-400">{r.isbn13}</span>}
      </div>
    )},
    { key: 'totalIn', header: 'Total In', render: (r: StockRow) => (
      <span className="font-mono text-green-700">+{r.totalIn}</span>
    )},
    { key: 'totalOut', header: 'Total Out', render: (r: StockRow) => (
      <span className="font-mono text-red-600">-{r.totalOut}</span>
    )},
    { key: 'stockOnHand', header: 'Stock on Hand', render: (r: StockRow) => (
      <span className={`font-mono font-semibold ${
        r.stockOnHand <= 0 ? 'text-red-600' : r.stockOnHand < lowStockThreshold ? 'text-amber-600' : 'text-gray-900'
      }`}>
        {r.stockOnHand}
      </span>
    )},
  ];

  const locationColumns = [
    { key: 'title', header: 'Title', render: (r: StockRow) => (
      <div>
        <span className="font-medium">{r.title}</span>
        {r.isbn13 && <span className="ml-2 text-xs text-gray-400">{r.isbn13}</span>}
      </div>
    )},
    { key: 'warehouseStock', header: 'Warehouse', render: (r: StockRow) => (
      <span className={`font-mono ${(r.warehouseStock ?? 0) <= 0 ? 'text-red-600' : (r.warehouseStock ?? 0) < lowStockThreshold ? 'text-amber-600' : 'text-gray-900'}`}>
        {r.warehouseStock ?? 0}
      </span>
    )},
    { key: 'storeStock', header: 'Store', render: (r: StockRow) => (
      <span className="font-mono text-gray-700">{r.storeStock ?? 0}</span>
    )},
    { key: 'inTransit', header: 'In Transit', render: (r: StockRow) => (
      <span className="font-mono text-blue-600">{r.inTransit ?? 0}</span>
    )},
    { key: 'consigned', header: 'Consigned', render: (r: StockRow) => (
      <span className="font-mono text-amber-600">{r.consigned ?? 0}</span>
    )},
    { key: 'takealot', header: 'Takealot', render: (r: StockRow) => (
      <span className="font-mono text-purple-600">{r.takealot ?? 0}</span>
    )},
    { key: 'returnsPending', header: 'Returns', render: (r: StockRow) => (
      <span className="font-mono text-orange-600">{r.returnsPending ?? 0}</span>
    )},
    { key: 'damaged', header: 'Damaged', render: (r: StockRow) => (
      <span className="font-mono text-red-600">{r.damaged ?? 0}</span>
    )},
    { key: 'stockOnHand', header: 'Total', render: (r: StockRow) => (
      <span className={`font-mono font-semibold ${
        r.stockOnHand <= 0 ? 'text-red-600' : r.stockOnHand < lowStockThreshold ? 'text-amber-600' : 'text-gray-900'
      }`}>
        {r.stockOnHand}
      </span>
    )},
  ];

  const displayData = showLocations ? (locationData?.data ?? data?.data ?? []) : (data?.data ?? []);
  const columns = showLocations ? locationColumns : baseColumns;

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
            <button
              onClick={() => navigate('/inventory/stock-take')}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Stock Take
            </button>
          </div>
        }
      />

      {/* Summary Cards */}
      {s && (
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-lg border bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase text-gray-500">Total in System</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{s.totalInSystem.toLocaleString()}</p>
            <p className="text-xs text-gray-400">Every copy across all locations</p>
          </div>
          <div className="rounded-lg border bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase text-gray-500">Available to Dispatch</p>
            <p className="mt-1 text-2xl font-bold text-green-700">{s.availableToDispatch.toLocaleString()}</p>
            <p className="text-xs text-gray-400">Warehouse stock only</p>
          </div>
          <div className="rounded-lg border bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase text-gray-500">At Risk (SOR)</p>
            <p className="mt-1 text-2xl font-bold text-amber-600">{s.atRisk.toLocaleString()}</p>
            <p className="text-xs text-gray-400">Consigned stock (may be returned)</p>
          </div>
          <div className="rounded-lg border bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase text-gray-500">Sold to Date</p>
            <p className="mt-1 text-2xl font-bold text-blue-700">{s.soldToDate.toLocaleString()}</p>
            <p className="text-xs text-gray-400">Cumulative units sold</p>
          </div>
        </div>
      )}

      <div className="mb-4 flex items-center gap-4">
        <div className="flex-1">
          <SearchBar value={search} onChange={handleSearch} placeholder="Search by title or ISBN..." />
        </div>
        <button
          onClick={() => setShowLocations(!showLocations)}
          className={`rounded-md border px-3 py-2 text-sm font-medium ${
            showLocations ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
          }`}
        >
          {showLocations ? 'Hide Locations' : 'Show Locations'}
        </button>
        <ExportButton options={[
          { label: 'Export Inventory CSV', onClick: () => downloadFromApi('/export/inventory', 'inventory-export.csv') },
          { label: 'Export Movements CSV', onClick: () => setExportMovementsModalOpen(true) },
        ]} />
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-gray-400">Loading...</div>
      ) : (
        <>
          <DataTable
            columns={columns}
            data={displayData}
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
      <DateRangeExportModal
        open={exportMovementsModalOpen}
        onClose={() => setExportMovementsModalOpen(false)}
        onExport={(from, to) => downloadFromApi(exportUrl('/export/inventory-movements', from, to), 'inventory-movements-export.csv')}
        title="Export Inventory Movements"
      />
    </div>
  );
}
