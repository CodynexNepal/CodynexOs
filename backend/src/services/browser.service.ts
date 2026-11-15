import { chromium, Browser, BrowserContext, Page, CDPSession } from 'playwright';
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
  private cdpSessions: Map<string, CDPSession> = new Map();
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
        viewport: { width: 1440, height: 900 },
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

      // Attach Chrome DevTools Protocol (CDP) Screencast for 60fps mobile-smooth streaming
      try {
        const cdp = await context.newCDPSession(page);
        this.cdpSessions.set(sessionId, cdp);

        await cdp.send('Page.startScreencast', {
          format: 'jpeg',
          quality: 60,
          maxWidth: 1280,
          maxHeight: 800,
          everyNthFrame: 1,
        });

        cdp.on('Page.screencastFrame', async (params: { data: string; sessionId: number }) => {
          try {
            await cdp.send('Page.screencastFrameAck', { sessionId: params.sessionId });
          } catch (error) {
            logger.debug('Failed to acknowledge screencast frame', {
              error: error instanceof Error ? error.message : String(error),
            });
          }
          state.lastScreenshot = params.data;
          socketServer.emit('browser:screenshot', {
            sessionId,
            screenshot: params.data,
            url: page.url(),
            timestamp: new Date().toISOString(),
          });
        });
      } catch (err: any) {
        logger.warn('CDP 60fps screencast attachment warning, continuing with frame capture', {
          error: err?.message,
        });
      }
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
      // Fast commit navigation
      await page.goto(cleanUrl, { waitUntil: 'commit', timeout: 20000 });
      state.url = page.url();
      state.title = await page.title().catch(() => '');

      // Emit preliminary frame immediately for instant visual feedback
      void this.captureScreenshot(page, sessionId).then((shot) => {
        if (shot) state.lastScreenshot = shot;
      });

      // Rapid DOM wait threshold (3s max instead of 15s)
      await page.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
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

  private async resolveLocator(page: Page, selector: string): Promise<import('playwright').Locator | null> {
    const sel = (selector || '').trim();
    if (!sel) return null;

    // 1. Direct selector match
    try {
      const loc = page.locator(sel);
      if ((await loc.count()) > 0) return loc.first();
    } catch {
      // Ignore invalid selectors and continue with resilient fallbacks.
    }

    // 2. Search bar resilience (WhatsApp Web, Google, general apps)
    if (/search|search-bar|find|query|contact/i.test(sel)) {
      const searchSelectors = [
        'div[contenteditable="true"][role="textbox"]',
        'div[contenteditable="true"][data-tab="3"]',
        'div[contenteditable="true"]',
        '[aria-label*="Search" i]',
        '[placeholder*="Search" i]',
        '[title*="Search" i]',
        'input[type="search"]',
        'input[type="text"][name*="search" i]',
        'input[type="text"]',
      ];
      for (const candidate of searchSelectors) {
        try {
          const loc = page.locator(candidate);
          if ((await loc.count()) > 0) return loc.first();
        } catch {
          // Ignore selector lookup failures and try the next candidate.
        }
      }
    }

    // 3. Message / chat input resilience (WhatsApp Web chat input)
    if (/message|chat|reply|type a message|send/i.test(sel)) {
      const msgSelectors = [
        'footer div[contenteditable="true"][role="textbox"]',
        'div[contenteditable="true"][data-tab="10"]',
        'div[contenteditable="true"][data-tab="6"]',
        'div[contenteditable="true"][role="textbox"]',
        'footer textarea',
        'footer input',
      ];
      for (const candidate of msgSelectors) {
        try {
          const loc = page.locator(candidate);
          if ((await loc.count()) > 0) return loc.first();
        } catch {
          // Ignore selector lookup failures and continue trying other candidates.
        }
      }
    }

    // 4. Text and attribute matches for names/contacts
    try {
      const titleMatch = page.locator(`span[title*="${sel}" i]`);
      if ((await titleMatch.count()) > 0) return titleMatch.first();
    } catch {
      // Ignore selector lookup failures and continue with fallback matches.
    }

    try {
      const textMatch = page.locator(`text="${sel}"`);
      if ((await textMatch.count()) > 0) return textMatch.first();
    } catch {
      // Ignore selector lookup failures and continue with fallback matches.
    }

    try {
      const roleBtn = page.getByRole('button', { name: sel });
      if ((await roleBtn.count()) > 0) return roleBtn.first();
    } catch {
      // Ignore selector lookup failures and continue with fallback matches.
    }

    try {
      const byText = page.getByText(sel, { exact: false });
      if ((await byText.count()) > 0) return byText.first();
    } catch {
      // Ignore selector lookup failures and continue with fallback matches.
    }

    return null;
  }

  async click(sessionId: string, selector: string): Promise<BrowserSessionState> {
    const { page, state } = await this.getOrCreateSession(sessionId);
    if (state.humanTakeover) {
      throw new Error('Action blocked: Browser session is currently under human control.');
    }

    state.status = 'INTERACTING';
    const loc = await this.resolveLocator(page, selector);
    if (loc) {
      await loc.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => {});
      await loc.click({ timeout: 2500 });
    } else {
      try {
        await page.click(selector, { timeout: 2500 });
      } catch (clickErr: any) {
        const fuzzy = page
          .locator(`button:has-text("${selector}"), a:has-text("${selector}"), [aria-label*="${selector}" i], text="${selector}"`)
          .first();
        if ((await fuzzy.count()) > 0) {
          await fuzzy.click({ timeout: 2000 });
        } else {
          throw new Error(
            `Element "${selector}" not found on page within fast timeout. Extract page state with browser_extract to locate exact elements.`,
            { cause: clickErr },
          );
        }
      }
    }
    await page.waitForTimeout(50);

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

  async type(
    sessionId: string,
    selector: string,
    text: string,
    pressEnter = false,
  ): Promise<BrowserSessionState> {
    const { page, state } = await this.getOrCreateSession(sessionId);
    if (state.humanTakeover) {
      throw new Error('Action blocked: Browser session is currently under human control.');
    }

    state.status = 'INTERACTING';
    const loc = await this.resolveLocator(page, selector);
    let filled = false;

    if (loc) {
      try {
        await loc.click({ timeout: 1500 }).catch(() => {});
        const isContentEditable = await loc
          .evaluate((el) => el.getAttribute('contenteditable') === 'true')
          .catch(() => false);
        if (isContentEditable) {
          await page.keyboard.type(text, { delay: 5 });
          filled = true;
        } else {
          await loc.fill(text, { timeout: 2000 });
          filled = true;
        }
      } catch {
        try {
          await loc.click({ timeout: 1000 }).catch(() => {});
          await page.keyboard.type(text, { delay: 5 });
          filled = true;
        } catch {
          // Ignore fallback typing errors.
        }
      }
    }

    if (!filled) {
      try {
        await page.fill(selector, text, { timeout: 2000 });
      } catch {
        await page.click(selector, { timeout: 1500 }).catch(() => {});
        await page.keyboard.type(text, { delay: 5 });
      }
    }

    if (pressEnter) {
      await page.waitForTimeout(50);
      await page.keyboard.press('Enter');
    }

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

  async extractContent(sessionId: string): Promise<{
    url: string;
    title: string;
    text: string;
    html: string;
    interactiveElements?: Array<{
      tag: string;
      role?: string;
      text?: string;
      placeholder?: string;
      ariaLabel?: string;
      title?: string;
      selector?: string;
    }>;
  }> {
    const { page } = await this.getOrCreateSession(sessionId);
    const url = page.url();
    const title = await page.title();
    const text = await page.evaluate(() => document.body?.innerText || '');
    const html = await page.content();

    const interactiveElements = await page
      .evaluate(() => {
        const candidates = Array.from(
          document.querySelectorAll(
            'button, a, input, textarea, div[contenteditable="true"], [role="button"], [role="textbox"], [role="link"], [data-tab]',
          ),
        );
        return candidates
          .slice(0, 35)
          .map((el) => {
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return null;
            const tag = el.tagName.toLowerCase();
            const role = el.getAttribute('role') || undefined;
            const placeholder = el.getAttribute('placeholder') || undefined;
            const ariaLabel = el.getAttribute('aria-label') || undefined;
            const title = el.getAttribute('title') || undefined;
            const textContent = (el.textContent || '').trim().slice(0, 60) || undefined;
            let selector = tag;
            if (ariaLabel) selector += `[aria-label="${ariaLabel}"]`;
            else if (title) selector += `[title="${title}"]`;
            else if (placeholder) selector += `[placeholder="${placeholder}"]`;
            else if (el.id) selector = `#${el.id}`;
            else if (el.getAttribute('data-tab')) selector += `[data-tab="${el.getAttribute('data-tab')}"]`;
            else if (textContent && (tag === 'button' || tag === 'a' || role === 'button')) selector = `${tag}:has-text("${textContent.replace(/"/g, '\\"')}")`;

            return {
              tag,
              role,
              placeholder,
              ariaLabel,
              title,
              text: textContent,
              selector,
            };
          })
          .filter(Boolean);
      })
      .catch(() => []);

    return {
      url,
      title,
      text: text.slice(0, 50000),
      html: html.slice(0, 100000),
      interactiveElements: interactiveElements as any,
    };
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

  async clickCoordinate(sessionId: string, x: number, y: number): Promise<void> {
    const { page } = await this.getOrCreateSession(sessionId);
    await page.mouse.click(x, y);
  }

  async mouseWheel(sessionId: string, deltaX: number, deltaY: number): Promise<void> {
    const { page } = await this.getOrCreateSession(sessionId);
    await page.mouse.wheel(deltaX, deltaY);
  }

  async keyPress(sessionId: string, key: string): Promise<void> {
    const { page } = await this.getOrCreateSession(sessionId);
    await page.keyboard.press(key);
  }

  async typeDirect(sessionId: string, text: string): Promise<void> {
    const { page } = await this.getOrCreateSession(sessionId);
    await page.keyboard.type(text);
  }

  async closeSession(sessionId: string): Promise<void> {
    const cdp = this.cdpSessions.get(sessionId);
    if (cdp) {
      await cdp.send('Page.stopScreencast').catch(() => {});
      await cdp.detach().catch(() => {});
      this.cdpSessions.delete(sessionId);
    }

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
