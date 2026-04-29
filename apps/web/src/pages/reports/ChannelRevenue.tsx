import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { downloadCsv } from '../../lib/export';
import { ExportButton } from '../../components/ExportButton';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { ChartTooltip, ChartGradients, GradientDef, CHART_COLORS, cleanAxisProps, cleanGridProps } from '../../components/charts';

interface ChannelRow { channel: string; saleCount: number; unitsSold: number; revenue: number }
interface PartnerRow { partnerName: string; invoiceCount: number; unitsSold: number; revenue: number }
interface TrendRow { month: string; channel: string; revenue: number }

const fmt = (n: number) => `R ${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const COLORS = CHART_COLORS;

const channelLabels: Record<string, string> = {
  XARRA_WEBSITE: 'Xarra Website',
  XARRA_STORE: 'Xarra Store',
  AMAZON_KDP: 'Amazon KDP',
  TAKEALOT: 'Takealot',
  PARTNER: 'Retail Partners',
};

export function ChannelRevenue() {
  const year = new Date().getFullYear();
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(new Date().toISOString().split('T')[0]);

  const { data, isLoading } = useQuery({
    queryKey: ['report-channel-revenue', from, to],
    queryFn: () => api<{ data: { byChannel: ChannelRow[]; partnerBreakdown: PartnerRow[]; monthlyTrend: TrendRow[] } }>(`/reports/channel-revenue?from=${from}&to=${to}`),
  });

  const channels = data?.data.byChannel ?? [];
  const partners = data?.data.partnerBreakdown ?? [];
  const trend = data?.data.monthlyTrend ?? [];
  const totalRevenue = channels.reduce((s, c) => s + c.revenue, 0);

  const pieData = channels.map((c) => ({ name: channelLabels[c.channel] || c.channel, value: c.revenue }));

  // Build stacked bar chart data from trend
  const monthsSet = [...new Set(trend.map((t) => t.month))].sort();
  const channelsSet = [...new Set(trend.map((t) => t.channel))];
  const stackedData = monthsSet.map((month) => {
    const row: Record<string, any> = { month };
    for (const ch of channelsSet) {
      const entry = trend.find((t) => t.month === month && t.channel === ch);
      row[ch] = entry?.revenue ?? 0;
    }
    return row;
  });

  return (
    <div>
      <PageHeader title="Channel Revenue" subtitle="Revenue breakdown by sales channel (website, store, KDP, Takealot, partners)" />

      <div className="flex gap-3 mb-6">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
        <ExportButton options={[
          { label: 'Export Channels CSV', onClick: () => {
            if (channels.length > 0) {
              downloadCsv(channels.map((c) => ({ ...c, channelLabel: channelLabels[c.channel] || c.channel })), [
                { key: 'channelLabel', header: 'Channel' },
                { key: 'saleCount', header: 'Sales Count' },
                { key: 'unitsSold', header: 'Units Sold' },
                { key: 'revenue', header: 'Revenue' },
              ], 'channel-revenue-report');
            }
          }},
          { label: 'Export Partners CSV', onClick: () => {
            if (partners.length > 0) {
              downloadCsv(partners, [
                { key: 'partnerName', header: 'Partner' },
                { key: 'invoiceCount', header: 'Invoices' },
                { key: 'unitsSold', header: 'Units Sold' },
                { key: 'revenue', header: 'Revenue' },
              ], 'channel-partner-breakdown');
            }
          }},
        ]} />
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-6 mb-6">
            {/* Donut chart */}
            {pieData.length > 0 && (
              <div className="rounded-xl border border-gray-200/60 bg-white p-4 shadow-sm" style={{ height: 350 }}>
                <h3 className="text-sm font-medium text-gray-700 mb-3">Revenue by Channel</h3>
                <ResponsiveContainer width="100%" height="90%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={110} paddingAngle={2} cornerRadius={4} label={({ name, percent }: any) => `${name} (${((percent || 0) * 100).toFixed(0)}%)`} labelLine={{ stroke: '#cbd5e1', strokeWidth: 1 }}>
                      {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} strokeWidth={0} />)}
                    </Pie>
                    <Tooltip content={<ChartTooltip formatter={(v) => fmt(v)} />} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Stacked bar trend */}
            {stackedData.length > 0 && (
              <div className="rounded-xl border border-gray-200/60 bg-white p-4 shadow-sm" style={{ height: 350 }}>
                <h3 className="text-sm font-medium text-gray-700 mb-3">Monthly Trend by Channel</h3>
                <ResponsiveContainer width="100%" height="90%">
                  <BarChart data={stackedData}>
                    <CartesianGrid {...cleanGridProps} />
                    <XAxis dataKey="month" {...cleanAxisProps} />
                    <YAxis {...cleanAxisProps} tickFormatter={(v) => `R${(v / 1000).toFixed(0)}k`} />
                    <Tooltip content={<ChartTooltip formatter={(v) => fmt(v)} />} />
                    <Legend />
                    {channelsSet.map((ch, i) => (
                      <Bar key={ch} dataKey={ch} name={channelLabels[ch] || ch} stackId="a" fill={COLORS[i % COLORS.length]} radius={i === channelsSet.length - 1 ? [4, 4, 0, 0] : undefined} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Channel summary table */}
          <div className="card overflow-hidden mb-6">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Channel</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Sales Count</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Units Sold</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Revenue</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">% of Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {channels.map((c) => (
                  <tr key={c.channel} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{channelLabels[c.channel] || c.channel}</td>
                    <td className="px-4 py-3 text-sm text-right">{c.saleCount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-right">{c.unitsSold.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-right font-mono font-medium">{fmt(c.revenue)}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-500">{totalRevenue > 0 ? ((c.revenue / totalRevenue) * 100).toFixed(1) : 0}%</td>
                  </tr>
                ))}
                {channels.length > 0 && (
                  <tr className="bg-gray-50 font-semibold">
                    <td className="px-4 py-3 text-sm">Total</td>
                    <td className="px-4 py-3 text-sm text-right">{channels.reduce((s, c) => s + c.saleCount, 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-right">{channels.reduce((s, c) => s + c.unitsSold, 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-right font-mono">{fmt(totalRevenue)}</td>
                    <td className="px-4 py-3 text-sm text-right">100%</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Partner breakdown */}
          {partners.length > 0 && (
            <>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Partner Revenue Breakdown (via Invoices)</h3>
              <div className="card overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Partner</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Invoices</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Units</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {partners.map((p) => (
                      <tr key={p.partnerName} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{p.partnerName}</td>
                        <td className="px-4 py-3 text-sm text-right">{p.invoiceCount}</td>
                        <td className="px-4 py-3 text-sm text-right">{p.unitsSold.toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm text-right font-mono">{fmt(p.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
