const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');

/**
 * Crawls a website starting from a given URL
 * 
 * Strategy:
 * - BFS traversal with depth limiting
 * - Only internal links (same domain)
 * - Deduplication to prevent loops
 * - Respects maxPages and maxDepth constraints
 * - Optional Playwright rendering for SPA / auth flows
 */
async function crawlWebsite(startUrl, config, credentials) {
  const {
    maxDepth,
    maxPages,
    timeout,
    rendering = 'auto',
    delayMs = 250,
    maxRetries = 3,
    retryBaseMs = 500,
    retryMaxMs = 5000,
    authMode = 'auto',
    loginUrl = null,
    abortSignal = null,
    onLog = null
  } = config;
  
  const visited = new Set();
  const pages = [];
  const queue = [{ url: startUrl, depth: 0, referrer: null }];
  
  const baseDomain = new URL(startUrl).hostname;
  let browserContext = null;
  let usingPlaywright = false;

  while (queue.length > 0 && pages.length < maxPages) {
    const { url, depth, referrer } = queue.shift();
    const visitKey = normalizeForVisit(url);

    if (visited.has(visitKey) || depth > maxDepth) {
      continue;
    }

    visited.add(visitKey);

    try {
      throwIfAborted(abortSignal);
      log(onLog, `Crawling [depth=${depth}]: ${url}`);
      
      if (pages.length > 0 && delayMs > 0) {
        await sleep(delayMs, abortSignal);
      }

      let html = null;
      let renderUsed = 'static';

      if (shouldUsePlaywright(rendering, authMode, credentials)) {
        browserContext = browserContext || await createBrowserContext(credentials, authMode, loginUrl || startUrl, timeout);
        usingPlaywright = true;
        html = await fetchHtmlWithPlaywright(url, browserContext.context, timeout, maxRetries, abortSignal);
        renderUsed = 'playwright';
      } else {
        html = await fetchHtmlWithAxios(url, {
          timeout,
          maxRetries,
          retryBaseMs,
          retryMaxMs,
          credentials,
          authMode,
          abortSignal
        });

        if (rendering === 'auto' && needsPlaywright(html)) {
          browserContext = browserContext || await createBrowserContext(credentials, authMode, loginUrl || startUrl, timeout);
          usingPlaywright = true;
          html = await fetchHtmlWithPlaywright(url, browserContext.context, timeout, maxRetries, abortSignal);
          renderUsed = 'playwright';
        }
      }

      const $ = cheerio.load(html);

      // Extract page metadata
      const title = $('title').text().trim() || $('h1').first().text().trim() || 'Untitled';
      
      // Extract all links
      const links = [];
      $('a[href]').each((i, elem) => {
        const href = $(elem).attr('href');
        const text = $(elem).text().trim();
        const context = extractLinkContext($, elem);

        if (!href || isNonHttpLink(href)) return;

        try {
          const absoluteUrl = new URL(href, url).href;
          const resolvedUrl = resolveRedirector(absoluteUrl, url);
          if (!resolvedUrl) return;

          const linkDomain = new URL(resolvedUrl).hostname;

          // Only include internal links
          if (linkDomain === baseDomain) {
            const normalized = stripHash(resolvedUrl);
            const current = stripHash(url);
            if (normalized === current) return;

            links.push({
              href: resolvedUrl,
              text,
              context
            });
          }
        } catch (e) {
          // Invalid URL, skip
        }
      });

      pages.push({
        url,
        title,
        html,
        links,
        depth,
        referrer,
        rendering: renderUsed
      });

      // Add new links to queue
      if (depth < maxDepth) {
        links.forEach(link => {
          const nextKey = normalizeForVisit(link.href);
          if (!visited.has(nextKey)) {
            queue.push({
              url: link.href,
              depth: depth + 1,
              referrer: url
            });
          }
        });
      }

    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      log(onLog, `Failed to crawl ${url}: ${error.message}`);
    }
  }

  if (browserContext && usingPlaywright) {
    await closeBrowserContext(browserContext);
  }

  return pages;
}

function shouldUsePlaywright(rendering, authMode, credentials) {
  if (rendering === 'playwright') return true;
  if (['form', 'auto'].includes(authMode) && credentials?.username && credentials?.password) return true;
  return false;
}

function needsPlaywright(html) {
  if (!html) return false;
  const hasAppRoot = html.includes('id="__next"') || html.includes('id="root"');
  const linkCount = (html.match(/<a\s/gi) || []).length;
  return hasAppRoot && linkCount < 3;
}

async function fetchHtmlWithAxios(url, options) {
  const {
    timeout,
    maxRetries,
    retryBaseMs,
    retryMaxMs,
    credentials,
    authMode,
    abortSignal
  } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      throwIfAborted(abortSignal);
      const response = await axios.get(url, {
        timeout,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; FlowMapperBot/1.0)'
        },
        maxRedirects: 5,
        signal: abortSignal || undefined,
        auth: authMode === 'basic' && credentials?.username && credentials?.password ? {
          username: credentials.username,
          password: credentials.password
        } : undefined
      });
      return response.data;
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      const status = error.response?.status;
      if (!shouldRetry(status) || attempt === maxRetries) {
        throw error;
      }

      const retryAfter = Number(error.response?.headers?.['retry-after']);
      const wait = retryAfter
        ? Math.min(retryAfter * 1000, retryMaxMs)
        : Math.min(retryBaseMs * Math.pow(2, attempt), retryMaxMs);

      await sleep(wait + jitter(100), abortSignal);
    }
  }

  throw new Error('Failed to fetch after retries');
}

async function fetchHtmlWithPlaywright(url, context, timeout, maxRetries, abortSignal) {
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    throwIfAborted(abortSignal);
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout });
      const content = await page.content();
      await page.close();
      return content;
    } catch (error) {
      await page.close();
      if (isAbortError(error)) {
        throw error;
      }
      if (attempt === maxRetries) {
        throw error;
      }
      await sleep(500 + jitter(200), abortSignal);
    }
  }

  throw new Error('Failed to render after retries');
}

async function createBrowserContext(credentials, authMode, startUrl, timeout) {
  let playwright;
  try {
    playwright = require('playwright');
  } catch (error) {
    throw new Error('Playwright is not installed. Run npm install to enable SPA/auth crawling.');
  }

  const browser = await playwright.chromium.launch();
  const contextOptions = {};

  if (authMode === 'basic' && credentials?.username && credentials?.password) {
    contextOptions.httpCredentials = {
      username: credentials.username,
      password: credentials.password
    };
  }

  const context = await browser.newContext(contextOptions);

  if (['form', 'auto'].includes(authMode) && credentials?.username && credentials?.password) {
    await attemptFormLogin(context, credentials, startUrl, timeout);
  }

  return { browser, context };
}

async function closeBrowserContext(browserContext) {
  try {
    await browserContext.context.close();
    await browserContext.browser.close();
  } catch (error) {
    // Ignore cleanup errors
  }
}

async function attemptFormLogin(context, credentials, startUrl, timeout) {
  const page = await context.newPage();
  try {
    await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout });

    const passwordInput = await page.$('input[type="password"]');
    if (!passwordInput) return;

    const usernameInput = await page.$('input[type="email"]')
      || await page.$('input[name*="email" i]')
      || await page.$('input[name*="user" i]')
      || await page.$('input[type="text"]');

    if (usernameInput) {
      await usernameInput.fill(credentials.username);
    }

    await passwordInput.fill(credentials.password);

    const submitButton = await page.$('button[type="submit"]')
      || await page.$('input[type="submit"]')
      || await page.$('button:has-text("Login")')
      || await page.$('button:has-text("Sign in")');

    if (submitButton) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle', timeout }).catch(() => {}),
        submitButton.click()
      ]);
    } else {
      await passwordInput.press('Enter');
      await page.waitForTimeout(1000);
    }
  } finally {
    await page.close();
  }
}

function shouldRetry(status) {
  return [429, 502, 503, 504].includes(status);
}

function stripHash(url) {
  try {
    const urlObj = new URL(url);
    urlObj.hash = '';
    return urlObj.toString();
  } catch {
    return url;
  }
}

function normalizeForVisit(url) {
  try {
    const urlObj = new URL(url);
    urlObj.hash = '';
    const normalizedPath = urlObj.pathname.replace(/\/+$/, '');
    urlObj.pathname = normalizedPath || '/';
    return urlObj.toString();
  } catch {
    return url;
  }
}

function isNonHttpLink(href) {
  return href.startsWith('#') ||
    href.startsWith('mailto:') ||
    href.startsWith('tel:') ||
    href.startsWith('javascript:');
}

function sleep(ms, abortSignal) {
  if (!abortSignal) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      cleanup();
      reject(createAbortError());
    };
    const cleanup = () => {
      abortSignal.removeEventListener('abort', onAbort);
    };
    if (abortSignal.aborted) {
      onAbort();
    } else {
      abortSignal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

function jitter(max) {
  return Math.floor(Math.random() * max);
}

function log(onLog, message) {
  if (typeof onLog === 'function') {
    onLog(message);
  } else {
    console.log(message);
  }
}

function resolveRedirector(absoluteUrl, baseUrl) {
  try {
    const urlObj = new URL(absoluteUrl);
    // Skip common redirector patterns like /url?q=...
    if (urlObj.pathname === '/url' && urlObj.searchParams.has('q')) {
      const target = urlObj.searchParams.get('q');
      if (!target) return null;
      const resolved = new URL(target, baseUrl).href;
      return resolved;
    }
    return absoluteUrl;
  } catch {
    return null;
  }
}

function throwIfAborted(abortSignal) {
  if (abortSignal?.aborted) {
    throw createAbortError();
  }
}

function isAbortError(error) {
  return error?.name === 'AbortError' || error?.code === 'ERR_CANCELED';
}

function createAbortError() {
  const error = new Error('Crawl cancelled');
  error.name = 'AbortError';
  return error;
}

/**
 * Extracts context information about where a link appears
 * This is crucial for identifying global vs contextual navigation
 */
function extractLinkContext($, elem) {
  const $elem = $(elem);
  
  // Check if link is in header, footer, nav, or sidebar
  const inHeader = $elem.closest('header, [role="banner"]').length > 0;
  const inFooter = $elem.closest('footer, [role="contentinfo"]').length > 0;
  const inNav = $elem.closest('nav, [role="navigation"]').length > 0;
  const inSidebar = $elem.closest('aside, .sidebar, [role="complementary"]').length > 0;
  
  // Check for common class names indicating global navigation
  const classes = $elem.attr('class') || '';
  const parent = $elem.parent();
  const parentClasses = parent.attr('class') || '';
  
  const isGlobalNav = 
    inHeader || inFooter || inNav || inSidebar ||
    /nav|menu|header|footer/.test(classes) ||
    /nav|menu|header|footer/.test(parentClasses);

  return {
    isGlobalNav,
    inHeader,
    inFooter,
    inNav,
    inSidebar,
    position: getPositionInPage($, elem)
  };
}

/**
 * Determines approximate position of element in page
 */
function getPositionInPage($, elem) {
  const $elem = $(elem);
  const $body = $('body');
  
  const allElements = $body.find('*').length;
  const elemIndex = $body.find('*').index($elem);
  
  const ratio = elemIndex / allElements;
  
  if (ratio < 0.2) return 'top';
  if (ratio > 0.8) return 'bottom';
  return 'middle';
}

module.exports = { crawlWebsite };
