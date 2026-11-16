import app from '../src/worker/index.js';
import { workerBindings } from '../src/server/bindings.js';

export const config = { runtime: 'nodejs' };

const handler = (req: Request) => app.fetch(req, workerBindings());

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const DELETE = handler;
export const PUT = handler;
export const OPTIONS = handler;
export const HEAD = handler;
