/**
 * Centralised status → badge CSS class mapping.
 * Used across all three portals (admin, partner, author).
 *
 * USAGE:
 *   import { statusBadge, STATUS_COLORS, INVOICE_STATUS_COLORS } from '../../lib/statusColors';
 *   <span className={statusBadge(status)}>...</span>
 */

// ─── General / cross-domain ───────────────────────────────────────────────────

export const STATUS_COLORS: Record<string, string> = {
  // Neutral / start states
  DRAFT:           'bg-gray-100 text-gray-600',
  CLOSED:          'bg-gray-200 text-gray-700',
  CANCELLED:       'bg-red-100 text-red-700',

  // Pending / waiting
  PENDING:         'bg-yellow-100 text-yellow-700',
  SUBMITTED:       'bg-yellow-100 text-yellow-700',
  UNDER_REVIEW:    'bg-blue-100 text-blue-700',

  // In-flight / processing
  ISSUED:          'bg-blue-100 text-blue-700',
  SENT:            'bg-blue-100 text-blue-700',
  CONFIRMED:       'bg-blue-100 text-blue-700',
  AUTHORIZED:      'bg-blue-100 text-blue-700',
  PROCESSING:      'bg-orange-100 text-orange-700',
  COLLECTED:       'bg-yellow-100 text-yellow-700',
  IN_TRANSIT:      'bg-blue-100 text-blue-700',
  OUT_FOR_DELIVERY:'bg-indigo-100 text-indigo-700',
  DISPATCHED:      'bg-purple-100 text-purple-700',

  // Partial
  PARTIAL:         'bg-amber-100 text-amber-700',
  PARTIAL_RETURN:  'bg-amber-100 text-amber-700',
  CALCULATED:      'bg-amber-100 text-amber-700',

  // Success / complete
  PAID:            'bg-green-100 text-green-700',
  RECEIVED:        'bg-green-100 text-green-700',
  DELIVERED:       'bg-green-100 text-green-700',
  APPROVED:        'bg-green-100 text-green-700',
  MATCHED:         'bg-green-100 text-green-700',
  ACKNOWLEDGED:    'bg-green-100 text-green-700',
  ACCEPTED:        'bg-green-100 text-green-700',
  COMPLETED:       'bg-green-100 text-green-700',
  CREDITED:        'bg-green-100 text-green-700',
  ACTIVE:          'bg-green-100 text-green-700',

  // Terminal workflow states
  CONVERTED:       'bg-purple-100 text-purple-700',
  RECONCILED:      'bg-purple-100 text-purple-700',
  INSPECTED:       'bg-purple-100 text-purple-700',

  // Failure / negative
  OVERDUE:         'bg-red-100 text-red-700',
  REJECTED:        'bg-red-100 text-red-700',
  FAILED:          'bg-red-100 text-red-700',
  RETURNED:        'bg-orange-100 text-orange-700',
  DISPUTED:        'bg-orange-100 text-orange-700',

  // Voided — grey + strikethrough
  VOIDED:          'bg-gray-100 text-gray-400 line-through',
};

/** Returns a badge class for any status string. Falls back to a neutral grey. */
export function statusBadge(status: string): string {
  return STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600';
}

// ─── Domain-specific maps (override where workflow semantics differ) ───────────

/**
 * Consignment statuses — DELIVERED is an intermediate workflow step
 * (stock at partner, not yet acknowledged), so it gets indigo instead of green.
 */
export const CONSIGNMENT_STATUS_COLORS: Record<string, string> = {
  ...STATUS_COLORS,
  DELIVERED: 'bg-indigo-100 text-indigo-700',
};

/**
 * Expense claim statuses — PAID is a final disbursement state shown
 * distinctly from generic "success" to distinguish from invoice PAID.
 */
export const EXPENSE_STATUS_COLORS: Record<string, string> = {
  ...STATUS_COLORS,
  PAID: 'bg-purple-100 text-purple-700',
};

// ─── Inventory movement type colours ──────────────────────────────────────────

export const MOVEMENT_TYPE_COLORS: Record<string, string> = {
  IN:      'bg-green-100 text-green-700',
  RETURN:  'bg-blue-100 text-blue-700',
  CONSIGN: 'bg-amber-100 text-amber-700',
  SELL:    'bg-purple-100 text-purple-700',
  ADJUST:  'bg-gray-100 text-gray-600',
  WRITEOFF:'bg-red-100 text-red-700',
};

// ─── Audit action colours ──────────────────────────────────────────────────────

export const AUDIT_ACTION_COLORS: Record<string, string> = {
  CREATE:        'bg-green-100 text-green-700',
  UPDATE:        'bg-blue-100 text-blue-700',
  DELETE:        'bg-red-100 text-red-700',
  VOID:          'bg-red-100 text-red-700',
  APPROVE:       'bg-emerald-100 text-emerald-700',
  REJECT:        'bg-amber-100 text-amber-700',
  LOGIN:         'bg-gray-100 text-gray-600',
  LOGOUT:        'bg-gray-100 text-gray-500',
  EXPORT:        'bg-purple-100 text-purple-700',
  PDF_GENERATE:  'bg-indigo-100 text-indigo-700',
  STATUS_CHANGE: 'bg-cyan-100 text-cyan-700',
};
