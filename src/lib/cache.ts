export interface CacheOptions {
  ttl?: number;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const memoryCache = new Map<string, CacheEntry<any>>();
let cleanupInterval: NodeJS.Timeout | null = null;

export function setCache<T>(key: string, value: T, ttl: number = 300000): void {
  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + ttl
  });
  
  if (!cleanupInterval) {
    cleanupInterval = setInterval(cleanupCache, 60000);
  }
}

export function getCache<T>(key: string): T | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  
  if (entry.expiresAt < Date.now()) {
    memoryCache.delete(key);
    return null;
  }
  
  return entry.value as T;
}

export function deleteCache(key: string): boolean {
  return memoryCache.delete(key);
}

export function clearCache(): void {
  memoryCache.clear();
}

function cleanupCache(): void {
  const now = Date.now();
  const keysToDelete: string[] = [];
  
  memoryCache.forEach((entry, key) => {
    if (entry.expiresAt < now) {
      keysToDelete.push(key);
    }
  });
  
  keysToDelete.forEach(key => memoryCache.delete(key));
}

export function getCacheStats(): { size: number; keys: string[] } {
  return {
    size: memoryCache.size,
    keys: Array.from(memoryCache.keys()).slice(0, 100)
  };
}

export function cacheMiddleware<T>(
  keyFn: (input: any) => string,
  ttl: number = 60000
) {
  return async (input: any, fn: () => Promise<T>): Promise<T> => {
    const key = keyFn(input);
    const cached = getCache<T>(key);
    
    if (cached !== null) {
      return cached;
    }
    
    const result = await fn();
    setCache(key, result, ttl);
    
    return result;
  };
}