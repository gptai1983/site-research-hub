export interface AIProvider {
  name: string;
  type: 'openai_compatible';
  base_url: string;
  api_key: string;
  models: { name: string; context_window: number }[];
}

export interface RouterConfig {
  fallback_chain: { provider: string }[];
  rules: { if: string; use: string }[];
  default: { use: string };
}

export interface ProviderInfo {
  provider: string;
  model: string;
  reason?: string;
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

export function selectProvider(prompt: string): ProviderInfo {
  const lowerPrompt = prompt.toLowerCase();

  if (/код|python|js|code|script|generate|write.*code|функция|class/.test(lowerPrompt)) {
    return { provider: 'opencode-zen', model: 'big-pickle', reason: 'task_type:code' };
  }
  if (/картинка|скриншот|image|screenshot|vision|анализ.*изображение|ocr|фото|скрин/.test(lowerPrompt)) {
    return { provider: 'gemini', model: 'gemini-1.5-flash', reason: 'task_type:vision' };
  }
  return { provider: 'groq', model: 'llama-3.3-70b-versatile', reason: 'task_type:chat' };
}

export function getFallbackProviders(currentProvider: string): string[] {
  const idx = FALLBACK_ORDER.indexOf(currentProvider);
  if (idx === -1 || idx === FALLBACK_ORDER.length - 1) {
    return FALLBACK_ORDER;
  }
  return FALLBACK_ORDER.slice(idx + 1);
}

export function isRetryableError(status: number): boolean {
  return status === 429 || status >= 500;
}

export async function callProviderAPI(
  provider: string,
  model: string,
  prompt: string,
  apiKey: string
): Promise<{ content: string; usage?: any; model: string }> {
  const baseUrl = PROVIDER_ENDPOINTS[provider];
  if (!baseUrl) throw new Error(`Unknown provider: ${provider}`);

  console.log(`[AI Router] Calling ${provider}/${model}...`);

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.log(`[AI Router] ${provider} error: ${response.status} - ${errorText.substring(0, 100)}`);
    throw { 
      status: response.status, 
      message: errorText,
      provider 
    };
  }

  const data = await response.json();
  console.log(`[AI Router] ${provider} success`);
  
  return {
    content: data.choices?.[0]?.message?.content || '',
    usage: data.usage,
    model: data.model || model,
  };
}

export async function smartRequest(
  prompt: string,
  apiKeys: { groq?: string; 'opencode-zen'?: string; gemini?: string },
  preferredProvider?: string
): Promise<{ content: string; provider: string; model: string }> {
  const { provider: selectedProvider, model: selectedModel } = selectProvider(prompt);
  
  const providers = preferredProvider 
    ? [preferredProvider, ...getFallbackProviders(preferredProvider)]
    : FALLBACK_ORDER;

  const errors: string[] = [];

  for (const currentProvider of providers) {
    const apiKey = apiKeys[currentProvider as keyof typeof apiKeys];
    if (!apiKey) {
      errors.push(`${currentProvider}: no API key`);
      continue;
    }

    const model = selectedProvider === currentProvider 
      ? selectedModel 
      : PROVIDER_MODEL_MAP[currentProvider]?.default || 'default';

    try {
      const result = await callProviderAPI(currentProvider, model, prompt, apiKey);
      console.log(`[AI Router] Success with ${currentProvider}/${result.model}`);
      return { 
        content: result.content, 
        provider: currentProvider, 
        model: result.model 
      };
    } catch (error: any) {
      const errorInfo = `${currentProvider}: ${error.status || 'error'} - ${error.message?.substring(0, 50) || 'unknown'}`;
      errors.push(errorInfo);
      
      if (!isRetryableError(error.status)) {
        console.log(`[AI Router] Non-retryable error, stopping fallback`);
        break;
      }
      
      console.log(`[AI Router] Retryable error, trying next provider...`);
      continue;
    }
  }

  console.log(`[AI Router] All providers failed: ${errors.join(', ')}`);
  throw new Error(`All providers failed: ${errors.join('; ')}`);
}