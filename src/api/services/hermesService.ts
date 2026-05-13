import 'dotenv/config';
import { selectProvider, callProviderAPI, isRetryableError, getFallbackProviders } from '../../lib/aiRouter';

export interface HermesResult {
  success: boolean;
  output?: string;
  error?: string;
  provider?: string;
  model?: string;
}

export interface HermesOptions {
  url?: string;
  provider?: string;
  model?: string;
  timeout?: number;
}

const PROVIDER_ENDPOINTS: Record<string, string> = {
  groq: 'https://api.groq.com/openai/v1',
  'opencode-zen': 'https://opencode.ai/zen/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/',
};

const PROVIDER_MODEL_MAP: Record<string, Record<string, string>> = {
  groq: { default: 'llama-3.3-70b-versatile', fast: 'llama-3.1-8b-instant' },
  'opencode-zen': { default: 'big-pickle', free: 'minimax-m2.5-free' },
  gemini: { default: 'gemini-1.5-flash', vision: 'gemini-1.5-pro' },
};

const FALLBACK_ORDER = ['groq', 'opencode-zen', 'gemini'];

const COMPLETE_SIGNAL = '__RESEARCH_COMPLETE__';

function getApiKey(provider: string): string | undefined {
  switch (provider) {
    case 'groq': return process.env.GROQ_API_KEY;
    case 'opencode-zen': return process.env.OPENCODE_API_KEY;
    case 'gemini': return process.env.GEMINI_API_KEY;
    default: return undefined;
  }
}

async function callWithFallback(
  prompt: string,
  preferredProvider?: string,
  timeout?: number
): Promise<{ content: string; provider: string; model: string }> {
  const { provider: selectedProvider, model: selectedModel } = selectProvider(prompt);
  const providers = preferredProvider
    ? [preferredProvider, ...getFallbackProviders(preferredProvider)]
    : FALLBACK_ORDER;

  const errors: string[] = [];

  for (const currentProvider of providers) {
    const apiKey = getApiKey(currentProvider);
    if (!apiKey) {
      errors.push(`${currentProvider}: no API key`);
      continue;
    }

    const model = selectedProvider === currentProvider
      ? selectedModel
      : PROVIDER_MODEL_MAP[currentProvider]?.default || 'default';

    try {
      const controller = new AbortController();
      const timer = timeout ? setTimeout(() => controller.abort(), timeout) : null;

      const result = await callProviderAPI(currentProvider, model, prompt, apiKey);

      if (timer) clearTimeout(timer);

      return {
        content: result.content,
        provider: currentProvider,
        model: result.model,
      };
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error(`Timeout after ${timeout}ms`);
      }
      const errorInfo = `${currentProvider}: ${error.status || 'error'} - ${(error.message || '').substring(0, 50)}`;
      errors.push(errorInfo);

      if (!isRetryableError(error.status)) break;

      continue;
    }
  }

  throw new Error(`All providers failed: ${errors.join('; ')}`);
}

export async function executeResearchTask(
  _sessionId: number,
  prompt: string,
  options: HermesOptions = {}
): Promise<HermesResult> {
  const { url, provider, timeout } = options;

  let fullPrompt = prompt;
  if (url) {
    fullPrompt = `Исследуй сайт ${url}. Задача: ${prompt}. Используй браузер для навигации и сбора данных. Верни структурированный результат в формате JSON.`;
  }

  try {
    const result = await callWithFallback(fullPrompt, provider, timeout);
    return {
      success: true,
      output: result.content,
      provider: result.provider,
      model: result.model,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Unknown error',
      provider: provider || 'unknown',
    };
  }
}

export function executeResearchTaskStream(
  _sessionId: number,
  prompt: string,
  options: HermesOptions = {},
  onData: (data: string) => void,
  onError: (error: string) => void
): { kill: () => void } {
  const { url, provider: preferredProvider, timeout } = options;

  let fullPrompt = prompt;
  if (url) {
    fullPrompt = `Исследуй сайт ${url}. Задача: ${prompt}. Используй браузер для навигации. Верни структурированный результат.`;
  }

  const { provider: selectedProvider } = selectProvider(fullPrompt);
  const providerToUse = preferredProvider || selectedProvider;
  const apiKey = getApiKey(providerToUse);
  const baseUrl = PROVIDER_ENDPOINTS[providerToUse];

  let aborted = false;

  if (!apiKey || !baseUrl) {
    onError(`Provider ${providerToUse} not configured`);
    return { kill: () => { aborted = true; } };
  }

  const controller = new AbortController();

  void (async () => {
    const providers = preferredProvider
      ? [preferredProvider, ...getFallbackProviders(preferredProvider)]
      : FALLBACK_ORDER;

    const errors: string[] = [];

    for (const currentProvider of providers) {
      if (aborted) return;

      const key = getApiKey(currentProvider);
      const url = PROVIDER_ENDPOINTS[currentProvider];
      const model = PROVIDER_MODEL_MAP[currentProvider]?.default || 'big-pickle';

      if (!key || !url) {
        errors.push(`${currentProvider}: not configured`);
        continue;
      }

      let timer: NodeJS.Timeout | null = null;
      if (timeout) {
        timer = setTimeout(() => {
          controller.abort();
          onError(`Timeout after ${timeout}ms`);
        }, timeout);
      }

      try {
        const response = await fetch(`${url}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: fullPrompt }],
            temperature: 0.7,
            max_tokens: 4096,
            stream: true,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorText = await response.text();
          if (timer) clearTimeout(timer);
          const errMsg = `${currentProvider} error ${response.status}: ${errorText.substring(0, 100)}`;

          if (isRetryableError(response.status)) {
            errors.push(errMsg);
            onError(`[FALLBACK] ${errMsg}`);
            continue;
          }
          errors.push(errMsg);
          onError(errMsg);
          break;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          if (timer) clearTimeout(timer);
          errors.push(`${currentProvider}: no response body`);
          continue;
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let fullContent = '';

        while (true) {
          if (aborted) {
            reader.cancel();
            return;
          }

          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data:')) continue;

            const data = trimmed.slice(5).trim();
            if (!data || data === '[DONE]') continue;

            try {
              const chunk = JSON.parse(data);
              const content = chunk.choices?.[0]?.delta?.content || '';
              if (content) {
                fullContent += content;
                onData(content);
              }
            } catch {
              // skip malformed JSON tokens
            }
          }
        }

        if (timer) clearTimeout(timer);

        // Success — signal completion
        onData(COMPLETE_SIGNAL);
        return;

      } catch (error: any) {
        if (aborted || error.name === 'AbortError') return;
        if (timer) clearTimeout(timer);

        const errMsg = `${currentProvider}: ${error.message || 'unknown'}`;

        if (isRetryableError(error.status)) {
          errors.push(errMsg);
          onError(`[FALLBACK] ${errMsg}`);
          continue;
        }

        errors.push(errMsg);
        onError(errMsg);
        break;
      }
    }

    // All streaming attempts failed — try non-streaming as last resort
    if (!aborted && errors.length > 0) {
      onError(`Streaming failed, trying non-streaming fallback...`);

      try {
        const fallbackProviders = preferredProvider
          ? [preferredProvider, ...getFallbackProviders(preferredProvider)]
          : FALLBACK_ORDER;

        for (const fp of fallbackProviders) {
          const fKey = getApiKey(fp);
          if (!fKey) continue;

          try {
            const result = await callProviderAPI(
              fp,
              PROVIDER_MODEL_MAP[fp]?.default || 'default',
              fullPrompt,
              fKey,
            );
            onData(result.content);
            onData(COMPLETE_SIGNAL);
            return;
          } catch (fe: any) {
            if (!isRetryableError(fe.status)) break;
          }
        }

        onError(`All providers failed: ${errors.join('; ')}`);
      } catch (e: any) {
        onError(`Non-streaming fallback also failed: ${e.message}`);
      }
    }
  })();

  return {
    kill: () => {
      aborted = true;
      controller.abort();
    },
  };
}

export const __test__ = { COMPLETE_SIGNAL };
