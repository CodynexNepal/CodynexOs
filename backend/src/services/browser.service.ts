import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { socketServer } from '../socket/socket.server';
import { logger } from '../utils/logger.util';

export interface BrowserSessionState {
  sessionId: string;
  url: string;
  title: string;
  status: 'IDLE' | 'NAVIGATING' | 'INTERACTING' | 'PAUSED' | 'CLOSED';
  humanTakeover: boolean;
  lastScreenshot?: string; // base64
  consoleLogs: Array<{ type: string; text: string; timestamp: string }>;
  actionHistory: Array<{ action: string; target?: string; timestamp: string }>;
}

export class BrowserService {
  private browser: Browser | null = null;
  private contexts: Map<string, BrowserContext> = new Map();
  private pages: Map<string, Page> = new Map();
  private states: Map<string, BrowserSessionState> = new Map();
  private isInitializing = false;

  private async ensureBrowser(): Promise<Browser> {
    if (this.browser && this.browser.isConnected()) {
      return this.browser;
    }

    if (this.isInitializing) {
      while (this.isInitializing) {
        await new Promise((r) => setTimeout(r, 100));
      }
      if (this.browser && this.browser.isConnected()) return this.browser;
    }

    this.isInitializing = true;
    try {
      // Prioritize installed Chrome, fallback to Edge or default chromium
      try {
        this.browser = await chromium.launch({
          channel: 'chrome',
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        });
      } catch {
        try {
          this.browser = await chromium.launch({
            channel: 'msedge',
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
          });
        } catch {
          this.browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
          });
        }
      }

      logger.info('Playwright autonomous browser instance initialized successfully');
      return this.browser;
    } finally {
      this.isInitializing = false;
    }
  }

  async getOrCreateSession(sessionId: string): Promise<{ context: BrowserContext; page: Page; state: BrowserSessionState }> {
    const browser = await this.ensureBrowser();

    if (!this.contexts.has(sessionId)) {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 CodyNex-OS/2.0',
      });
      const page = await context.newPage();

      const state: BrowserSessionState = {
        sessionId,
        url: 'about:blank',
        title: 'New Blank Session',
        status: 'IDLE',
        humanTakeover: false,
        consoleLogs: [],
        actionHistory: [],
      };

      // Listen for browser console events
      page.on('console', (msg) => {
        const item = {
          type: msg.type(),
          text: msg.text(),
          timestamp: new Date().toISOString(),
        };
        state.consoleLogs.push(item);
        if (state.consoleLogs.length > 100) state.consoleLogs.shift();
      });

      page.on('pageerror', (err) => {
        socketServer.emit('browser:error', {
          sessionId,
          error: err.message,
          url: page.url(),
          timestamp: new Date().toISOString(),
        });
      });

      this.contexts.set(sessionId, context);
      this.pages.set(sessionId, page);
      this.states.set(sessionId, state);
    }

    return {
      context: this.contexts.get(sessionId)!,
      page: this.pages.get(sessionId)!,
      state: this.states.get(sessionId)!,
    };
  }

  async navigate(sessionId: string, url: string): Promise<BrowserSessionState> {
    const { page, state } = await this.getOrCreateSession(sessionId);
    state.status = 'NAVIGATING';

    let cleanUrl = (url || '').trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      const isLocal = /^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?(\/.*)?$/i.test(cleanUrl);
      cleanUrl = isLocal ? `http://${cleanUrl}` : `https://${cleanUrl}`;
    }

    // Auto-downgrade local addresses from https to http to avoid ERR_SSL_PROTOCOL_ERROR
    if (/^https:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?(\/.*)?$/i.test(cleanUrl)) {
      cleanUrl = cleanUrl.replace(/^https:\/\//i, 'http://');
    }

    try {
      // Use 'commit' first to confirm response headers/document start, then soft-wait for domcontentloaded
      await page.goto(cleanUrl, { waitUntil: 'commit', timeout: 30000 });
      await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
      state.url = page.url();
      state.title = await page.title().catch(() => '');
      state.status = 'IDLE';

      const screenshot = await this.captureScreenshot(page, sessionId);
      state.lastScreenshot = screenshot;

      state.actionHistory.push({
        action: 'NAVIGATE',
        target: cleanUrl,
        timestamp: new Date().toISOString(),
      });

      socketServer.emit('browser:navigation', {
        sessionId,
        url: state.url,
        title: state.title,
        screenshot,
        timestamp: new Date().toISOString(),
      });

      return state;
    } catch (err: any) {
      state.status = 'IDLE';

      // If SSL protocol error happened on an HTTPS URL, attempt automatic HTTP downgrade
      if (err?.message?.includes('ERR_SSL_PROTOCOL_ERROR') && cleanUrl.startsWith('https://')) {
        const httpFallback = cleanUrl.replace(/^https:\/\//i, 'http://');
        try {
          await page.goto(httpFallback, { waitUntil: 'commit', timeout: 30000 });
          await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
          state.url = page.url();
          state.title = await page.title().catch(() => '');
          const screenshot = await this.captureScreenshot(page, sessionId);
          state.lastScreenshot = screenshot;
          state.actionHistory.push({
            action: 'NAVIGATE',
            target: httpFallback,
            timestamp: new Date().toISOString(),
          });
          socketServer.emit('browser:navigation', {
            sessionId,
            url: state.url,
            title: state.title,
            screenshot,
            timestamp: new Date().toISOString(),
          });
          return state;
        } catch {
          // fallback failed, continue to standard handling below
        }
      }

      // Gracefully handle net::ERR_ABORTED if page has already navigated to target or redirected
      if (err?.message?.includes('ERR_ABORTED')) {
        const curUrl = page.url();
        if (curUrl && curUrl !== 'about:blank') {
          state.url = curUrl;
          state.title = await page.title().catch(() => '');
          const screenshot = await this.captureScreenshot(page, sessionId);
          state.lastScreenshot = screenshot;
          socketServer.emit('browser:navigation', {
            sessionId,
            url: state.url,
            title: state.title,
            screenshot,
            timestamp: new Date().toISOString(),
          });
          return state;
        }
      }

      socketServer.emit('browser:error', {
        sessionId,
        error: err?.message || 'Navigation failed',
        url: cleanUrl,
        timestamp: new Date().toISOString(),
      });
      throw err;
    }
  }

  async click(sessionId: string, selector: string): Promise<BrowserSessionState> {
    const { page, state } = await this.getOrCreateSession(sessionId);
    if (state.humanTakeover) {
      throw new Error('Action blocked: Browser session is currently under human control.');
    }

    state.status = 'INTERACTING';
    await page.click(selector, { timeout: 10000 });
    await page.waitForTimeout(500);

    state.url = page.url();
    state.title = await page.title();
    state.status = 'IDLE';

    const screenshot = await this.captureScreenshot(page, sessionId);
    state.lastScreenshot = screenshot;

    state.actionHistory.push({
      action: 'CLICK',
      target: selector,
      timestamp: new Date().toISOString(),
    });

    socketServer.emit('browser:action', {
      sessionId,
      action: 'CLICK',
      selector,
      url: state.url,
      screenshot,
      timestamp: new Date().toISOString(),
    });

    return state;
  }

  async type(sessionId: string, selector: string, text: string): Promise<BrowserSessionState> {
    const { page, state } = await this.getOrCreateSession(sessionId);
    if (state.humanTakeover) {
      throw new Error('Action blocked: Browser session is currently under human control.');
    }

    state.status = 'INTERACTING';
    await page.fill(selector, text, { timeout: 10000 });

    state.status = 'IDLE';
    const screenshot = await this.captureScreenshot(page, sessionId);
    state.lastScreenshot = screenshot;

    state.actionHistory.push({
      action: 'TYPE',
      target: selector,
      timestamp: new Date().toISOString(),
    });

    socketServer.emit('browser:action', {
      sessionId,
      action: 'TYPE',
      selector,
      url: state.url,
      screenshot,
      timestamp: new Date().toISOString(),
    });

    return state;
  }

  async scroll(sessionId: string, direction: 'UP' | 'DOWN', amount = 400): Promise<BrowserSessionState> {
    const { page, state } = await this.getOrCreateSession(sessionId);
    state.status = 'INTERACTING';

    const delta = direction === 'DOWN' ? amount : -amount;
    await page.mouse.wheel(0, delta);
    await page.waitForTimeout(300);

    state.status = 'IDLE';
    const screenshot = await this.captureScreenshot(page, sessionId);
    state.lastScreenshot = screenshot;

    socketServer.emit('browser:action', {
      sessionId,
      action: 'SCROLL',
      direction,
      amount,
      url: state.url,
      screenshot,
      timestamp: new Date().toISOString(),
    });

    return state;
  }

  async extractContent(sessionId: string): Promise<{ url: string; title: string; text: string; html: string }> {
    const { page } = await this.getOrCreateSession(sessionId);
    const url = page.url();
    const title = await page.title();
    const text = await page.evaluate(() => document.body?.innerText || '');
    const html = await page.content();
    return { url, title, text: text.slice(0, 50000), html: html.slice(0, 100000) };
  }

  async setHumanTakeover(sessionId: string, enabled: boolean): Promise<BrowserSessionState> {
    const { state } = await this.getOrCreateSession(sessionId);
    state.humanTakeover = enabled;
    state.status = enabled ? 'PAUSED' : 'IDLE';

    socketServer.emit('browser:action', {
      sessionId,
      action: enabled ? 'HUMAN_TAKEOVER_START' : 'HUMAN_TAKEOVER_END',
      url: state.url,
      timestamp: new Date().toISOString(),
    });

    return state;
  }

  async getSessionState(sessionId: string): Promise<BrowserSessionState | null> {
    return this.states.get(sessionId) || null;
  }

  async closeSession(sessionId: string): Promise<void> {
    const context = this.contexts.get(sessionId);
    if (context) {
      await context.close().catch(() => {});
      this.contexts.delete(sessionId);
      this.pages.delete(sessionId);
      this.states.delete(sessionId);
    }
  }

  private async captureScreenshot(page: Page, sessionId: string): Promise<string> {
    try {
      const buffer = await page.screenshot({ type: 'jpeg', quality: 65 });
      const base64 = buffer.toString('base64');
      socketServer.emit('browser:screenshot', {
        sessionId,
        screenshot: base64,
        url: page.url(),
        timestamp: new Date().toISOString(),
      });
      return base64;
    } catch {
      return '';
    }
  }
}

export const browserService = new BrowserService();
