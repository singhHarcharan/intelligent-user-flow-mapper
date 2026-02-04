const { crawlWebsite } = require('./crawler');
const { analyzePage } = require('./pageAnalyzer');
const { classifyGlobalNavigation } = require('./globalNavDetector');
const { extractFlows } = require('./flowExtractor');
const { reduceNoise } = require('./noiseReducer');
const { formatOutput } = require('./outputFormatter');

/**
 * Main orchestrator for the Intelligent User Flow Mapper
 * 
 * Process flow:
 * 1. Crawl website and collect pages
 * 2. Analyze each page for context and link types
 * 3. Extract meaningful user flows
 * 4. Reduce noise (global nav, redundant paths)
 * 5. Format output for frontend consumption
 */
async function crawlAndExtractFlows({ startUrl, credentials, crawlConfig, abortSignal, onLog }) {
  const authMode = crawlConfig?.authMode || (credentials ? 'auto' : 'none');
  const config = {
    maxDepth: crawlConfig?.maxDepth || 3,
    maxPages: crawlConfig?.maxPages || 50,
    timeout: crawlConfig?.timeout || 30000,
    rendering: crawlConfig?.rendering || 'auto',
    delayMs: crawlConfig?.delayMs || 250,
    maxRetries: crawlConfig?.maxRetries || 3,
    retryBaseMs: crawlConfig?.retryBaseMs || 500,
    retryMaxMs: crawlConfig?.retryMaxMs || 5000,
    authMode,
    loginUrl: crawlConfig?.loginUrl || null,
    abortSignal,
    onLog
  };

  throwIfAborted(abortSignal);
  log(onLog, 'Step 1: Crawling website...');
  const crawledPages = await crawlWebsite(startUrl, config, credentials);
  log(onLog, `Crawled ${crawledPages.length} pages`);

  throwIfAborted(abortSignal);
  log(onLog, 'Step 2: Analyzing pages...');
  const analyzedPagesRaw = crawledPages.map(page => analyzePage(page));
  const analyzedPages = classifyGlobalNavigation(analyzedPagesRaw, { threshold: 0.6 });
  log(onLog, `Analyzed ${analyzedPages.length} pages`);

  throwIfAborted(abortSignal);
  log(onLog, 'Step 3: Extracting user flows...');
  const rawFlows = extractFlows(analyzedPages, startUrl);
  log(onLog, `Extracted ${rawFlows.length} raw flows`);

  throwIfAborted(abortSignal);
  log(onLog, 'Step 4: Reducing noise...');
  const cleanedFlows = reduceNoise(rawFlows, analyzedPages);
  log(onLog, `Cleaned to ${cleanedFlows.length} meaningful flows`);

  throwIfAborted(abortSignal);
  log(onLog, 'Step 5: Formatting output...');
  const output = formatOutput(cleanedFlows, analyzedPages, startUrl);
  log(onLog, 'Output formatted successfully');

  return output;
}

module.exports = { crawlAndExtractFlows };

function throwIfAborted(abortSignal) {
  if (abortSignal?.aborted) {
    const error = new Error('Crawl cancelled');
    error.name = 'AbortError';
    throw error;
  }
}

function log(onLog, message) {
  if (typeof onLog === 'function') {
    onLog(message);
  } else {
    console.log(message);
  }
}
