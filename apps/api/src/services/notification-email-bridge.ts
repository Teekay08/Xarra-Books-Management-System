import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import {
  notificationEmailPreferences, partnerNotificationEmailPreferences,
  notificationEmailLog, notificationDigests, channelPartners,
} from '@xarra/db';
import { sendEmail, isEmailConfigured } from './email.js';

const NOTIFICATION_SUBJECTS: Record<string, string> = {
  PARTNER_ORDER_SUBMITTED: 'New Partner Order Received',
  PARTNER_ORDER_CANCELLED: 'Partner Order Cancelled',
  INVOICE_OVERDUE: 'Invoice Overdue Reminder',
  INVOICE_PAID: 'Invoice Payment Received',
  PAYMENT_RECEIVED: 'Payment Received',
  INVENTORY_LOW_STOCK: 'Low Stock Alert',
  EXPENSE_CLAIM_SUBMITTED: 'New Expense Claim for Review',
  PROJECT_CREATED: 'New Project Created',
  PROJECT_OVER_BUDGET: 'Project Over Budget Alert',
  TIMESHEET_SUBMITTED: 'Timesheet Submitted for Approval',
};

/**
 * Send email for an internal staff notification.
 * Called after createNotification() — fire-and-forget.
 */
export async function notifyByEmail(
  app: FastifyInstance,
  notification: { id: string; type: string; title: string; message: string; userId?: string | null; actionUrl?: string | null },
  recipientEmail?: string,
) {
  if (!isEmailConfigured() || !recipientEmail) return;

  try {
    let shouldSend = true;
    let digest: string | null = null;

    if (notification.userId) {
      const prefs = await app.db.query.notificationEmailPreferences.findFirst({
        where: eq(notificationEmailPreferences.userId, notification.userId),
      });

      if (prefs) {
        if (!prefs.emailEnabled) return;
        const typePrefs = (prefs.preferences as Record<string, any>)?.[notification.type];
        if (typePrefs?.email === false) return;
        const freq = typePrefs?.digest || prefs.digestFrequency || 'IMMEDIATE';
        if (freq === 'NONE') return;
        if (freq !== 'IMMEDIATE') {
          digest = freq;
          shouldSend = false;
        }
      }
    }

    if (digest) {
      const scheduledFor = calculateDigestTime(digest);
      await app.db.insert(notificationDigests).values({
        recipientType: 'STAFF',
        recipientId: notification.userId || '',
        notificationId: notification.id,
        digestFrequency: digest,
        scheduledFor,
      });
      return;
    }

    if (!shouldSend) return;

    const subject = NOTIFICATION_SUBJECTS[notification.type] || notification.title;
    const html = renderNotificationEmail(notification);
    await sendEmail({ to: recipientEmail, subject, html });

    await app.db.insert(notificationEmailLog).values({
      notificationId: notification.id,
      recipientEmail,
      recipientType: 'STAFF',
      subject,
      status: 'SENT',
      sentAt: new Date(),
    });
  } catch (err: any) {
    await app.db.insert(notificationEmailLog).values({
      notificationId: notification.id,
      recipientEmail: recipientEmail || '',
      recipientType: 'STAFF',
      subject: notification.title,
      status: 'FAILED',
      errorMessage: err.message,
    }).catch(() => {});
  }
}

/**
 * Send email for a partner notification.
 * XARRA_MANAGED partners always get emails regardless of preferences.
 */
export async function notifyPartnerByEmail(
  app: FastifyInstance,
  notification: { id: string; type: string; title: string; message: string; partnerUserId?: string | null; partnerId: string },
  recipientEmail?: string,
) {
  if (!isEmailConfigured() || !recipientEmail) return;

  try {
    if (notification.partnerUserId) {
      const prefs = await app.db.query.partnerNotificationEmailPreferences.findFirst({
        where: eq(partnerNotificationEmailPreferences.partnerUserId, notification.partnerUserId),
      });
      if (prefs && !prefs.emailEnabled) {
        const partner = await app.db.query.channelPartners.findFirst({
          where: eq(channelPartners.id, notification.partnerId),
        });
        if (partner?.portalMode !== 'XARRA_MANAGED') return;
      }
    }

    const subject = notification.title;
    const html = renderPartnerNotificationEmail(notification);
    await sendEmail({ to: recipientEmail, subject, html });

    await app.db.insert(notificationEmailLog).values({
      partnerNotificationId: notification.id,
      recipientEmail,
      recipientType: 'PARTNER',
      subject,
      status: 'SENT',
      sentAt: new Date(),
    });
  } catch (err: any) {
    await app.db.insert(notificationEmailLog).values({
      partnerNotificationId: notification.id,
      recipientEmail: recipientEmail || '',
      recipientType: 'PARTNER',
      subject: notification.title,
      status: 'FAILED',
      errorMessage: err.message,
    }).catch(() => {});
  }
}

function calculateDigestTime(frequency: string): Date {
  const now = new Date();
  if (frequency === 'DAILY') {
    const next = new Date(now);
    next.setUTCHours(5, 0, 0, 0); // 7am SAST = 5am UTC
    if (next <= now) next.setDate(next.getDate() + 1);
    return next;
  }
  if (frequency === 'WEEKLY') {
    const next = new Date(now);
    const daysUntilMonday = (8 - next.getUTCDay()) % 7 || 7;
    next.setDate(next.getDate() + daysUntilMonday);
    next.setUTCHours(5, 0, 0, 0);
    return next;
  }
  return now;
}

/** Escape HTML special characters to prevent XSS */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Sanitize URL — only allow http/https protocols */
function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url, 'https://placeholder.com');
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return url;
    return '#';
  } catch {
    return '#';
  }
}

function renderNotificationEmail(notification: { title: string; message: string; actionUrl?: string | null }): string {
  const title = escapeHtml(notification.title);
  const message = escapeHtml(notification.message);
  const actionUrl = notification.actionUrl ? sanitizeUrl(notification.actionUrl) : null;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">
  <div style="border-bottom:3px solid #166534;padding-bottom:15px;margin-bottom:20px">
    <h1 style="color:#166534;font-size:20px;margin:0">Xarra Books</h1>
  </div>
  <h2 style="color:#1a1a1a;font-size:18px;margin-bottom:10px">${title}</h2>
  <p style="color:#555;font-size:14px;line-height:1.6">${message}</p>
  ${actionUrl ? `
    <div style="margin:25px 0">
      <a href="${actionUrl}" style="background:#166534;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600">View Details</a>
    </div>
  ` : ''}
  <div style="margin-top:30px;padding-top:15px;border-top:1px solid #eee;font-size:12px;color:#999">
    <p>This notification was sent from Xarra Books Management System.</p>
  </div>
</body></html>`;
}

function renderPartnerNotificationEmail(notification: { title: string; message: string }): string {
  const title = escapeHtml(notification.title);
  const message = escapeHtml(notification.message);

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">
  <div style="border-bottom:3px solid #166534;padding-bottom:15px;margin-bottom:20px">
    <h1 style="color:#166534;font-size:20px;margin:0">Xarra Books</h1>
    <p style="color:#888;font-size:12px;margin:4px 0 0">Partner Portal</p>
  </div>
  <h2 style="color:#1a1a1a;font-size:18px;margin-bottom:10px">${title}</h2>
  <p style="color:#555;font-size:14px;line-height:1.6">${message}</p>
  <div style="margin-top:30px;padding-top:15px;border-top:1px solid #eee;font-size:12px;color:#999">
    <p>This notification was sent from Xarra Books. To manage your notification preferences, contact your account manager.</p>
  </div>
</body></html>`;
}
