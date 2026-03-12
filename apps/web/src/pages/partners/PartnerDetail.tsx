import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

interface Branch {
  id: string;
  name: string;
  code: string | null;
  contactName: string | null;
  contactEmail: string | null;
  city: string | null;
  isActive: boolean;
}

interface Partner {
  id: string;
  name: string;
  discountPct: string;
  sorDays: number | null;
  paymentTermsDays: number | null;
  paymentDay: number | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  remittanceEmail: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  vatNumber: string | null;
  isActive: boolean;
  notes: string | null;
  branches: Branch[];
}

export function PartnerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showBranchForm, setShowBranchForm] = useState(false);
  const [editBranch, setEditBranch] = useState<Branch | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['partner', id],
    queryFn: () => api<{ data: Partner }>(`/partners/${id}`),
  });

  const deactivate = useMutation({
    mutationFn: () => api(`/partners/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partners'] });
      navigate('/partners');
    },
  });

  if (isLoading) return <div className="py-12 text-center text-gray-400">Loading...</div>;
  if (!data?.data) return <div className="py-12 text-center text-gray-400">Partner not found</div>;

  const partner = data.data;

  return (
    <div>
      <PageHeader
        title={partner.name}
        subtitle={`${Number(partner.discountPct)}% discount`}
        backTo={{ label: 'Back to Partners', href: '/partners' }}
        action={
          <div className="flex gap-2">
            <button
              onClick={() => navigate(`/partners/${id}/edit`)}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Edit
            </button>
            {partner.isActive && (
              <button
                onClick={() => {
                  if (confirm('Deactivate this partner?')) deactivate.mutate();
                }}
                className="rounded-md border border-red-300 px-4 py-2 text-sm text-red-700 hover:bg-red-50"
              >
                Deactivate
              </button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Partner Details">
          <dl className="grid grid-cols-2 gap-3">
            <DI label="Discount" value={`${Number(partner.discountPct)}%`} />
            <DI label="SOR Days" value={partner.sorDays?.toString()} />
            <DI label="Payment Terms" value={partner.paymentTermsDays ? `${partner.paymentTermsDays} days` : null} />
            <DI label="Payment Day" value={partner.paymentDay ? `Day ${partner.paymentDay}` : null} />
            <DI label="VAT Number" value={partner.vatNumber} />
            <DI label="Status" value={partner.isActive ? 'Active' : 'Inactive'} />
          </dl>
        </Card>

        <Card title="Contact Information">
          <dl className="grid grid-cols-2 gap-3">
            <DI label="Contact Name" value={partner.contactName} />
            <DI label="Contact Email" value={partner.contactEmail} />
            <DI label="Contact Phone" value={partner.contactPhone} />
            <DI label="Remittance Email" value={partner.remittanceEmail} />
          </dl>
        </Card>

        {(partner.addressLine1 || partner.city) && (
          <Card title="Address">
            <dl className="grid grid-cols-2 gap-3">
              <DI label="Address Line 1" value={partner.addressLine1} />
              <DI label="Address Line 2" value={partner.addressLine2} />
              <DI label="City" value={partner.city} />
              <DI label="Province" value={partner.province} />
              <DI label="Postal Code" value={partner.postalCode} />
            </dl>
          </Card>
        )}

        {partner.notes && (
          <Card title="Notes">
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{partner.notes}</p>
          </Card>
        )}
      </div>

      {/* Branches Section */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Branches</h2>
          <button
            onClick={() => { setEditBranch(null); setShowBranchForm(true); }}
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
          >
            Add Branch
          </button>
        </div>

        {partner.branches?.length > 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">City</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {partner.branches.map((b) => (
                  <tr key={b.id}>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{b.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{b.code ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{b.city ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{b.contactName ?? '—'}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`inline-flex px-2 py-0.5 text-xs rounded-full ${b.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                        {b.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm">
                      <button
                        onClick={() => { setEditBranch(b); setShowBranchForm(true); }}
                        className="text-green-600 hover:text-green-800 mr-3"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-500">No branches yet. Add a branch for multi-location partners.</p>
        )}
      </div>

      {showBranchForm && (
        <BranchModal
          partnerId={id!}
          branch={editBranch}
          onClose={() => { setShowBranchForm(false); setEditBranch(null); }}
          onSaved={() => {
            setShowBranchForm(false);
            setEditBranch(null);
            queryClient.invalidateQueries({ queryKey: ['partner', id] });
          }}
        />
      )}
    </div>
  );
}

function BranchModal({ partnerId, branch, onClose, onSaved }: {
  partnerId: string;
  branch: Branch | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState('');
  const isEdit = Boolean(branch);

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      isEdit
        ? api(`/partners/${partnerId}/branches/${branch!.id}`, { method: 'PATCH', body: JSON.stringify(body) })
        : api(`/partners/${partnerId}/branches`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: onSaved,
  });

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const fd = new FormData(e.currentTarget);
    mutation.mutate({
      name: fd.get('name'),
      code: fd.get('code') || undefined,
      contactName: fd.get('contactName') || undefined,
      contactEmail: fd.get('contactEmail') || undefined,
      contactPhone: fd.get('contactPhone') || undefined,
      addressLine1: fd.get('addressLine1') || undefined,
      city: fd.get('city') || undefined,
      province: fd.get('province') || undefined,
      postalCode: fd.get('postalCode') || undefined,
    }, { onError: (err) => setError(err.message) });
  }

  const cls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
        <h3 className="text-lg font-semibold mb-4">{isEdit ? 'Edit Branch' : 'Add Branch'}</h3>
        {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 mb-4">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Branch Name *</label>
              <input name="name" defaultValue={branch?.name ?? ''} required className={cls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Code</label>
              <input name="code" defaultValue={branch?.code ?? ''} placeholder="e.g. BB-SAND" className={cls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contact Name</label>
              <input name="contactName" defaultValue={branch?.contactName ?? ''} className={cls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contact Email</label>
              <input name="contactEmail" type="email" defaultValue={branch?.contactEmail ?? ''} className={cls} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
            <input name="addressLine1" placeholder="Street address" className={cls} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
              <input name="city" defaultValue={branch?.city ?? ''} className={cls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Province</label>
              <input name="province" className={cls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Postal Code</label>
              <input name="postalCode" className={cls} />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={mutation.isPending}
              className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
            >
              {mutation.isPending ? 'Saving...' : isEdit ? 'Update' : 'Create'}
            </button>
            <button type="button" onClick={onClose} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">{title}</h3>
      {children}
    </div>
  );
}

function DI({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900">{value ?? '—'}</dd>
    </div>
  );
}
