import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

const NOTIFICATION_CATEGORIES = {
  'Orders & Fulfillment': [
    { type: 'PARTNER_ORDER_SUBMITTED', label: 'New partner order received' },
    { type: 'PARTNER_ORDER_CANCELLED', label: 'Partner order cancelled' },
    { type: 'PARTNER_RETURN_SUBMITTED', label: 'Partner return request submitted' },
  ],
  'Finance & Payments': [
    { type: 'INVOICE_OVERDUE', label: 'Invoice overdue reminder' },
    { type: 'INVOICE_PAID', label: 'Invoice payment received' },
    { type: 'INVOICE_ISSUED', label: 'Invoice issued' },
    { type: 'PAYMENT_RECEIVED', label: 'Payment received' },
    { type: 'CREDIT_NOTE_CREATED', label: 'Credit note created' },
    { type: 'DEBIT_NOTE_CREATED', label: 'Debit note created' },
    { type: 'REMITTANCE_MATCHED', label: 'Remittance matched' },
  ],
  'Inventory & Operations': [
    { type: 'INVENTORY_LOW_STOCK', label: 'Low stock alert' },
    { type: 'INVENTORY_RECEIVED', label: 'Stock received' },
    { type: 'CONSIGNMENT_DISPATCHED', label: 'Consignment dispatched' },
    { type: 'CONSIGNMENT_EXPIRING', label: 'Consignment expiring' },
    { type: 'PURCHASE_ORDER_ISSUED', label: 'Purchase order issued' },
    { type: 'PURCHASE_ORDER_RECEIVED', label: 'Goods received' },
  ],
  'Procurement': [
    { type: 'EXPENSE_CLAIM_SUBMITTED', label: 'Expense claim submitted' },
    { type: 'EXPENSE_CLAIM_APPROVED', label: 'Expense claim approved' },
    { type: 'REQUISITION_SUBMITTED', label: 'Requisition submitted' },
    { type: 'REQUISITION_APPROVED', label: 'Requisition approved' },
  ],
  'Project Budgeting': [
    { type: 'PROJECT_CREATED', label: 'New project created' },
    { type: 'PROJECT_BUDGET_APPROVED', label: 'Project budget approved' },
    { type: 'PROJECT_OVER_BUDGET', label: 'Project over budget alert' },
    { type: 'TIMESHEET_SUBMITTED', label: 'Timesheet submitted' },
    { type: 'TIMESHEET_APPROVED', label: 'Timesheet approved' },
    { type: 'SOW_SENT', label: 'SOW document sent' },
    { type: 'SOW_ACCEPTED', label: 'SOW accepted' },
  ],
};

const DIGEST_OPTIONS = [
  { value: 'IMMEDIATE', label: 'Immediate' },
  { value: 'DAILY', label: 'Daily Digest' },
  { value: 'WEEKLY', label: 'Weekly Digest' },
  { value: 'NONE', label: 'Off' },
];

interface Preferences {
  emailEnabled: boolean;
  digestFrequency: string;
  dailyDigestHour: number;
  weeklyDigestDay: number;
  preferences: Record<string, { email: boolean; digest: string }>;
}

export function NotificationEmailSettings() {
  const queryClient = useQueryClient();
  const [prefs, setPrefs] = useState<Preferences>({
    emailEnabled: true,
    digestFrequency: 'IMMEDIATE',
    dailyDigestHour: 7,
    weeklyDigestDay: 1,
    preferences: {},
  });

  const { data, isLoading } = useQuery({
    queryKey: ['notification-email-prefs'],
    queryFn: () => api<{ data: Preferences }>('/order-tracking/notification-preferences'),
  });

  useEffect(() => {
    if (data?.data) setPrefs(data.data);
  }, [data]);

  const mutation = useMutation({
    mutationFn: () => api('/order-tracking/notification-preferences', {
      method: 'PUT',
      body: JSON.stringify(prefs),
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notification-email-prefs'] }),
    onError: (err: Error) => alert(`Failed to save: ${err.message}`),
  });

  const getTypePref = (type: string) => prefs.preferences[type] || { email: true, digest: prefs.digestFrequency };

  const setTypePref = (type: string, field: 'email' | 'digest', value: any) => {
    setPrefs((p) => ({
      ...p,
      preferences: {
        ...p.preferences,
        [type]: { ...getTypePref(type), [field]: value },
      },
    }));
  };

  if (isLoading) return <div className="p-8 text-gray-400">Loading...</div>;

  return (
    <div>
      <PageHeader
        title="Email Notification Settings"
        subtitle="Control which notifications are sent to your email"
        backTo={{ label: 'Settings', href: '/settings' }}
      />

      {/* Master Toggle */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Email Notifications</h3>
            <p className="text-xs text-gray-500 mt-1">Master toggle for all email notifications</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" checked={prefs.emailEnabled}
              onChange={(e) => setPrefs({ ...prefs, emailEnabled: e.target.checked })}
              className="sr-only peer" />
            <div className="w-11 h-6 bg-gray-200 peer-focus:ring-2 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-green-600 after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all" />
          </label>
        </div>
      </div>

      {prefs.emailEnabled && (
        <>
          {/* Default Digest */}
          <div className="rounded-lg border border-gray-200 bg-white p-5 mb-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Default Delivery</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Default Frequency</label>
                <select value={prefs.digestFrequency}
                  onChange={(e) => setPrefs({ ...prefs, digestFrequency: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
                  {DIGEST_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              {prefs.digestFrequency === 'DAILY' && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Daily Digest Hour (SAST)</label>
                  <select value={prefs.dailyDigestHour}
                    onChange={(e) => setPrefs({ ...prefs, dailyDigestHour: Number(e.target.value) })}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
                    ))}
                  </select>
                </div>
              )}
              {prefs.digestFrequency === 'WEEKLY' && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Weekly Digest Day</label>
                  <select value={prefs.weeklyDigestDay}
                    onChange={(e) => setPrefs({ ...prefs, weeklyDigestDay: Number(e.target.value) })}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
                    {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d, i) => (
                      <option key={i} value={i}>{d}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Per-category settings */}
          {Object.entries(NOTIFICATION_CATEGORIES).map(([category, types]) => (
            <div key={category} className="rounded-lg border border-gray-200 bg-white p-5 mb-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">{category}</h3>
              <div className="space-y-3">
                {types.map(({ type, label }) => {
                  const typePref = getTypePref(type);
                  return (
                    <div key={type} className="flex items-center justify-between py-1">
                      <span className="text-sm text-gray-700">{label}</span>
                      <div className="flex items-center gap-3">
                        <select value={typePref.digest}
                          onChange={(e) => setTypePref(type, 'digest', e.target.value)}
                          className="rounded-md border border-gray-300 px-2 py-1 text-xs">
                          {DIGEST_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}

      <button onClick={() => mutation.mutate()} disabled={mutation.isPending}
        className="rounded-md bg-green-700 px-6 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50">
        {mutation.isPending ? 'Saving...' : 'Save Preferences'}
      </button>
    </div>
  );
}
