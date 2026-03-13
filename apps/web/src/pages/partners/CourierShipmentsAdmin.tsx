import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type PaginatedResponse } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { SearchBar } from '../../components/SearchBar';
import { DataTable } from '../../components/DataTable';
import { Pagination } from '../../components/Pagination';
import { ActionMenu } from '../../components/ActionMenu';
import { STATUS_COLORS as statusColors } from '../../lib/statusColors';

interface Shipment {
  id: string;
  courierCompany: string;
  waybillNumber: string;
  trackingUrl: string | null;
  status: string;
  recipientName: string;
  recipientAddress: string | null;
  recipientPhone: string | null;
  packageCount: number | null;
  weightKg: string | null;
  linkedEntityType: string | null;
  linkedEntityId: string | null;
  deliveredSignedBy: string | null;
  failureReason: string | null;
  createdAt: string;
}

interface ShipmentFormData {
  courierCompany: string;
  waybillNumber: string;
  trackingUrl: string;
  linkedEntityType: string;
  linkedEntityId: string;
  recipientName: string;
  recipientAddress: string;
  recipientPhone: string;
  packageCount: string;
  weightKg: string;
}

const emptyForm: ShipmentFormData = {
  courierCompany: 'FASTWAY',
  waybillNumber: '',
  trackingUrl: '',
  linkedEntityType: '',
  linkedEntityId: '',
  recipientName: '',
  recipientAddress: '',
  recipientPhone: '',
  packageCount: '1',
  weightKg: '',
};

const allStatuses = Object.keys(statusColors);

export function CourierShipmentsAdmin() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [createModal, setCreateModal] = useState(false);
  const [form, setForm] = useState<ShipmentFormData>(emptyForm);
  const [updateModal, setUpdateModal] = useState(false);
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
  const [updateStatus, setUpdateStatus] = useState('');
  const [updateSignedBy, setUpdateSignedBy] = useState('');
  const [updateFailureReason, setUpdateFailureReason] = useState('');

  const queryParams = new URLSearchParams({
    page: String(page),
    limit: '20',
    ...(search && { search }),
    ...(statusFilter && { status: statusFilter }),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['partner-admin-shipments', page, search, statusFilter],
    queryFn: () =>
      api<PaginatedResponse<Shipment>>(`/partner-admin/shipments?${queryParams.toString()}`),
  });

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api('/partner-admin/shipments', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partner-admin-shipments'] });
      setCreateModal(false);
      setForm(emptyForm);
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api(`/partner-admin/shipments/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partner-admin-shipments'] });
      setUpdateModal(false);
      setSelectedShipment(null);
    },
  });

  const handleSearch = useCallback((v: string) => {
    setSearch(v);
    setPage(1);
  }, []);

  function openUpdate(shipment: Shipment) {
    setSelectedShipment(shipment);
    setUpdateStatus(shipment.status);
    setUpdateSignedBy(shipment.deliveredSignedBy ?? '');
    setUpdateFailureReason(shipment.failureReason ?? '');
    setUpdateModal(true);
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = {
      courierCompany: form.courierCompany,
      waybillNumber: form.waybillNumber,
      recipientName: form.recipientName,
    };
    if (form.trackingUrl) body.trackingUrl = form.trackingUrl;
    if (form.linkedEntityType && form.linkedEntityId) {
      body.linkedEntityType = form.linkedEntityType;
      body.linkedEntityId = form.linkedEntityId;
    }
    if (form.recipientAddress) body.recipientAddress = form.recipientAddress;
    if (form.recipientPhone) body.recipientPhone = form.recipientPhone;
    if (form.packageCount) body.packageCount = Number(form.packageCount);
    if (form.weightKg) body.weightKg = Number(form.weightKg);
    createMut.mutate(body);
  }

  function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedShipment) return;
    const body: Record<string, unknown> = { status: updateStatus };
    if (updateStatus === 'DELIVERED' && updateSignedBy) body.deliveredSignedBy = updateSignedBy;
    if (updateStatus === 'FAILED' && updateFailureReason) body.failureReason = updateFailureReason;
    updateMut.mutate({ id: selectedShipment.id, body });
  }

  function updateField<K extends keyof ShipmentFormData>(key: K, value: ShipmentFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function linkedLabel(s: Shipment) {
    if (!s.linkedEntityType || !s.linkedEntityId) return '—';
    return `${s.linkedEntityType} ${s.linkedEntityId.slice(0, 8)}...`;
  }

  const columns = [
    {
      key: 'waybillNumber',
      header: 'Waybill',
      render: (s: Shipment) => (
        <span className="font-medium text-green-700">{s.waybillNumber}</span>
      ),
    },
    { key: 'courierCompany', header: 'Courier' },
    {
      key: 'status',
      header: 'Status',
      render: (s: Shipment) => (
        <span
          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[s.status] ?? 'bg-gray-100 text-gray-600'}`}
        >
          {s.status.replace(/_/g, ' ')}
        </span>
      ),
    },
    { key: 'recipientName', header: 'Recipient' },
    {
      key: 'linkedEntityType',
      header: 'Linked To',
      render: linkedLabel,
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (s: Shipment) => new Date(s.createdAt).toLocaleDateString(),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (s: Shipment) => (
        <div onClick={(e) => e.stopPropagation()}>
          <ActionMenu items={[
            { label: 'Update Status', onClick: () => openUpdate(s) },
            { label: 'Track Shipment', onClick: () => window.open(s.trackingUrl!, '_blank'), hidden: !s.trackingUrl },
            { label: 'Copy Waybill', onClick: () => navigator.clipboard.writeText(s.waybillNumber) },
          ]} />
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Courier Shipments"
        subtitle="Manage courier shipments and tracking"
        action={
          <button
            onClick={() => {
              setForm(emptyForm);
              setCreateModal(true);
            }}
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
          >
            Create Shipment
          </button>
        }
      />

      <div className="mb-4 flex items-center gap-4">
        <div className="flex-1">
          <SearchBar value={search} onChange={handleSearch} placeholder="Search by waybill or recipient..." />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
        >
          <option value="">All Statuses</option>
          {allStatuses.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-gray-400">Loading...</div>
      ) : (
        <>
          <DataTable
            columns={columns}
            data={data?.data ?? []}
            emptyMessage="No shipments found"
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

      {/* Create Shipment Modal */}
      {createModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Create Shipment</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Courier Company</label>
                  <input
                    type="text"
                    value={form.courierCompany}
                    onChange={(e) => updateField('courierCompany', e.target.value)}
                    required
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Waybill Number</label>
                  <input
                    type="text"
                    value={form.waybillNumber}
                    onChange={(e) => updateField('waybillNumber', e.target.value)}
                    required
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Tracking URL</label>
                <input
                  type="url"
                  value={form.trackingUrl}
                  onChange={(e) => updateField('trackingUrl', e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Linked Entity Type</label>
                  <select
                    value={form.linkedEntityType}
                    onChange={(e) => updateField('linkedEntityType', e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  >
                    <option value="">None</option>
                    <option value="consignment">Consignment</option>
                    <option value="order">Order</option>
                    <option value="return">Return</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Linked Entity ID</label>
                  <input
                    type="text"
                    value={form.linkedEntityId}
                    onChange={(e) => updateField('linkedEntityId', e.target.value)}
                    disabled={!form.linkedEntityType}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 disabled:bg-gray-50"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Recipient Name</label>
                <input
                  type="text"
                  value={form.recipientName}
                  onChange={(e) => updateField('recipientName', e.target.value)}
                  required
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Recipient Address</label>
                <textarea
                  value={form.recipientAddress}
                  onChange={(e) => updateField('recipientAddress', e.target.value)}
                  rows={2}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Recipient Phone</label>
                  <input
                    type="tel"
                    value={form.recipientPhone}
                    onChange={(e) => updateField('recipientPhone', e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Package Count</label>
                  <input
                    type="number"
                    min="1"
                    value={form.packageCount}
                    onChange={(e) => updateField('packageCount', e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Weight (kg)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={form.weightKg}
                    onChange={(e) => updateField('weightKg', e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>
              </div>

              {createMut.isError && (
                <p className="text-sm text-red-600">{createMut.error?.message ?? 'An error occurred'}</p>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateModal(false)}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMut.isPending}
                  className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
                >
                  {createMut.isPending ? 'Creating...' : 'Create Shipment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Update Status Modal */}
      {updateModal && selectedShipment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">
              Update Shipment — {selectedShipment.waybillNumber}
            </h3>
            <form onSubmit={handleUpdate} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Status</label>
                <select
                  value={updateStatus}
                  onChange={(e) => setUpdateStatus(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                >
                  {allStatuses.map((s) => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>

              {updateStatus === 'DELIVERED' && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Signed By</label>
                  <input
                    type="text"
                    value={updateSignedBy}
                    onChange={(e) => setUpdateSignedBy(e.target.value)}
                    required
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>
              )}

              {updateStatus === 'FAILED' && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Failure Reason</label>
                  <textarea
                    value={updateFailureReason}
                    onChange={(e) => setUpdateFailureReason(e.target.value)}
                    required
                    rows={2}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>
              )}

              {updateMut.isError && (
                <p className="text-sm text-red-600">{updateMut.error?.message ?? 'An error occurred'}</p>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setUpdateModal(false)}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateMut.isPending}
                  className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
                >
                  {updateMut.isPending ? 'Updating...' : 'Update Status'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
