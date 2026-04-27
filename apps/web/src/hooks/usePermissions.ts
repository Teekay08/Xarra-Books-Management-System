import { useSession } from '../lib/auth-client';
import { hasPermission, canAccessModule, type Module, type Permission } from '@xarra/shared';

function canonicalRole(role: string): string {
  const map: Record<string, string> = {
    admin: 'admin',
    finance: 'finance',
    project_manager: 'projectmanager',
    projectmanager: 'projectmanager',
    author: 'author',
    staff: 'staff',
    operations: 'projectmanager',
    editorial: 'staff',
    reports_only: 'staff',
    reportsonly: 'staff',
    employee: 'staff',
  };
  const key = role.toLowerCase().replace(/_/g, '');
  return map[key] ?? map[role.toLowerCase()] ?? 'staff';
}

/**
 * Returns permission flags for the current user covering both
 * Xarra Books and Billetterie Software.
 */
export function usePermissions() {
  const { data: session } = useSession();
  const u = session?.user as any;
  const role = (u?.role as string) ?? '';
  const canonical = role ? canonicalRole(role) : '';

  // ── Xarra Books role booleans ─────────────────────────────────────────────
  const isAdmin          = canonical === 'admin';
  const isFinance        = canonical === 'finance';
  const isProjectManager = canonical === 'projectmanager';
  const isAuthor         = canonical === 'author';
  const isStaff          = canonical === 'staff';
  /** Any role that can see business data (not staff or author). */
  const isXarraBusinessUser = isAdmin || isFinance || isProjectManager;

  // ── Billetterie system-level role booleans ────────────────────────────────
  const bilSystemRole: string | null = (u?.billetterieSystemRole as string) ?? null;

  /** Full Billetterie admin — can see and manage all projects, settings, teams. */
  const isBilAdmin   = isAdmin || bilSystemRole === 'ADMIN';
  /** Can create projects and has system-level Billetterie access. */
  const isBilManager = isBilAdmin || bilSystemRole === 'MANAGER';
  /** Has any Billetterie system-level role (used to show admin-level nav). */
  const hasBilSystemRole = isBilManager;

  return {
    role: role ?? '',

    // Generic permission helpers
    can: (module: Module, permission: Permission): boolean => {
      if (!role) return false;
      return hasPermission(role, module, permission);
    },
    canAccess: (module: Module): boolean => {
      if (!role) return false;
      return canAccessModule(role, module);
    },

    // Xarra Books
    isAdmin,
    isFinance,
    isProjectManager,
    isAuthor,
    isStaff,
    isXarraBusinessUser,

    // Billetterie
    isBilAdmin,
    isBilManager,
    hasBilSystemRole,
    bilSystemRole,
  };
}
