export interface WebhookConfig {
  id: string;
  url: string;
  events: WebhookEvent[];
  enabled: boolean;
  secret?: string;
}

export type WebhookEvent = 
  | 'session.start' 
  | 'session.complete' 
  | 'session.error'
  | 'batch.complete'
  | 'scheduler.task';

export interface WebhookPayload {
  event: WebhookEvent;
  timestamp: number;
  data: any;
}

const webhooks: Map<string, WebhookConfig> = new Map();

export function createWebhook(
  url: string,
  events: WebhookEvent[],
  secret?: string
): string {
  const id = `wh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const config: WebhookConfig = {
    id,
    url,
    events,
    enabled: true,
    secret
  };
  
  webhooks.set(id, config);
  console.log(`[Webhook] Created webhook ${id} for ${url}`);
  
  return id;
}

export function getWebhooks(): WebhookConfig[] {
  return Array.from(webhooks.values());
}

export function deleteWebhook(id: string): boolean {
  return webhooks.delete(id);
}

export function toggleWebhook(id: string, enabled: boolean): boolean {
  const webhook = webhooks.get(id);
  if (webhook) {
    webhook.enabled = enabled;
    return true;
  }
  return false;
}

async function sendWebhook(config: WebhookConfig, payload: WebhookPayload): Promise<boolean> {
  if (!config.enabled) return false;
  
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    
    if (config.secret) {
      const signature = await createHmacSignature(JSON.stringify(payload), config.secret);
      headers['X-Webhook-Signature'] = signature;
    }
    
    const response = await fetch(config.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    
    console.log(`[Webhook] ${config.id} sent, status: ${response.status}`);
    return response.ok;
  } catch (error) {
    console.error(`[Webhook] ${config.id} failed:`, error);
    return false;
  }
}

async function createHmacSignature(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(data);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function notifyEvent(event: WebhookEvent, data: any): Promise<void> {
  const payload: WebhookPayload = {
    event,
    timestamp: Date.now(),
    data
  };
  
  const promises = Array.from(webhooks.values())
    .filter(w => w.events.includes(event))
    .map(w => sendWebhook(w, payload));
  
  await Promise.allSettled(promises);
}

export function getWebhookStatus(): { total: number; enabled: number } {
  const all = Array.from(webhooks.values());
  return {
    total: all.length,
    enabled: all.filter(w => w.enabled).length
  };
}