import { useState, type FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

interface Contract {
  id: string;
  titleId: string;
  royaltyRatePrint: string;
  royaltyRateEbook: string;
  triggerType: string;
  triggerValue: number | null;
  advanceAmount: string;
  isSigned: boolean;
  startDate: string;
  endDate: string | null;
  title?: { title: string; isbn13: string | null };
}

interface Author {
  id: string;
  legalName: string;
  penName: string | null;
  type: string;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  city: string | null;
  province: string | null;
  isActive: boolean;
  notes: string | null;
  portalUserId: string | null;
  portalUser: { email: string; updatedAt: string | null } | null;
  contracts?: Contract[];
}

interface TitleOption {
  id: string;
  title: string;
  isbn13: string | null;
}

export function AuthorDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showContractModal, setShowContractModal] = useState(false);
  const [showPortalModal, setShowPortalModal] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['author', id],
    queryFn: () => api<{ data: Author }>(`/authors/${id}`),
  });

  const deactivate = useMutation({
    mutationFn: () => api(`/authors/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['authors'] });
      navigate('/authors');
    },
  });

  if (isLoading) return <div className="py-12 text-center text-gray-400">Loading...</div>;
  if (!data?.data) return <div className="py-12 text-center text-gray-400">Author not found</div>;

  const author = data.data;
  const contracts = author.contracts ?? [];

  return (
    <div>
      <PageHeader
        title={author.legalName}
        subtitle={author.penName ? `Writing as "${author.penName}"` : undefined}
        action={
          <div className="flex gap-2">
            <button
              onClick={() => navigate(`/authors/${id}/edit`)}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Edit
            </button>
            {author.isActive && (
              <button
                onClick={() => {
                  if (confirm('Deactivate this author?')) deactivate.mutate();
                }}
                className="rounded-md border border-red-300 px-4 py-2 text-sm text-red-700 hover:bg-red-50"
              >
                Deactivate
              </button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card title="Details">
            <DL>
              <DI label="Type" value={author.type} />
              <DI label="Email" value={author.email} />
              <DI label="Phone" value={author.phone} />
              <DI label="Status" value={author.isActive ? 'Active' : 'Inactive'} />
            </DL>
          </Card>

          {author.addressLine1 && (
            <Card title="Address">
              <p className="text-sm text-gray-700">
                {[author.addressLine1, author.city, author.province].filter(Boolean).join(', ')}
              </p>
            </Card>
          )}

          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900">Contracts</h3>
              <button
                onClick={() => setShowContractModal(true)}
                className="rounded-md bg-green-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-800"
              >
                Add Contract
              </button>
            </div>
            {contracts.length > 0 ? (
              <div className="divide-y">
                {contracts.map((c) => (
                  <div key={c.id} className="py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{c.title?.title ?? c.titleId}</p>
                      <p className="text-xs text-gray-500">
                        Print: {(Number(c.royaltyRatePrint) * 100).toFixed(0)}%
                        {c.royaltyRateEbook && ` | Ebook: ${(Number(c.royaltyRateEbook) * 100).toFixed(0)}%`}
                        {Number(c.advanceAmount) > 0 && ` | Advance: R ${Number(c.advanceAmount).toFixed(2)}`}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      c.isSigned ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {c.isSigned ? 'Signed' : 'Unsigned'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No contracts yet. Add a contract to link this author to a title.</p>
            )}
          </div>
        </div>

        {author.notes && (
          <Card title="Notes">
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{author.notes}</p>
          </Card>
        )}

        {/* Portal Access */}
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900">Portal Access</h3>
            {!author.portalUserId && (
              <button
                onClick={() => setShowPortalModal(true)}
                className="rounded-md bg-green-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-800"
              >
                Grant Access
              </button>
            )}
          </div>
          {author.portalUserId && author.portalUser ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                  Active
                </span>
              </div>
              <p className="text-sm text-gray-700">
                <span className="text-gray-500">Login email: </span>
                {author.portalUser.email}
              </p>
              {author.portalUser.updatedAt && (
                <p className="text-xs text-gray-400">
                  Last activity:{' '}
                  {new Date(author.portalUser.updatedAt).toLocaleDateString('en-ZA', {
                    day: 'numeric', month: 'short', year: 'numeric',
                  })}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              No portal access. The author cannot log in until access is granted.
            </p>
          )}
        </div>
      </div>

      {showContractModal && (
        <ContractModal
          authorId={id!}
          authorType={author.type}
          onClose={() => setShowContractModal(false)}
          onSuccess={() => {
            setShowContractModal(false);
            queryClient.invalidateQueries({ queryKey: ['author', id] });
          }}
        />
      )}

      {showPortalModal && (
        <PortalAccessModal
          authorId={id!}
          authorEmail={author.email}
          authorName={author.legalName}
          onClose={() => setShowPortalModal(false)}
          onSuccess={() => {
            setShowPortalModal(false);
            queryClient.invalidateQueries({ queryKey: ['author', id] });
          }}
        />
      )}
    </div>
  );
}

function ContractModal({
  authorId,
  authorType,
  onClose,
  onSuccess,
}: {
  authorId: string;
  authorType: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { data: titlesData } = useQuery({
    queryKey: ['titles-all'],
    queryFn: () => api<{ data: TitleOption[] }>('/titles?limit=200'),
  });

  const { data: templatesData } = useQuery({
    queryKey: ['contract-templates-active', authorType],
    queryFn: () => api<{ data: { id: string; name: string; authorType: string; version: string }[] }>(
      `/authors/contract-templates?activeOnly=true&authorType=${encodeURIComponent(authorType)}`
    ),
  });

  const createContract = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/authors/${authorId}/contracts`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess,
  });

  const titles = titlesData?.data ?? [];
  const templates = templatesData?.data ?? [];

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const templateId = fd.get('contractTemplateId') as string;
    createContract.mutate({
      authorId,
      titleId: fd.get('titleId') as string,
      contractTemplateId: templateId || undefined,
      royaltyRatePrint: Number(fd.get('royaltyRatePrint')) / 100,
      royaltyRateEbook: Number(fd.get('royaltyRateEbook') || 0) / 100,
      triggerType: fd.get('triggerType') as string,
      triggerValue: fd.get('triggerValue') ? Number(fd.get('triggerValue')) : undefined,
      advanceAmount: Number(fd.get('advanceAmount') || 0),
      startDate: fd.get('startDate') as string,
      endDate: (fd.get('endDate') as string) || undefined,
      isSigned: fd.get('isSigned') === 'on',
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Add Contract</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contract Template</label>
            <select name="contractTemplateId" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
              <option value="">No template (custom terms)</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.authorType}) v{t.version}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              Contract terms from the selected template will be attached for the author to review and sign.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <select name="titleId" required className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
              <option value="">Select a title...</option>
              {titles.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title} {t.isbn13 ? `(${t.isbn13})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Print Royalty % *</label>
              <input name="royaltyRatePrint" type="number" step="0.1" min="0" max="100" required
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="e.g. 25" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ebook Royalty %</label>
              <input name="royaltyRateEbook" type="number" step="0.1" min="0" max="100"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="e.g. 35" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Trigger Type *</label>
              <select name="triggerType" required className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
                <option value="DATE">Date-based</option>
                <option value="UNITS">Units sold threshold</option>
                <option value="REVENUE">Revenue threshold</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Trigger Value</label>
              <input name="triggerValue" type="number" min="0"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="Optional" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Advance Amount (R)</label>
            <input name="advanceAmount" type="number" step="0.01" min="0" defaultValue="0"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
              <input name="startDate" type="date" required
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <input name="endDate" type="date"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input name="isSigned" type="checkbox" id="isSigned" className="rounded border-gray-300" />
            <label htmlFor="isSigned" className="text-sm text-gray-700">Contract is signed</label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={createContract.isPending}
              className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50">
              {createContract.isPending ? 'Creating...' : 'Create Contract'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PortalAccessModal({
  authorId,
  authorEmail,
  authorName,
  onClose,
  onSuccess,
}: {
  authorId: string;
  authorEmail: string | null;
  authorName: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const grantAccess = useMutation({
    mutationFn: (body: { email: string; name: string; password: string }) =>
      api(`/authors/${authorId}/portal-access`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess,
  });

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    grantAccess.mutate({
      email: fd.get('email') as string,
      name: authorName,
      password: fd.get('password') as string,
    });
  }

  const cls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="p-5 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Grant Portal Access</h2>
          <p className="text-xs text-gray-500 mt-1">
            Creates a login account for {authorName}. Share these credentials with the author.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email Address *</label>
            <input
              name="email"
              type="email"
              required
              defaultValue={authorEmail ?? ''}
              className={cls}
              placeholder="author@email.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Temporary Password *</label>
            <input
              name="password"
              type="password"
              required
              minLength={8}
              className={cls}
              placeholder="Min. 8 characters"
            />
            <p className="text-xs text-gray-400 mt-1">Author can change this after first login via Settings.</p>
          </div>
          {grantAccess.isError && (
            <p className="text-sm text-red-600">
              {(grantAccess.error as Error)?.message ?? 'Failed to grant access'}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={grantAccess.isPending}
              className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50">
              {grantAccess.isPending ? 'Creating...' : 'Grant Access'}
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

function DL({ children }: { children: React.ReactNode }) {
  return <dl className="grid grid-cols-2 gap-3">{children}</dl>;
}

function DI({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900">{value ?? '—'}</dd>
    </div>
  );
}
