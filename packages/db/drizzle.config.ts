import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// Load .env from monorepo root (handle both ESM and CJS contexts)
const dir = typeof __dirname !== 'undefined' ? __dirname : resolve(fileURLToPath(import.meta.url), '..');
config({ path: resolve(dir, '../../.env') });

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
