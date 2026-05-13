import { useEffect, useState, useCallback } from 'react';
import { getStoredToken } from './auth';

interface SSEMessage {
  type: 'connected' | 'log' | 'error' | 'complete';
  message?: string;
  result?: string;
  sessionId?: string;
}

export function useSSE(sessionId: number | null) {
  const [messages, setMessages] = useState<SSEMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(() => {
    if (!sessionId) return;

    setError(null);
    const token = getStoredToken();
    const eventSource = new EventSource(`http://localhost:3000/sse/${sessionId}${token ? `?token=${encodeURIComponent(token)}` : ''}`);

    eventSource.onopen = () => {
      setConnected(true);
      setError(null);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as SSEMessage;
        setMessages(prev => [...prev, data]);
      } catch {
        console.error('Failed to parse SSE message');
      }
    };

    eventSource.onerror = () => {
      setConnected(false);
      setError('Connection lost');
      eventSource.close();
    };

    return () => {
      eventSource.close();
      setConnected(false);
    };
  }, [sessionId]);

  useEffect(() => {
    const cleanup = connect();
    return cleanup;
  }, [connect]);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return { messages, connected, error, clearMessages };
}

export function useSessionPolling(sessionId: number | null, intervalMs: number = 2000) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;

    let cancelled = false;

    const fetchSession = async () => {
      try {
        setLoading(true);
        const response = await fetch(`http://localhost:3000/trpc/sessions.get`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: sessionId })
        });
        
        if (!cancelled) {
          const result = await response.json();
          setData(result.result?.data || null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to fetch');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchSession();
    const interval = setInterval(fetchSession, intervalMs);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sessionId, intervalMs]);

  return { data, loading, error };
}