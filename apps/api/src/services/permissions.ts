// ─── Effective Permissions Service ───────────────────────────────────────────
// Computes a user's effective permissions as:
//   base role defaults  +  GRANT overrides  -  DENY overrides
//
// This module is the single source of truth for "can user X do Y on module Z?"
// It is used by requirePermission() in the auth middleware.

import { eq } from 'drizzle-orm';
import { userPermissionOverrides } from '@xarra/db';
import { hasPermission, type Module, type Permission } from '@xarra/shared';

/**
 * Fetch all permission overrides for a user from the database.
 * Returns a map keyed by "module:permission" → 'GRANT' | 'DENY'.
 */
export async function getUserOverrides(
  db: any,
  userId: string,
): Promise<Map<string, 'GRANT' | 'DENY'>> {
  const rows = await db
    .select({
      module:     userPermissionOverrides.module,
      permission: userPermissionOverrides.permission,
      type:       userPermissionOverrides.type,
    })
    .from(userPermissionOverrides)
    .where(eq(userPermissionOverrides.userId, userId));

  const map = new Map<string, 'GRANT' | 'DENY'>();
  for (const row of rows) {
    map.set(`${row.module}:${row.permission}`, row.type as 'GRANT' | 'DENY');
  }
  return map;
}

/**
 * Check whether a user has an effective permission, considering:
 * 1. Their system role's base permissions
 * 2. Any GRANT overrides (can add permissions the role doesn't have)
 * 3. Any DENY overrides (can remove permissions the role does have)
 *
 * DENY always wins over GRANT.
 */
export async function hasEffectivePermission(
  db: any,
  userId: string,
  role: string,
  module: Module,
  permission: Permission,
): Promise<boolean> {
  const key = `${module}:${permission}`;
  const overrides = await getUserOverrides(db, userId);

  // Explicit DENY always wins
  if (overrides.get(key) === 'DENY') return false;

  // Explicit GRANT — even if role doesn't normally allow it
  if (overrides.get(key) === 'GRANT') return true;

  // Fall back to role-based check
  return hasPermission(role, module, permission);
}

/**
 * Get the full effective permission set for a user as a plain object.
 * Used by the frontend to know what to show/hide per user.
 */
export async function getEffectivePermissions(
  db: any,
  userId: string,
  role: string,
): Promise<Record<string, string[]>> {
  const { PERMISSIONS } = await import('@xarra/shared');
  const overrides = await getUserOverrides(db, userId);

  const allModules = Object.keys(
    (PERMISSIONS as any)[role] ?? (PERMISSIONS as any)['staff'] ?? {},
  );

  // Start from role base
  const effective: Record<string, Set<string>> = {};
  for (const [mod, perms] of Object.entries((PERMISSIONS as any)[role] ?? {})) {
    effective[mod] = new Set(perms as string[]);
  }

  // Apply overrides
  for (const [key, type] of overrides) {
    const [mod, perm] = key.split(':');
    if (!effective[mod]) effective[mod] = new Set();
    if (type === 'GRANT') effective[mod].add(perm);
    if (type === 'DENY')  effective[mod].delete(perm);
  }

  return Object.fromEntries(
    Object.entries(effective).map(([mod, perms]) => [mod, [...perms]]),
  );
}
