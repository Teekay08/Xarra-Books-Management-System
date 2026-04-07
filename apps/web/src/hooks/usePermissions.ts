import { useSession } from '../lib/auth-client';
import { hasPermission, canAccessModule, type Module, type Permission } from '@xarra/shared';

/**
 * Map any role string to the canonical 5-role name for boolean flags.
 */
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
 * Hook to check permissions based on the current user's role.
 */
export function usePermissions() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role as string | undefined;
  const canonical = role ? canonicalRole(role) : '';

  // DEBUG: remove after fixing
  if (role) {
    const testDashboard = canAccessModule(role, 'dashboard');
    const testEmployee = canAccessModule(role, 'employeePortal');
    const testInvoices = canAccessModule(role, 'invoices');
    console.log('[PERMS DEBUG]', { role, canonical, isStaff: canonical === 'staff', dashboard: testDashboard, employeePortal: testEmployee, invoices: testInvoices });
  }

  return {
    role: role ?? '',
    can: (module: Module, permission: Permission): boolean => {
      if (!role) return false;
      return hasPermission(role, module, permission);
    },
    canAccess: (module: Module): boolean => {
      if (!role) return false;
      return canAccessModule(role, module);
    },
    isAdmin: canonical === 'admin',
    isFinance: canonical === 'finance',
    isProjectManager: canonical === 'projectmanager',
    isAuthor: canonical === 'author',
    isStaff: canonical === 'staff',
  };
}
