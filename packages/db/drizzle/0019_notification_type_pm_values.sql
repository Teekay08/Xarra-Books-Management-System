-- Add project management notification types to the notification_type enum
DO $$ BEGIN ALTER TYPE "notification_type" ADD VALUE 'TASK_ASSIGNED'; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TYPE "notification_type" ADD VALUE 'TASK_STARTED'; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TYPE "notification_type" ADD VALUE 'TASK_REVIEW_REQUESTED'; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TYPE "notification_type" ADD VALUE 'TASK_COMPLETED'; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TYPE "notification_type" ADD VALUE 'TASK_SENT_BACK'; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TYPE "notification_type" ADD VALUE 'TASK_REQUEST_SUBMITTED'; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TYPE "notification_type" ADD VALUE 'TASK_REQUEST_APPROVED'; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TYPE "notification_type" ADD VALUE 'TASK_REQUEST_REJECTED'; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TYPE "notification_type" ADD VALUE 'TASK_REQUEST_NEEDS_INFO'; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TYPE "notification_type" ADD VALUE 'EXTENSION_REQUESTED'; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TYPE "notification_type" ADD VALUE 'EXTENSION_APPROVED'; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TYPE "notification_type" ADD VALUE 'EXTENSION_DECLINED'; EXCEPTION WHEN duplicate_object THEN null; END $$;
