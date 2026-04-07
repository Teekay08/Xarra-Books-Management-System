import { Queue, Worker, type Job } from 'bullmq';
import { createDb } from '@xarra/db';
import { sql } from 'drizzle-orm';
import { sendEmail, isEmailConfigured } from '../services/email.js';
import { config } from '../config.js';

const QUEUE_NAME = 'task-planner-reminders';

function parseRedisUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname || 'localhost',
    port: parseInt(parsed.port || '6379'),
    password: parsed.password || undefined,
  };
}

export function createTaskPlannerReminderQueue(redisUrl: string) {
  return new Queue(QUEUE_NAME, { connection: parseRedisUrl(redisUrl) });
}

export async function scheduleTaskPlannerReminderJob(queue: Queue) {
  const existing = await queue.getRepeatableJobs();
  for (const job of existing) {
    await queue.removeRepeatableByKey(job.key);
  }

  // Run daily at 05:30 UTC (07:30 SAST)
  await queue.add(
    'send-task-planner-reminders',
    {},
    {
      repeat: { pattern: '30 5 * * *' },
      removeOnComplete: 100,
      removeOnFail: 50,
    }
  );
}

interface StaffReminderTarget {
  staffId: string;
  staffName: string;
  email: string;
}

interface TaskReminderItem {
  id: string;
  number: string;
  title: string;
  status: string;
  dueDate: string;
  projectName: string;
  remainingHours: string;
}

function renderPlannerReminderHtml(target: StaffReminderTarget, tasks: TaskReminderItem[]) {
  const today = new Date();
  const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dueToday: TaskReminderItem[] = [];
  const overdue: TaskReminderItem[] = [];
  const thisWeek: TaskReminderItem[] = [];

  for (const task of tasks) {
    const due = new Date(task.dueDate);
    const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
    const diffDays = Math.round((dueDay.getTime() - dayStart.getTime()) / 86400000);
    if (diffDays < 0) overdue.push(task);
    else if (diffDays === 0) dueToday.push(task);
    else if (diffDays <= 7) thisWeek.push(task);
  }

  const renderList = (items: TaskReminderItem[]) => {
    if (!items.length) {
      return '<p style="margin:0;color:#666;">None</p>';
    }
    return `<ul style="padding-left:18px;margin:8px 0;">${items
      .map((t) => {
        const dueLabel = new Date(t.dueDate).toLocaleDateString('en-ZA');
        const rem = Number(t.remainingHours || 0).toFixed(1);
        return `<li style="margin:6px 0;"><strong>${t.number}</strong> - ${t.title} <span style="color:#666;">(${t.projectName}, due ${dueLabel}, ${rem}h left)</span></li>`;
      })
      .join('')}</ul>`;
  };

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.45;color:#222;max-width:680px;">
      <h2 style="margin-bottom:6px;">Daily Planner Reminder</h2>
      <p style="margin-top:0;">Hi ${target.staffName}, here is your task summary for today.</p>

      <h3 style="margin-bottom:4px;">Overdue</h3>
      ${renderList(overdue)}

      <h3 style="margin-bottom:4px;">Due Today</h3>
      ${renderList(dueToday)}

      <h3 style="margin-bottom:4px;">Due This Week</h3>
      ${renderList(thisWeek)}

      <p style="margin-top:16px;color:#666;">Open your planner in Xarra to review and update progress.</p>
    </div>
  `;
}

export function createTaskPlannerReminderWorker(redisUrl: string) {
  const worker = new Worker(
    QUEUE_NAME,
    async (_job: Job) => {
      if (!isEmailConfigured()) {
        return { message: 'Email not configured' };
      }

      const db = createDb(config.database.url);

      const targets = await db.execute(sql`
        SELECT
          sm.id AS "staffId",
          sm.name AS "staffName",
          COALESCE(u.email, sm.email) AS email
        FROM staff_members sm
        LEFT JOIN "user" u ON u.id = sm.user_id
        WHERE sm.is_active = true
          AND sm.is_internal = true
          AND COALESCE(u.email, sm.email) IS NOT NULL
      `) as unknown as StaffReminderTarget[];

      let sent = 0;
      let skipped = 0;

      for (const target of targets) {
        const tasks = await db.execute(sql`
          SELECT
            ta.id,
            ta.number,
            ta.title,
            ta.status,
            ta.due_date AS "dueDate",
            p.name AS "projectName",
            ta.remaining_hours AS "remainingHours"
          FROM task_assignments ta
          JOIN projects p ON p.id = ta.project_id
          WHERE ta.staff_member_id = ${target.staffId}
            AND ta.status IN ('ASSIGNED', 'IN_PROGRESS', 'REVIEW')
            AND ta.due_date IS NOT NULL
            AND ta.due_date::date <= CURRENT_DATE + 7
          ORDER BY ta.due_date ASC
          LIMIT 15
        `) as unknown as TaskReminderItem[];

        if (!tasks.length) {
          skipped++;
          continue;
        }

        const subject = `Task Planner Reminder: ${tasks.length} upcoming task${tasks.length === 1 ? '' : 's'}`;
        const html = renderPlannerReminderHtml(target, tasks);
        await sendEmail({ to: target.email, subject, html });
        sent++;
      }

      return { message: `Sent ${sent} planner reminders, skipped ${skipped}` };
    },
    { connection: parseRedisUrl(redisUrl) }
  );

  worker.on('completed', (job, result) => {
    console.log(`Task planner reminder job ${job.id} completed:`, result);
  });

  worker.on('failed', (job, err) => {
    console.error(`Task planner reminder job ${job?.id} failed:`, err.message);
  });

  return worker;
}
