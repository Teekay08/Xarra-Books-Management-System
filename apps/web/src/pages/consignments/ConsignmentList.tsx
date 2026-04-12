import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router';
import { api, type PaginatedResponse } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { SearchBar } from '../../components/SearchBar';
import { ExportButton } from '../../components/ExportButton';
import { downloadFromApi, exportUrl } from '../../lib/export';
import { DateRangeExportModal } from '../../components/DateRangeExportModal';
import { DataTable } from '../../components/DataTable';
import { Pagination } from '../../components/Pagination';
import { ActionMenu } from '../../components/ActionMenu';
import { CONSIGNMENT_STATUS_COLORS as statusColors } from '../../lib/statusColors';

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

export function ConsignmentList() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [exportConsignModalOpen, setExportConsignModalOpen] = useState(false);
  const [exportLinesModalOpen, setExportLinesModalOpen] = useState(false);

  // Fetch system configuration for SOR alert period
  const { data: systemConfig } = useQuery({
    queryKey: ['system-config'],
    queryFn: () => api<{ data: { sorAlertDays: number } }>('/settings/system-config'),
  });

  const sorAlertDays = systemConfig?.data?.sorAlertDays ?? 30;
  const sorCriticalDays = Math.floor(sorAlertDays / 2); // Red alert at half the alert period

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
        <span className={days <= sorCriticalDays ? 'text-red-600 font-medium' : days <= sorAlertDays ? 'text-amber-600' : ''}>
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
    { key: 'actions', header: 'Actions', render: (c: Consignment) => (
      <div onClick={(e) => e.stopPropagation()}>
        <ActionMenu items={[
          { label: 'View Details', onClick: () => navigate(`/consignments/${c.id}`) },
          { label: 'Download PDF', onClick: () => window.open(`/api/v1/consignments/${c.id}/proforma-pdf`, '_blank') },
          { label: 'Print', onClick: () => { const w = window.open(`/api/v1/consignments/${c.id}/proforma-pdf`, '_blank'); w?.addEventListener('load', () => w.print()); } },
        ]} />
      </div>
    )},
  ];

  return (
    <div>
      <div className="px-6 pt-4 pb-0">
        <Link to="/orders/processing" className="mb-2 inline-flex items-center text-sm text-green-700 hover:underline">
          &#8592; Processing Queue
        </Link>
      </div>
      <PageHeader
        title="Sales Purchase Orders"
        subtitle="Sales PO dispatches and SOR tracking"
        action={
          <button
            onClick={() => navigate('/consignments/new')}
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
          >
            + New Sales PO
          </button>
        }
      />

      <div className="mb-4 flex items-center gap-2">
        <button
          onClick={() => navigate('/consignments')}
          className="rounded-md border border-green-700 bg-green-700 px-3 py-1.5 text-xs font-medium text-white"
        >
          Orders
        </button>
        <button
          onClick={() => navigate('/consignments/proformas')}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          Agreements
        </button>
      </div>

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
            emptyMessage="No sales purchase orders yet"
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
        title="Export Sales Purchase Orders"
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
