# Staff Weekly Planner & Monthly View Feature Plan

## Goal
Enable staff users to:
- Plan and view their tasks by week and month.
- Receive daily reminder notifications (in-app and email).
- Configure reminder preferences (time, channels, weekdays).

## Why This Fits Current System
Existing capabilities already in place:
- Staff task retrieval for logged-in staff: `GET /project-management/my/tasks` in apps/api/src/modules/project-management/routes.ts.
- Staff dashboard UI: apps/web/src/pages/employee/EmployeeDashboard.tsx.
- In-app notifications + email bridge: apps/api/src/services/notifications.ts and apps/api/src/services/notification-email-bridge.ts.
- Scheduled jobs infrastructure (BullMQ + Redis): apps/api/src/app.ts and existing jobs in apps/api/src/jobs/.

This feature should build on those patterns instead of introducing a new scheduler or notification stack.

## Scope
In scope:
- Weekly planner (drag/drop and list planning view).
- Monthly calendar view.
- Daily task reminders by email and optional in-app notification.
- Reminder preferences per user.

Out of scope (Phase 1):
- Bi-directional calendar sync to Google/Outlook.
- Mobile push notifications.
- Complex recurring task engine.

## UX Plan
### Staff Planner Page
New route:
- `/employee/planner`

Views:
- Week view:
  - Left column: backlog/unscheduled tasks.
  - Main: Monday to Sunday columns with planned task blocks.
  - Quick actions: mark done, start, move to another day.
- Month view:
  - Calendar grid.
  - Day cell shows task count + overdue count.
  - Click day to drill into day agenda.

Filters:
- Status (ASSIGNED, IN_PROGRESS, REVIEW).
- Priority.
- Project.

Highlights:
- Overdue tasks in red.
- Due today in orange.
- Time-exhausted tasks with warning badge.

### Reminder Preferences UI
Add section in user settings:
- Channel toggles:
  - Email reminders
  - In-app reminders
- Daily digest time (default 07:00 SAST).
- Weekdays only toggle.
- Include weekends toggle.
- Include overdue tasks toggle.

## Data Model Changes
Add new table in `packages/db/src/schema/project-management.ts`:

`staff_task_planner_entries`
- `id` uuid pk
- `staff_member_id` uuid not null
- `task_assignment_id` uuid not null
- `planned_date` timestamptz not null (date portion used)
- `slot_start` timestamptz nullable
- `slot_end` timestamptz nullable
- `planned_hours` decimal(5,2) nullable
- `note` text nullable
- `created_at`, `updated_at`
- unique index on (`staff_member_id`, `task_assignment_id`, `planned_date`)
- index on (`staff_member_id`, `planned_date`)

Add user preference payload (extend existing notification preferences record):
- `taskPlanner` object
  - `enabled`: boolean
  - `emailEnabled`: boolean
  - `inAppEnabled`: boolean
  - `dailyReminderTime`: string (HH:mm, local)
  - `timezone`: string (default `Africa/Johannesburg`)
  - `weekdaysOnly`: boolean
  - `includeOverdue`: boolean

## API Plan
Add routes in `apps/api/src/modules/project-management/routes.ts`.

Planner read APIs:
- `GET /project-management/my/planner/week?start=YYYY-MM-DD`
  - Returns week buckets + tasks + planned entries.
- `GET /project-management/my/planner/month?year=YYYY&month=MM`
  - Returns month calendar payload with per-day aggregates.

Planner write APIs:
- `PUT /project-management/my/planner/entry`
  - Upsert one planned entry for task/date.
- `DELETE /project-management/my/planner/entry/:id`
  - Remove a planned entry.

Reminder preference APIs:
- `GET /project-management/my/planner/preferences`
- `PUT /project-management/my/planner/preferences`

Reminder send job:
- New job file: `apps/api/src/jobs/task-planner-reminders.ts`
- Schedule once daily in `apps/api/src/app.ts`.
- For each opted-in staff member:
  - Fetch today planned tasks + overdue tasks.
  - Send email digest if email enabled.
  - Create in-app notification if in-app enabled.

## Notification Content
Subject examples:
- `Your task plan for Monday, 06 Apr`
- `Task reminder: 3 tasks due today`

Email body sections:
- Planned for today.
- Overdue and not completed.
- Upcoming tomorrow.

In-app notification:
- Type: `TASK_DUE_REMINDER` (add to shared notification type enum if needed).
- Action URL: `/employee/planner?date=YYYY-MM-DD`.

## Backend Logic Rules
- Only include tasks assigned to current staff member.
- Completed/cancelled tasks excluded from planner defaults.
- If a task has no planner entry, it appears in backlog.
- If due date exists and no planned date, suggest due date day in API response metadata.
- Prevent planning beyond remaining hours (soft warning first, hard block optional Phase 2).

## Frontend Components
Add under `apps/web/src/pages/employee/`:
- `EmployeePlanner.tsx`
- `components/WeekPlannerGrid.tsx`
- `components/MonthPlannerCalendar.tsx`
- `components/PlannerTaskCard.tsx`
- `components/PlannerFilters.tsx`

State and fetching:
- Use React Query with keys:
  - `my-planner-week`
  - `my-planner-month`
  - `my-planner-preferences`

## Phased Delivery
### Phase 1 (MVP)
- Week view read-only from tasks grouped by due date.
- Month view read-only calendar counts.
- Daily reminder email job from due-today + overdue tasks.

### Phase 2
- Planner entries table + drag/drop scheduling.
- Personalized reminder preferences.
- In-app reminder notifications.

### Phase 3
- Planned hours capacity bar per day.
- Auto-plan suggestion (distribute remaining work to due date).
- CSV/ICS export.

## Acceptance Criteria
1. Staff can open week and month planner views without PM permissions.
2. Week view shows all active assigned tasks and overdue status correctly.
3. Month view displays accurate per-day counts.
4. Planner entries persist and reload correctly.
5. Reminder job sends only to users with preferences enabled.
6. Reminder email includes only relevant tasks for that staff user.
7. In-app reminder appears with correct action URL.
8. No reminder duplicates for same user/day/channel.

## Risks and Mitigations
- Timezone drift for reminders:
  - Store timezone in preferences, use server-side conversion to SAST default.
- Notification fatigue:
  - Add digest mode and weekdays-only.
- Performance on month view:
  - Aggregate in SQL by day; paginate detailed task lists.

## Test Plan
Backend tests:
- Planner week/month endpoint filtering and date grouping.
- Planner entry upsert/delete authorization.
- Reminder job recipient selection + dedupe.

Frontend tests:
- Week/month rendering with mock data.
- Drag/drop entry save optimistic update and rollback.
- Preferences form validation.

Manual QA:
- Create tasks with mixed due dates/statuses.
- Verify overdue/today/tomorrow sections.
- Verify one reminder per day and correct email content.

## Suggested First Build Order
1. Add planner read endpoints from existing task data.
2. Build week/month UI shells with real API payload.
3. Add reminder job (due-today + overdue, no planner entries yet).
4. Add planner entries persistence and drag/drop.
5. Add reminder preferences and in-app notifications.
