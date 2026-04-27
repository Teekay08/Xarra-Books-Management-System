import type { FastifyInstance } from 'fastify';
import { eq, and, desc } from 'drizzle-orm';
import { z } from 'zod';
import {
  billetterieProjects,
  billetterieProjectDocuments,
  billetteriePhaseDeliverables,
} from '@xarra/db';
import { requireAuth } from '../../../middleware/require-auth.js';
import { getProjectRole } from '../helpers.js';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'node:crypto';

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/zip',
  'application/x-zip-compressed',
];

export async function documentsRoutes(app: FastifyInstance) {
  // GET /projects/:id/documents?phaseKey=INITIATION&deliverableId=xxx
  app.get('/projects/:id/documents', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { phaseKey, deliverableId } = request.query as {
      phaseKey?: string;
      deliverableId?: string;
    };

    const project = await app.db.query.billetterieProjects.findFirst({
      where: eq(billetterieProjects.id, id),
    });
    if (!project) return reply.notFound('Project not found');

    const conditions: any[] = [eq(billetterieProjectDocuments.projectId, id)];
    if (phaseKey) conditions.push(eq(billetterieProjectDocuments.phaseKey as any, phaseKey));
    if (deliverableId) conditions.push(eq(billetterieProjectDocuments.deliverableId, deliverableId));

    const docs = await app.db
      .select()
      .from(billetterieProjectDocuments)
      .where(and(...conditions))
      .orderBy(desc(billetterieProjectDocuments.uploadedAt));

    return { data: docs };
  });

  // POST /projects/:id/documents — multipart upload
  app.post('/projects/:id/documents', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.session!.user.id;

    const project = await app.db.query.billetterieProjects.findFirst({
      where: eq(billetterieProjects.id, id),
    });
    if (!project) return reply.notFound('Project not found');

    // Any authenticated team member or sys admin can upload
    const projectRole = await getProjectRole(app.db, id, userId);
    const systemRole = (request.session!.user as any).role as string;
    if (!projectRole && !['admin', 'project_manager'].includes(systemRole)) {
      return reply.forbidden('Not a member of this project');
    }

    const data = await request.file();
    if (!data) return reply.badRequest('No file uploaded');

    if (!ALLOWED_MIME_TYPES.includes(data.mimetype)) {
      return reply.badRequest('File type not allowed');
    }

    const buffer = await data.toBuffer();
    if (buffer.length > 25 * 1024 * 1024) {
      return reply.badRequest('File too large. Maximum size: 25MB');
    }

    // Parse metadata from form fields
    const phaseKey = (data.fields as any)?.phaseKey?.value as string | undefined;
    const deliverableId = (data.fields as any)?.deliverableId?.value as string | undefined;
    const displayName = ((data.fields as any)?.name?.value as string) || data.filename;

    // Validate deliverable belongs to this project if provided
    if (deliverableId) {
      const deliv = await app.db.query.billetteriePhaseDeliverables.findFirst({
        where: and(
          eq(billetteriePhaseDeliverables.id, deliverableId),
          eq(billetteriePhaseDeliverables.projectId, id),
        ),
      });
      if (!deliv) return reply.badRequest('Deliverable not found in this project');
    }

    const uploadsDir = path.join(process.cwd(), 'data', 'uploads', 'billetterie', id);
    await fs.mkdir(uploadsDir, { recursive: true });

    const ext = path.extname(data.filename).toLowerCase().replace(/[^a-z0-9.]/g, '') || '.bin';
    const randomName = crypto.randomUUID();
    const filename = `${randomName}${ext}`;
    const fileKey = `billetterie/${id}/${filename}`;
    const filepath = path.join(process.cwd(), 'data', 'uploads', fileKey);

    await fs.writeFile(filepath, buffer);

    const [doc] = await app.db
      .insert(billetterieProjectDocuments)
      .values({
        projectId: id,
        phaseKey: phaseKey as any,
        deliverableId: deliverableId || null,
        name: displayName,
        fileKey,
        fileName: data.filename,
        fileSize: buffer.length,
        mimeType: data.mimetype,
        uploadedBy: userId,
      })
      .returning();

    // If linked to a deliverable, auto-advance deliverable to IN_PROGRESS if still PENDING
    if (deliverableId) {
      await app.db
        .update(billetteriePhaseDeliverables)
        .set({ status: 'IN_PROGRESS', updatedAt: new Date() })
        .where(
          and(
            eq(billetteriePhaseDeliverables.id, deliverableId),
            eq(billetteriePhaseDeliverables.status, 'PENDING'),
          ),
        );
    }

    return { data: doc };
  });

  // GET /projects/:id/documents/:docId/download
  app.get('/projects/:id/documents/:docId/download', { preHandler: requireAuth }, async (request, reply) => {
    const { id, docId } = request.params as { id: string; docId: string };

    const doc = await app.db.query.billetterieProjectDocuments.findFirst({
      where: and(
        eq(billetterieProjectDocuments.id, docId),
        eq(billetterieProjectDocuments.projectId, id),
      ),
    });
    if (!doc) return reply.notFound('Document not found');

    const filepath = path.join(process.cwd(), 'data', 'uploads', doc.fileKey);
    try {
      await fs.access(filepath);
    } catch {
      return reply.notFound('File not found on disk');
    }

    reply.header('Content-Type', doc.mimeType);
    reply.header('Content-Disposition', `attachment; filename="${doc.fileName}"`);
    const stream = await import('fs').then((f) => f.createReadStream(filepath));
    return reply.send(stream);
  });

  // DELETE /projects/:id/documents/:docId
  app.delete('/projects/:id/documents/:docId', { preHandler: requireAuth }, async (request, reply) => {
    const { id, docId } = request.params as { id: string; docId: string };
    const userId = request.session!.user.id;

    const doc = await app.db.query.billetterieProjectDocuments.findFirst({
      where: and(
        eq(billetterieProjectDocuments.id, docId),
        eq(billetterieProjectDocuments.projectId, id),
      ),
    });
    if (!doc) return reply.notFound('Document not found');

    const projectRole = await getProjectRole(app.db, id, userId);
    const systemRole = (request.session!.user as any).role as string;
    const canDelete =
      doc.uploadedBy === userId ||
      ['PM', 'ADMIN'].includes(projectRole ?? '') ||
      ['admin', 'project_manager'].includes(systemRole);
    if (!canDelete) return reply.forbidden('Not authorised to delete this document');

    // Delete from disk
    const filepath = path.join(process.cwd(), 'data', 'uploads', doc.fileKey);
    await fs.unlink(filepath).catch(() => {});

    await app.db
      .delete(billetterieProjectDocuments)
      .where(eq(billetterieProjectDocuments.id, docId));

    return { success: true };
  });
}
