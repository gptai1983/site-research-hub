import { saveLearningRecord, getAllLearningRecords, upsertProviderStats, getAllProviderStats } from '../db/schema';

export interface LearningRecord {
  prompt: string;
  provider: string;
  model: string;
  success: boolean;
  duration: number;
  tokensUsed?: number;
  error?: string;
}

let cachedStats: Record<string, { success: number; total: number; avgDuration: number }> = {};

export function reloadProviderStats(): void {
  const rows = getAllProviderStats();
  cachedStats = {};
  for (const r of rows) {
    const key = `${r.provider}/${r.model}`;
    cachedStats[key] = { success: r.successCount, total: r.totalCount, avgDuration: r.avgDuration };
  }
}

export function recordOutcome(record: LearningRecord): void {
  saveLearningRecord(record);
  upsertProviderStats(record.provider, record.model, record.success, record.duration);
  reloadProviderStats();
  if (!record.success) {
    console.log(`[SelfLearning] Failed: ${record.provider}/${record.model} - ${record.error}`);
  }
}

export function getBestProvider(prompt: string): { provider: string; model: string } {
  const lowerPrompt = prompt.toLowerCase();

  if (/код|python|js|script/.test(lowerPrompt)) {
    return getFastestProvider(['opencode-zen']);
  }
  if (/картинка|image|screenshot|vision/.test(lowerPrompt)) {
    return getFastestProvider(['gemini']);
  }

  return getFastestProvider(['groq', 'opencode-zen', 'gemini']);
}

function getFastestProvider(providers: string[]): { provider: string; model: string } {
  let best = { provider: 'groq', model: 'llama-3.3-70b-versatile', avgDuration: Infinity };

  for (const p of providers) {
    const models = getModelsForProvider(p);
    for (const m of models) {
      const key = `${p}/${m}`;
      const stats = cachedStats[key];
      if (stats && stats.avgDuration < best.avgDuration && stats.success / stats.total > 0.7) {
        best = { provider: p, model: m, avgDuration: stats.avgDuration };
      }
    }
  }

  return { provider: best.provider, model: best.model };
}

function getModelsForProvider(provider: string): string[] {
  const models: Record<string, string[]> = {
    'groq': ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
    'opencode-zen': ['big-pickle', 'minimax-m2.5-free'],
    'gemini': ['gemini-1.5-flash']
  };
  return models[provider] || [];
}

export function getProviderStats(): Record<string, any> {
  return { ...cachedStats };
}

export function analyzeAndOptimizePrompt(prompt: string): string {
  const optimizations: Record<string, (p: string) => string> = {
    'получи': (p) => p.replace('получи', 'извлеки'),
    'узнай': (p) => p.replace('узнай', 'получи информацию'),
    'найди': (p) => p.replace('найди', 'найди и извлеки данные'),
  };

  let optimized = prompt;
  for (const [key, fn] of Object.entries(optimizations)) {
    if (prompt.toLowerCase().includes(key)) {
      optimized = fn(optimized);
    }
  }

  return optimized;
}

export function autoRetryWithFallback(_prompt: string, failedProvider: string): string[] {
  const fallbackOrder: Record<string, string[]> = {
    'groq': ['opencode-zen', 'gemini'],
    'opencode-zen': ['groq', 'gemini'],
    'gemini': ['groq', 'opencode-zen']
  };

  return fallbackOrder[failedProvider] || ['groq'];
}

export function getSelfLearningStats() {
  const records = getAllLearningRecords();
  const total = records.length;
  const success = records.filter(r => r.success).length;
  const providers = getAllProviderStats();

  return {
    totalRecords: total,
    successRate: total > 0 ? (success / total * 100).toFixed(1) + '%' : 'N/A',
    providers
  };
}
