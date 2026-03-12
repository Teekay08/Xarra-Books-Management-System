import type { ReactNode } from 'react';

/* ── Modern Color Palette ─────────────────────────────────── */

export const CHART_COLORS = [
  '#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444',
  '#06b6d4', '#ec4899', '#6366f1', '#14b8a6', '#f97316',
] as const;

/* ── Gradient Pairs (from → to) ───────────────────────────── */

export const GRADIENTS = {
  green:   { from: '#34d399', to: '#059669' },
  red:     { from: '#fca5a5', to: '#dc2626' },
  blue:    { from: '#93c5fd', to: '#2563eb' },
  purple:  { from: '#c4b5fd', to: '#7c3aed' },
  amber:   { from: '#fcd34d', to: '#d97706' },
  teal:    { from: '#5eead4', to: '#0d9488' },
  pink:    { from: '#f9a8d4', to: '#db2777' },
  indigo:  { from: '#a5b4fc', to: '#4f46e5' },
} as const;

/* ── SVG Gradient Defs (render inside any recharts chart) ── */

interface GradientDefProps {
  id: string;
  from: string;
  to: string;
  direction?: 'vertical' | 'horizontal';
}

export function GradientDef({ id, from, to, direction = 'vertical' }: GradientDefProps) {
  const isVert = direction === 'vertical';
  return (
    <linearGradient id={id} x1="0" y1="0" x2={isVert ? '0' : '1'} y2={isVert ? '1' : '0'}>
      <stop offset="0%" stopColor={from} stopOpacity={0.9} />
      <stop offset="100%" stopColor={to} stopOpacity={0.9} />
    </linearGradient>
  );
}

/* Convenience: render <defs> block with multiple gradients */
export function ChartGradients({ children }: { children: ReactNode }) {
  return <defs>{children}</defs>;
}

/* ── Custom Tooltip ────────────────────────────────────────── */

interface TooltipPayloadEntry {
  color: string;
  name: string;
  value: number;
  dataKey: string;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
  formatter?: (value: number) => string;
}

export function ChartTooltip({ active, payload, label, formatter }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-gray-200/60 bg-white/90 backdrop-blur-md shadow-xl px-4 py-3 min-w-[140px]">
      {label && (
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">{label}</p>
      )}
      <div className="space-y-1">
        {payload.map((entry, i) => (
          <div key={i} className="flex items-center justify-between gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full shadow-sm" style={{ backgroundColor: entry.color }} />
              <span className="text-gray-500">{entry.name || entry.dataKey}</span>
            </div>
            <span className="font-semibold text-gray-900 tabular-nums">
              {formatter ? formatter(entry.value) : entry.value?.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Shared Axis / Grid config ─────────────────────────────── */

export const cleanAxisProps = {
  axisLine: false,
  tickLine: false,
  tick: { fontSize: 11, fill: '#94a3b8' },
} as const;

export const cleanGridProps = {
  strokeDasharray: '3 3',
  stroke: '#e2e8f0',
  vertical: false,
} as const;

/* ── Donut Center Label ────────────────────────────────────── */

interface DonutCenterProps {
  cx: number;
  cy: number;
  label: string;
  value: string;
}

export function DonutCenter({ cx, cy, label, value }: DonutCenterProps) {
  return (
    <g>
      <text x={cx} y={cy - 8} textAnchor="middle" className="fill-gray-400 text-[11px] font-medium">
        {label}
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" className="fill-gray-900 text-lg font-bold">
        {value}
      </text>
    </g>
  );
}
