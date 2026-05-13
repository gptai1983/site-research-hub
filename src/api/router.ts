import { z } from 'zod';
import { 
  getSession, updateSessionStatus, saveSessionResult, 
  getAllProfiles, createProfile, deleteProfile,
  getAllSessions, createSession, getProfile, updateProfileCookies,
  getSessionMetrics
} from '../db/schema';
import { executeResearchTaskStream } from './services/hermesService';
import { selectProvider } from '../lib/aiRouter';
import { navigateToUrl, scrapePage, closeBrowser, loginToSite } from '../lib/browserService';
import { encrypt, decrypt } from '../lib/encryption';
import { sendSSE } from '../lib/sse';
import { runBatch, cancelBatch, getBatchStatus } from '../lib/batchRunner';
import { 
  createScheduledTask, getScheduledTasks, getScheduledTask, 
  deleteScheduledTask, toggleScheduledTask, getSchedulerStatus 
} from '../lib/scheduler';
import { createWebhook, getWebhooks, deleteWebhook, toggleWebhook, getWebhookStatus } from '../lib/webhooks';
import { exportSessions, exportSessionReport } from '../lib/export';
import { 
  recordOutcome, getBestProvider, getProviderStats, analyzeAndOptimizePrompt,
  autoRetryWithFallback, getSelfLearningStats 
} from '../lib/selfLearning';
import {
  checkForUpdates, downloadUpdate, applyUpdate, getUpdateStatus, rollback, startAutoUpdater
} from '../lib/autoUpdater';
import { t } from './trpc';
import { protectedProcedure } from './authMiddleware';
import { authRouter } from './authRouter';
import 'dotenv/config';

interface SessionData {
  id: number;
  profileId: number;
  prompt: string;
  url?: string;
  status: string;
  result?: string;
  error?: string;
  provider?: string;
  model?: string;
  createdAt: Date;
  logs: string[];
}

const activeSessions: Map<number, SessionData> = new Map();
const reports: Map<number, { content: string }> = new Map();

export const appRouter = t.router({
  auth: authRouter,
  profiles: t.router({
    list: protectedProcedure.query(async () => getAllProfiles()),
    create: protectedProcedure.input(z.object({ 
      name: z.string(), 
      url: z.string(), 
      credentials: z.string().optional() 
    })).mutation(async ({ input }) => {
      const encryptedCreds = input.credentials ? encrypt(input.credentials) : undefined;
      const id = createProfile(input.name, input.url, encryptedCreds);
      return { id, name: input.name, url: input.url, credentials: input.credentials, createdAt: new Date() };
    }),
    login: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      const profile = getProfile(Number(input.id));
      if (!profile) throw new Error('Profile not found');
      
      if (!profile.credentials) {
        throw new Error('No credentials for this profile');
      }
      
      try {
        const credsJson = String(profile.credentials);
        const creds = JSON.parse(decrypt(credsJson));
        const page = await loginToSite({
          url: String(profile.url),
          username: creds.username,
          password: creds.password
        });
        
        const cookies = await page.context().cookies();
        updateProfileCookies(Number(input.id), JSON.stringify(cookies));
        
        await page.context().browser()?.close();
        
        return { success: true, message: 'Login successful, cookies saved' };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      deleteProfile(input.id);
      return { success: true };
    }),
    get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      const profiles = getAllProfiles();
      return profiles.find(p => p.id === input.id) || null;
    }),
  }),
  sessions: t.router({
    list: protectedProcedure.input(z.object({ profileId: z.number().optional() }).nullish()).query(async ({ input }) => {
      const profileId = input?.profileId ?? undefined;
      const sessions = getAllSessions(profileId);
      return sessions.map(s => ({ 
        sessionId: Number(s.id), 
        profileId: Number(s.profileId), 
        status: String(s.status), 
        prompt: String(s.prompt || ''), 
        result: s.result ? String(s.result) : undefined,
        error: s.error ? String(s.error) : undefined,
        provider: s.provider ? String(s.provider) : undefined,
        model: s.model ? String(s.model) : undefined,
        createdAt: s.createdAt ? new Date(Number(s.createdAt)) : new Date(),
        updatedAt: s.updatedAt ? new Date(Number(s.updatedAt)) : new Date(),
        logs: activeSessions.get(Number(s.id))?.logs || [] 
      }));
    }),
    create: protectedProcedure.input(z.object({ profileId: z.number(), prompt: z.string(), url: z.string().optional() })).mutation(async ({ input }) => {
      const id = createSession(input.profileId, input.prompt, input.url);
      const newId = Number(id);
      const session: SessionData = { 
        id: newId, 
        profileId: input.profileId, 
        prompt: input.prompt, 
        url: input.url, 
        status: 'pending', 
        logs: [],
        createdAt: new Date()
      };
      activeSessions.set(Number(id), session);
      const { logs, id: _sid, ...rest } = session;
      return { sessionId: newId, ...rest, logs };
    }),
    start: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      const dbSession = getSession(input.id);
      if (!dbSession) throw new Error('Session not found');

      let session = activeSessions.get(input.id);
      if (!session) {
        session = {
          id: input.id,
          profileId: Number(dbSession.profileId),
          prompt: String(dbSession.prompt || ''),
          url: dbSession.url ? String(dbSession.url) : undefined,
          status: 'pending',
          logs: [],
          createdAt: new Date(Number(dbSession.createdAt))
        };
      }

      session.status = 'running';
      session.logs.push('Task started...');
      sendSSE(String(session.id), { type: 'log', message: 'Task started...' });

      const { provider, model } = selectProvider(session.prompt);
      session.provider = provider;
      session.model = model;
      session.logs.push(`Selected provider: ${provider}/${model}`);
      sendSSE(String(session.id), { type: 'log', message: `Selected provider: ${provider}/${model}` });

      updateSessionStatus(session.id, 'running', provider || undefined, model || undefined);

      let accumulatedResult = '';

      const process = executeResearchTaskStream(
        session.id,
        session.prompt,
        { url: session.url, provider },
        (data) => {
          if (data === '__RESEARCH_COMPLETE__') {
            session.status = 'completed';
            session.result = accumulatedResult;
            saveSessionResult(session.id, accumulatedResult);
            sendSSE(String(session.id), { type: 'complete', result: accumulatedResult });
            return;
          }
          session.logs.push(data);
          accumulatedResult += data;
          sendSSE(String(session.id), { type: 'log', message: data });
        },
    (error) => {
      if (!error.includes('Opening') && !error.includes('Downloading')) {
        session.logs.push(`[ERROR] ${error}`);
        sendSSE(String(session.id), { type: 'error', message: error });
        session.status = 'error';
        session.error = error;
        updateSessionStatus(session.id, 'error', session.provider, session.model);
        saveSessionResult(session.id, '', error);
      }
    }
      );

      setTimeout(() => {
        if (session && session.status === 'running') {
          process.kill();
          session.status = 'completed';
          session.logs.push('Task completed (timeout)');
          updateSessionStatus(session.id, 'completed');
          sendSSE(String(session.id), { type: 'complete', message: 'Task completed (timeout)' });
        }
      }, 300000);

      if (session) activeSessions.set(session.id, session);
      return { success: true, status: 'running', provider, model, sessionId: session.id };
    }),
    get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      const dbSession = getSession(input.id);
      if (!dbSession) return null;
      const active = activeSessions.get(input.id);
      return { 
        id: input.id,
        profileId: Number(dbSession.profileId),
        status: String(dbSession.status),
        prompt: String(dbSession.prompt || ''),
        result: dbSession.result ? String(dbSession.result) : undefined,
        error: dbSession.error ? String(dbSession.error) : undefined,
        provider: dbSession.provider ? String(dbSession.provider) : undefined,
        model: dbSession.model ? String(dbSession.model) : undefined,
        createdAt: new Date(Number(dbSession.createdAt)),
        updatedAt: new Date(Number(dbSession.updatedAt)),
        logs: active?.logs || [] 
      };
    }),
    logs: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => activeSessions.get(input.id)?.logs || []),
    update: protectedProcedure.input(z.object({ id: z.number(), status: z.string().optional(), result: z.string().optional(), error: z.string().optional() })).mutation(async ({ input }) => {
      const session = activeSessions.get(input.id);
      if (session) {
        if (input.status) session.status = input.status;
        if (input.result) session.result = input.result;
        if (input.error) session.error = input.error;
      }
      if (input.status || input.result || input.error) {
        updateSessionStatus(input.id, input.status || 'pending', session?.provider, session?.model);
        if (input.result) saveSessionResult(input.id, input.result);
      }
      return { success: true };
    }),
  }),
  reports: t.router({
    get: protectedProcedure.input(z.object({ sessionId: z.number() })).query(async ({ input }) => {
      const report = reports.get(input.sessionId);
      return report ? [{ id: input.sessionId, content: report.content }] : [];
    }),
  }),
  browser: t.router({
    navigate: protectedProcedure.input(z.object({ url: z.string() })).mutation(async ({ input }) => {
      try {
        const page = await navigateToUrl(input.url);
        const result = await scrapePage(page);
        await page.context().browser()?.close();
        return { success: true, ...result };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }),
    close: protectedProcedure.mutation(async () => {
      await closeBrowser();
      return { success: true };
    }),
  }),
  metrics: t.router({
    get: protectedProcedure.input(z.object({ profileId: z.number().optional() }).nullish()).query(async ({ input }) => {
      return getSessionMetrics(input?.profileId ?? undefined);
    }),
  }),
  batch: t.router({
    run: protectedProcedure.input(z.object({
      batchId: z.string(),
      tasks: z.array(z.object({
        profileId: z.number(),
        url: z.string().optional(),
        prompt: z.string()
      }))
    })).mutation(async ({ input }) => {
      const { batchId, tasks } = input;
      
      const progress = await runBatch(batchId, tasks, (p) => {
        sendSSE(batchId, { type: 'batch_progress', ...p });
      });
      
      return { success: true, ...progress };
    }),
    cancel: protectedProcedure.input(z.object({ batchId: z.string() })).mutation(async ({ input }) => {
      const cancelled = cancelBatch(input.batchId);
      return { success: cancelled };
    }),
    status: protectedProcedure.input(z.object({ batchId: z.string() })).query(async ({ input }) => {
      return { running: getBatchStatus(input.batchId) };
    }),
  }),
  scheduler: t.router({
    list: protectedProcedure.query(async () => getScheduledTasks()),
    create: protectedProcedure.input(z.object({
      profileId: z.number(),
      prompt: z.string(),
      url: z.string().optional(),
      schedule: z.enum(['hourly', 'daily', 'weekly'])
    })).mutation(async ({ input }) => {
      const taskId = createScheduledTask(input.profileId, input.prompt, input.url, input.schedule);
      return { id: taskId, ...input };
    }),
    get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
      return getScheduledTask(input.id) || null;
    }),
    delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
      const deleted = deleteScheduledTask(input.id);
      return { success: deleted };
    }),
    toggle: protectedProcedure.input(z.object({ id: z.string(), enabled: z.boolean() })).mutation(async ({ input }) => {
      const toggled = toggleScheduledTask(input.id, input.enabled);
      return { success: toggled };
    }),
    status: protectedProcedure.query(() => getSchedulerStatus()),
  }),
  webhooks: t.router({
    list: protectedProcedure.query(() => getWebhooks()),
    create: protectedProcedure.input(z.object({
      url: z.string().url(),
      events: z.array(z.enum(['session.start', 'session.complete', 'session.error', 'batch.complete', 'scheduler.task'])),
      secret: z.string().optional()
    })).mutation(async ({ input }) => {
      const id = createWebhook(input.url, input.events, input.secret);
      return { id, ...input };
    }),
    delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
      const deleted = deleteWebhook(input.id);
      return { success: deleted };
    }),
    toggle: protectedProcedure.input(z.object({ id: z.string(), enabled: z.boolean() })).mutation(async ({ input }) => {
      const toggled = toggleWebhook(input.id, input.enabled);
      return { success: toggled };
    }),
    status: protectedProcedure.query(() => getWebhookStatus()),
    test: protectedProcedure.input(z.object({ url: z.string().url() })).mutation(async ({ input }) => {
      try {
        await fetch(input.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ test: true }) });
        return { success: true };
      } catch {
        return { success: false, error: 'Failed to reach URL' };
      }
    }),
  }),
  export: t.router({
    sessions: protectedProcedure.input(z.object({ 
      profileId: z.number().optional(),
      format: z.enum(['json', 'csv', 'markdown']).optional()
    })).query(async ({ input }) => {
      const format = input.format || 'json';
      const content = exportSessions(input.profileId, format);
      return { content, format, filename: `sessions_${Date.now()}.${format}` };
    }),
    session: protectedProcedure.input(z.object({ 
      sessionId: z.number(),
      format: z.enum(['json', 'csv', 'markdown']).optional()
    })).query(async ({ input }) => {
      const format = input.format || 'json';
      const content = exportSessionReport(input.sessionId, format);
      if (!content) throw new Error('Session not found');
      return { content, format, filename: `session_${input.sessionId}_${Date.now()}.${format}` };
    }),
  }),
  learning: t.router({
    record: protectedProcedure.input(z.object({
      prompt: z.string(),
      provider: z.string(),
      model: z.string(),
      success: z.boolean(),
      duration: z.number(),
      tokensUsed: z.number().optional(),
      error: z.string().optional()
    })).mutation(async ({ input }) => {
      recordOutcome(input);
      return { success: true };
    }),
    getBest: protectedProcedure.input(z.object({ prompt: z.string() })).query(async ({ input }) => {
      return getBestProvider(input.prompt);
    }),
    optimize: protectedProcedure.input(z.object({ prompt: z.string() })).query(async ({ input }) => {
      return { optimized: analyzeAndOptimizePrompt(input.prompt) };
    }),
    getFallback: protectedProcedure.input(z.object({ failedProvider: z.string() })).query(async ({ input }) => {
      return { providers: autoRetryWithFallback('', input.failedProvider) };
    }),
    stats: protectedProcedure.query(() => getSelfLearningStats()),
providerStats: protectedProcedure.query(() => getProviderStats()),
  }),
    updater: t.router({
    check: protectedProcedure.query(async () => checkForUpdates()),
    download: protectedProcedure.input(z.object({ version: z.string() })).mutation(async ({ input }) => {
      return { success: await downloadUpdate(input.version) };
    }),
    applyUpdate: protectedProcedure.mutation(async () => applyUpdate({ 
      autoInstall: true,
      checkInterval: 3600000,
      backupBeforeUpdate: true
    })),
    status: protectedProcedure.query(() => getUpdateStatus()),
    rollback: protectedProcedure.mutation(() => rollback()),
    startAuto: protectedProcedure.input(z.object({ autoInstall: z.boolean().optional() })).mutation(async ({ input }) => {
      startAutoUpdater({ 
        autoInstall: input.autoInstall ?? false,
        checkInterval: 3600000,
        backupBeforeUpdate: true
      });
      return { success: true };
    }),
  }),
});

export type AppRouter = typeof appRouter;