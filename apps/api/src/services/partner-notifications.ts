import type { FastifyInstance } from 'fastify';
import { partnerNotifications } from '@xarra/db';
import type { PartnerNotificationType, NotificationPriority } from '@xarra/shared';

interface CreatePartnerNotificationInput {
  type: PartnerNotificationType;
  priority?: NotificationPriority;
  title: string;
  message: string;
  partnerId: string;
  partnerUserId?: string; // null = visible to all users at this partner
  actionUrl?: string;
  referenceType?: string;
  referenceId?: string;
}

export async function createPartnerNotification(
  app: FastifyInstance,
  input: CreatePartnerNotificationInput,
) {
  const [notification] = await app.db
    .insert(partnerNotifications)
    .values({
      type: input.type,
      priority: input.priority ?? 'NORMAL',
      title: input.title,
      message: input.message,
      partnerId: input.partnerId,
      partnerUserId: input.partnerUserId,
      actionUrl: input.actionUrl,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
    })
    .returning();

  return notification;
}

/** Notify all users at a partner organization */
export async function notifyPartner(
  app: FastifyInstance,
  partnerId: string,
  input: Omit<CreatePartnerNotificationInput, 'partnerId' | 'partnerUserId'>,
) {
  return createPartnerNotification(app, { ...input, partnerId, partnerUserId: undefined });
}
