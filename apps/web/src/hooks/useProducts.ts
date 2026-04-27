import { useSession } from '../lib/auth-client';

export type BilletterieSystemRole = 'MANAGER' | 'ADMIN' | null;

/**
 * Returns which products (companies) the current user has access to,
 * plus their Billetterie system-level role.
 *
 * These flags come directly from the Better Auth session (additionalFields),
 * so no extra API call is needed.
 *
 * Future (Option B): swap the internals to query workspace memberships
 * without changing any call sites.
 */
export function useProducts() {
  const { data: session, isPending } = useSession();
  const u = session?.user as any;

  // System admins always have access to everything
  const isAdmin = (u?.role as string)?.toLowerCase() === 'admin';

  const xarraAccess: boolean       = isAdmin || (u?.xarraAccess !== false);  // default true
  const billetterieAccess: boolean = isAdmin || (u?.billetterieAccess === true);
  const billetterieSystemRole: BilletterieSystemRole =
    (u?.billetterieSystemRole as BilletterieSystemRole) ?? null;

  const products = [
    ...(xarraAccess       ? ['xarra']       : []),
    ...(billetterieAccess ? ['billetterie'] : []),
  ] as Array<'xarra' | 'billetterie'>;

  return {
    isPending,
    products,
    xarraAccess,
    billetterieAccess,
    billetterieSystemRole,
    hasMultiple: products.length > 1,
    hasNone: products.length === 0,
  };
}
