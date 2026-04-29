import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { api } from '../lib/api';
import { formatR } from '../lib/format';
import { useSession } from '../lib/auth-client';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { ChartTooltip, ChartGradients, GradientDef, cleanAxisProps, cleanGridProps } from '../components/charts';

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface RevenuePoint  { month: string; revenue: number }
interface ExpensePoint  { category: string; total: number }
interface OverdueInvoice { id: string; number: string; total: number; dueDate: string; partnerName: string; daysOverdue: number }
interface Activity      { type: string; reference: string; amount: number; date: string }
interface TopTitle      { id: string; title: string; unitsSold: number; revenue: number }
interface OutstandingSor { id: string; number: string; partnerName: string; returnByDate: string; outstandingUnits: number; isOverdue: boolean; daysUntilDue: number }
interface RoyaltyDue    { id: string; authorName: string; amountPending: number; entryCount: number }
interface LowStockTitle { id: string; title: string; stockOnHand: number }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function firstName(name: string) {
  return name?.split(' ')[0] ?? '';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Wave-style metric bucket — coloured amount + label + count */
function FinanceBucket({
  label, amount, sub, color, href, urgent,
}: {
  label: string; amount: number | undefined; sub: string;
  color: 'blue' | 'red' | 'amber' | 'green' | 'purple';
  href: string; urgent?: boolean;
}) {
  const COLORS = {
    blue:   { bg: 'bg-blue-50',   border: 'border-blue-100',  text: 'text-blue-700',   dot: 'bg-blue-400' },
    red:    { bg: 'bg-red-50',    border: 'border-red-100',   text: 'text-red-600',    dot: 'bg-red-400' },
    amber:  { bg: 'bg-amber-50',  border: 'border-amber-100', text: 'text-amber-700',  dot: 'bg-amber-400' },
    green:  { bg: 'bg-emerald-50',border: 'border-emerald-100',text: 'text-emerald-700',dot: 'bg-emerald-400'},
    purple: { bg: 'bg-purple-50', border: 'border-purple-100',text: 'text-purple-700', dot: 'bg-purple-400'},
  };
  const c = COLORS[color];
  return (
    <Link to={href} className={`flex-1 rounded-xl border p-4 hover:shadow-sm transition-shadow ${c.bg} ${c.border}`}>
      <div className="flex items-center gap-1.5 mb-2">
        <span className={`h-2 w-2 rounded-full shrink-0 ${c.dot}`} />
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</span>
        {urgent && <span className="ml-auto text-[9px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">Attention</span>}
      </div>
      <p className={`text-2xl font-black leading-none ${c.text}`}>
        {amount !== undefined ? formatR(amount) : '—'}
      </p>
      <p className="text-[11px] text-gray-500 mt-1.5">{sub}</p>
    </Link>
  );
}

/** Combined income vs expenses area chart */
function IncomeExpenseChart({ revenueData }: { revenueData: RevenuePoint[] | undefined }) {
  if (!revenueData?.length) {
    return (
      <div className="h-48 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-2">
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"/></svg>
          </div>
          <p className="text-xs text-gray-400">No revenue data yet</p>
        </div>
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={revenueData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="incGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#2563eb" stopOpacity={0.18} />
            <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid {...cleanGridProps} />
        <XAxis dataKey="month" {...cleanAxisProps} />
        <YAxis {...cleanAxisProps} tickFormatter={(v: number) => `R${(v / 1000).toFixed(0)}k`} />
        <Tooltip content={<ChartTooltip formatter={(v: any) => formatR(v)} />} />
        <Area
          type="monotone" dataKey="revenue" name="Revenue"
          stroke="#2563eb" strokeWidth={2}
          fill="url(#incGrad)" dot={false} activeDot={{ r: 4, fill: '#2563eb' }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Single activity feed row */
function ActivityRow({ a, navigate }: { a: Activity; navigate: ReturnType<typeof useNavigate> }) {
  const TYPE_STYLE: Record<string, string> = {
    INVOICE:   'bg-blue-100 text-blue-700',
    'CASH SALE': 'bg-teal-100 text-teal-700',
    PAYMENT:   'bg-green-100 text-green-700',
    DEFAULT:   'bg-gray-100 text-gray-600',
  };
  const style = TYPE_STYLE[a.type] ?? TYPE_STYLE.DEFAULT;
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
      <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${style}`}>{a.type}</span>
      <span className="font-mono text-xs text-gray-700 flex-1 truncate">{a.reference}</span>
      <span className="text-xs text-gray-400 shrink-0">{new Date(a.date).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' })}</span>
      <span className="text-xs font-semibold text-gray-900 shrink-0 font-mono">{formatR(a.amount)}</span>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export function Dashboard() {
  const navigate = useNavigate();
  const { data: session } = useSession();
  const [topTitlesPeriod, setTopTitlesPeriod] = useState<'mtd' | 'ytd'>('ytd');

  const { data: statsData, isLoading }  = useQuery({ queryKey: ['dashboard-stats'],    queryFn: () => api<{ data: DashboardStats }>('/dashboard/stats') });
  const { data: pnlData }               = useQuery({ queryKey: ['dashboard-pnl'],      queryFn: () => api<{ data: PnlSummary }>('/dashboard/pnl-summary') });
  const { data: revenueData }           = useQuery({ queryKey: ['dashboard-revenue'],  queryFn: () => api<{ data: RevenuePoint[] }>('/dashboard/revenue-chart') });
  const { data: overdueData }           = useQuery({ queryKey: ['dashboard-overdue'],  queryFn: () => api<{ data: OverdueInvoice[] }>('/dashboard/overdue-invoices') });
  const { data: activityData }          = useQuery({ queryKey: ['dashboard-activity'], queryFn: () => api<{ data: Activity[] }>('/dashboard/recent-activity') });
  const { data: topTitlesData }         = useQuery({ queryKey: ['dashboard-top-titles'],queryFn: () => api<{ data: { mtd: TopTitle[]; ytd: TopTitle[] } }>('/dashboard/top-titles') });
  const { data: sorData }               = useQuery({ queryKey: ['dashboard-outstanding-sors'],queryFn: () => api<{ data: OutstandingSor[] }>('/dashboard/outstanding-sors') });
  const { data: royaltiesData }         = useQuery({ queryKey: ['dashboard-royalties-due'],queryFn: () => api<{ data: RoyaltyDue[] }>('/dashboard/royalties-due') });
  const { data: lowStockData }          = useQuery({ queryKey: ['dashboard-low-stock'],queryFn: () => api<{ data: LowStockTitle[] }>('/dashboard/low-stock') });

  const stats     = statsData?.data;
  const pnl       = pnlData?.data;
  const topTitles = topTitlesPeriod === 'mtd' ? topTitlesData?.data?.mtd : topTitlesData?.data?.ytd;
  const overdue   = overdueData?.data ?? [];
  const userName  = firstName(session?.user?.name ?? '');

  // Derived invoice buckets (from pnl + overdue list)
  const overdueTotal  = overdue.reduce((s, i) => s + i.total, 0);

  return (
    <div className="space-y-5">

      {/* ── Greeting + quick actions ─────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {greeting()}{userName ? `, ${userName}` : ''}
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {new Date().toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link to="/invoices/new"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-xarra-red text-white text-xs font-semibold hover:bg-xarra-red-dark shadow-sm transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            New Invoice
          </Link>
          <Link to="/invoices/new-cash-sale"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-gray-200 text-gray-700 text-xs font-semibold hover:bg-gray-50 shadow-sm transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg>
            Cash Sale
          </Link>
          <Link to="/consignments/new"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-gray-200 text-gray-700 text-xs font-semibold hover:bg-gray-50 shadow-sm transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
            New Consignment
          </Link>
          <Link to="/payments"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-gray-200 text-gray-700 text-xs font-semibold hover:bg-gray-50 shadow-sm transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Record Payment
          </Link>
        </div>
      </div>

      {/* ── Hero: Net income + area chart + 3 finance KPIs ──────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Main chart card */}
        <div className="lg:col-span-2 card p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Net Income — Year to Date</p>
              <p className={`text-3xl font-black mt-1 leading-none ${pnl ? (pnl.ytdNet >= 0 ? 'text-gray-900' : 'text-red-600') : 'text-gray-200'}`}>
                {pnl ? formatR(pnl.ytdNet) : '—'}
              </p>
              {pnl && (
                <div className="flex items-center gap-3 mt-2">
                  <span className="flex items-center gap-1 text-xs text-blue-600">
                    <span className="h-2 w-2 rounded-full bg-blue-500" />
                    Revenue {formatR(pnl.ytdRevenue)}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-red-500">
                    <span className="h-2 w-2 rounded-full bg-red-400" />
                    Expenses {formatR(pnl.ytdExpenses)}
                  </span>
                  {pnl.mtdYoYChange !== null && (
                    <span className={`flex items-center gap-0.5 text-xs font-semibold ${pnl.mtdYoYChange >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        {pnl.mtdYoYChange >= 0
                          ? <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18"/>
                          : <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3"/>}
                      </svg>
                      {Math.abs(pnl.mtdYoYChange).toFixed(1)}% YoY
                    </span>
                  )}
                </div>
              )}
            </div>
            <Link to="/analytics/cash-flow" className="text-xs text-blue-600 hover:underline shrink-0">Full report →</Link>
          </div>
          <IncomeExpenseChart revenueData={revenueData?.data} />
        </div>

        {/* Right column: 3 finance KPIs stacked */}
        <div className="flex flex-col gap-3">
          <div className="card p-4 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Revenue This Month</p>
            <p className="text-2xl font-black text-gray-900 leading-none">{pnl ? formatR(pnl.mtdRevenue) : '—'}</p>
            <p className="text-xs text-gray-400 mt-1">Expenses: {pnl ? formatR(pnl.mtdExpenses) : '—'}</p>
            <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              {pnl && pnl.mtdRevenue > 0 && (
                <div
                  className="h-full bg-blue-500 rounded-full"
                  style={{ width: `${Math.min(100, (pnl.mtdExpenses / pnl.mtdRevenue) * 100)}%` }}
                />
              )}
            </div>
            <p className="text-[10px] text-gray-400 mt-1">
              {pnl && pnl.mtdRevenue > 0
                ? `${((pnl.mtdExpenses / pnl.mtdRevenue) * 100).toFixed(0)}% expense ratio`
                : 'No data yet'}
            </p>
          </div>

          <div className={`card p-4 flex-1 ${overdue.length > 0 ? 'border-red-100 bg-red-50/30' : ''}`}>
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Overdue Invoices</p>
              {overdue.length > 0 && <span className="text-[9px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">Action needed</span>}
            </div>
            <p className={`text-2xl font-black leading-none ${overdue.length > 0 ? 'text-red-600' : 'text-gray-900'}`}>
              {formatR(overdueTotal)}
            </p>
            <p className="text-xs text-gray-400 mt-1">{overdue.length} invoice{overdue.length !== 1 ? 's' : ''} past due</p>
          </div>

          <div className="card p-4 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Outstanding (Unpaid)</p>
            <p className="text-2xl font-black text-amber-600 leading-none">{pnl ? formatR(pnl.outstanding) : '—'}</p>
            <p className="text-xs text-gray-400 mt-1">Awaiting payment</p>
            <Link to="/invoices?status=ISSUED" className="text-[11px] text-blue-600 hover:underline mt-2 inline-block">View invoices →</Link>
          </div>
        </div>
      </div>

      {/* ── Invoice money buckets (Wave-style) ───────────────────────── */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Money Owed to You</h2>
            <p className="text-xs text-gray-400 mt-0.5">Invoice status across all retail partners</p>
          </div>
          <Link to="/invoices/new" className="inline-flex items-center gap-1 text-xs font-semibold text-xarra-red hover:text-xarra-red-dark transition-colors">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            Create Invoice
          </Link>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-1">
          <FinanceBucket
            label="Outstanding"
            amount={pnl?.outstanding}
            sub="Sent, awaiting payment"
            color="blue"
            href="/invoices?status=ISSUED"
          />
          <FinanceBucket
            label="Overdue"
            amount={overdueTotal}
            sub={`${overdue.length} invoice${overdue.length !== 1 ? 's' : ''} past due date`}
            color="red"
            href="/invoices?status=OVERDUE"
            urgent={overdue.length > 0}
          />
          <FinanceBucket
            label="Cash Sales MTD"
            amount={stats?.mtdCashSales}
            sub="Direct sales this month"
            color="green"
            href="/sales/cash-sales"
          />
          <FinanceBucket
            label="Open POs"
            amount={undefined}
            sub={`${stats?.openPurchaseOrders ?? '—'} purchase orders open`}
            color="purple"
            href="/finance/purchase-orders"
          />
        </div>
      </div>

      {/* ── Operations pulse (4 clickable stat tiles) ────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: 'Titles', value: stats?.totalTitles, link: '/titles', color: 'hover:border-blue-200',
            icon: <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"/></svg>,
            iconBg: 'bg-blue-50',
          },
          {
            label: 'Active Authors', value: stats?.activeAuthors, link: '/authors', color: 'hover:border-green-200',
            icon: <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"/></svg>,
            iconBg: 'bg-green-50',
          },
          {
            label: 'Partners', value: stats?.activePartners, link: '/partners', color: 'hover:border-amber-200',
            icon: <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z"/></svg>,
            iconBg: 'bg-amber-50',
          },
          {
            label: 'Total Stock', value: stats?.totalStock?.toLocaleString(), link: '/inventory', color: 'hover:border-purple-200',
            icon: <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"/></svg>,
            iconBg: 'bg-purple-50',
          },
        ].map(s => (
          <div
            key={s.label}
            onClick={() => navigate(s.link)}
            className={`card p-4 cursor-pointer border transition-all ${s.color} hover:shadow-sm`}
          >
            <div className={`w-9 h-9 rounded-lg ${s.iconBg} flex items-center justify-center mb-3`}>{s.icon}</div>
            <p className="text-xl font-black text-gray-900 leading-none">
              {isLoading ? <span className="text-gray-200">—</span> : s.value ?? 0}
            </p>
            <p className="text-[11px] text-gray-500 mt-1 font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── Main content grid ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Recent activity — 3 cols */}
        <div className="lg:col-span-3 card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900">Recent Activity</h2>
            <Link to="/invoices" className="text-xs text-blue-600 hover:underline">See all →</Link>
          </div>
          {activityData?.data?.length ? (
            <div>
              {activityData.data.slice(0, 8).map((a, i) => (
                <ActivityRow key={i} a={a} navigate={navigate} />
              ))}
            </div>
          ) : (
            <div className="empty-state py-10">
              <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"/></svg>
              </div>
              <p className="empty-state-title">No recent activity</p>
              <p className="empty-state-desc">Transactions will appear here</p>
            </div>
          )}
        </div>

        {/* Right column: Top titles + Royalties — 2 cols */}
        <div className="lg:col-span-2 space-y-4">

          {/* Top performing titles */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-900">Top Titles</h2>
              <div className="flex rounded-lg border border-gray-100 overflow-hidden text-[11px]">
                <button onClick={() => setTopTitlesPeriod('mtd')}
                  className={`px-2.5 py-1 transition-colors ${topTitlesPeriod === 'mtd' ? 'bg-gray-100 font-semibold text-gray-800' : 'text-gray-400 hover:text-gray-600'}`}>MTD</button>
                <button onClick={() => setTopTitlesPeriod('ytd')}
                  className={`px-2.5 py-1 transition-colors ${topTitlesPeriod === 'ytd' ? 'bg-gray-100 font-semibold text-gray-800' : 'text-gray-400 hover:text-gray-600'}`}>YTD</button>
              </div>
            </div>
            {topTitles?.length ? (
              <div className="space-y-2">
                {topTitles.slice(0, 5).map((t, i) => (
                  <div key={t.id} onClick={() => navigate(`/titles/${t.id}`)}
                    className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors group">
                    <span className="text-[10px] font-black text-gray-300 w-4 shrink-0 text-center">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-800 truncate group-hover:text-xarra-red transition-colors">{t.title}</p>
                      <p className="text-[10px] text-gray-400">{t.unitsSold} units sold</p>
                    </div>
                    <span className="text-xs font-semibold font-mono text-gray-700 shrink-0">{formatR(t.revenue)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 py-4 text-center">No sales data yet</p>
            )}
          </div>

          {/* Royalties due */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-900">Royalties Due</h2>
              <Link to="/royalties" className="text-xs text-blue-600 hover:underline">Manage →</Link>
            </div>
            {royaltiesData?.data?.length ? (
              <div className="space-y-2">
                {royaltiesData.data.slice(0, 4).map(r => (
                  <div key={r.id} className="flex items-center justify-between">
                    <p className="text-xs text-gray-700 truncate flex-1">{r.authorName}</p>
                    <div className="text-right shrink-0 ml-2">
                      <p className="text-xs font-semibold font-mono text-gray-900">{formatR(r.amountPending)}</p>
                      <p className="text-[10px] text-amber-600">{r.entryCount} pending</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 text-center py-2">No royalties pending</p>
            )}
          </div>
        </div>
      </div>

      {/* ── SOR Watch + Low Stock ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* SOR Watch */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">SOR Watch</h2>
              <p className="text-xs text-gray-400 mt-0.5">Sale or return consignments needing attention</p>
            </div>
            <Link to="/consignments" className="text-xs text-blue-600 hover:underline">View all →</Link>
          </div>
          {sorData?.data?.length ? (
            <div className="space-y-2">
              {sorData.data.slice(0, 6).map(sor => (
                <div key={sor.id} onClick={() => navigate(`/consignments/${sor.id}`)}
                  className="flex items-center gap-3 p-2.5 rounded-lg border border-gray-50 hover:border-gray-200 hover:bg-gray-50/50 cursor-pointer transition-all">
                  <div className={`h-2 w-2 rounded-full shrink-0 ${sor.isOverdue ? 'bg-red-400' : sor.daysUntilDue <= 7 ? 'bg-amber-400' : 'bg-green-400'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-gray-700">{sor.number}</span>
                      <span className="text-xs text-gray-500 truncate">{sor.partnerName}</span>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5">{sor.outstandingUnits} units outstanding</p>
                  </div>
                  <span className={`text-xs font-semibold shrink-0 ${sor.isOverdue ? 'text-red-500' : sor.daysUntilDue <= 7 ? 'text-amber-600' : 'text-gray-500'}`}>
                    {sor.isOverdue ? `${Math.abs(sor.daysUntilDue)}d overdue` : `${sor.daysUntilDue}d left`}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state py-8">
              <div className="empty-state-icon">✅</div>
              <p className="empty-state-title">All SORs on track</p>
              <p className="empty-state-desc">No consignments expiring soon</p>
            </div>
          )}
        </div>

        {/* Low Stock Alerts */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Stock Alerts</h2>
              <p className="text-xs text-gray-400 mt-0.5">Titles approaching or at zero stock</p>
            </div>
            <Link to="/inventory" className="text-xs text-blue-600 hover:underline">Inventory →</Link>
          </div>
          {lowStockData?.data?.length ? (
            <div className="space-y-2">
              {lowStockData.data.slice(0, 6).map(t => (
                <div key={t.id} onClick={() => navigate(`/titles/${t.id}`)}
                  className="flex items-center gap-3 p-2.5 rounded-lg border border-gray-50 hover:border-gray-200 hover:bg-gray-50/50 cursor-pointer transition-all">
                  <div className={`h-2 w-2 rounded-full shrink-0 ${t.stockOnHand <= 0 ? 'bg-red-500' : 'bg-amber-400'}`} />
                  <p className="text-xs text-gray-700 flex-1 truncate">{t.title}</p>
                  <span className={`text-xs font-bold shrink-0 ${t.stockOnHand <= 0 ? 'text-red-600' : 'text-amber-600'}`}>
                    {t.stockOnHand <= 0 ? 'Out of stock' : `${t.stockOnHand} left`}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state py-8">
              <div className="empty-state-icon">📦</div>
              <p className="empty-state-title">All titles well-stocked</p>
              <p className="empty-state-desc">No stock alerts at this time</p>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
