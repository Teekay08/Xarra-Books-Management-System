import type { FastifyInstance } from 'fastify';
import { notifications } from '@xarra/db';
import type { NotificationType, NotificationPriority } from '@xarra/shared';
import { notifyByEmail } from './notification-email-bridge.js';

interface CreateNotificationInput {
  type: NotificationType;
  priority?: NotificationPriority;
  title: string;
  message: string;
  userId?: string; // null = broadcast to all admins
  actionUrl?: string;
  referenceType?: string;
  referenceId?: string;
  recipientEmail?: string; // optional: send email notification
}

export async function createNotification(
  app: FastifyInstance,
  input: CreateNotificationInput,
) {
  const [notification] = await app.db
    .insert(notifications)
    .values({
      type: input.type,
      priority: input.priority ?? 'NORMAL',
      title: input.title,
      message: input.message,
      userId: input.userId,
      actionUrl: input.actionUrl,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
    })
    .returning();

  // Send email notification (fire-and-forget)
  notifyByEmail(app, notification, input.recipientEmail).catch(() => {});

  return notification;
}

export async function createBroadcastNotification(
  app: FastifyInstance,
  input: Omit<CreateNotificationInput, 'userId'>,
) {
  // Create a single notification with no userId (visible to all)
  return createNotification(app, { ...input, userId: undefined });
}
