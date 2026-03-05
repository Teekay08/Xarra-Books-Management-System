/**
 * Role-Based Access Control (RBAC) Permissions Matrix
 *
 * Defines what each role can do across every module.
 * Used by both API middleware and frontend route/UI guards.
 */

export type Permission = 'read' | 'create' | 'update' | 'delete' | 'void' | 'approve' | 'export';

export type Module =
  | 'dashboard'
  | 'authors'
  | 'titles'
  | 'partners'
  | 'inventory'
  | 'consignments'
  | 'returns'
  | 'invoices'
  | 'quotations'
  | 'creditNotes'
  | 'debitNotes'
  | 'payments'
  | 'remittances'
  | 'expenses'
  | 'statements'
  | 'reports'
  | 'auditLogs'
  | 'settings'
  | 'users'
  | 'deletionRequests'
  | 'sync'
  | 'purchaseOrders'
  | 'cashSales'
  | 'expenseClaims'
  | 'requisitions';

export type Role = 'admin' | 'finance' | 'operations' | 'editorial' | 'author' | 'reportsOnly';

type PermissionMatrix = Record<Role, Partial<Record<Module, Permission[]>>>;

export const PERMISSIONS: PermissionMatrix = {
  admin: {
    dashboard: ['read'],
    authors: ['read', 'create', 'update', 'delete'],
    titles: ['read', 'create', 'update', 'delete'],
    partners: ['read', 'create', 'update', 'delete'],
    inventory: ['read', 'create', 'update', 'delete'],
    consignments: ['read', 'create', 'update', 'delete', 'approve'],
    returns: ['read', 'create', 'update', 'delete', 'approve'],
    invoices: ['read', 'create', 'update', 'delete', 'void', 'export'],
    quotations: ['read', 'create', 'update', 'delete', 'export'],
    creditNotes: ['read', 'create', 'update', 'delete', 'void', 'export'],
    debitNotes: ['read', 'create', 'update', 'delete', 'void', 'export'],
    payments: ['read', 'create', 'update', 'delete'],
    remittances: ['read', 'create', 'update', 'delete'],
    expenses: ['read', 'create', 'update', 'delete'],
    statements: ['read', 'create', 'export'],
    reports: ['read', 'export'],
    auditLogs: ['read'],
    settings: ['read', 'update'],
    users: ['read', 'create', 'update', 'delete'],
    deletionRequests: ['read', 'create', 'approve'],
    sync: ['read', 'create'],
    purchaseOrders: ['read', 'create', 'update', 'delete', 'export'],
    cashSales: ['read', 'create', 'void', 'export'],
    expenseClaims: ['read', 'create', 'update', 'approve'],
    requisitions: ['read', 'create', 'update', 'approve'],
  },
  finance: {
    dashboard: ['read'],
    authors: ['read'],
    titles: ['read'],
    partners: ['read'],
    inventory: ['read'],
    consignments: ['read', 'approve'],
    returns: ['read', 'approve'],
    invoices: ['read', 'create', 'update', 'void', 'export'],
    quotations: ['read', 'create', 'update', 'export'],
    creditNotes: ['read', 'create', 'update', 'void', 'export'],
    debitNotes: ['read', 'create', 'update', 'void', 'export'],
    payments: ['read', 'create', 'update'],
    remittances: ['read', 'create', 'update'],
    expenses: ['read', 'create', 'update'],
    statements: ['read', 'create', 'export'],
    reports: ['read', 'export'],
    auditLogs: ['read'],
    settings: ['read'],
    sync: ['read'],
    purchaseOrders: ['read', 'create', 'update', 'export'],
    cashSales: ['read', 'create', 'void', 'export'],
    expenseClaims: ['read', 'create', 'update', 'approve'],
    requisitions: ['read', 'create', 'update'],
  },
  operations: {
    dashboard: ['read'],
    authors: ['read'],
    titles: ['read'],
    partners: ['read', 'create', 'update'],
    inventory: ['read', 'create', 'update'],
    consignments: ['read', 'create', 'update'],
    returns: ['read', 'create', 'update'],
    invoices: ['read'],
    quotations: ['read'],
    creditNotes: ['read'],
    debitNotes: ['read'],
    payments: ['read'],
    remittances: ['read'],
    expenses: ['read'],
    statements: ['read'],
    reports: ['read'],
    settings: ['read'],
    sync: ['read', 'create'],
    purchaseOrders: ['read', 'create', 'update', 'export'],
    cashSales: ['read', 'create'],
    requisitions: ['read', 'create', 'update'],
  },
  editorial: {
    dashboard: ['read'],
    authors: ['read', 'create', 'update'],
    titles: ['read', 'create', 'update'],
    partners: ['read'],
    inventory: ['read'],
    consignments: ['read'],
    returns: ['read'],
    invoices: ['read'],
    quotations: ['read'],
    creditNotes: ['read'],
    debitNotes: ['read'],
    expenses: ['read'],
    statements: ['read'],
    reports: ['read'],
    settings: ['read'],
  },
  author: {
    dashboard: ['read'],
    authors: ['read'], // own profile only (enforced at route level)
    titles: ['read'],  // own titles only
    statements: ['read'],
    reports: ['read'], // own royalty reports only
    settings: ['read'],
  },
  reportsOnly: {
    dashboard: ['read'],
    authors: ['read'],
    titles: ['read'],
    partners: ['read'],
    inventory: ['read'],
    consignments: ['read'],
    returns: ['read'],
    invoices: ['read'],
    quotations: ['read'],
    creditNotes: ['read'],
    debitNotes: ['read'],
    payments: ['read'],
    remittances: ['read'],
    expenses: ['read'],
    statements: ['read'],
    reports: ['read', 'export'],
    purchaseOrders: ['read'],
    cashSales: ['read'],
    expenseClaims: ['read'],
    requisitions: ['read'],
    settings: ['read'],
  },
};

/**
 * Normalize role string from DB (e.g. 'REPORTS_ONLY', 'admin', 'FINANCE') to Role key.
 */
function normalizeRole(role: string): Role {
  const map: Record<string, Role> = {
    admin: 'admin',
    finance: 'finance',
    operations: 'operations',
    editorial: 'editorial',
    author: 'author',
    reports_only: 'reportsOnly',
    reportsonly: 'reportsOnly',
    reportsOnly: 'reportsOnly',
  };
  return map[role.toLowerCase()] ?? map[role] ?? ('admin' as Role);
}

/**
 * Check if a role has a specific permission on a module.
 */
export function hasPermission(role: string, module: Module, permission: Permission): boolean {
  const roleKey = normalizeRole(role);
  const rolePerms = PERMISSIONS[roleKey];
  if (!rolePerms) return false;
  const modulePerms = rolePerms[module];
  if (!modulePerms) return false;
  return modulePerms.includes(permission);
}

/**
 * Get all permissions for a role on a module.
 */
export function getModulePermissions(role: string, module: Module): Permission[] {
  const roleKey = normalizeRole(role);
  const rolePerms = PERMISSIONS[roleKey];
  if (!rolePerms) return [];
  return rolePerms[module] ?? [];
}

/**
 * Check if a role can access a module at all (has any permission).
 */
export function canAccessModule(role: string, module: Module): boolean {
  const perms = getModulePermissions(role, module);
  return perms.length > 0;
}
