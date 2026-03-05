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
  advanceAmount: string;
  isSigned: boolean;
  startDate: string;
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
  contracts?: Contract[];
}

export function AuthorDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

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

          {author.contracts && author.contracts.length > 0 && (
            <Card title="Contracts">
              <div className="divide-y">
                {author.contracts.map((c) => (
                  <div key={c.id} className="py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{c.title?.title ?? c.titleId}</p>
                      <p className="text-xs text-gray-500">
                        Print: {(Number(c.royaltyRatePrint) * 100).toFixed(0)}% | Ebook: {(Number(c.royaltyRateEbook) * 100).toFixed(0)}%
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
            </Card>
          )}
        </div>

        {author.notes && (
          <Card title="Notes">
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{author.notes}</p>
          </Card>
        )}
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
