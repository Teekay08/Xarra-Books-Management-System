import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

type Row = {
  staffId: string;
  staffName: string;
  role: string;
  plannedHours: number;
  loggedHours: number;
  variance: number;
  accuracyPercent: number | null;
  uniqueTasks: number;
  plannedEntries: number;
};

type Response = {
  data: {
    from: string;
    to: string;
    totals: {
      plannedHours: number;
      loggedHours: number;
      variance: number;
      accuracyPercent: number | null;
    };
    rows: Row[];
  };
};

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function PlannedVsActual() {
  const today = new Date();
  const monthAgo = new Date();
  monthAgo.setDate(today.getDate() - 28);

  const [from, setFrom] = useState(ymd(monthAgo));
  const [to, setTo] = useState(ymd(today));

  const { data, isLoading } = useQuery({
    queryKey: ['planner-analytics', from, to],
    queryFn: () => api<Response>(`/project-management/planner/analytics?from=${from}&to=${to}`),
  });

  const rows = data?.data.rows || [];
  const totals = data?.data.totals;

  return (
    <div>
      <PageHeader
        title="Planned vs Actual"
        subtitle="How accurately staff are planning their work versus what was actually logged"
        backTo={{ label: 'Reports', href: '/reports' }}
      />

      <div className="mb-5 flex flex-wrap items-end gap-3 rounded border border-gray-200 bg-white p-3">
        <div>
          <label className="block text-xs font-medium text-gray-600">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          />
        </div>
      </div>

      {isLoading && <div className="rounded border border-gray-200 bg-white p-6 text-sm text-gray-500">Loading…</div>}

      {totals && (
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded border border-gray-200 bg-white p-3">
            <p className="text-xs uppercase text-gray-500">Total Planned</p>
            <p className="mt-1 text-xl font-semibold text-gray-900">{totals.plannedHours.toFixed(1)}h</p>
          </div>
          <div className="rounded border border-gray-200 bg-white p-3">
            <p className="text-xs uppercase text-gray-500">Total Logged (approved)</p>
            <p className="mt-1 text-xl font-semibold text-blue-700">{totals.loggedHours.toFixed(1)}h</p>
          </div>
          <div className="rounded border border-gray-200 bg-white p-3">
            <p className="text-xs uppercase text-gray-500">Variance</p>
            <p className={`mt-1 text-xl font-semibold ${totals.variance >= 0 ? 'text-green-700' : 'text-red-600'}`}>
              {totals.variance >= 0 ? '+' : ''}{totals.variance.toFixed(1)}h
            </p>
          </div>
          <div className="rounded border border-gray-200 bg-white p-3">
            <p className="text-xs uppercase text-gray-500">Plan Accuracy</p>
            <p className="mt-1 text-xl font-semibold text-gray-900">
              {totals.accuracyPercent == null ? '—' : `${totals.accuracyPercent.toFixed(0)}%`}
            </p>
          </div>
        </div>
      )}

      <div className="overflow-x-auto card">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">Staff</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2 text-right">Tasks</th>
              <th className="px-3 py-2 text-right">Planned</th>
              <th className="px-3 py-2 text-right">Logged</th>
              <th className="px-3 py-2 text-right">Variance</th>
              <th className="px-3 py-2 text-right">Accuracy</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !isLoading && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-sm text-gray-500">
                  No planner data in this period.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.staffId} className="border-t border-gray-100">
                <td className="px-3 py-2 font-medium text-gray-900">{r.staffName}</td>
                <td className="px-3 py-2 text-gray-600">{r.role}</td>
                <td className="px-3 py-2 text-right text-gray-700">{r.uniqueTasks}</td>
                <td className="px-3 py-2 text-right text-gray-900">{r.plannedHours.toFixed(1)}h</td>
                <td className="px-3 py-2 text-right text-blue-700">{r.loggedHours.toFixed(1)}h</td>
                <td className={`px-3 py-2 text-right font-medium ${r.variance >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                  {r.variance >= 0 ? '+' : ''}{r.variance.toFixed(1)}h
                </td>
                <td className="px-3 py-2 text-right text-gray-900">
                  {r.accuracyPercent == null ? '—' : `${r.accuracyPercent.toFixed(0)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
