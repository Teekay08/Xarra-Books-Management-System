/**
 * Role-Based Access Control (RBAC) Permissions Matrix
 *
 * 5 system roles:
 *   ADMIN           — Full access to everything
 *   FINANCE         — Finance, budgeting, reports, payments
 *   PROJECT_MANAGER — Projects, staff, tasks, timesheets, SOWs
 *   AUTHOR          — Author portal (own profile, titles, royalties)
 *   STAFF           — My Workspace (own tasks, timesheets, time logging)
 *
 * Staff members' actual job function (Editor, Typesetter, Cover Designer)
 * is stored in their staff_members profile, not the system role.
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
  | 'requisitions'
  | 'partnerPortal'
  | 'courierShipments'
  | 'royalties'
  | 'budgeting'
  | 'projectManagement'
  | 'employeePortal';

export type Role = 'admin' | 'finance' | 'projectManager' | 'author' | 'staff';

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
    partnerPortal: ['read', 'create', 'update', 'delete', 'approve'],
    courierShipments: ['read', 'create', 'update', 'delete'],
    royalties: ['read', 'create', 'update', 'approve', 'void'],
    budgeting: ['read', 'create', 'update', 'delete', 'approve', 'void', 'export'],
    projectManagement: ['read', 'create', 'update', 'delete', 'approve', 'export'],
    employeePortal: ['read', 'create', 'update'],
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
    partnerPortal: ['read', 'approve'],
    courierShipments: ['read'],
    royalties: ['read', 'create', 'update', 'approve', 'void'],
    budgeting: ['read', 'create', 'update', 'approve', 'void', 'export'],
    employeePortal: ['read', 'create', 'update'],
  },
  projectManager: {
    dashboard: ['read'],
    titles: ['read'],              // view titles (for project context)
    authors: ['read'],             // view authors (for project context)
    reports: ['read'],             // view reports relevant to projects
    settings: ['read'],            // view own settings
    budgeting: ['read', 'create', 'update', 'approve', 'export'], // manage project budgets
    projectManagement: ['read', 'create', 'update', 'delete', 'approve', 'export'], // full PM access
    employeePortal: ['read', 'create', 'update'], // see own workspace too
  },
  author: {
    dashboard: ['read'],
    authors: ['read'], // own profile only (enforced at route level)
    titles: ['read'],  // own titles only
    statements: ['read'],
    reports: ['read'], // own royalty reports only
    settings: ['read'],
  },
  staff: {
    dashboard: ['read'],
    employeePortal: ['read', 'create', 'update'],
    settings: ['read'],
  },
};

/**
 * Normalize role string from DB to Role key.
 * Handles legacy roles by mapping them to the closest new role.
 */
function normalizeRole(role: string): Role {
  const map: Record<string, Role> = {
    // Current roles
    admin: 'admin',
    finance: 'finance',
    project_manager: 'projectManager',
    projectmanager: 'projectManager',
    projectManager: 'projectManager',
    author: 'author',
    staff: 'staff',
    // Legacy roles → mapped to closest new role
    operations: 'projectManager',  // operations staff → PM (similar access needs)
    editorial: 'staff',            // editorial → staff (work on projects)
    reports_only: 'staff',         // reports only → staff (minimal access)
    reportsonly: 'staff',
    reportsOnly: 'staff',
    employee: 'staff',             // old employee role → staff
  };
  return map[role.toLowerCase()] ?? map[role] ?? ('staff' as Role);
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
