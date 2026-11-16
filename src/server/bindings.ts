import type { Env } from '../worker/env.js';
import { getDb } from './pgd1.js';

/** Bindings for the Hono app on Node (Vercel function and local `npm run dev:api`). */
export function workerBindings(): Env {
  return {
    DB: getDb() as unknown as D1Database,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ?? '',
    SESSION_SECRET: process.env.SESSION_SECRET ?? '',
    X_BEARER_TOKEN: process.env.X_BEARER_TOKEN || undefined,
    CRON_SECRET: process.env.CRON_SECRET || undefined,
    RESEND_API_KEY: process.env.RESEND_API_KEY || undefined,
    REPORT_FROM_EMAIL: process.env.REPORT_FROM_EMAIL || undefined,
    GITHUB_TOKEN: process.env.GITHUB_TOKEN || undefined,
    REDDIT_CLIENT_ID: process.env.REDDIT_CLIENT_ID || undefined,
    REDDIT_CLIENT_SECRET: process.env.REDDIT_CLIENT_SECRET || undefined,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || undefined,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || undefined,
    META_APP_ID: process.env.META_APP_ID || undefined,
    META_APP_SECRET: process.env.META_APP_SECRET || undefined,
  };
}
