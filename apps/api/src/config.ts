import { resolve } from 'node:path';
import { config as dotenvConfig } from 'dotenv';
import { z } from 'zod';

// Load .env from monorepo root
dotenvConfig({ path: resolve(import.meta.dirname, '../../../.env') });

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  JWT_SECRET: z.string().min(8),
  S3_BUCKET: z.string().default('xarra-documents'),
  AWS_REGION: z.string().default('af-south-1'),
  RESEND_API_KEY: z.string().default(''),
  FROM_EMAIL: z.string().email().default('onboarding@resend.dev'),
  TAKEALOT_API_KEY: z.string().default(''),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env = parsed.data;

export const config = {
  port: env.PORT,
  host: env.HOST,
  nodeEnv: env.NODE_ENV,

  database: {
    url: env.DATABASE_URL,
  },

  redis: {
    url: env.REDIS_URL,
  },

  cors: {
    origins: env.CORS_ORIGIN.split(',').map((o) => o.trim()),
  },

  jwt: {
    secret: env.JWT_SECRET,
    expiresIn: '15m',
    refreshExpiresIn: '7d',
  },

  s3: {
    bucket: env.S3_BUCKET,
    region: env.AWS_REGION,
  },

  resend: {
    apiKey: env.RESEND_API_KEY,
    fromEmail: env.FROM_EMAIL,
  },

  takealot: {
    apiKey: env.TAKEALOT_API_KEY,
  },
} as const;
