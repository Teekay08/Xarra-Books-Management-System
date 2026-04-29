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
  WEB_URL: z.string().url().optional(),
  JWT_SECRET: z.string().min(8),
  S3_BUCKET: z.string().default('xarra-documents'),
  AWS_REGION: z.string().default('af-south-1'),
  RESEND_API_KEY: z.string().default(''),
  FROM_EMAIL: z.string().email().default('onboarding@resend.dev'),
  TAKEALOT_API_KEY: z.string().default(''),
  WOOCOMMERCE_URL: z.string().url().optional(),
  WOOCOMMERCE_CONSUMER_KEY: z.string().default(''),
  WOOCOMMERCE_CONSUMER_SECRET: z.string().default(''),
  WOOCOMMERCE_WEBHOOK_SECRET: z.string().default(''),
  GROQ_API_KEY: z.string().default(''),
  GROQ_MODEL: z.string().default('llama-3.3-70b-versatile'),
  GROQ_MAX_TOKENS: z.coerce.number().int().positive().default(700),
  GROQ_TEMPERATURE: z.coerce.number().min(0).max(1).default(0.4),
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

  web: {
    url: (env.WEB_URL ?? env.CORS_ORIGIN.split(',')[0] ?? 'http://localhost:5173').trim().replace(/\/$/, ''),
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

  woocommerce: {
    url: env.WOOCOMMERCE_URL ?? '',
    consumerKey: env.WOOCOMMERCE_CONSUMER_KEY,
    consumerSecret: env.WOOCOMMERCE_CONSUMER_SECRET,
    webhookSecret: env.WOOCOMMERCE_WEBHOOK_SECRET,
  },

  ai: {
    apiKey: env.GROQ_API_KEY,
    model: env.GROQ_MODEL,
    maxTokens: env.GROQ_MAX_TOKENS,
    temperature: env.GROQ_TEMPERATURE,
  },
} as const;
