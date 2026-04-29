import { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { ActionMenu } from '../../components/ActionMenu';

// ─── All modules and what permissions are meaningful per module ───────────────
const MODULE_PERMISSIONS: Record<string, string[]> = {
  dashboard:         ['read'],
  authors:           ['read', 'create', 'update', 'delete'],
  titles:            ['read', 'create', 'update', 'delete'],
  partners:          ['read', 'create', 'update', 'delete'],
  inventory:         ['read', 'create', 'update', 'delete'],
  consignments:      ['read', 'create', 'update', 'approve'],
  returns:           ['read', 'create', 'update', 'approve'],
  orderManagement:   ['read', 'create', 'update', 'approve'],
  invoices:          ['read', 'create', 'update', 'void', 'export'],
  quotations:        ['read', 'create', 'update', 'export'],
  creditNotes:       ['read', 'create', 'update', 'void', 'export'],
  debitNotes:        ['read', 'create', 'update', 'void', 'export'],
  payments:          ['read', 'create', 'update'],
  remittances:       ['read', 'create', 'update'],
  royalties:         ['read', 'create', 'approve', 'void'],
  statements:        ['read', 'create', 'export'],
  reports:           ['read', 'export'],
  auditLogs:         ['read'],
  budgeting:         ['read', 'create', 'update', 'approve', 'export'],
  projectManagement: ['read', 'create', 'update', 'approve', 'export'],
  employeePortal:    ['read', 'create', 'update'],
};

const MODULE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard', authors: 'Authors', titles: 'Titles',
  partners: 'Partners', inventory: 'Inventory', consignments: 'Consignments',
  returns: 'Returns / GRN', orderManagement: 'Order Management',
  invoices: 'Invoices', quotations: 'Quotations', creditNotes: 'Credit Notes',
  debitNotes: 'Debit Notes', payments: 'Payments', remittances: 'Remittances',
  royalties: 'Royalties', statements: 'Statements', reports: 'Reports',
  auditLogs: 'Audit Logs', budgeting: 'Budgeting',
  projectManagement: 'Project Management', employeePortal: 'Employee Portal',
};

// ─── Permission Configurator Modal ────────────────────────────────────────────
function PermissionConfigModal({ user, onClose }: { user: User; onClose: () => void }) {
  const qc = useQueryClient();
  const [overrides, setOverrides] = useState<Record<string, 'GRANT' | 'DENY' | null>>({});
  const [reason, setReason] = useState('');
  const [loaded, setLoaded] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['user-perms', user.id],
    queryFn: () => api<{ data: any }>(`/users/${user.id}/permissions`),
  });

  // Initialise overrides from loaded data
  if (data && !loaded) {
    const map: Record<string, 'GRANT' | 'DENY' | null> = {};
    for (const o of data.data?.overrides ?? []) {
      map[`${o.module}:${o.permission}`] = o.type;
    }
    setOverrides(map);
    setLoaded(true);
  }

  const effective: Record<string, string[]> = data?.data?.effectivePermissions ?? {};

  const saveMut = useMutation({
    mutationFn: (body: any) => api(`/users/${user.id}/permissions`, { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['user-perms', user.id] }); onClose(); },
  });

  function toggleOverride(module: string, perm: string, type: 'GRANT' | 'DENY') {
    const key = `${module}:${perm}`;
    setOverrides(prev => ({ ...prev, [key]: prev[key] === type ? null : type }));
  }

  function save() {
    const overrideList = Object.entries(overrides)
      .filter(([, v]) => v !== null)
      .map(([key, type]) => {
        const [module, permission] = key.split(':');
        return { module, permission, type: type!, reason: reason || null };
      });
    saveMut.mutate({ overrides: overrideList });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Permission Overrides — {user.name}</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Base role: <strong>{user.role}</strong> ·
              Add individual grants or denials on top of the role's defaults
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-1">
          {isLoading ? (
            <p className="text-sm text-gray-400 text-center py-8">Loading permissions…</p>
          ) : (
            <>
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 items-center pb-2 mb-2 border-b border-gray-100">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Module / Permission</span>
                <span className="text-[10px] font-bold text-gray-500 uppercase w-12 text-center">Base</span>
                <span className="text-[10px] font-bold text-green-700 uppercase w-12 text-center">Grant</span>
                <span className="text-[10px] font-bold text-red-600 uppercase w-12 text-center">Deny</span>
              </div>

              {Object.entries(MODULE_PERMISSIONS).map(([mod, perms]) => (
                <div key={mod}>
                  <div className="text-[10px] font-bold text-gray-700 uppercase tracking-wide pt-2 pb-1">
                    {MODULE_LABELS[mod] ?? mod}
                  </div>
                  {perms.map(perm => {
                    const key = `${mod}:${perm}`;
                    const baseHas = (effective[mod] ?? []).includes(perm);
                    const override = overrides[key];
                    return (
                      <div key={key} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 items-center py-0.5">
                        <span className={`text-xs pl-2 ${override === 'DENY' ? 'line-through text-gray-400' : override === 'GRANT' ? 'text-green-700 font-medium' : 'text-gray-600'}`}>
                          {perm}
                        </span>
                        <span className={`text-[10px] w-12 text-center font-mono ${baseHas ? 'text-gray-700' : 'text-gray-300'}`}>
                          {baseHas ? '✓' : '—'}
                        </span>
                        <button onClick={() => toggleOverride(mod, perm, 'GRANT')}
                          className={`w-12 text-xs py-0.5 rounded border transition-colors ${override === 'GRANT' ? 'bg-green-100 border-green-400 text-green-800 font-bold' : 'border-gray-200 text-gray-400 hover:border-green-300'}`}>
                          +
                        </button>
                        <button onClick={() => toggleOverride(mod, perm, 'DENY')}
                          className={`w-12 text-xs py-0.5 rounded border transition-colors ${override === 'DENY' ? 'bg-red-100 border-red-400 text-red-800 font-bold' : 'border-gray-200 text-gray-400 hover:border-red-300'}`}>
                          —
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Reason for overrides (optional)</label>
            <input value={reason} onChange={e => setReason(e.target.value)}
              placeholder="e.g. Senior role with cross-department reporting access"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 text-xs text-gray-500">
              <span className="font-bold text-green-700">+</span> = Grant (add beyond role) &nbsp;
              <span className="font-bold text-red-600">—</span> = Deny (remove from role) &nbsp;
              Active override highlighted
            </div>
            <button onClick={onClose} className="px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={save} disabled={saveMut.isPending}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saveMut.isPending ? 'Saving…' : 'Save Overrides'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  xarraAccess?: boolean;
  billetterieAccess?: boolean;
  billetterieSystemRole?: string | null;
}

interface Invitation {
  id: string;
  email: string;
  name: string;
  role: string;
  status: 'PENDING' | 'ACCEPTED' | 'EXPIRED';
  expiresAt: string;
  createdAt: string;
}

const ROLES = ['ADMIN', 'FINANCE', 'PROJECT_MANAGER', 'AUTHOR', 'STAFF'];
const BIL_SYSTEM_ROLES = [
  { value: '', label: 'Team member only' },
  { value: 'MANAGER', label: 'Manager (can create/view all projects)' },
  { value: 'ADMIN', label: 'Admin (full Billetterie admin)' },
];

function EditUserModal({ user, cls, onClose, updateMutation, productAccessMutation }: {
  user: User;
  cls: string;
  onClose: () => void;
  updateMutation: any;
  productAccessMutation: any;
}) {
  const [xarraAccess, setXarraAccess] = useState(user.xarraAccess !== false);
  const [billetterieAccess, setBilletterieAccess] = useState(!!user.billetterieAccess);
  const [billetterieSystemRole, setBilletterieSystemRole] = useState(user.billetterieSystemRole ?? '');

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    // Fire both mutations; close when user details mutation settles
    updateMutation.mutate({
      id: user.id,
      name: fd.get('name'),
      role: fd.get('role'),
      isActive: fd.get('isActive') === 'true',
    });

    productAccessMutation.mutate({
      id: user.id,
      xarraAccess,
      billetterieAccess,
      billetterieSystemRole: billetterieSystemRole || null,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Edit User</h3>

          {/* Basic details */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input name="name" defaultValue={user.name} className={cls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input value={user.email} disabled className={`${cls} bg-gray-100`} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select name="role" defaultValue={user.role} className={cls}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select name="isActive" defaultValue={String(user.isActive)} className={cls}>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>

          {/* Product access section */}
          <div className="border-t border-gray-100 pt-4">
            <p className="text-sm font-medium text-gray-700 mb-3">Product Access</p>
            <div className="space-y-3">
              <label className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2.5 cursor-pointer hover:bg-gray-50">
                <div>
                  <p className="text-sm font-medium text-gray-900">Xarra Books</p>
                  <p className="text-xs text-gray-500">Publishing & inventory management</p>
                </div>
                <button
                  type="button"
                  onClick={() => setXarraAccess((v) => !v)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    xarraAccess ? 'bg-green-600' : 'bg-gray-300'
                  }`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                    xarraAccess ? 'translate-x-4' : 'translate-x-1'
                  }`} />
                </button>
              </label>

              <label className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2.5 cursor-pointer hover:bg-gray-50">
                <div>
                  <p className="text-sm font-medium text-gray-900">Billetterie</p>
                  <p className="text-xs text-gray-500">Project & software delivery management</p>
                </div>
                <button
                  type="button"
                  onClick={() => setBilletterieAccess((v) => !v)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    billetterieAccess ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                    billetterieAccess ? 'translate-x-4' : 'translate-x-1'
                  }`} />
                </button>
              </label>

              {billetterieAccess && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Billetterie system role</label>
                  <select
                    value={billetterieSystemRole}
                    onChange={(e) => setBilletterieSystemRole(e.target.value)}
                    className={cls}
                  >
                    {BIL_SYSTEM_ROLES.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={updateMutation.isPending || productAccessMutation.isPending}
              className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50">
              {(updateMutation.isPending || productAccessMutation.isPending) ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function UserManagement() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'users' | 'invitations'>('users');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [permUser, setPermUser] = useState<User | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api<{ data: User[]; pagination: any }>('/users?limit=100'),
  });

  const { data: invitations, isLoading: invitationsLoading } = useQuery({
    queryKey: ['invitations'],
    queryFn: () => api<{ data: Invitation[] }>('/settings/invitations'),
  });

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api('/users', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setShowCreateModal(false);
      setError('');
      setSuccess('User created successfully');
      setTimeout(() => setSuccess(''), 3000);
    },
  });

  const inviteMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api('/settings/invitations/send', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitations'] });
      setShowInviteModal(false);
      setError('');
      setSuccess('Invitation sent successfully');
      setTimeout(() => setSuccess(''), 3000);
    },
  });

  const resendMutation = useMutation({
    mutationFn: (id: string) =>
      api(`/settings/invitations/${id}/resend`, { method: 'POST' }),
    onSuccess: () => {
      setSuccess('Invitation resent successfully');
      setTimeout(() => setSuccess(''), 3000);
    },
  });

  const deleteInvitationMutation = useMutation({
    mutationFn: (id: string) =>
      api(`/settings/invitations/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitations'] });
      setSuccess('Invitation revoked');
      setTimeout(() => setSuccess(''), 3000);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }: Record<string, unknown>) =>
      api(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setEditingUser(null);
      setSuccess('User updated successfully');
      setTimeout(() => setSuccess(''), 3000);
    },
  });

  const productAccessMutation = useMutation({
    mutationFn: ({ id, ...body }: Record<string, unknown>) =>
      api(`/users/${id}/product-access`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setSuccess('Product access updated');
      setTimeout(() => setSuccess(''), 3000);
    },
  });

  function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      name: fd.get('name'),
      email: fd.get('email'),
      password: fd.get('password'),
      role: fd.get('role'),
    }, { onError: (err) => setError(err.message) });
  }

  function handleInvite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const fd = new FormData(e.currentTarget);
    inviteMutation.mutate({
      name: fd.get('name'),
      email: fd.get('email'),
      role: fd.get('role'),
    }, { onError: (err) => setError(err.message) });
  }

  const cls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm';

  return (
    <div>
      <PageHeader
        title="User Management"
        subtitle="Manage user accounts and send invitations"
        action={
          <div className="flex gap-2">
            <button onClick={() => setShowInviteModal(true)}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              Send Invitation
            </button>
            <button onClick={() => setShowCreateModal(true)}
              className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800">
              Add User
            </button>
          </div>
        }
      />

      {error && <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {success && <div className="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-700">{success}</div>}

      {/* Tab Navigation */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          <button
            onClick={() => setActiveTab('users')}
            className={`whitespace-nowrap border-b-2 pb-3 pt-1 text-sm font-medium transition-colors ${
              activeTab === 'users'
                ? 'border-green-700 text-green-700'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            Active Users {data?.data && `(${data.data.length})`}
          </button>
          <button
            onClick={() => setActiveTab('invitations')}
            className={`whitespace-nowrap border-b-2 pb-3 pt-1 text-sm font-medium transition-colors ${
              activeTab === 'invitations'
                ? 'border-green-700 text-green-700'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            Pending Invitations {invitations?.data && invitations.data.length > 0 && `(${invitations.data.length})`}
          </button>
        </nav>
      </div>

      {/* Users Tab */}
      {activeTab === 'users' && (
        <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product Access</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {isLoading && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>}
              {data?.data?.map((user) => (
                <tr key={user.id}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{user.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{user.email}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex gap-1 flex-wrap">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        user.xarraAccess !== false ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                      }`}>
                        Xarra
                      </span>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        user.billetterieAccess ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'
                      }`}>
                        Billetterie{user.billetterieSystemRole ? ` (${user.billetterieSystemRole})` : ''}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      user.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {user.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm" onClick={(e) => e.stopPropagation()}>
                    <ActionMenu items={[
                      { label: 'Edit', onClick: () => setEditingUser(user) },
                      { label: 'Permission Overrides', onClick: () => setPermUser(user) },
                      { label: user.isActive ? 'Deactivate' : 'Activate', onClick: () => {
                        updateMutation.mutate({ id: user.id, isActive: !user.isActive });
                      }, variant: user.isActive ? 'danger' : 'default' },
                    ]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pending Invitations Tab */}
      {activeTab === 'invitations' && (
        <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Expires</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {invitationsLoading && <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>}
              {invitations?.data && invitations.data.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No pending invitations</td></tr>
              )}
              {invitations?.data?.map((invitation) => (
                <tr key={invitation.id}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{invitation.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{invitation.email}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                      {invitation.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {new Date(invitation.expiresAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-sm" onClick={(e) => e.stopPropagation()}>
                    <ActionMenu items={[
                      { label: 'Resend', onClick: () => resendMutation.mutate(invitation.id) },
                      { label: 'Revoke', onClick: () => {
                        if (confirm('Revoke this invitation?')) {
                          deleteInvitationMutation.mutate(invitation.id);
                        }
                      }, variant: 'danger' },
                    ]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Send Invitation Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <form onSubmit={handleInvite} className="p-6 space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Send User Invitation</h3>
              <p className="text-sm text-gray-500">
                Send an email invitation to create a new user account. They will receive a link to set up their password.
              </p>
              {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input name="name" required className={cls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input name="email" type="email" required className={cls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role *</label>
                <select name="role" required className={cls}>
                  {ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ').split(' ').map(w => w[0] + w.slice(1).toLowerCase()).join(' ')}</option>)}
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => { setShowInviteModal(false); setError(''); }}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={inviteMutation.isPending}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                  {inviteMutation.isPending ? 'Sending...' : 'Send Invitation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Create User</h3>
              <p className="text-sm text-gray-500">
                Create a user account directly with username and password (not via email invitation).
              </p>
              {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input name="name" required className={cls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input name="email" type="email" required className={cls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                <input name="password" type="password" required minLength={8} className={cls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role *</label>
                <select name="role" required className={cls}>
                  {ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ').split(' ').map(w => w[0] + w.slice(1).toLowerCase()).join(' ')}</option>)}
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => { setShowCreateModal(false); setError(''); }}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={createMutation.isPending}
                  className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50">
                  {createMutation.isPending ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <EditUserModal
          user={editingUser}
          cls={cls}
          onClose={() => setEditingUser(null)}
          updateMutation={updateMutation}
          productAccessMutation={productAccessMutation}
        />
      )}

      {/* Permission Overrides Modal */}
      {permUser && (
        <PermissionConfigModal user={permUser} onClose={() => setPermUser(null)} />
      )}
    </div>
  );
}
