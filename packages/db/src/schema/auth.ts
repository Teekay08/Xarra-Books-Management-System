import { pgTable, text, boolean, timestamp, integer } from 'drizzle-orm/pg-core';

// Better Auth managed tables — singular names as required by the adapter

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('emailVerified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  role: text('role').default('staff'),
  banned: boolean('banned').default(false),
  banReason: text('banReason'),
  banExpires: integer('banExpires'),
  isActive: boolean('isActive').default(true),

  // ─── Product access ─────────────────────────────────────────────────────────
  // Controls which products (companies) the user can enter after login.
  // Designed for Option A → Option B migration: these will eventually map to
  // workspace/organisation memberships.
  xarraAccess:           boolean('xarraAccess').notNull().default(true),
  billetterieAccess:     boolean('billetterieAccess').notNull().default(false),
  // Billetterie system-level role (orthogonal to project-scoped team roles).
  // NULL = standard team member (can only work on projects they are assigned to)
  // 'MANAGER' = can create / archive projects, see all projects
  // 'ADMIN'   = full Billetterie admin (user management, all projects)
  billetterieSystemRole: text('billetterieSystemRole'),
});

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expiresAt').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId').notNull().references(() => user.id),
  impersonatedBy: text('impersonatedBy'),
});

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId').notNull().references(() => user.id),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: timestamp('accessTokenExpiresAt'),
  refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
});

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expiresAt').notNull(),
  createdAt: timestamp('createdAt'),
  updatedAt: timestamp('updatedAt'),
});
