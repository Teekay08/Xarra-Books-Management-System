import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

interface SchedulingSettings {
  statementGeneration: {
    enabled: boolean;
    dayOfMonth: number;
    timeHour: number;
  };
  sorAutoInvoice: {
    enabled: boolean;
    graceDays: number;
    timeHour: number;
  };
  invoiceSending: {
    enabled: boolean;
    dayOfMonth: number;
    timeHour: number;
  };
}

const defaults: SchedulingSettings = {
  statementGeneration: { enabled: true, dayOfMonth: 1, timeHour: 6 },
  sorAutoInvoice: { enabled: true, graceDays: 0, timeHour: 8 },
  invoiceSending: { enabled: false, dayOfMonth: 25, timeHour: 9 },
};

const dayOptions = Array.from({ length: 28 }, (_, i) => i + 1);
const hourOptions = Array.from({ length: 24 }, (_, i) => i);

function formatHour(h: number) {
  const sast = h;
  const ampm = sast >= 12 ? 'PM' : 'AM';
  const hr = sast === 0 ? 12 : sast > 12 ? sast - 12 : sast;
  return `${hr}:00 ${ampm} SAST`;
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function AutomationScheduling() {
  const queryClient = useQueryClient();
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['scheduling-settings'],
    queryFn: () => api<{ data: SchedulingSettings }>('/settings/scheduling'),
  });

  const settings = data?.data ?? defaults;
  const [form, setForm] = useState<SchedulingSettings | null>(null);
  const current = form ?? settings;

  const mutation = useMutation({
    mutationFn: (body: SchedulingSettings) =>
      api('/settings/scheduling', { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling-settings'] });
      setSuccess('Scheduling settings saved successfully');
      setError('');
      setTimeout(() => setSuccess(''), 3000);
    },
    onError: (err) => setError(err.message),
  });

  function update<K extends keyof SchedulingSettings>(
    section: K,
    field: string,
    value: unknown
  ) {
    setForm(prev => ({
      ...(prev ?? settings),
      [section]: { ...(prev ?? settings)[section], [field]: value },
    }));
  }

  function handleSave() {
    mutation.mutate(current);
  }

  if (isLoading) return <div className="py-12 text-center text-gray-400">Loading...</div>;

  const toggleClass = (enabled: boolean) =>
    `relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
      enabled ? 'bg-green-600' : 'bg-gray-200'
    }`;
  const toggleDot = (enabled: boolean) =>
    `inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
      enabled ? 'translate-x-6' : 'translate-x-1'
    }`;

  const selectCls = 'rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500';

  return (
    <div>
      <PageHeader
        title="Automation & Scheduling"
        subtitle="Configure when statements are generated and invoices are sent to partners"
      />

      <div className="max-w-2xl space-y-6">
        {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {success && <div className="rounded-md bg-green-50 p-3 text-sm text-green-700">{success}</div>}

        {/* Monthly Statement Generation */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Monthly Statement Generation</h3>
              <p className="text-xs text-gray-500 mt-1">
                Automatically compile partner statements for the previous month
              </p>
            </div>
            <button
              type="button"
              onClick={() => update('statementGeneration', 'enabled', !current.statementGeneration.enabled)}
              className={toggleClass(current.statementGeneration.enabled)}
            >
              <span className={toggleDot(current.statementGeneration.enabled)} />
            </button>
          </div>

          <div className={`space-y-4 ${!current.statementGeneration.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Day of Month</label>
                <select
                  value={current.statementGeneration.dayOfMonth}
                  onChange={e => update('statementGeneration', 'dayOfMonth', Number(e.target.value))}
                  className={selectCls + ' w-full'}
                >
                  {dayOptions.map(d => (
                    <option key={d} value={d}>{ordinal(d)}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">Statements for the previous month will compile on this day</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Time (SAST)</label>
                <select
                  value={current.statementGeneration.timeHour}
                  onChange={e => update('statementGeneration', 'timeHour', Number(e.target.value))}
                  className={selectCls + ' w-full'}
                >
                  {hourOptions.map(h => (
                    <option key={h} value={h}>{formatHour(h)}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="rounded-md bg-blue-50 p-3 text-xs text-blue-700">
              Statements are compiled as drafts and require admin review and approval before being sent to partners.
            </div>
          </div>
        </div>

        {/* SOR Auto-Invoicing */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">SOR Expiry Auto-Invoicing</h3>
              <p className="text-xs text-gray-500 mt-1">
                Automatically generate invoices when Sale-or-Return consignments expire
              </p>
            </div>
            <button
              type="button"
              onClick={() => update('sorAutoInvoice', 'enabled', !current.sorAutoInvoice.enabled)}
              className={toggleClass(current.sorAutoInvoice.enabled)}
            >
              <span className={toggleDot(current.sorAutoInvoice.enabled)} />
            </button>
          </div>

          <div className={`space-y-4 ${!current.sorAutoInvoice.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Grace Period (Days)</label>
                <select
                  value={current.sorAutoInvoice.graceDays}
                  onChange={e => update('sorAutoInvoice', 'graceDays', Number(e.target.value))}
                  className={selectCls + ' w-full'}
                >
                  {[0, 1, 2, 3, 5, 7, 10, 14, 21, 30].map(d => (
                    <option key={d} value={d}>
                      {d === 0 ? 'No grace period (invoice immediately on expiry)' : `${d} day${d > 1 ? 's' : ''} after SOR expiry`}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">Wait this many days after SOR expiry before auto-invoicing</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Check Time (SAST)</label>
                <select
                  value={current.sorAutoInvoice.timeHour}
                  onChange={e => update('sorAutoInvoice', 'timeHour', Number(e.target.value))}
                  className={selectCls + ' w-full'}
                >
                  {hourOptions.map(h => (
                    <option key={h} value={h}>{formatHour(h)}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="rounded-md bg-amber-50 p-3 text-xs text-amber-700">
              Invoices are auto-generated with ISSUED status for sold items on expired consignments. A notification is created for admin review.
            </div>
          </div>
        </div>

        {/* Invoice Sending Schedule */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Scheduled Invoice Sending</h3>
              <p className="text-xs text-gray-500 mt-1">
                Automatically email approved invoices to partners on a set day each month
              </p>
            </div>
            <button
              type="button"
              onClick={() => update('invoiceSending', 'enabled', !current.invoiceSending.enabled)}
              className={toggleClass(current.invoiceSending.enabled)}
            >
              <span className={toggleDot(current.invoiceSending.enabled)} />
            </button>
          </div>

          <div className={`space-y-4 ${!current.invoiceSending.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Day of Month</label>
                <select
                  value={current.invoiceSending.dayOfMonth}
                  onChange={e => update('invoiceSending', 'dayOfMonth', Number(e.target.value))}
                  className={selectCls + ' w-full'}
                >
                  {dayOptions.map(d => (
                    <option key={d} value={d}>{ordinal(d)}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">Unsent ISSUED invoices will be emailed on this day</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Time (SAST)</label>
                <select
                  value={current.invoiceSending.timeHour}
                  onChange={e => update('invoiceSending', 'timeHour', Number(e.target.value))}
                  className={selectCls + ' w-full'}
                >
                  {hourOptions.map(h => (
                    <option key={h} value={h}>{formatHour(h)}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="rounded-md bg-blue-50 p-3 text-xs text-blue-700">
              Only invoices with status ISSUED that haven't been sent yet will be included. You can always send invoices manually from the invoice detail page.
            </div>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={mutation.isPending}
          className="rounded-md bg-green-700 px-6 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
        >
          {mutation.isPending ? 'Saving...' : 'Save Scheduling Settings'}
        </button>
      </div>
    </div>
  );
}
