import { useSession } from '../lib/auth-client';
import { hasPermission, canAccessModule, type Module, type Permission } from '@xarra/shared';

/**
 * Hook to check permissions based on the current user's role.
 */
export function usePermissions() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role as string | undefined;

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
    isAdmin: role?.toLowerCase() === 'admin',
    isFinance: role?.toLowerCase() === 'finance',
    isOperations: role?.toLowerCase() === 'operations',
    isEditorial: role?.toLowerCase() === 'editorial',
    isAuthor: role?.toLowerCase() === 'author',
    isReportsOnly: role?.toLowerCase() === 'reports_only' || role?.toLowerCase() === 'reportsonly',
  };
}
