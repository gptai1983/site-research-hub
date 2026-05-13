#!/usr/bin/env npx tsx
import fetch from 'node-fetch';

const BASE_URL = process.env.API_URL || 'http://localhost:3000';
let authToken: string | null = null;

function authHeaders(): Record<string, string> {
  return authToken ? { 'Authorization': `Bearer ${authToken}` } : {};
}

async function waitForServer(url: string, timeoutMs = 15000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) return;
    } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('Server did not start in time');
}

async function query(path: string, input?: any) {
  const start = Date.now();
  let url = `${BASE_URL}${path}`;
  if (input !== undefined) url += `?input=${encodeURIComponent(JSON.stringify(input))}`;
  try {
    const res = await fetch(url, { headers: { ...authHeaders() } });
    const body = await res.text();
    let data: any = null;
    try { data = JSON.parse(body); } catch { data = body; }
    const duration = Date.now() - start;
    if (data?.result?.data !== undefined) data = data.result.data;
    const ok = res.status < 300;
    console.log(`  ${ok ? '✓' : '✗'} [${res.status}] GET ${path} (${duration}ms)`);
    if (!ok) console.log(`    ${data?.error?.message || data?.error || JSON.stringify(data).substring(0, 150)}`);
    return { status: res.status, data, duration };
  } catch (e: any) {
    console.error(`  ✗ [ERROR] GET ${path}: ${e.message}`);
    return { status: 0, error: e.message, duration: Date.now() - start };
  }
}

async function mutate(path: string, input?: any) {
  const start = Date.now();
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: input ? JSON.stringify(input) : undefined
    });
    const body = await res.text();
    let data: any = null;
    try { data = JSON.parse(body); } catch { data = body; }
    const duration = Date.now() - start;
    if (data?.result?.data !== undefined) data = data.result.data;
    const ok = res.status < 300;
    console.log(`  ${ok ? '✓' : '✗'} [${res.status}] POST ${path} (${duration}ms)`);
    if (!ok) console.log(`    ${data?.error?.message || data?.error || JSON.stringify(data).substring(0, 150)}`);
    return { status: res.status, data, duration };
  } catch (e: any) {
    console.error(`  ✗ [ERROR] POST ${path}: ${e.message}`);
    return { status: 0, error: e.message, duration: Date.now() - start };
  }
}

async function runTests() {
  console.log('=== Hermes Site Research Hub - API Tests ===\n');

  let passed = 0;
  let failed = 0;
  const check = (name: string, ok: boolean) => {
    console.log(`  ${ok ? '✓' : '✗'} ${name}`);
    if (ok) passed++; else failed++;
  };

  // Auth setup
  console.log('--- Auth Setup ---');
  let setupRes = await mutate('/trpc/auth.setupFirstUser', { email: 'test@hermes.dev', password: 'testpass123' });
  if (setupRes.status !== 200) {
    setupRes = await mutate('/trpc/auth.login', { email: 'test@hermes.dev', password: 'testpass123' });
  }
  check('POST auth.setupFirstUser or login succeeds', setupRes.status === 200);
  if (setupRes.status === 200) {
    authToken = setupRes.data?.token;
    check('auth returns token', typeof authToken === 'string' && authToken.length > 0);
    const role = setupRes.data?.user?.role;
    check('auth returns user role', role === 'admin' || role === 'user');
    const meRes = await query('/trpc/auth.me');
    check('query auth.me returns user', meRes.status === 200 && meRes.data?.email === 'test@hermes.dev');
  }

  // Health
  console.log('\n--- Health Checks ---');
  check('GET / returns 200', (await query('/')).status === 200);
  check('GET /health returns 200', (await query('/health')).status === 200);
  check('GET /status returns 200', (await query('/status')).status === 200);
  check('GET /rate-limit-stats returns 200', (await query('/rate-limit-stats')).status === 200);

  // Profiles
  console.log('\n--- Profiles API ---');
  const p1 = await mutate('/trpc/profiles.create', {
    name: 'Test Profile', url: 'https://example.com'
  });
  check('POST profiles.create returns 200', p1.status === 200);
  const profileId = p1.data?.id;
  check('profiles.create returns numeric id', typeof profileId === 'number' && profileId > 0);
  if (profileId && profileId > 0) {
    check('query profiles.list returns 200', (await query('/trpc/profiles.list')).status === 200);
    check('query profiles.get returns 200', (await query('/trpc/profiles.get', { id: profileId })).status === 200);

    // Sessions
    console.log('\n--- Sessions API ---');
    const s = await mutate('/trpc/sessions.create', {
      profileId, prompt: 'Get page title', url: 'https://example.com'
    });
    check('POST sessions.create returns 200', s.status === 200);
    const sessionId = s.data?.sessionId;
    if (sessionId) check('sessions.create returns sessionId', sessionId > 0);

    check('query sessions.list returns 200', (await query('/trpc/sessions.list', { profileId })).status === 200);
    check('query sessions.get returns 200', (await query('/trpc/sessions.get', { id: sessionId })).status === 200);

    // Metrics (query)
    console.log('\n--- Metrics API ---');
    check('query metrics.get returns 200', (await query('/trpc/metrics.get')).status === 200);

    // Export (query)
    console.log('\n--- Export API ---');
    check('query export.sessions returns 200', (await query('/trpc/export.sessions', { format: 'json' })).status === 200);

    // Webhooks (two queries)
    console.log('\n--- Webhooks API ---');
    check('query webhooks.list returns 200', (await query('/trpc/webhooks.list')).status === 200);
    check('query webhooks.status returns 200', (await query('/trpc/webhooks.status')).status === 200);

    // Scheduler (query + query)
    console.log('\n--- Scheduler API ---');
    check('query scheduler.list returns 200', (await query('/trpc/scheduler.list')).status === 200);
    check('query scheduler.status returns 200', (await query('/trpc/scheduler.status')).status === 200);

    // Learning (query)
    console.log('\n--- Learning API ---');
    check('query learning.stats returns 200', (await query('/trpc/learning.stats')).status === 200);
    check('query learning.providerStats returns 200', (await query('/trpc/learning.providerStats')).status === 200);
    check('query learning.getBest returns 200', (await query('/trpc/learning.getBest', { prompt: 'напиши код' })).status === 200);
    check('query learning.optimize returns 200', (await query('/trpc/learning.optimize', { prompt: 'получи данные' })).status === 200);

    // Updater (query)
    console.log('\n--- Updater API ---');
    check('query updater.check returns 200', (await query('/trpc/updater.check')).status === 200);
    check('query updater.status returns 200', (await query('/trpc/updater.status')).status === 200);

    // Browser (mutation)
    console.log('\n--- Browser API ---');
    const br = await mutate('/trpc/browser.navigate', { url: 'https://example.com' });
    if (br.status === 200) check('POST browser.navigate works', true);
    else console.log(`  ⚠ browser.navigate returned ${br.status} (Playwright may not be installed)`);

    // Cleanup
    console.log('\n--- Cleanup ---');
    check('POST profiles.delete succeeds', (await mutate('/trpc/profiles.delete', { id: profileId })).status === 200);
  } else {
    console.log('  ⚠ Skipping dependent tests since profile creation failed');
  }

  console.log('\n=== Results ===');
  console.log(`  Passed: ${passed}, Failed: ${failed}, Total: ${passed + failed}`);
  return failed > 0 ? 1 : 0;
}

async function main() {
  try {
    await waitForServer(BASE_URL);
    console.log('Server is ready!\n');
    const exitCode = await runTests();
    return exitCode;
  } catch (e: any) {
    console.error(`Failed: ${e.message}`);
    return 1;
  }
}

main().then(process.exit);
