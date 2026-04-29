import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

interface ReminderSettings {
  enabled: boolean;
  weekBefore: boolean;
  dayBefore: boolean;
  onDueDate: boolean;
  threeDaysAfter: boolean;
  sevenDaysAfter: boolean;
}

const defaults: ReminderSettings = {
  enabled: false,
  weekBefore: true,
  dayBefore: true,
  onDueDate: true,
  threeDaysAfter: true,
  sevenDaysAfter: true,
};

const intervals = [
  { key: 'weekBefore' as const, label: '7 days before due date', description: 'Friendly early reminder' },
  { key: 'dayBefore' as const, label: '1 day before due date', description: 'Final notice before due' },
  { key: 'onDueDate' as const, label: 'On the due date', description: 'Due date reminder' },
  { key: 'threeDaysAfter' as const, label: '3 days after due date', description: 'First overdue notice' },
  { key: 'sevenDaysAfter' as const, label: '7 days after due date', description: 'Second overdue notice' },
];

export function InvoiceReminders() {
  const queryClient = useQueryClient();
  const [success, setSuccess] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api<{ data: { invoiceReminders: ReminderSettings | null } | null }>('/settings'),
  });

  const settings = data?.data?.invoiceReminders ?? defaults;
  const [form, setForm] = useState<ReminderSettings | null>(null);
  const current = form ?? settings;

  const mutation = useMutation({
    mutationFn: (body: ReminderSettings) =>
      api('/settings/invoice-reminders', { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setSuccess('Reminder settings saved');
      setTimeout(() => setSuccess(''), 3000);
    },
  });

  function toggle(key: keyof ReminderSettings) {
    setForm(prev => ({ ...(prev ?? settings), [key]: !(prev ?? settings)[key] }));
  }

  function handleSave() {
    mutation.mutate(current);
  }

  if (isLoading) return <div className="py-12 text-center text-gray-400">Loading...</div>;

  return (
    <div>
      <PageHeader title="Invoice Reminders" subtitle="Configure automatic payment reminder emails to channel partners" />

      <div className="max-w-xl space-y-6">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Auto-Send Reminders</h3>
              <p className="text-xs text-gray-500 mt-1">
                When enabled, reminder emails are sent daily at 08:00 SAST for invoices matching the selected intervals.
              </p>
            </div>
            <button
              type="button"
              onClick={() => toggle('enabled')}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                current.enabled ? 'bg-green-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  current.enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className={`space-y-3 ${!current.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
            <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider">Reminder Intervals</h4>
            {intervals.map(({ key, label, description }) => (
              <label key={key} className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={current[key]}
                  onChange={() => toggle(key)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                />
                <div>
                  <span className="text-sm font-medium text-gray-900">{label}</span>
                  <p className="text-xs text-gray-500">{description}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {success && <div className="rounded-md bg-green-50 p-3 text-sm text-green-700">{success}</div>}

        <button
          onClick={handleSave}
          disabled={mutation.isPending}
          className="rounded-md bg-green-700 px-6 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
        >
          {mutation.isPending ? 'Saving...' : 'Save Reminder Settings'}
        </button>

        <div className="card p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">How it works</h3>
          <ul className="text-sm text-gray-600 space-y-1.5 list-disc list-inside">
            <li>Reminders are sent to the partner's remittance email (or contact email as fallback)</li>
            <li>Only invoices with status <strong>Issued</strong> or <strong>Partial</strong> receive reminders</li>
            <li>Each reminder type is sent only once per invoice (no duplicates)</li>
            <li>The job runs daily at 08:00 SAST — reminders are sent if the invoice due date matches the interval on that day</li>
            <li>Voided or fully paid invoices are automatically excluded</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
