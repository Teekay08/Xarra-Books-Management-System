import { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

interface SystemConfig {
  lowStockThreshold: number;
  sorAlertDays: number;
  exchangeRateSource: 'MANUAL' | 'SARB' | 'XE';
}

export function SystemConfiguration() {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['system-config'],
    queryFn: () => api<{ data: SystemConfig }>('/settings/system-config'),
  });

  const mutation = useMutation({
    mutationFn: (body: Partial<SystemConfig>) =>
      api('/settings/system-config', { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-config'] });
      setSuccess('System configuration saved successfully');
      setTimeout(() => setSuccess(''), 3000);
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setSuccess('');
    const fd = new FormData(e.currentTarget);
    
    const body: Partial<SystemConfig> = {
      lowStockThreshold: parseInt(fd.get('lowStockThreshold') as string, 10),
      sorAlertDays: parseInt(fd.get('sorAlertDays') as string, 10),
      exchangeRateSource: fd.get('exchangeRateSource') as SystemConfig['exchangeRateSource'],
    };

    mutation.mutate(body);
  }

  if (isLoading) return <div className="py-12 text-center text-gray-400">Loading...</div>;
  
  const config = data?.data;
  const cls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500';

  return (
    <div>
      <PageHeader 
        title="System Configuration" 
        subtitle="Configure operational thresholds and system behavior" 
      />

      {error && <div className="mb-4 max-w-3xl rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {success && <div className="mb-4 max-w-3xl rounded-md bg-green-50 p-3 text-sm text-green-700">{success}</div>}

      <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
        {/* Inventory Settings */}
        <fieldset className="rounded-lg border border-gray-200 bg-white p-5">
          <legend className="px-2 text-sm font-semibold text-gray-700">Inventory Settings</legend>
          <p className="mb-4 text-xs text-gray-500">
            Configure how the system alerts you about low stock levels.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Low Stock Threshold
            </label>
            <input
              type="number"
              name="lowStockThreshold"
              min="0"
              max="1000"
              defaultValue={config?.lowStockThreshold ?? 10}
              className={cls}
              placeholder="10"
            />
            <p className="mt-1 text-xs text-gray-500">
              Stock levels below this number will be highlighted in amber in the inventory view.
            </p>
          </div>
        </fieldset>

        {/* Consignment Settings */}
        <fieldset className="rounded-lg border border-gray-200 bg-white p-5">
          <legend className="px-2 text-sm font-semibold text-gray-700">Consignment Settings</legend>
          <p className="mb-4 text-xs text-gray-500">
            Configure alerts for Sale or Return (SOR) consignments approaching expiry.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              SOR Alert Period (days)
            </label>
            <input
              type="number"
              name="sorAlertDays"
              min="1"
              max="365"
              defaultValue={config?.sorAlertDays ?? 30}
              className={cls}
              placeholder="30"
            />
            <p className="mt-1 text-xs text-gray-500">
              SOR consignments expiring within this many days will be highlighted in amber.
            </p>
          </div>
        </fieldset>

        {/* Exchange Rate Settings */}
        <fieldset className="rounded-lg border border-gray-200 bg-white p-5">
          <legend className="px-2 text-sm font-semibold text-gray-700">Exchange Rate Settings</legend>
          <p className="mb-4 text-xs text-gray-500">
            Choose how exchange rates are sourced when syncing with international sales platforms (e.g., Amazon KDP).
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Exchange Rate Source
            </label>
            <select
              name="exchangeRateSource"
              defaultValue={config?.exchangeRateSource ?? 'MANUAL'}
              className={cls}
            >
              <option value="MANUAL">Manual Entry</option>
              <option value="SARB">South African Reserve Bank (SARB)</option>
              <option value="XE">XE.com Currency API</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">
              <span className="font-medium">Manual:</span> Exchange rates must be entered manually for each sync.<br />
              <span className="font-medium">SARB:</span> Automatically fetch official rates from the South African Reserve Bank.<br />
              <span className="font-medium">XE:</span> Automatically fetch real-time rates from XE.com (requires API key).
            </p>
          </div>
        </fieldset>

        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded-md bg-green-700 px-6 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
        >
          {mutation.isPending ? 'Saving...' : 'Save Configuration'}
        </button>
      </form>
    </div>
  );
}
