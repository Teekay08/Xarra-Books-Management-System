/**
 * Role-Based Access Control (RBAC) Permissions Matrix
 *
 * ── XARRA BOOKS ──────────────────────────────────────────────────────────────
 * 5 system roles (stored on the Better Auth user record as `role`):
 *
 *   admin          — Full access to every module and action.
 *
 *   finance        — Financial cycle: invoices, credit/debit notes, payments,
 *                    remittances, expenses, royalties, budgeting, statements.
 *                    Read-only on titles/partners/consignments for context.
 *
 *   projectManager — Business operations: titles, partners, consignments,
 *                    inventory, order management, project management, courier.
 *                    Read-only on invoices and royalties. No user/settings admin.
 *                    (Key kept as `projectManager` for backward compatibility;
 *                     conceptually covers both "Operations Manager" and "PM".)
 *
 *   author         — External author portal only: own profile, own titles,
 *                    own royalty statements. No access to any business data.
 *
 *   staff          — Internal team member workspace only: own tasks, timesheets,
 *                    planner. No access to any business or financial data.
 *
 * ── BILLETTERIE SOFTWARE ─────────────────────────────────────────────────────
 * System-level Billetterie roles (stored as `billetterieSystemRole` on user):
 *
 *   ADMIN   — Full Billetterie access: all projects, team management, settings.
 *   MANAGER — Can create projects; has project-team role access within projects.
 *   (null)  — Team member only: access scoped to projects they're assigned to.
 *
 * Project-team roles (stored in billetterie_project_team per project):
 *
 *   SPONSOR — Approves gate docs, advances phases, creates/edits issues. View all.
 *   PM      — Full project control: tasks, issues, team, timesheets, milestones.
 *   BA      — Creates/edits tasks, issues, deliverables; logs time; records meetings/docs.
 *   ADMIN   — Administrative: meeting minutes, docs, action items; logs time; creates issues.
 *
 * Note: Xarra system `admin` role always bypasses all Billetterie checks too.
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
  | 'orderManagement'
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
    orderManagement: ['read', 'create', 'update', 'delete', 'approve', 'export'],
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
    sync: ['read'],
    purchaseOrders: ['read', 'create', 'update', 'export'],
    cashSales: ['read', 'create', 'void', 'export'],
    expenseClaims: ['read', 'create', 'update', 'approve'],
    requisitions: ['read', 'create', 'update'],
    partnerPortal: ['read', 'approve'],
    courierShipments: ['read'],
    royalties: ['read', 'create', 'update', 'approve', 'void'],
    budgeting: ['read', 'create', 'update', 'approve', 'void', 'export'],
    orderManagement: ['read', 'approve'],
    employeePortal: ['read', 'create', 'update'],
  },
  projectManager: {
    // Business operations — titles, partners, consignments, inventory, orders, PM.
    // Explicitly excludes: finance mutations, royalties, user management, settings.
    dashboard:         ['read'],
    authors:           ['read'],
    titles:            ['read', 'create', 'update', 'delete'],
    partners:          ['read', 'create', 'update'],
    inventory:         ['read', 'create', 'update', 'delete'],
    consignments:      ['read', 'create', 'update', 'approve'],
    returns:           ['read', 'create', 'update', 'approve'],
    invoices:          ['read'],               // read-only: POs and client invoices for context
    purchaseOrders:    ['read', 'create', 'update', 'export'],
    orderManagement:   ['read', 'create', 'update', 'approve'],
    courierShipments:  ['read', 'create', 'update'],
    partnerPortal:     ['read', 'create', 'update'],
    reports:           ['read'],
    sync:              ['read'],
    budgeting:         ['read', 'create', 'update', 'approve', 'export'],
    projectManagement: ['read', 'create', 'update', 'delete', 'approve', 'export'],
    employeePortal:    ['read', 'create', 'update'],
  },
  author: {
    // External author portal only — own data, enforced at route level.
    authors:    ['read'],
    titles:     ['read'],
    statements: ['read'],
    reports:    ['read'],
  },
  staff: {
    // Internal team member — own workspace only, no business data access.
    employeePortal: ['read', 'create', 'update'],
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
