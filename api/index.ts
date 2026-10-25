import app from '../src/worker/index';
import { getDb } from '../src/server/pgd1';

export const config = { runtime: 'nodejs' };

const handler = (req: Request) =>
  app.fetch(req, {
    DB: getDb() as unknown as D1Database,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ?? '',
    SESSION_SECRET: process.env.SESSION_SECRET ?? '',
  } as any);

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const DELETE = handler;
export const PUT = handler;
export const OPTIONS = handler;
