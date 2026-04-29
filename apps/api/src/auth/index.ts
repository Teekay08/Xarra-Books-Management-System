import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins';
import { createDb } from '@xarra/db';
import { config } from '../config.js';
import { sendEmail, isEmailConfigured } from '../services/email.js';
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
  trustedOrigins: config.cors.origins,

  rateLimit: {
    enabled: config.nodeEnv === 'production',
    window: 60,
    max: 20,
  },

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    sendResetPassword: async ({ user, url }) => {
      if (!isEmailConfigured()) {
        console.warn('Email not configured — password reset link:', url);
        return;
      }
      await sendEmail({
        to: user.email,
        subject: 'Reset your Xarra Books password',
        html: `
          <div style="font-family: 'Inter', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
            <h2 style="color: #1f2937; margin-bottom: 16px;">Password Reset</h2>
            <p style="color: #4b5563; line-height: 1.6;">Hi ${user.name},</p>
            <p style="color: #4b5563; line-height: 1.6;">You requested a password reset for your Xarra Books account. Click the button below to set a new password:</p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${url}" style="background-color: #8B1A1A; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">Reset Password</a>
            </div>
            <p style="color: #9ca3af; font-size: 13px;">If you didn't request this, you can safely ignore this email. This link expires in 1 hour.</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
            <p style="color: #d1d5db; font-size: 11px; text-align: center;">Xarra Books &mdash; We mainstream the African book</p>
          </div>
        `,
      });
    },
  },

  session: {
    expiresIn: 60 * 60 * 8, // 8 hours (full work day)
    updateAge: 60 * 15, // refresh every 15 minutes of activity
    cookieCache: {
      enabled: true,
      maxAge: 60 * 15,
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
      // Product access — included in every session response
      xarraAccess: {
        type: 'boolean',
        defaultValue: true,
        required: false,
      },
      billetterieAccess: {
        type: 'boolean',
        defaultValue: false,
        required: false,
      },
      billetterieSystemRole: {
        type: 'string',
        required: false,
      },
    },
  },
});

export type Auth = typeof auth;
