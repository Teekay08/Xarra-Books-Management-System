import { useParams, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

interface ProductionCost {
  id: string;
  category: string;
  description: string;
  amount: string;
  vendor: string | null;
  paidDate: string | null;
}

interface Title {
  id: string;
  title: string;
  subtitle: string | null;
  isbn13: string | null;
  asin: string | null;
  rrpZar: string;
  costPriceZar: string | null;
  formats: string[];
  status: string;
  description: string | null;
  publishDate: string | null;
  pageCount: number | null;
  weightGrams: number | null;
  primaryAuthor?: { legalName: string; penName: string | null } | null;
  productionCosts?: ProductionCost[];
}

const statusColors: Record<string, string> = {
  PRODUCTION: 'bg-amber-100 text-amber-700',
  ACTIVE: 'bg-green-100 text-green-700',
  OUT_OF_PRINT: 'bg-gray-100 text-gray-500',
};

export function TitleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['title', id],
    queryFn: () => api<{ data: Title }>(`/titles/${id}`),
  });

  if (isLoading) return <div className="py-12 text-center text-gray-400">Loading...</div>;
  if (!data?.data) return <div className="py-12 text-center text-gray-400">Title not found</div>;

  const title = data.data;

  return (
    <div>
      <PageHeader
        title={title.title}
        subtitle={title.subtitle ?? undefined}
        action={
          <button
            onClick={() => navigate(`/titles/${id}/edit`)}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Edit
          </button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card title="Book Details">
            <dl className="grid grid-cols-2 gap-3">
              <DI label="ISBN-13" value={title.isbn13} />
              <DI label="ASIN" value={title.asin} />
              <DI label="RRP" value={title.rrpZar ? `R ${Number(title.rrpZar).toFixed(2)}` : null} />
              <DI label="Cost Price" value={title.costPriceZar ? `R ${Number(title.costPriceZar).toFixed(2)}` : null} />
              <DI label="Formats" value={title.formats.join(', ')} />
              <DI label="Status" value={title.status} badge={statusColors[title.status]} />
              <DI label="Publish Date" value={title.publishDate?.split('T')[0]} />
              <DI label="Pages" value={title.pageCount?.toString()} />
              <DI label="Weight" value={title.weightGrams ? `${title.weightGrams}g` : null} />
              {title.primaryAuthor && (
                <DI label="Primary Author" value={title.primaryAuthor.penName || title.primaryAuthor.legalName} />
              )}
            </dl>
          </Card>

          {title.description && (
            <Card title="Description">
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{title.description}</p>
            </Card>
          )}

          {title.productionCosts && title.productionCosts.length > 0 && (
            <Card title="Production Costs">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-gray-500">
                    <th className="pb-2">Category</th>
                    <th className="pb-2">Description</th>
                    <th className="pb-2">Vendor</th>
                    <th className="pb-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {title.productionCosts.map((c) => (
                    <tr key={c.id}>
                      <td className="py-2">{c.category}</td>
                      <td className="py-2">{c.description}</td>
                      <td className="py-2 text-gray-500">{c.vendor ?? '—'}</td>
                      <td className="py-2 text-right font-mono">R {Number(c.amount).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t font-medium">
                    <td colSpan={3} className="py-2">Total</td>
                    <td className="py-2 text-right font-mono">
                      R {title.productionCosts.reduce((sum, c) => sum + Number(c.amount), 0).toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </Card>
          )}
        </div>
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

function DI({ label, value, badge }: { label: string; value: string | null | undefined; badge?: string }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900">
        {badge && value ? (
          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badge}`}>{value}</span>
        ) : (
          value ?? '—'
        )}
      </dd>
    </div>
  );
}
