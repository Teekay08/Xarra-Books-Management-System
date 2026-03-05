import { useParams, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

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
  isActive: boolean;
  notes: string | null;
}

export function PartnerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

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

        {partner.notes && (
          <Card title="Notes">
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{partner.notes}</p>
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

function DI({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900">{value ?? '—'}</dd>
    </div>
  );
}
