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

interface ConsignmentLine {
  qtyDispatched: number;
  qtySold: number;
  qtyReturned: number;
  title?: { title: string };
}

interface Consignment {
  id: string;
  dispatchDate: string | null;
  sorExpiryDate: string | null;
  status: string;
  partner?: { name: string };
  lines?: ConsignmentLine[];
}

const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  DISPATCHED: 'bg-blue-100 text-blue-700',
  DELIVERED: 'bg-indigo-100 text-indigo-700',
  ACKNOWLEDGED: 'bg-green-100 text-green-700',
  PARTIAL_RETURN: 'bg-amber-100 text-amber-700',
  RECONCILED: 'bg-purple-100 text-purple-700',
  CLOSED: 'bg-gray-100 text-gray-500',
};

export function ConsignmentList() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [exportConsignModalOpen, setExportConsignModalOpen] = useState(false);
  const [exportLinesModalOpen, setExportLinesModalOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['consignments', page, search],
    queryFn: () =>
      api<PaginatedResponse<Consignment>>(
        `/consignments?page=${page}&limit=20&search=${encodeURIComponent(search)}`
      ),
  });

  const handleSearch = useCallback((v: string) => {
    setSearch(v);
    setPage(1);
  }, []);

  const columns = [
    { key: 'partner', header: 'Partner', render: (c: Consignment) => c.partner?.name ?? '—' },
    { key: 'dispatchDate', header: 'Dispatch', render: (c: Consignment) =>
      c.dispatchDate ? new Date(c.dispatchDate).toLocaleDateString('en-ZA') : '—'
    },
    { key: 'sorExpiryDate', header: 'SOR Expiry', render: (c: Consignment) => {
      if (!c.sorExpiryDate) return '—';
      const expiry = new Date(c.sorExpiryDate);
      const days = Math.ceil((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      return (
        <span className={days <= 14 ? 'text-red-600 font-medium' : days <= 30 ? 'text-amber-600' : ''}>
          {expiry.toLocaleDateString('en-ZA')} ({days}d)
        </span>
      );
    }},
    { key: 'lines', header: 'Items', render: (c: Consignment) => {
      const total = c.lines?.reduce((s, l) => s + l.qtyDispatched, 0) ?? 0;
      const sold = c.lines?.reduce((s, l) => s + l.qtySold, 0) ?? 0;
      return `${sold}/${total} sold`;
    }},
    { key: 'status', header: 'Status', render: (c: Consignment) => (
      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[c.status] ?? ''}`}>
        {c.status.replace(/_/g, ' ')}
      </span>
    )},
  ];

  return (
    <div>
      <PageHeader
        title="Consignments"
        subtitle="Stock dispatches and SOR tracking"
        action={
          <button
            onClick={() => navigate('/consignments/new')}
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
          >
            + New Consignment
          </button>
        }
      />

      <div className="mb-4 flex items-center gap-4">
        <div className="flex-1">
          <SearchBar value={search} onChange={handleSearch} placeholder="Search..." />
        </div>
        <ExportButton options={[
          { label: 'Export Consignments CSV', onClick: () => setExportConsignModalOpen(true) },
          { label: 'Export Lines CSV', onClick: () => setExportLinesModalOpen(true) },
        ]} />
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-gray-400">Loading...</div>
      ) : (
        <>
          <DataTable
            columns={columns}
            data={data?.data ?? []}
            onRowClick={(c) => navigate(`/consignments/${c.id}`)}
            emptyMessage="No consignments yet"
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
        open={exportConsignModalOpen}
        onClose={() => setExportConsignModalOpen(false)}
        onExport={(from, to) => downloadFromApi(exportUrl('/export/consignments', from, to), 'consignments-export.csv')}
        title="Export Consignments"
      />
      <DateRangeExportModal
        open={exportLinesModalOpen}
        onClose={() => setExportLinesModalOpen(false)}
        onExport={(from, to) => downloadFromApi(exportUrl('/export/consignment-lines', from, to), 'consignment-lines-export.csv')}
        title="Export Consignment Lines"
      />
    </div>
  );
}
