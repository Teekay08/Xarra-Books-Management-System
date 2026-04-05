import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

export function SystemHealth() {
  const { data: healthData } = useQuery({
    queryKey: ['system-health'],
    queryFn: () => fetch('/api/v1/system-health').then(r => r.json()).catch(() => null),
    refetchInterval: 30000, // refresh every 30s
  });

  const { data: meData } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ user: any }>('/me'),
  });

  const h = healthData;
  const isAdmin = meData?.user?.role?.toLowerCase() === 'admin';

  if (!isAdmin) {
    return <div className="p-8 text-gray-500">Access denied. Admin only.</div>;
  }

  return (
    <div>
      <PageHeader title="System Health" subtitle="Technical overview — API, database, background services" />

      {/* Overall Status */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatusCard label="API" status={h ? 'UP' : 'DOWN'} detail={h?.timestamp ? new Date(h.timestamp).toLocaleTimeString('en-ZA') : '—'} />
        <StatusCard label="Database" status={h?.database?.connected ? 'CONNECTED' : 'DOWN'} detail={h?.database?.latency ? `${h.database.latency}ms latency` : '—'} />
        <StatusCard label="Redis" status={h?.redis?.connected ? 'CONNECTED' : 'DOWN'} detail={h?.redis?.status || '—'} />
        <StatusCard label="Environment" status="INFO" detail={h?.environment || 'development'} />
      </div>

      {/* System Info */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Server Info</h3>
          <div className="space-y-2 text-sm">
            <InfoRow label="Node.js" value={h?.nodeVersion || '—'} />
            <InfoRow label="Platform" value={h?.platform || '—'} />
            <InfoRow label="Uptime" value={h?.uptime ? formatUptime(h.uptime) : '—'} />
            <InfoRow label="Memory Used" value={h?.memory ? `${h.memory.used}MB / ${h.memory.total}MB` : '—'} />
            <InfoRow label="API Version" value={h?.version || 'v1'} />
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Database Stats</h3>
          <div className="space-y-2 text-sm">
            <InfoRow label="Status" value={h?.database?.connected ? 'Connected' : 'Disconnected'} />
            <InfoRow label="Latency" value={h?.database?.latency ? `${h.database.latency}ms` : '—'} />
            <InfoRow label="Total Users" value={h?.database?.stats?.users ?? '—'} />
            <InfoRow label="Total Titles" value={h?.database?.stats?.titles ?? '—'} />
            <InfoRow label="Total Projects" value={h?.database?.stats?.projects ?? '—'} />
            <InfoRow label="Active Staff" value={h?.database?.stats?.staff ?? '—'} />
          </div>
        </div>
      </div>

      {/* Background Jobs */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 mb-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Background Jobs</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {(h?.jobs || []).map((job: any) => (
            <div key={job.name} className="rounded-md border border-gray-100 p-3">
              <p className="text-xs font-medium text-gray-900">{job.name}</p>
              <p className={`text-xs ${job.status === 'active' ? 'text-green-600' : 'text-gray-400'}`}>{job.status}</p>
              {job.schedule && <p className="text-[10px] text-gray-400">{job.schedule}</p>}
            </div>
          ))}
          {(!h?.jobs || h.jobs.length === 0) && (
            <p className="text-sm text-gray-400 col-span-4">Job status not available (Redis may be down)</p>
          )}
        </div>
      </div>

      {/* Recent Notifications */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 mb-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Recent Email Log</h3>
        {h?.recentEmails?.length > 0 ? (
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Time</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">To</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Subject</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {h.recentEmails.map((e: any, i: number) => (
                <tr key={i}>
                  <td className="px-3 py-2 text-gray-500">{e.time}</td>
                  <td className="px-3 py-2 text-gray-700">{e.to}</td>
                  <td className="px-3 py-2 text-gray-900 truncate max-w-[200px]">{e.subject}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${e.status === 'SENT' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {e.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-400">No recent email activity</p>
        )}
      </div>

      {/* Quick Links */}
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Developer Quick Links</h3>
        <div className="flex flex-wrap gap-2">
          <a href="/api/v1/health" target="_blank" rel="noopener noreferrer"
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
            API Health Check
          </a>
          <a href="/api/v1/ping" target="_blank" rel="noopener noreferrer"
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
            API Ping
          </a>
        </div>
      </div>
    </div>
  );
}

function StatusCard({ label, status, detail }: { label: string; status: string; detail: string }) {
  const colors = status === 'UP' || status === 'CONNECTED'
    ? 'border-green-200 bg-green-50'
    : status === 'DOWN' || status === 'DISCONNECTED'
      ? 'border-red-200 bg-red-50'
      : 'border-gray-200 bg-white';
  const dotColor = status === 'UP' || status === 'CONNECTED' ? 'bg-green-500' : status === 'DOWN' ? 'bg-red-500' : 'bg-gray-400';

  return (
    <div className={`rounded-lg border p-4 ${colors}`}>
      <div className="flex items-center gap-2 mb-1">
        <div className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
        <p className="text-xs font-medium text-gray-900">{label}</p>
      </div>
      <p className="text-lg font-bold text-gray-900">{status}</p>
      <p className="text-[10px] text-gray-500">{detail}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-900">{value}</span>
    </div>
  );
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
