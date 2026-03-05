import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { companySettings } from '@xarra/db';
import { companySettingsSchema } from '@xarra/shared';
import { requireAuth, requireRole } from '../../middleware/require-auth.js';
import path from 'path';
import fs from 'fs/promises';

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

    const allowedTypes = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];
    if (!allowedTypes.includes(data.mimetype)) {
      return reply.badRequest('Invalid file type. Allowed: PNG, JPEG, SVG, WebP');
    }

    const uploadsDir = path.join(process.cwd(), 'data', 'uploads');
    await fs.mkdir(uploadsDir, { recursive: true });

    const ext = data.filename.split('.').pop() || 'png';
    const filename = `logo-${Date.now()}.${ext}`;
    const filepath = path.join(uploadsDir, filename);
    const buffer = await data.toBuffer();
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
}
