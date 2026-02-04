const { crawlWebsite } = require('./crawler');
const { analyzePage } = require('./pageAnalyzer');
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
async function crawlAndExtractFlows({ startUrl, credentials, crawlConfig }) {
  const config = {
    maxDepth: crawlConfig?.maxDepth || 3,
    maxPages: crawlConfig?.maxPages || 50,
    timeout: crawlConfig?.timeout || 30000
  };

  console.log('Step 1: Crawling website...');
  const crawledPages = await crawlWebsite(startUrl, config, credentials);
  console.log(`Crawled ${crawledPages.length} pages`);

  console.log('Step 2: Analyzing pages...');
  const analyzedPages = crawledPages.map(page => analyzePage(page));
  console.log(`Analyzed ${analyzedPages.length} pages`);

  console.log('Step 3: Extracting user flows...');
  const rawFlows = extractFlows(analyzedPages, startUrl);
  console.log(`Extracted ${rawFlows.length} raw flows`);

  console.log('Step 4: Reducing noise...');
  const cleanedFlows = reduceNoise(rawFlows, analyzedPages);
  console.log(`Cleaned to ${cleanedFlows.length} meaningful flows`);

  console.log('Step 5: Formatting output...');
  const output = formatOutput(cleanedFlows, analyzedPages, startUrl);
  console.log('Output formatted successfully');
  console.log('Output:', JSON.stringify(output, null, 2));

  return output;
}

module.exports = { crawlAndExtractFlows };
