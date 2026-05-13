import { createSession } from '../db/schema';
import { executeResearchTaskStream } from '../api/services/hermesService';
import { selectProvider } from './aiRouter';
import { sendSSE } from './sse';

export interface ScheduledTask {
  id: string;
  profileId: number;
  prompt: string;
  url?: string;
  schedule: 'hourly' | 'daily' | 'weekly';
  enabled: boolean;
  lastRun?: number;
  nextRun: number;
  createdAt: number;
}

const scheduledTasks: Map<string, ScheduledTask> = new Map();
let schedulerInterval: NodeJS.Timeout | null = null;

const SCHEDULE_INTERVALS = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000
};

export function createScheduledTask(
  profileId: number,
  prompt: string,
  url: string | undefined,
  schedule: 'hourly' | 'daily' | 'weekly'
): string {
  const id = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const now = Date.now();
  
  const task: ScheduledTask = {
    id,
    profileId,
    prompt,
    url,
    schedule,
    enabled: true,
    nextRun: now + SCHEDULE_INTERVALS[schedule],
    createdAt: now
  };
  
  scheduledTasks.set(id, task);
  
  if (!schedulerInterval) {
    startScheduler();
  }
  
  console.log(`[Scheduler] Created task ${id}, next run: ${new Date(task.nextRun).toISOString()}`);
  
  return id;
}

export function getScheduledTasks(): ScheduledTask[] {
  return Array.from(scheduledTasks.values());
}

export function getScheduledTask(id: string): ScheduledTask | undefined {
  return scheduledTasks.get(id);
}

export function deleteScheduledTask(id: string): boolean {
  return scheduledTasks.delete(id);
}

export function toggleScheduledTask(id: string, enabled: boolean): boolean {
  const task = scheduledTasks.get(id);
  if (task) {
    task.enabled = enabled;
    return true;
  }
  return false;
}

function startScheduler() {
  if (schedulerInterval) return;
  
  schedulerInterval = setInterval(() => {
    const now = Date.now();
    
    scheduledTasks.forEach((task) => {
      if (!task.enabled || task.nextRun > now) return;
      
      console.log(`[Scheduler] Running task ${task.id}`);
      
      const { provider } = selectProvider(task.prompt);
      const sessionId = createSession(task.profileId, task.prompt, task.url);
      const sid = Number(sessionId);
      
      sendSSE(sid.toString(), { type: 'scheduled_task_start', taskId: task.id });
      
      void executeResearchTaskStream(
        sid,
        task.prompt,
        { url: task.url, provider },
        (data) => {
          sendSSE(sid.toString(), { type: 'log', message: data });
        },
        (error) => {
          if (!error.includes('Opening') && !error.includes('Downloading')) {
            sendSSE(sid.toString(), { type: 'error', message: error });
          }
        }
      );
      
      task.lastRun = now;
      task.nextRun = now + SCHEDULE_INTERVALS[task.schedule];
      
      console.log(`[Scheduler] Task ${task.id} completed, next run: ${new Date(task.nextRun).toISOString()}`);
    });
  }, 60000);
  
  console.log('[Scheduler] Started');
}

export function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('[Scheduler] Stopped');
  }
}

export function getSchedulerStatus(): { running: boolean; tasks: number } {
  return {
    running: schedulerInterval !== null,
    tasks: scheduledTasks.size
  };
}