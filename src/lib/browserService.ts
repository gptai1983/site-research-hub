import { chromium, Browser, Page, BrowserContext } from 'playwright';

export interface BrowserOptions {
  headless?: boolean;
  timeout?: number;
  userAgent?: string;
}

export interface LoginCredentials {
  url: string;
  username: string;
  password: string;
  selector?: string;
}

export interface WaitOptions {
  timeout?: number;
  state?: 'visible' | 'hidden' | 'attached';
}

let browserInstance: Browser | null = null;
const contextCache: Map<string, BrowserContext> = new Map();

export async function getBrowser(options: BrowserOptions = {}): Promise<Browser> {
  if (browserInstance?.isConnected()) {
    return browserInstance;
  }
  
  browserInstance = await chromium.launch({ 
    headless: options.headless ?? true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  
  return browserInstance;
}

export async function closeBrowser(): Promise<void> {
  contextCache.clear();
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

export async function getContext(profileId: string, cookies?: any[]): Promise<BrowserContext> {
  const cacheKey = profileId;
  
  if (contextCache.has(cacheKey)) {
    const ctx = contextCache.get(cacheKey)!;
    if (ctx.pages().length > 0) {
      return ctx;
    }
  }
  
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  });
  
  if (cookies?.length) {
    await context.addCookies(cookies);
  }
  
  contextCache.set(cacheKey, context);
  return context;
}

export async function navigateToUrl(url: string, options: BrowserOptions = {}): Promise<Page> {
  const browser = await getBrowser(options);
  const context = await browser.newContext();
  const page = await context.newPage();
  
  await page.goto(url, { timeout: options.timeout || 30000, waitUntil: 'domcontentloaded' });
  return page;
}

export async function loginToSite(credentials: LoginCredentials, options: BrowserOptions = {}): Promise<Page> {
  const browser = await getBrowser(options);
  const context = await browser.newContext();
  const page = await context.newPage();
  
  await page.goto(credentials.url, { timeout: options.timeout || 30000 });
  
  await page.waitForLoadState('networkidle');
  
  await page.fill('input[name="username"], input[type="email"], input#username, input#email', credentials.username);
  await page.fill('input[name="password"], input[type="password"], input#password', credentials.password);
  
  await Promise.all([
    page.waitForNavigation({ timeout: options.timeout || 30000 }),
    page.click('button[type="submit"], input[type="submit"], button:has-text("Login"), button:has-text("Sign in")')
  ]);
  
  return page;
}

export async function waitForElement(page: Page, selector: string, options: WaitOptions = {}): Promise<boolean> {
  try {
    await page.waitForSelector(selector, {
      timeout: options.timeout || 10000,
      state: options.state || 'visible'
    });
    return true;
  } catch {
    return false;
  }
}

export async function fillAndSubmit(page: Page, fields: Record<string, string>): Promise<boolean> {
  for (const [selector, value] of Object.entries(fields)) {
    await page.fill(selector, value);
  }
  
  const submitButton = await page.$('button[type="submit"], input[type="submit"]');
  if (submitButton) {
    await submitButton.click();
    return true;
  }
  return false;
}

export async function scrapePage(page: Page): Promise<{
  title: string;
  url: string;
  content: string;
  links: string[];
  images: string[];
}> {
  const title = await page.title();
  const url = page.url();
  const content = await page.textContent('body') || '';
  
  const { links, images } = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a'))
      .map(a => a.href)
      .filter(href => href.startsWith('http'));
    
    const images = Array.from(document.querySelectorAll('img'))
      .map(img => img.src)
      .filter(src => src.startsWith('http'));
    
    return { links, images };
  });
  
  return { title, url, content, links, images };
}

export async function takeScreenshot(page: Page, path?: string): Promise<Buffer> {
  return await page.screenshot({ 
    path, 
    fullPage: true,
    type: 'png'
  });
}

export async function takeElementScreenshot(page: Page, selector: string, path?: string): Promise<Buffer | null> {
  const element = await page.$(selector);
  if (!element) return null;
  
  return await element.screenshot({ 
    path, 
    type: 'png'
  });
}

export async function executeScript(page: Page, script: string): Promise<any> {
  return await page.evaluate(script);
}

export async function getPageHtml(page: Page): Promise<string> {
  return await page.content();
}

export async function clickAndWait(page: Page, selector: string, timeout: number = 30000): Promise<void> {
  await Promise.all([
    page.waitForNavigation({ timeout }),
    page.click(selector)
  ]);
}

export async function getCookies(page: Page): Promise<any[]> {
  return await page.context().cookies();
}

export async function setCookies(context: BrowserContext, cookies: any[]): Promise<void> {
  await context.addCookies(cookies);
}