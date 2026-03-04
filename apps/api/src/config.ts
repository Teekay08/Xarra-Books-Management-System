import { resolve } from 'node:path';
import { config as dotenvConfig } from 'dotenv';

// Load .env from monorepo root
dotenvConfig({ path: resolve(import.meta.dirname, '../../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',

  database: {
    url: process.env.DATABASE_URL || 'postgres://xarra:xarra@localhost:5432/xarra',
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
    expiresIn: '15m',
    refreshExpiresIn: '7d',
  },

  s3: {
    bucket: process.env.S3_BUCKET || 'xarra-documents',
    region: process.env.AWS_REGION || 'af-south-1',
  },

  resend: {
    apiKey: process.env.RESEND_API_KEY || '',
    fromEmail: process.env.FROM_EMAIL || 'noreply@xarrabooks.com',
  },
} as const;
