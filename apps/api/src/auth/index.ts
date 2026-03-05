import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins';
import { createDb } from '@xarra/db';
import { config } from '../config.js';
import {
  ac,
  adminRole,
  financeRole,
  operationsRole,
  editorialRole,
  authorRole,
  reportsOnlyRole,
} from './permissions.js';

const db = createDb(config.database.url);

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
  }),
  secret: config.jwt.secret,
  baseURL: `http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`,
  trustedOrigins: [config.cors.origin],

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },

  session: {
    expiresIn: 60 * 15, // 15 minutes
    updateAge: 60 * 5, // refresh every 5 minutes
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },

  plugins: [
    admin({
      ac,
      roles: {
        admin: adminRole,
        finance: financeRole,
        operations: operationsRole,
        editorial: editorialRole,
        author: authorRole,
        reportsOnly: reportsOnlyRole,
      },
      defaultRole: 'operations',
    }),
  ],

  user: {
    additionalFields: {
      isActive: {
        type: 'boolean',
        defaultValue: true,
        required: false,
      },
    },
  },
});

export type Auth = typeof auth;
