import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api } from '../lib/api';
import { formatR } from '../lib/format';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { ChartTooltip, ChartGradients, GradientDef, CHART_COLORS, cleanAxisProps, cleanGridProps } from '../components/charts';

interface DashboardStats {
  totalTitles: number;
  activeAuthors: number;
  activePartners: number;
  totalStock: number;
  openPurchaseOrders: number;
  pendingExpenseClaims: number;
  mtdCashSales: number;
  pendingPartnerOrders: number;
}

interface PnlSummary {
  ytdRevenue: number;
  ytdExpenses: number;
  ytdNet: number;
  mtdRevenue: number;
  mtdRevenueLy: number;
  mtdYoYChange: number | null;
  mtdExpenses: number;
  mtdNet: number;
  outstanding: number;
}

interface RevenuePoint { month: string; revenue: number }
interface ExpensePoint { category: string; total: number }
interface OverdueInvoice { id: string; number: string; total: number; dueDate: string; partnerName: string; daysOverdue: number }
interface Activity { type: string; reference: string; amount: number; date: string }
interface TopTitle { id: string; title: string; unitsSold: number; revenue: number }
interface OutstandingSor { id: string; number: string; partnerName: string; returnByDate: string; outstandingUnits: number; isOverdue: boolean; daysUntilDue: number }
interface RoyaltyDue { id: string; authorName: string; amountPending: number; entryCount: number }
interface LowStockTitle { id: string; title: string; stockOnHand: number }

const PIE_COLORS = CHART_COLORS;

export function Dashboard() {
  const navigate = useNavigate();
  const [topTitlesPeriod, setTopTitlesPeriod] = useState<'mtd' | 'ytd'>('ytd');

  const { data: statsData, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => api<{ data: DashboardStats }>('/dashboard/stats'),
  });

  const { data: pnlData } = useQuery({
    queryKey: ['dashboard-pnl'],
    queryFn: () => api<{ data: PnlSummary }>('/dashboard/pnl-summary'),
  });

  const { data: revenueData } = useQuery({
    queryKey: ['dashboard-revenue'],
    queryFn: () => api<{ data: RevenuePoint[] }>('/dashboard/revenue-chart'),
  });

  const { data: expenseData } = useQuery({
    queryKey: ['dashboard-expenses'],
    queryFn: () => api<{ data: ExpensePoint[] }>('/dashboard/expense-chart'),
  });

  const { data: overdueData } = useQuery({
    queryKey: ['dashboard-overdue'],
    queryFn: () => api<{ data: OverdueInvoice[] }>('/dashboard/overdue-invoices'),
  });

  const { data: activityData } = useQuery({
    queryKey: ['dashboard-activity'],
    queryFn: () => api<{ data: Activity[] }>('/dashboard/recent-activity'),
  });

  const { data: topTitlesData } = useQuery({
    queryKey: ['dashboard-top-titles'],
    queryFn: () => api<{ data: { mtd: TopTitle[]; ytd: TopTitle[] } }>('/dashboard/top-titles'),
  });

  const { data: sorData } = useQuery({
    queryKey: ['dashboard-outstanding-sors'],
    queryFn: () => api<{ data: OutstandingSor[] }>('/dashboard/outstanding-sors'),
  });

  const { data: royaltiesData } = useQuery({
    queryKey: ['dashboard-royalties-due'],
    queryFn: () => api<{ data: RoyaltyDue[] }>('/dashboard/royalties-due'),
  });

  const { data: lowStockData } = useQuery({
    queryKey: ['dashboard-low-stock'],
    queryFn: () => api<{ data: LowStockTitle[] }>('/dashboard/low-stock'),
  });

  const stats = statsData?.data;
  const pnl = pnlData?.data;
  const topTitles = topTitlesPeriod === 'mtd' ? topTitlesData?.data?.mtd : topTitlesData?.data?.ytd;

  const operationalCards = [
    { label: 'Total Titles', value: stats?.totalTitles, color: 'bg-blue-50 text-blue-700', link: '/titles' },
    { label: 'Active Authors', value: stats?.activeAuthors, color: 'bg-green-50 text-green-700', link: '/authors' },
    { label: 'Channel Partners', value: stats?.activePartners, color: 'bg-amber-50 text-amber-700', link: '/partners' },
    { label: 'Total Stock', value: stats?.totalStock, color: 'bg-purple-50 text-purple-700', link: '/inventory' },
    { label: 'Open POs', value: stats?.openPurchaseOrders, color: 'bg-indigo-50 text-indigo-700', link: '/finance/purchase-orders' },
    { label: 'Cash Sales MTD', value: stats?.mtdCashSales !== undefined ? formatR(stats.mtdCashSales) : undefined, color: 'bg-teal-50 text-teal-700', link: '/sales/cash-sales', isAmount: true },
    { label: 'Pending Claims', value: stats?.pendingExpenseClaims, color: 'bg-orange-50 text-orange-700', link: '/expenses/claims' },
    { label: 'Partner Orders', value: stats?.pendingPartnerOrders, color: 'bg-rose-50 text-rose-700', link: '/partners/portal-orders' },
  ];

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
        <p className="text-sm text-gray-500 mt-1">Xarra Books Management System</p>
      </div>

      {/* Financial summary cards */}
      {pnl && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <p className="text-xs text-gray-500 uppercase">Revenue YTD</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{formatR(pnl.ytdRevenue)}</p>
            <p className="text-xs text-gray-400 mt-1">This month: {formatR(pnl.mtdRevenue)}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <p className="text-xs text-gray-500 uppercase">Sales This Month</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{formatR(pnl.mtdRevenue)}</p>
            {pnl.mtdYoYChange !== null ? (
              <p className={`text-xs mt-1 font-medium ${pnl.mtdYoYChange >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {pnl.mtdYoYChange >= 0 ? '▲' : '▼'} {Math.abs(pnl.mtdYoYChange).toFixed(1)}% vs same month last year
              </p>
            ) : (
              <p className="text-xs text-gray-400 mt-1">No comparison data</p>
            )}
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <p className="text-xs text-gray-500 uppercase">Net Profit YTD</p>
            <p className={`text-2xl font-bold mt-1 ${pnl.ytdNet >= 0 ? 'text-green-700' : 'text-red-600'}`}>
              {formatR(pnl.ytdNet)}
            </p>
            <p className="text-xs text-gray-400 mt-1">This month: {formatR(pnl.mtdNet)}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <p className="text-xs text-gray-500 uppercase">Outstanding</p>
            <p className="text-2xl font-bold text-amber-600 mt-1">{formatR(pnl.outstanding)}</p>
            <p className="text-xs text-gray-400 mt-1">Unpaid invoices</p>
          </div>
        </div>
      )}

      {/* Operational stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
        {operationalCards.map((stat) => (
          <div
            key={stat.label}
            onClick={() => navigate(stat.link)}
            className={`rounded-lg p-5 ${stat.color} cursor-pointer hover:opacity-80 transition-opacity`}
          >
            <p className="text-sm font-medium opacity-80">{stat.label}</p>
            <p className={`font-bold mt-1 ${(stat as any).isAmount ? 'text-xl' : 'text-3xl'}`}>
              {isLoading ? '...' : stat.value ?? 0}
            </p>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Revenue bar chart */}
        <div className="rounded-xl border border-gray-200/60 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Revenue Over Time</h3>
          {revenueData?.data && revenueData.data.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={revenueData.data}>
                <ChartGradients>
                  <GradientDef id="revGrad" from="#34d399" to="#059669" />
                </ChartGradients>
                <CartesianGrid {...cleanGridProps} />
                <XAxis dataKey="month" {...cleanAxisProps} />
                <YAxis {...cleanAxisProps} tickFormatter={(v) => `R${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<ChartTooltip formatter={(v) => formatR(v)} />} />
                <Bar dataKey="revenue" fill="url(#revGrad)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[280px] flex items-center justify-center text-gray-400 text-sm">No revenue data yet</div>
          )}
        </div>

        {/* Expense donut chart */}
        <div className="rounded-xl border border-gray-200/60 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Expenses by Category (YTD)</h3>
          {expenseData?.data && expenseData.data.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={expenseData.data}
                  dataKey="total"
                  nameKey="category"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  cornerRadius={4}
                  label={({ category, percent }: any) => `${category} (${(percent * 100).toFixed(0)}%)`}
                  labelLine={{ strokeWidth: 1, stroke: '#cbd5e1' }}
                >
                  {expenseData.data.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} strokeWidth={0} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip formatter={(v) => formatR(v)} />} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[280px] flex items-center justify-center text-gray-400 text-sm">No expense data yet</div>
          )}
        </div>
      </div>

      {/* Insights row: Top Titles + Outstanding SORs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Top 5 Performing Titles */}
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900">Top Performing Titles</h3>
            <div className="flex rounded-md border border-gray-200 overflow-hidden text-xs">
              <button
                onClick={() => setTopTitlesPeriod('mtd')}
                className={`px-2 py-1 ${topTitlesPeriod === 'mtd' ? 'bg-gray-100 font-medium' : 'text-gray-500'}`}
              >MTD</button>
              <button
                onClick={() => setTopTitlesPeriod('ytd')}
                className={`px-2 py-1 ${topTitlesPeriod === 'ytd' ? 'bg-gray-100 font-medium' : 'text-gray-500'}`}
              >YTD</button>
            </div>
          </div>
          {topTitles && topTitles.length > 0 ? (
            <div className="divide-y">
              {topTitles.map((t, i) => (
                <div
                  key={t.id}
                  className="flex items-center gap-3 py-2 cursor-pointer hover:bg-gray-50 px-1 rounded"
                  onClick={() => navigate(`/titles/${t.id}`)}
                >
                  <span className="text-xs font-bold text-gray-300 w-4 shrink-0">#{i + 1}</span>
                  <span className="text-sm text-gray-800 flex-1 truncate">{t.title}</span>
                  <span className="text-xs text-gray-500 shrink-0">{t.unitsSold} units</span>
                  <span className="text-sm font-medium font-mono text-gray-900 shrink-0">{formatR(t.revenue)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">No sales data</p>
          )}
        </div>

        {/* Outstanding SORs */}
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900">Outstanding SORs</h3>
            <button onClick={() => navigate('/consignments')} className="text-xs text-green-700 hover:underline">View all</button>
          </div>
          {sorData?.data && sorData.data.length > 0 ? (
            <div className="divide-y max-h-56 overflow-y-auto">
              {sorData.data.map((sor) => (
                <div
                  key={sor.id}
                  className="flex items-center justify-between py-2 cursor-pointer hover:bg-gray-50 px-1 rounded"
                  onClick={() => navigate(`/consignments/${sor.id}`)}
                >
                  <div>
                    <span className="font-mono text-sm text-gray-800">{sor.number}</span>
                    <span className="text-xs text-gray-500 ml-2">{sor.partnerName}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-gray-500">{sor.outstandingUnits} units</span>
                    <span className={`ml-2 text-xs font-medium ${sor.isOverdue ? 'text-red-500' : 'text-amber-500'}`}>
                      {sor.isOverdue ? `${Math.abs(sor.daysUntilDue)}d overdue` : `${sor.daysUntilDue}d left`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">No SORs due within 30 days</p>
          )}
        </div>
      </div>

      {/* Bottom row: Royalties Due + Low Stock + Overdue Invoices + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Royalties Due */}
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900">Royalties Due</h3>
            <button onClick={() => navigate('/royalties')} className="text-xs text-green-700 hover:underline">Manage</button>
          </div>
          {royaltiesData?.data && royaltiesData.data.length > 0 ? (
            <div className="divide-y max-h-48 overflow-y-auto">
              {royaltiesData.data.map((r) => (
                <div key={r.id} className="flex items-center justify-between py-2 text-sm px-1">
                  <span className="text-gray-700">{r.authorName}</span>
                  <div className="text-right">
                    <span className="font-medium font-mono">{formatR(r.amountPending)}</span>
                    <span className="ml-2 text-xs text-amber-600">{r.entryCount} pending</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">No royalties pending</p>
          )}
        </div>

        {/* Low Stock Alerts */}
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900">Low Stock Alerts</h3>
            <button onClick={() => navigate('/inventory')} className="text-xs text-green-700 hover:underline">View inventory</button>
          </div>
          {lowStockData?.data && lowStockData.data.length > 0 ? (
            <div className="divide-y max-h-48 overflow-y-auto">
              {lowStockData.data.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between py-2 cursor-pointer hover:bg-gray-50 px-1 rounded"
                  onClick={() => navigate(`/titles/${t.id}`)}
                >
                  <span className="text-sm text-gray-700 truncate flex-1">{t.title}</span>
                  <span className={`text-sm font-bold ml-3 shrink-0 ${t.stockOnHand <= 0 ? 'text-red-600' : 'text-amber-500'}`}>
                    {t.stockOnHand <= 0 ? 'Out of stock' : `${t.stockOnHand} left`}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">All titles well-stocked</p>
          )}
        </div>
      </div>

      {/* Overdue Invoices + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Overdue invoices */}
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Overdue Invoices</h3>
          {overdueData?.data && overdueData.data.length > 0 ? (
            <div className="divide-y max-h-64 overflow-y-auto">
              {overdueData.data.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between py-2 text-sm cursor-pointer hover:bg-gray-50 px-1 rounded"
                  onClick={() => navigate(`/invoices/${inv.id}`)}>
                  <div>
                    <span className="font-mono text-green-700">{inv.number}</span>
                    <span className="text-gray-500 ml-2">{inv.partnerName}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-medium">{formatR(inv.total)}</span>
                    <span className="ml-2 text-xs text-red-500">{inv.daysOverdue}d overdue</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">No overdue invoices</p>
          )}
        </div>

        {/* Recent activity */}
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Recent Activity</h3>
          {activityData?.data && activityData.data.length > 0 ? (
            <div className="divide-y max-h-64 overflow-y-auto">
              {activityData.data.map((a, i) => (
                <div key={i} className="flex items-center justify-between py-2 text-sm px-1">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                      a.type === 'INVOICE' ? 'bg-blue-100 text-blue-700' :
                      a.type === 'CASH SALE' ? 'bg-teal-100 text-teal-700' :
                      'bg-green-100 text-green-700'
                    }`}>{a.type}</span>
                    <span className="font-mono text-gray-700">{a.reference}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-medium">{formatR(a.amount)}</span>
                    <span className="ml-2 text-xs text-gray-400">{new Date(a.date).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">No recent activity</p>
          )}
        </div>
      </div>
    </div>
  );
}
