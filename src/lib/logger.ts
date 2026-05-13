export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  context?: Record<string, any>;
}

const LOG_LEVEL = (process.env.LOG_LEVEL || 'INFO') as keyof typeof LogLevel;
const currentLevel = LogLevel[LOG_LEVEL] ?? LogLevel.INFO;

const logs: LogEntry[] = [];
const MAX_LOGS = 1000;

function formatMessage(level: string, message: string, context?: Record<string, any>): string {
  const timestamp = new Date().toISOString();
  const ctxStr = context ? ` ${JSON.stringify(context)}` : '';
  return `[${timestamp}] ${level}: ${message}${ctxStr}`;
}

export function debug(message: string, context?: Record<string, any>): void {
  if (currentLevel <= LogLevel.DEBUG) {
    console.debug(formatMessage('DEBUG', message, context));
    addLog('DEBUG', message, context);
  }
}

export function info(message: string, context?: Record<string, any>): void {
  if (currentLevel <= LogLevel.INFO) {
    console.log(formatMessage('INFO', message, context));
    addLog('INFO', message, context);
  }
}

export function warn(message: string, context?: Record<string, any>): void {
  if (currentLevel <= LogLevel.WARN) {
    console.warn(formatMessage('WARN', message, context));
    addLog('WARN', message, context);
  }
}

export function error(message: string, context?: Record<string, any>): void {
  if (currentLevel <= LogLevel.ERROR) {
    console.error(formatMessage('ERROR', message, context));
    addLog('ERROR', message, context);
  }
}

function addLog(level: string, message: string, context?: Record<string, any>): void {
  logs.push({
    timestamp: new Date().toISOString(),
    level,
    message,
    context
  });
  
  if (logs.length > MAX_LOGS) {
    logs.shift();
  }
}

export function getLogs(level?: string, limit: number = 100): LogEntry[] {
  let filtered = logs;
  
  if (level) {
    filtered = logs.filter(l => l.level === level);
  }
  
  return filtered.slice(-limit);
}

export function clearLogs(): void {
  logs.length = 0;
}

export function getLogStats(): { total: number; byLevel: Record<string, number> } {
  const byLevel: Record<string, number> = {};
  
  for (const log of logs) {
    byLevel[log.level] = (byLevel[log.level] || 0) + 1;
  }
  
  return { total: logs.length, byLevel };
}