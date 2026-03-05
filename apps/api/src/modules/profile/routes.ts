import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { users } from '@xarra/db';
import { updateProfileSchema } from '@xarra/shared';
import { requireAuth } from '../../middleware/require-auth.js';

export async function profileRoutes(app: FastifyInstance) {
  // Get current user profile
  app.get('/', { preHandler: requireAuth }, async (request) => {
    const user = await app.db.query.users.findFirst({
      where: eq(users.id, request.session!.user.id),
    });
    if (!user) return { data: null };

    const { passwordHash, ...profile } = user;
    return { data: profile };
  });

  // Update profile (name, preferences)
  app.patch('/', { preHandler: requireAuth }, async (request) => {
    const body = updateProfileSchema.parse(request.body);
    const [updated] = await app.db
      .update(users)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(users.id, request.session!.user.id))
      .returning();

    const { passwordHash, ...profile } = updated;
    return { data: profile };
  });

  // Password change is handled by Better Auth's built-in endpoint:
  // POST /api/auth/change-password { currentPassword, newPassword }
  // No need to reimplement it here.
}
