import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type PaginatedResponse } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { SearchBar } from '../../components/SearchBar';
import { DataTable } from '../../components/DataTable';
import { Pagination } from '../../components/Pagination';
import { ActionMenu } from '../../components/ActionMenu';
import { SearchableSelect } from '../../components/SearchableSelect';
import { QuickPartnerCreate } from '../../components/QuickPartnerCreate';

interface PortalUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: 'ADMIN' | 'BRANCH_MANAGER' | 'STAFF';
  isActive: boolean;
  lastLoginAt: string | null;
  partner: { id: string; name: string };
  branch: { id: string; name: string } | null;
}

interface Partner {
  id: string;
  name: string;
}

interface Branch {
  id: string;
  name: string;
}

interface UserFormData {
  partnerId: string;
  branchId: string;
  name: string;
  email: string;
  password: string;
  role: 'ADMIN' | 'BRANCH_MANAGER' | 'STAFF';
  phone: string;
}

const emptyForm: UserFormData = {
  partnerId: '',
  branchId: '',
  name: '',
  email: '',
  password: '',
  role: 'STAFF',
  phone: '',
};

const roleBadge: Record<string, string> = {
  ADMIN: 'bg-purple-100 text-purple-700',
  BRANCH_MANAGER: 'bg-blue-100 text-blue-700',
  STAFF: 'bg-gray-100 text-gray-600',
};

export function PartnerPortalUsers() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<PortalUser | null>(null);
  const [form, setForm] = useState<UserFormData>(emptyForm);
  const [showPartnerCreate, setShowPartnerCreate] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['partner-portal-users', page, search],
    queryFn: () =>
      api<PaginatedResponse<PortalUser>>(
        `/partner-admin/users?page=${page}&limit=20&search=${encodeURIComponent(search)}`
      ),
  });

  const { data: partnersData } = useQuery({
    queryKey: ['partners-select'],
    queryFn: () => api<PaginatedResponse<Partner>>('/partners?limit=500'),
  });

  const { data: branchesData } = useQuery({
    queryKey: ['partner-branches', form.partnerId],
    queryFn: () => api<{ data: Branch[] }>(`/partners/${form.partnerId}/branches`),
    enabled: modalOpen && !!form.partnerId,
  });

  const createMutation = useMutation({
    mutationFn: (body: UserFormData) =>
      api('/partner-admin/users', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partner-portal-users'] });
      closeModal();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<UserFormData> }) =>
      api(`/partner-admin/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partner-portal-users'] });
      closeModal();
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) =>
      api(`/partner-admin/users/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partner-portal-users'] });
    },
  });

  const handleSearch = useCallback((v: string) => {
    setSearch(v);
    setPage(1);
  }, []);

  function openCreate() {
    setEditingUser(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(user: PortalUser) {
    setEditingUser(user);
    setForm({
      partnerId: user.partner.id,
      branchId: user.branch?.id ?? '',
      name: user.name,
      email: user.email,
      password: '',
      role: user.role,
      phone: user.phone ?? '',
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingUser(null);
    setForm(emptyForm);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editingUser) {
      const body: Partial<UserFormData> = { ...form };
      if (!body.password) delete body.password;
      updateMutation.mutate({ id: editingUser.id, body });
    } else {
      createMutation.mutate(form);
    }
  }

  function updateField<K extends keyof UserFormData>(key: K, value: UserFormData[K]) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'partnerId') next.branchId = '';
      return next;
    });
  }

  const partnerOptions = (partnersData?.data ?? []).map((p) => ({
    value: p.id,
    label: p.name,
  }));

  const branchOptions = [
    { value: '', label: 'None (HQ user — no branch)' },
    ...(branchesData?.data ?? []).map((b) => ({ value: b.id, label: b.name })),
  ];

  const columns = [
    { key: 'name', header: 'Name' },
    { key: 'email', header: 'Email' },
    {
      key: 'partner',
      header: 'Partner',
      render: (u: PortalUser) => u.partner.name,
    },
    {
      key: 'branch',
      header: 'Branch',
      render: (u: PortalUser) => u.branch?.name ?? '\u2014',
    },
    {
      key: 'role',
      header: 'Role',
      render: (u: PortalUser) => (
        <span
          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${roleBadge[u.role] ?? 'bg-gray-100 text-gray-600'}`}
        >
          {u.role.replace('_', ' ')}
        </span>
      ),
    },
    {
      key: 'lastLoginAt',
      header: 'Last Login',
      render: (u: PortalUser) =>
        u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : 'Never',
    },
    {
      key: 'isActive',
      header: 'Active',
      render: (u: PortalUser) => (
        <span
          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
            u.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
          }`}
        >
          {u.isActive ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (u: PortalUser) => (
        <div onClick={(e) => e.stopPropagation()}>
          <ActionMenu items={[
            { label: 'Edit', onClick: () => openEdit(u) },
            { label: u.isActive ? 'Deactivate' : 'Activate', onClick: () => { if (confirm(`${u.isActive ? 'Deactivate' : 'Activate'} this user?`)) deactivateMutation.mutate(u.id); }, variant: u.isActive ? 'danger' : 'default' },
          ]} />
        </div>
      ),
    },
  ];

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div>
      <PageHeader
        title="Partner Portal Users"
        subtitle="Manage login accounts for channel partners"
        action={
          <button
            onClick={openCreate}
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
          >
            Create User
          </button>
        }
      />

      <div className="mb-4">
        <SearchBar value={search} onChange={handleSearch} placeholder="Search by name or email..." />
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-gray-400">Loading...</div>
      ) : (
        <>
          <DataTable
            columns={columns}
            data={data?.data ?? []}
            emptyMessage="No portal users found"
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

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">
              {editingUser ? 'Edit User' : 'Create User'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Partner *</label>
                <SearchableSelect
                  options={partnerOptions}
                  value={form.partnerId}
                  onChange={(v) => updateField('partnerId', v)}
                  placeholder="Search partners..."
                  required
                  onCreateNew={() => setShowPartnerCreate(true)}
                  createNewLabel="Create new partner"
                />
              </div>

              {form.partnerId && branchOptions.length > 0 && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Branch</label>
                  <SearchableSelect
                    options={branchOptions}
                    value={form.branchId}
                    onChange={(v) => updateField('branchId', v)}
                    placeholder="Select branch (optional)..."
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Name *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    required
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Email *</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => updateField('email', e.target.value)}
                    required
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Password{editingUser ? ' (leave blank to keep)' : ' *'}
                  </label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => updateField('password', e.target.value)}
                    required={!editingUser}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Phone</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => updateField('phone', e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Role</label>
                <select
                  value={form.role}
                  onChange={(e) => updateField('role', e.target.value as UserFormData['role'])}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                >
                  <option value="STAFF">Staff</option>
                  <option value="BRANCH_MANAGER">Branch Manager</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>

              {(createMutation.isError || updateMutation.isError) && (
                <p className="text-sm text-red-600">
                  {(createMutation.error ?? updateMutation.error)?.message ?? 'An error occurred'}
                </p>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : editingUser ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPartnerCreate && (
        <QuickPartnerCreate
          onClose={() => setShowPartnerCreate(false)}
          onCreated={(p) => { updateField('partnerId', p.id); }}
        />
      )}
    </div>
  );
}
