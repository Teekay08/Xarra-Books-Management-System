import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../../middleware/require-auth.js';
import {
  isAiConfigured,
  suggestProjectDetails,
  suggestTaskDetails,
  suggestSowContent,
  suggestDescription,
} from '../../services/ai.js';

export async function aiRoutes(app: FastifyInstance) {
  const isAiQuotaError = (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    const lower = message.toLowerCase();
    return lower.includes('429') || lower.includes('quota') || lower.includes('rate limit');
  };

  // Check if AI is available
  app.get('/status', { preHandler: requireAuth }, async () => {
    return { available: isAiConfigured() };
  });

  // Suggest project details from title + author
  app.post('/suggest/project', { preHandler: requireAuth }, async (request, reply) => {
    if (!isAiConfigured()) return reply.badRequest('AI is not configured. Set GEMINI_API_KEY in .env');

    const body = z.object({
      bookTitle: z.string().min(1),
      authorName: z.string().min(1),
      genre: z.string().optional(),
      projectType: z.string().optional(),
      contractType: z.string().optional(),
    }).parse(request.body);

    try {
      const suggestion = await suggestProjectDetails(body);
      return { data: suggestion };
    } catch (err: any) {
      app.log.error(`AI suggestion failed: ${err.message}`);
      return reply.internalServerError('AI suggestion failed. Please try again.');
    }
  });

  // Suggest task description and deliverables
  app.post('/suggest/task', { preHandler: requireAuth }, async (request, reply) => {
    if (!isAiConfigured()) return reply.badRequest('AI is not configured');

    const body = z.object({
      taskTitle: z.string().min(1),
      projectName: z.string().min(1),
      staffRole: z.string().min(1),
      allocatedHours: z.coerce.number().positive(),
    }).parse(request.body);

    try {
      const suggestion = await suggestTaskDetails(body);
      return { data: suggestion };
    } catch (err: any) {
      app.log.error(`AI task suggestion failed: ${err.message}`);
      return reply.internalServerError('AI suggestion failed. Please try again.');
    }
  });

  // Suggest SOW content
  app.post('/suggest/sow', { preHandler: requireAuth }, async (request, reply) => {
    if (!isAiConfigured()) return reply.badRequest('AI is not configured');

    const body = z.object({
      projectName: z.string().min(1),
      staffName: z.string().min(1),
      staffRole: z.string().min(1),
      tasks: z.array(z.object({
        title: z.string(),
        hours: z.number(),
        rate: z.number(),
      })),
      isInternal: z.boolean().default(true),
    }).parse(request.body);

    try {
      const suggestion = await suggestSowContent(body);
      return { data: suggestion };
    } catch (err: any) {
      app.log.error(`AI SOW suggestion failed: ${err.message}`);
      if (isAiQuotaError(err)) {
        return reply.tooManyRequests('AI quota exceeded. Please retry shortly or check Gemini API quota/billing.');
      }
      return reply.internalServerError('AI suggestion failed. Please try again.');
    }
  });

  // General description suggestion
  app.post('/suggest/description', { preHandler: requireAuth }, async (request, reply) => {
    if (!isAiConfigured()) return reply.badRequest('AI is not configured');

    const body = z.object({
      context: z.string().min(1),
      entityType: z.enum(['project', 'task', 'milestone', 'budget_line', 'sow']),
      existingData: z.record(z.any()).optional(),
    }).parse(request.body);

    try {
      const description = await suggestDescription(body);
      return { data: { description } };
    } catch (err: any) {
      app.log.error(`AI description suggestion failed: ${err.message}`);
      return reply.internalServerError('AI suggestion failed. Please try again.');
    }
  });
}
