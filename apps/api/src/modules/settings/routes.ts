import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { companySettings, userInvitations } from '@xarra/db';
import { companySettingsSchema } from '@xarra/shared';
import { requireAuth, requireRole } from '../../middleware/require-auth.js';
import { sendEmail } from '../../services/email.js';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';

export async function settingsRoutes(app: FastifyInstance) {
  // Get company settings
  app.get('/', { preHandler: requireAuth }, async () => {
    const settings = await app.db.query.companySettings.findFirst();
    return { data: settings || null };
  });

  // Upsert company settings (admin only)
  app.put('/', { preHandler: requireRole('admin') }, async (request) => {
    const body = companySettingsSchema.parse(request.body);
    const existing = await app.db.query.companySettings.findFirst();

    if (existing) {
      const [updated] = await app.db
        .update(companySettings)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(companySettings.id, existing.id))
        .returning();
      return { data: updated };
    }

    const [created] = await app.db
      .insert(companySettings)
      .values(body)
      .returning();
    return { data: created };
  });

  // Upload logo (admin only)
  app.post('/logo', { preHandler: requireRole('admin') }, async (request, reply) => {
    const data = await request.file();
    if (!data) return reply.badRequest('No file uploaded');

    // Validate MIME type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];
    if (!allowedTypes.includes(data.mimetype)) {
      return reply.badRequest('Invalid file type. Allowed: PNG, JPEG, SVG, WebP');
    }

    // Validate file size (max 2MB for logos)
    const buffer = await data.toBuffer();
    if (buffer.length > 2 * 1024 * 1024) {
      return reply.badRequest('File too large. Maximum size: 2MB');
    }

    const uploadsDir = path.join(process.cwd(), 'data', 'uploads');
    await fs.mkdir(uploadsDir, { recursive: true });

    // Use UUID-based filename to prevent path traversal and enumeration
    const ext = data.filename.split('.').pop()?.toLowerCase() || 'png';
    
    // Sanitize extension to prevent double-extension attacks
    const safeExt = ['png', 'jpg', 'jpeg', 'svg', 'webp'].includes(ext) ? ext : 'png';
    
    // Generate secure random filename
    const crypto = await import('node:crypto');
    const randomName = crypto.randomUUID();
    const filename = `logo-${randomName}.${safeExt}`;
    
    const filepath = path.join(uploadsDir, filename);
    await fs.writeFile(filepath, buffer);

    const logoUrl = `/uploads/${filename}`;
    const existing = await app.db.query.companySettings.findFirst();

    if (existing) {
      const [updated] = await app.db
        .update(companySettings)
        .set({ logoUrl, updatedAt: new Date() })
        .where(eq(companySettings.id, existing.id))
        .returning();
      return { data: updated };
    }

    const [created] = await app.db
      .insert(companySettings)
      .values({ companyName: 'Xarra Books', logoUrl })
      .returning();
    return { data: created };
  });

  // Update invoice reminder settings (admin only)
  app.put('/invoice-reminders', { preHandler: requireRole('admin') }, async (request, reply) => {
    const body = request.body as {
      enabled: boolean;
      weekBefore: boolean;
      dayBefore: boolean;
      onDueDate: boolean;
      threeDaysAfter: boolean;
      sevenDaysAfter: boolean;
    };

    const existing = await app.db.query.companySettings.findFirst();
    if (existing) {
      const [updated] = await app.db
        .update(companySettings)
        .set({ invoiceReminders: body, updatedAt: new Date() })
        .where(eq(companySettings.id, existing.id))
        .returning();
      return { data: updated };
    }

    const [created] = await app.db
      .insert(companySettings)
      .values({ companyName: 'Xarra Books', invoiceReminders: body })
      .returning();
    return { data: created };
  });

  // Get scheduling settings
  app.get('/scheduling', { preHandler: requireAuth }, async () => {
    const settings = await app.db.query.companySettings.findFirst();
    const defaults = {
      statementGeneration: { enabled: true, dayOfMonth: 1, timeHour: 6 },
      sorAutoInvoice: { enabled: true, graceDays: 0, timeHour: 8 },
      invoiceSending: { enabled: false, dayOfMonth: 25, timeHour: 9 },
    };
    return { data: settings?.schedulingSettings ?? defaults };
  });

  // Update scheduling settings (admin only)
  app.put('/scheduling', { preHandler: requireRole('admin') }, async (request, reply) => {
    const body = request.body as {
      statementGeneration: { enabled: boolean; dayOfMonth: number; timeHour: number };
      sorAutoInvoice: { enabled: boolean; graceDays: number; timeHour: number };
      invoiceSending: { enabled: boolean; dayOfMonth: number; timeHour: number };
    };

    // Validate dayOfMonth (1-28) and timeHour (0-23)
    for (const key of ['statementGeneration', 'invoiceSending'] as const) {
      const s = body[key];
      if (s.dayOfMonth < 1 || s.dayOfMonth > 28) {
        return reply.badRequest(`${key}.dayOfMonth must be between 1 and 28`);
      }
      if (s.timeHour < 0 || s.timeHour > 23) {
        return reply.badRequest(`${key}.timeHour must be between 0 and 23`);
      }
    }
    if (body.sorAutoInvoice.graceDays < 0 || body.sorAutoInvoice.graceDays > 30) {
      return reply.badRequest('sorAutoInvoice.graceDays must be between 0 and 30');
    }

    const existing = await app.db.query.companySettings.findFirst();
    if (existing) {
      const [updated] = await app.db
        .update(companySettings)
        .set({ schedulingSettings: body, updatedAt: new Date() })
        .where(eq(companySettings.id, existing.id))
        .returning();
      return { data: updated.schedulingSettings };
    }

    const [created] = await app.db
      .insert(companySettings)
      .values({ companyName: 'Xarra Books', schedulingSettings: body })
      .returning();
    return { data: created.schedulingSettings };
  });

  // Delete logo (admin only)
  app.delete('/logo', { preHandler: requireRole('admin') }, async (request, reply) => {
    const existing = await app.db.query.companySettings.findFirst();
    if (!existing) return reply.notFound('No company settings found');

    if (existing.logoUrl) {
      const filepath = path.join(process.cwd(), 'data', existing.logoUrl);
      await fs.unlink(filepath).catch(() => {});
    }

    const [updated] = await app.db
      .update(companySettings)
      .set({ logoUrl: null, updatedAt: new Date() })
      .where(eq(companySettings.id, existing.id))
      .returning();
    return { data: updated };
  });

  // Get system configuration (admin only)
  app.get('/system-config', { preHandler: requireRole('admin') }, async (request, reply) => {
    const existing = await app.db.query.companySettings.findFirst();
    if (!existing) return reply.notFound('No company settings found');

    return {
      data: {
        lowStockThreshold: existing.lowStockThreshold,
        sorAlertDays: existing.sorAlertDays,
        exchangeRateSource: existing.exchangeRateSource,
      },
    };
  });

  // Update system configuration (admin only)
  app.put('/system-config', { preHandler: requireRole('admin') }, async (request, reply) => {
    const body = request.body as {
      lowStockThreshold?: number;
      sorAlertDays?: number;
      exchangeRateSource?: string;
    };

    // Validation
    if (body.lowStockThreshold !== undefined && (body.lowStockThreshold < 0 || body.lowStockThreshold > 1000)) {
      return reply.badRequest('Low stock threshold must be between 0 and 1000');
    }
    if (body.sorAlertDays !== undefined && (body.sorAlertDays < 1 || body.sorAlertDays > 365)) {
      return reply.badRequest('SOR alert days must be between 1 and 365');
    }
    if (body.exchangeRateSource !== undefined && !['MANUAL', 'SARB', 'XE'].includes(body.exchangeRateSource)) {
      return reply.badRequest('Exchange rate source must be MANUAL, SARB, or XE');
    }

    const existing = await app.db.query.companySettings.findFirst();
    if (!existing) {
      // Create initial settings
      const [created] = await app.db
        .insert(companySettings)
        .values({
          companyName: 'Xarra Books',
          lowStockThreshold: body.lowStockThreshold ?? 10,
          sorAlertDays: body.sorAlertDays ?? 30,
          exchangeRateSource: body.exchangeRateSource ?? 'MANUAL',
        })
        .returning();
      return {
        data: {
          lowStockThreshold: created.lowStockThreshold,
          sorAlertDays: created.sorAlertDays,
          exchangeRateSource: created.exchangeRateSource,
        },
      };
    }

    // Update existing
    const [updated] = await app.db
      .update(companySettings)
      .set({
        ...body,
        updatedAt: new Date(),
      })
      .where(eq(companySettings.id, existing.id))
      .returning();

    return {
      data: {
        lowStockThreshold: updated.lowStockThreshold,
        sorAlertDays: updated.sorAlertDays,
        exchangeRateSource: updated.exchangeRateSource,
      },
    };
  });

  // Get email settings (admin only)
  app.get('/email-settings', { preHandler: requireRole('admin') }, async (request, reply) => {
    const existing = await app.db.query.companySettings.findFirst();
    if (!existing) return reply.notFound('No company settings found');

    return { data: existing.emailSettings };
  });

  // Update email settings (admin only)
  app.put('/email-settings', { preHandler: requireRole('admin') }, async (request, reply) => {
    const body = request.body as {
      smtpHost?: string;
      smtpPort?: number;
      smtpUser?: string;
      smtpPassword?: string;
      smtpSecure?: boolean;
      emailDomain?: string;
      replyToEmail?: string;
      fromName?: string;
    };

    const existing = await app.db.query.companySettings.findFirst();
    if (!existing) {
      // Create initial settings
      const [created] = await app.db
        .insert(companySettings)
        .values({
          companyName: 'Xarra Books',
          emailSettings: body,
        })
        .returning();
      return { data: created.emailSettings };
    }

    // Update existing
    const [updated] = await app.db
      .update(companySettings)
      .set({
        emailSettings: { ...existing.emailSettings, ...body },
        updatedAt: new Date(),
      })
      .where(eq(companySettings.id, existing.id))
      .returning();

    return { data: updated.emailSettings };
  });

  // Get document series configuration (admin only)
  app.get('/document-series', { preHandler: requireRole('admin') }, async (request, reply) => {
    const existing = await app.db.query.companySettings.findFirst();
    if (!existing) return reply.notFound('No company settings found');

    return { data: existing.documentSeries };
  });

  // Update document series configuration (admin only)
  app.put('/document-series', { preHandler: requireRole('admin') }, async (request, reply) => {
    const body = request.body as {
      invoiceStart?: number;
      creditNoteStart?: number;
      statementStart?: number;
      consignmentStart?: number;
      returnStart?: number;
      podStart?: number;
    };

    // Validation: all values must be positive integers if provided
    for (const [key, value] of Object.entries(body)) {
      if (value !== undefined && (!Number.isInteger(value) || value < 1)) {
        return reply.badRequest(`${key} must be a positive integer`);
      }
    }

    const existing = await app.db.query.companySettings.findFirst();
    if (!existing) {
      // Create initial settings
      const [created] = await app.db
        .insert(companySettings)
        .values({
          companyName: 'Xarra Books',
          documentSeries: body,
        })
        .returning();
      return { data: created.documentSeries };
    }

    // Update existing
    const [updated] = await app.db
      .update(companySettings)
      .set({
        documentSeries: { ...existing.documentSeries, ...body },
        updatedAt: new Date(),
      })
      .where(eq(companySettings.id, existing.id))
      .returning();

    return { data: updated.documentSeries };
  });

  // User Invitations

  // Send user invitation (admin only)
  app.post('/invitations/send', { preHandler: requireRole('admin') }, async (request, reply) => {
    const body = request.body as {
      email: string;
      name: string;
      role: string;
    };

    // Validate role
    const validRoles = ['admin', 'finance', 'operations', 'editorial', 'reports_only'];
    if (!validRoles.includes(body.role)) {
      return reply.badRequest(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
    }

    // Check if user already exists
    const existingUser = await app.db.query.user.findFirst({
      where: (user, { eq }) => eq(user.email, body.email),
    });
    if (existingUser) {
      return reply.badRequest('User with this email already exists');
    }

    // Check if there's already a pending invitation
    const existingInvitation = await app.db.query.userInvitations.findFirst({
      where: (invitations, { eq, and }) =>
        and(
          eq(invitations.email, body.email),
          eq(invitations.status, 'PENDING')
        ),
    });
    if (existingInvitation) {
      return reply.badRequest('Invitation already sent to this email');
    }

    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');

    // Set expiry to 7 days from now
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Create invitation record
    const [invitation] = await app.db
      .insert(userInvitations)
      .values({
        email: body.email,
        name: body.name,
        role: body.role,
        token,
        invitedBy: request.user!.id,
        expiresAt,
      })
      .returning();

    // Get company settings for branding
    const settings = await app.db.query.companySettings.findFirst();
    const companyName = settings?.companyName || 'Xarra Books';

    // Send invitation email
    const inviteUrl = `${process.env.WEB_URL || 'http://localhost:5173'}/accept-invitation/${token}`;
    try {
      await sendEmail({
        to: body.email,
        subject: `You've been invited to join ${companyName}`,
        htmlBody: `
          <h2>Welcome to ${companyName}</h2>
          <p>Hi ${body.name},</p>
          <p>You've been invited to join ${companyName} as a ${body.role}.</p>
          <p>Click the link below to accept your invitation and set up your account:</p>
          <p><a href="${inviteUrl}">${inviteUrl}</a></p>
          <p>This invitation expires in 7 days.</p>
          <p>Best regards,<br/>${companyName}</p>
        `,
      });
    } catch (error) {
      console.error('Failed to send invitation email:', error);
      // Don't fail the request - invitation is created, email can be resent
    }

    return { data: invitation };
  });

  // List pending invitations (admin only)
  app.get('/invitations', { preHandler: requireRole('admin') }, async () => {
    const invitations = await app.db.query.userInvitations.findMany({
      where: (invitations, { eq }) => eq(invitations.status, 'PENDING'),
      orderBy: (invitations, { desc }) => [desc(invitations.createdAt)],
    });
    return { data: invitations };
  });

  // Accept invitation (public)
  app.post('/invitations/accept/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    const body = request.body as {
      password: string;
    };

    // Find invitation
    const invitation = await app.db.query.userInvitations.findFirst({
      where: (invitations, { eq }) => eq(invitations.token, token),
    });

    if (!invitation) {
      return reply.notFound('Invalid invitation token');
    }

    // Check if already accepted
    if (invitation.status === 'ACCEPTED') {
      return reply.badRequest('This invitation has already been accepted');
    }

    // Check if expired
    if (new Date() > invitation.expiresAt) {
      // Mark as expired
      await app.db
        .update(userInvitations)
        .set({ status: 'EXPIRED' })
        .where(eq(userInvitations.id, invitation.id));
      return reply.badRequest('This invitation has expired');
    }

    // Check if user already exists (race condition protection)
    const existingUser = await app.db.query.user.findFirst({
      where: (user, { eq }) => eq(user.email, invitation.email),
    });
    if (existingUser) {
      return reply.badRequest('User with this email already exists');
    }

    // At this point, we would normally create the user via Better Auth
    // This requires integration with Better Auth's user creation process
    // For now, return the invitation details and let the frontend handle user creation
    
    return {
      data: {
        email: invitation.email,
        name: invitation.name,
        role: invitation.role,
        message: 'Invitation validated. Please complete user registration.',
      },
    };
  });

  // Resend invitation (admin only)
  app.post('/invitations/:id/resend', { preHandler: requireRole('admin') }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const invitation = await app.db.query.userInvitations.findFirst({
      where: (invitations, { eq }) => eq(invitations.id, id),
    });

    if (!invitation) {
      return reply.notFound('Invitation not found');
    }

    if (invitation.status !== 'PENDING') {
      return reply.badRequest('Can only resend pending invitations');
    }

    // Extend expiry by 7 days from now
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await app.db
      .update(userInvitations)
      .set({ expiresAt })
      .where(eq(userInvitations.id, id));

    // Get company settings for branding
    const settings = await app.db.query.companySettings.findFirst();
    const companyName = settings?.companyName || 'Xarra Books';

    // Resend invitation email
    const inviteUrl = `${process.env.WEB_URL || 'http://localhost:5173'}/accept-invitation/${invitation.token}`;
    await sendEmail({
      to: invitation.email,
      subject: `Reminder: You've been invited to join ${companyName}`,
      htmlBody: `
        <h2>Welcome to ${companyName}</h2>
        <p>Hi ${invitation.name},</p>
        <p>This is a reminder that you've been invited to join ${companyName} as a ${invitation.role}.</p>
        <p>Click the link below to accept your invitation and set up your account:</p>
        <p><a href="${inviteUrl}">${inviteUrl}</a></p>
        <p>This invitation expires in 7 days.</p>
        <p>Best regards,<br/>${companyName}</p>
      `,
    });

    return { data: { success: true } };
  });

  // Delete/revoke invitation (admin only)
  app.delete('/invitations/:id', { preHandler: requireRole('admin') }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const invitation = await app.db.query.userInvitations.findFirst({
      where: (invitations, { eq }) => eq(invitations.id, id),
    });

    if (!invitation) {
      return reply.notFound('Invitation not found');
    }

    await app.db
      .delete(userInvitations)
      .where(eq(userInvitations.id, id));

    return { data: { success: true } };
  });
}
