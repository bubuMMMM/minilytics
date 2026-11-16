import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { type AppEnv } from './env.js';
import { csrfGuard } from './lib/security.js';
import { ERR } from './lib/errors.js';
import { registerPublic } from './routes/public.js';
import { registerSites } from './routes/sites.js';
import { registerGrowth } from './growth.js';
import { registerAuth, requireAuth } from './auth.js';
import { registerBots } from './bots.js';
import { registerImports } from './imports.js';
import { registerShare } from './share.js';
import { registerWidgets } from './widgets.js';
import { registerPhone, registerWidgetPng } from './phone.js';
import { registerReplay } from './replay.js';
import { registerProfile } from './profile.js';
import { registerAlerts } from './alerts.js';
import { registerPlatform } from './platform.js';
import { registerConnectors } from './connectors.js';
import { registerWebQuality } from './web-quality.js';
import { registerWaitlist } from './waitlist.js';

const app = new Hono<AppEnv>();

// Security headers on every API response (nosniff, frame-ancestors via X-Frame-Options, referrer policy…).
const apiHeaders = secureHeaders({ crossOriginResourcePolicy: false, crossOriginOpenerPolicy: false });
// Widgets (src/worker/widgets.ts) set their own headers: they are the only responses other sites may frame.
app.use('/api/*', (c, next) => (c.req.path.startsWith('/api/widget/') || c.req.path.startsWith('/api/w/') ? next() : apiHeaders(c, next)));
// Cookie-authenticated routes refuse cross-site writes (defence in depth on top of SameSite=Strict).
app.use('/api/auth/*', csrfGuard);
app.use('/api/sites', csrfGuard);
app.use('/api/sites/*', csrfGuard);
app.use('/api/team', csrfGuard);
app.use('/api/team/*', csrfGuard);
app.use('/api/invites/*', csrfGuard);
app.use('/api/tokens', csrfGuard);
app.use('/api/tokens/*', csrfGuard);
app.use('/api/usage/*', csrfGuard);

// ---------- public: tracking, webhooks, server-side API, crons
registerPublic(app);
registerPlatform(app);

// ---------- login, sessions, team (src/worker/auth.ts)
registerAuth(app);
registerWaitlist(app);
app.use('/api/sites', requireAuth);
app.use('/api/sites/*', requireAuth);

// ---------- sites CRUD + stats
registerSites(app);

registerGrowth(app);
registerBots(app);
registerImports(app);
registerShare(app);
registerWidgets(app);
registerWidgetPng(app);
registerPhone(app);
registerReplay(app);
registerProfile(app);
registerAlerts(app);
registerWebQuality(app);
registerConnectors(app);

app.all('/api/*', (c) => c.json({ error: ERR.notFound }, 404));

// Everything else is the dashboard (static files). On Vercel this is not used: non-API paths are rewritten to index.html.
app.all('*', (c) => (c.env.ASSETS ? c.env.ASSETS.fetch(c.req.raw) : c.json({ error: ERR.notFound }, 404)));

export default app;
