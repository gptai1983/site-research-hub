import { createSession } from '../db/schema';
import { sendSSE } from './sse';
import { executeResearchTaskStream } from '../api/services/hermesService';
import { selectProvider } from './aiRouter';

export interface BatchTask {
  profileId: number;
  url?: string;
  prompt: string;
}

export interface BatchResult {
  sessionId: number;
  status: 'pending' | 'running' | 'completed' | 'error';
  result?: string;
  error?: string;
}

export interface BatchProgress {
  total: number;
  completed: number;
  failed: number;
  results: BatchResult[];
}

const runningBatches: Map<string, { cancel: () => void }> = new Map();

export async function runBatch(
  batchId: string,
  tasks: BatchTask[],
  onProgress?: (progress: BatchProgress) => void
): Promise<BatchProgress> {
  const progress: BatchProgress = {
    total: tasks.length,
    completed: 0,
    failed: 0,
    results: []
  };

  const { provider } = selectProvider(tasks[0].prompt);

  const cancelFn = {
    cancel: () => {
      runningBatches.delete(batchId);
    }
  };
  runningBatches.set(batchId, cancelFn);

  sendSSE(batchId, { type: 'batch_start', total: tasks.length });

  for (let i = 0; i < tasks.length; i++) {
    if (!runningBatches.has(batchId)) {
      sendSSE(batchId, { type: 'batch_cancelled', completed: progress.completed });
      break;
    }

    const task = tasks[i];
    const sessionId = createSession(task.profileId, task.prompt, task.url);
    const sid = Number(sessionId);

    sendSSE(batchId, { type: 'batch_task_start', index: i, sessionId: sid });

    await new Promise<void>((resolve) => {
      let accumulatedBatchResult = '';

      const process = executeResearchTaskStream(
        sid,
        task.prompt,
        { url: task.url, provider },
        (data) => {
          if (data === '__RESEARCH_COMPLETE__') {
            progress.completed++;
            progress.results.push({ sessionId: sid, status: 'completed', result: accumulatedBatchResult });
            onProgress?.(progress);
            return;
          }
          accumulatedBatchResult += data;
          sendSSE(batchId, { type: 'log', sessionId: sid, message: data });
        },
        (error) => {
          if (!error.includes('Opening') && !error.includes('Downloading')) {
            sendSSE(batchId, { type: 'error', sessionId: sid, message: error });
          }
        }
      );

      setTimeout(() => {
        process.kill();
        if (progress.results.find(r => r.sessionId === sid)?.status !== 'completed') {
          progress.failed++;
          progress.results.push({ sessionId: sid, status: 'error', error: 'Timeout' });
          sendSSE(batchId, { type: 'batch_task_complete', sessionId: sid, status: 'error' });
          onProgress?.(progress);
        }
        resolve();
      }, 300000);
    });

    sendSSE(batchId, { type: 'batch_task_complete', sessionId: sid, status: 'completed', index: i });
    onProgress?.(progress);
  }

  sendSSE(batchId, { type: 'batch_complete', ...progress });
  runningBatches.delete(batchId);

  return progress;
}

export function cancelBatch(batchId: string): boolean {
  const batch = runningBatches.get(batchId);
  if (batch) {
    batch.cancel();
    runningBatches.delete(batchId);
    return true;
  }
  return false;
}

export function getBatchStatus(batchId: string): boolean {
  return runningBatches.has(batchId);
}