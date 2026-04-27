import { eq, and } from 'drizzle-orm';
import { staffMembers, billetterieProjectTeam } from '@xarra/db';

// ─── Xarra system role helpers ────────────────────────────────────────────────

function canonicalSysRole(role: string): string {
  const map: Record<string, string> = {
    admin: 'admin', finance: 'finance', projectmanager: 'projectmanager',
    project_manager: 'projectmanager', author: 'author', staff: 'staff',
    operations: 'projectmanager', editorial: 'staff',
  };
  const key = (role ?? '').toLowerCase().replace(/_/g, '');
  return map[key] ?? map[(role ?? '').toLowerCase()] ?? 'staff';
}

/** True when the user holds the Xarra system `admin` role. */
export function isSysAdmin(user: any): boolean {
  return canonicalSysRole(user?.role ?? '') === 'admin';
}

// ─── Billetterie system-level role helpers ────────────────────────────────────

/**
 * True when the user is a Billetterie system admin OR a Xarra admin.
 * These users bypass all project-team checks within Billetterie.
 */
export function isBilSysAdmin(user: any): boolean {
  return isSysAdmin(user) || user?.billetterieSystemRole === 'ADMIN';
}

/**
 * True when the user is authorised to create Billetterie projects:
 * BIL_ADMIN, BIL_MANAGER, or Xarra admin.
 */
export function isBilSysManager(user: any): boolean {
  return isBilSysAdmin(user) || user?.billetterieSystemRole === 'MANAGER';
}

// ─── Project-team role helpers ────────────────────────────────────────────────

/**
 * Returns the project-scoped role of a user (SPONSOR | PM | BA | ADMIN)
 * or null if the user is not on the project team.
 */
export async function getProjectRole(db: any, projectId: string, userId: string): Promise<string | null> {
  const staff = await db
    .select({ id: staffMembers.id })
    .from(staffMembers)
    .where(eq(staffMembers.userId, userId))
    .limit(1)
    .then((r: any[]) => r[0]);

  if (!staff) return null;

  const membership = await db
    .select({ role: billetterieProjectTeam.role })
    .from(billetterieProjectTeam)
    .where(and(
      eq(billetterieProjectTeam.projectId, projectId),
      eq(billetterieProjectTeam.staffMemberId, staff.id),
    ))
    .limit(1)
    .then((r: any[]) => r[0]);

  return membership?.role ?? null;
}

/**
 * Returns the staffMember id for a user, or null.
 */
export async function getStaffMemberId(db: any, userId: string): Promise<string | null> {
  const staff = await db
    .select({ id: staffMembers.id })
    .from(staffMembers)
    .where(eq(staffMembers.userId, userId))
    .limit(1)
    .then((r: any[]) => r[0]);
  return staff?.id ?? null;
}

// ─── Project-action authorisation ────────────────────────────────────────────

export type BilProjectRole = 'SPONSOR' | 'PM' | 'BA' | 'ADMIN';

/**
 * Assert the current user may perform an action requiring one of `allowedRoles`
 * within the given project.
 *
 * Returns `null` when access is granted, or a human-readable denial message.
 *
 * Xarra admin and BIL_ADMIN users are always granted access (no team check).
 * All other users must appear in billetterie_project_team with a matching role.
 */
export async function assertBilProjectRole(
  db: any,
  projectId: string,
  user: any,
  allowedRoles: BilProjectRole[],
): Promise<string | null> {
  if (isBilSysAdmin(user)) return null;

  const projectRole = await getProjectRole(db, projectId, user.id);
  if (!projectRole) return 'You are not a member of this project';
  if (!allowedRoles.includes(projectRole as BilProjectRole)) {
    return `This action requires project role: ${allowedRoles.join(' or ')}`;
  }
  return null;
}

/**
 * Like assertBilProjectRole but grants access to all 4 project-team roles
 * (i.e. any team member may perform this action).
 */
export async function assertBilTeamMember(
  db: any,
  projectId: string,
  user: any,
): Promise<string | null> {
  return assertBilProjectRole(db, projectId, user, ['SPONSOR', 'PM', 'BA', 'ADMIN']);
}
