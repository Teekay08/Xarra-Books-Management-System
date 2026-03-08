import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api } from '../lib/api';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';

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
  mtdExpenses: number;
  mtdNet: number;
  outstanding: number;
}

interface RevenuePoint { month: string; revenue: number }
interface ExpensePoint { category: string; total: number }
interface OverdueInvoice { id: string; number: string; total: number; dueDate: string; partnerName: string; daysOverdue: number }
interface Activity { type: string; reference: string; amount: number; date: string }

const PIE_COLORS = ['#166534', '#15803d', '#22c55e', '#86efac', '#4ade80', '#a3e635', '#facc15', '#f97316'];

function formatR(v: number) {
  return `R ${v.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function Dashboard() {
  const navigate = useNavigate();

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

  const stats = statsData?.data;
  const pnl = pnlData?.data;

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
            <p className="text-xs text-gray-500 uppercase">Expenses YTD</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{formatR(pnl.ytdExpenses)}</p>
            <p className="text-xs text-gray-400 mt-1">This month: {formatR(pnl.mtdExpenses)}</p>
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
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Revenue Over Time</h3>
          {revenueData?.data && revenueData.data.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={revenueData.data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => formatR(Number(v))} />
                <Bar dataKey="revenue" fill="#166534" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[280px] flex items-center justify-center text-gray-400 text-sm">No revenue data yet</div>
          )}
        </div>

        {/* Expense pie chart */}
        <div className="rounded-lg border border-gray-200 bg-white p-5">
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
                  outerRadius={100}
                  label={({ category, percent }: any) => `${category} (${(percent * 100).toFixed(0)}%)`}
                  labelLine={{ strokeWidth: 1 }}
                >
                  {expenseData.data.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => formatR(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[280px] flex items-center justify-center text-gray-400 text-sm">No expense data yet</div>
          )}
        </div>
      </div>

      {/* Bottom row: Overdue Invoices + Recent Activity */}
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
