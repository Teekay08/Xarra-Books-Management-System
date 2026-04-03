import { pgTable, uuid, varchar, boolean, timestamp, pgEnum, index, jsonb } from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', [
  'ADMIN', 'FINANCE', 'PROJECT_MANAGER', 'AUTHOR', 'STAFF',
  // Legacy values kept for backward compatibility with existing DB rows
  'OPERATIONS', 'EDITORIAL', 'REPORTS_ONLY',
]);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  role: userRoleEnum('role').notNull().default('STAFF'),
  isActive: boolean('is_active').notNull().default(true),
  avatarUrl: varchar('avatar_url', { length: 500 }),
  preferences: jsonb('preferences').$type<{
    theme?: 'light' | 'dark';
    dateFormat?: string;
    itemsPerPage?: number;
  }>(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_users_role').on(t.role),
  index('idx_users_is_active').on(t.isActive),
]);
