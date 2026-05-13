import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { trpcServer } from "@hono/trpc-server";
import { appRouter } from "./api/router.js";
import { initDb, saveDb, db, getDbPath } from "./db/schema.js";
import { runMigrations } from "./db/migrations.js";
import { reloadProviderStats } from "./lib/selfLearning.js";
import { addSSEClient, removeSSEClient } from "./lib/sse.js";
import { checkRateLimit, getRateLimitStats } from "./lib/rateLimiter.js";
import { getCacheStats } from "./lib/cache.js";
import { getSchedulerStatus, stopScheduler } from "./lib/scheduler.js";
import { getWebhookStatus } from "./lib/webhooks.js";
import { getSelfLearningStats } from "./lib/selfLearning.js";
import { closeBrowser } from "./lib/browserService.js";
import { readFileSync, existsSync } from 'fs';
import "dotenv/config";

const REQUIRED_ENV_VARS = ['GROQ_API_KEY', 'OPENCODE_API_KEY', 'GEMINI_API_KEY'] as const;
const DB_PATH = process.env.DB_PATH || 'data.db';
const START_TIME = Date.now();

function validateConfig(): { ok: boolean; warnings: string[] } {
  const warnings: string[] = [];
  for (const key of REQUIRED_ENV_VARS) {
    if (!process.env[key]) warnings.push(`Missing ${key} in .env`);
  }
  if (!process.env.JWT_SECRET) warnings.push('JWT_SECRET not set — using insecure default (set in .env for production)');
  return { ok: warnings.length === 0, warnings };
}

const app = new Hono();

app.use('*', async (c, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;
  c.header('X-Response-Time', String(duration));
});

app.use('*', async (c, next) => {
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
  const { allowed, remaining, resetAt } = checkRateLimit(ip, { windowMs: 60000, maxRequests: 100 });
  
  c.header('X-RateLimit-Limit', '100');
  c.header('X-RateLimit-Remaining', String(remaining));
  c.header('X-RateLimit-Reset', String(Math.ceil(resetAt / 1000)));
  
  if (!allowed) {
    return c.text('Rate limit exceeded', 429);
  }
  
  await next();
});

app.use("/trpc/*", trpcServer({
  router: appRouter,
  createContext: async (_opts, c) => {
    return { auth: c.req.header('Authorization') };
  },
}));
app.get("/", (c) => c.json({ status: "ok", message: "Hermes Site Research Hub API" }));
app.get("/health", (c) => {
  let dbSize = 0;
  try { dbSize = readFileSync(DB_PATH).length; } catch { /* not yet */ }
  return c.json({ status: "healthy", uptime: Date.now() - START_TIME, dbPath: DB_PATH, dbSize });
});

app.get("/health/detailed", (c) => {
  const dbStatus = db ? 'connected' : 'disconnected';
  const rateLimitStats = getRateLimitStats();
  const cacheStats = getCacheStats();
  const schedulerStatus = getSchedulerStatus();
  const webhookStatus = getWebhookStatus();
  
  const isHealthy = dbStatus === 'connected';
  
  return c.json({
    status: isHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    services: {
      database: { status: dbStatus },
      rateLimiter: { ...rateLimitStats },
      cache: { size: cacheStats.size },
      scheduler: schedulerStatus,
      webhooks: webhookStatus
    }
  }, isHealthy ? 200 : 503);
});

app.get("/sse/:sessionId", async (c) => {
  const sessionId = c.req.param('sessionId');
  const token = c.req.query('token');
  if (!token) return c.text('Missing token query parameter', 401);
  try {
    const { verifyToken } = await import('./lib/auth.js');
    verifyToken(token);
  } catch {
    return c.text('Invalid or expired token', 401);
  }

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (data: string) => {
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      };
      
      addSSEClient(sessionId, send);
      send(JSON.stringify({ type: 'connected', sessionId }));
      
      c.req.raw.signal.addEventListener('abort', () => {
        removeSSEClient(sessionId, send);
      });
    }
  });
  
  return c.body(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  });
});

app.get("/status", (c) => {
  const groqKey = process.env.GROQ_API_KEY ? 'configured' : 'missing';
  const opencodeKey = process.env.OPENCODE_API_KEY ? 'configured' : 'missing';
  const geminiKey = process.env.GEMINI_API_KEY ? 'configured' : 'missing';

  return c.json({
    server: 'running',
    dbPath: DB_PATH,
    providers: {
      groq: groqKey,
      'opencode-zen': opencodeKey,
      gemini: geminiKey
    }
  });
});

app.get("/test-provider", async (c) => {
  const provider = c.req.query('provider') || 'groq';
  const { selectProvider } = await import('./lib/aiRouter.js');
  const { provider: selected, model } = selectProvider(`Test ${provider}`);
  return c.json({ selected, model, provider: provider });
});

app.get("/rate-limit-stats", (c) => {
  return c.json(getRateLimitStats());
});

app.get("/logs", async (c) => {
  const level = c.req.query('level') || undefined;
  const limit = parseInt(c.req.query('limit') || '100');
  const { getLogs, getLogStats } = await import('./lib/logger.js');
  return c.json({ logs: getLogs(level, limit), stats: getLogStats() });
});

app.get("/metrics", (c) => {
  let dbSize = 0;
  try { dbSize = existsSync(DB_PATH) ? readFileSync(DB_PATH).length : 0; } catch { /* ignore */ }
  const rateLimitStats = getRateLimitStats();
  const cacheStats = getCacheStats();
  const schedulerStatus = getSchedulerStatus();
  const learningStats = getSelfLearningStats();
  const uptime = (Date.now() - START_TIME) / 1000;

  const metrics = [
    `# HELP hermes_uptime_seconds Server uptime in seconds`,
    `# TYPE hermes_uptime_seconds gauge`,
    `hermes_uptime_seconds ${uptime}`,
    ``,
    `# HELP hermes_db_size_bytes Database file size in bytes`,
    `# TYPE hermes_db_size_bytes gauge`,
    `hermes_db_size_bytes ${dbSize}`,
    ``,
    `# HELP hermes_rate_limiter_active_windows Current rate limiter windows`,
    `# TYPE hermes_rate_limiter_active_windows gauge`,
    `hermes_rate_limiter_active_windows ${rateLimitStats.activeWindows || 0}`,
    ``,
    `# HELP hermes_cache_entries Number of cached entries`,
    `# TYPE hermes_cache_entries gauge`,
    `hermes_cache_entries ${cacheStats.size || 0}`,
    ``,
    `# HELP hermes_scheduler_tasks Number of scheduled tasks`,
    `# TYPE hermes_scheduler_tasks gauge`,
    `hermes_scheduler_tasks ${(schedulerStatus as any)?.tasks || 0}`,
    ``,
    `# HELP hermes_learning_records Total learning records`,
    `# TYPE hermes_learning_records gauge`,
    `hermes_learning_records ${(learningStats as any)?.totalRecords || 0}`,
    ``,
    `# HELP hermes_learning_success_rate Learning success rate`,
    `# TYPE hermes_learning_success_rate gauge`,
    `hermes_learning_success_rate ${parseFloat((learningStats as any)?.successRate || '0') || 0}`,
  ];

  return c.text(metrics.join('\n'), 200, { 'Content-Type': 'text/plain; charset=utf-8' });
});

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});

async function main() {
  const config = validateConfig();
  if (config.warnings.length > 0) {
    for (const w of config.warnings) console.warn(`[CONFIG] ${w}`);
  }

  await initDb();
  runMigrations();
  reloadProviderStats();
  console.log(`Database initialized at ${DB_PATH}`);
  
  const saveInterval = setInterval(() => { saveDb(); }, 30000);
  
  const server = serve({
    fetch: app.fetch,
    port: 3000,
    hostname: "0.0.0.0",
  });
  
  console.log("Server started on http://0.0.0.0:3000");
  console.log("Endpoints: /health, /health/detailed, /status, /sse/:sessionId");
  
  const shutdown = async (signal: string) => {
    console.log(`\n[${signal}] Starting graceful shutdown...`);
    
    clearInterval(saveInterval);
    saveDb();
    console.log("Database saved");
    
    try {
      await closeBrowser();
      console.log("Browser closed");
    } catch (e) {
      console.error("Error closing browser:", e);
    }
    
    try {
      stopScheduler();
      console.log("Scheduler stopped");
    } catch (e) {
      console.error("Error stopping scheduler:", e);
    }
    
    server.close();
    console.log("Server closed");
    
    process.exit(0);
  };
  
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch(console.error);