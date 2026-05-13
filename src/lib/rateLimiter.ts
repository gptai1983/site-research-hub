export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = { windowMs: 60000, maxRequests: 100 }
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const key = identifier;
  
  let record = rateLimitStore.get(key);
  
  if (!record || record.resetTime < now) {
    record = {
      count: 0,
      resetTime: now + config.windowMs
    };
    rateLimitStore.set(key, record);
  }
  
  record.count++;
  
  const remaining = Math.max(0, config.maxRequests - record.count);
  const allowed = record.count <= config.maxRequests;
  
  if (rateLimitStore.size > 10000) {
    const keysToDelete: string[] = [];
    rateLimitStore.forEach((value, key) => {
      if (value.resetTime < now) keysToDelete.push(key);
    });
    keysToDelete.forEach(key => rateLimitStore.delete(key));
  }
  
  return {
    allowed,
    remaining,
    resetAt: record.resetTime
  };
}

export function getRateLimitStatus(identifier: string): { count: number; resetAt: number } | null {
  const record = rateLimitStore.get(identifier);
  if (!record) return null;
  return { count: record.count, resetAt: record.resetTime };
}

export function resetRateLimit(identifier: string): void {
  rateLimitStore.delete(identifier);
}

export function getRateLimitStats(): { totalKeys: number; activeWindows: number } {
  const now = Date.now();
  const activeWindows = Array.from(rateLimitStore.values()).filter(r => r.resetTime > now).length;
  return {
    totalKeys: rateLimitStore.size,
    activeWindows
  };
}