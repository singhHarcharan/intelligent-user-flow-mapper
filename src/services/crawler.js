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
 */
async function crawlWebsite(startUrl, config, credentials) {
  const { maxDepth, maxPages, timeout } = config;
  
  const visited = new Set();
  const pages = [];
  const queue = [{ url: startUrl, depth: 0, referrer: null }];
  
  const baseDomain = new URL(startUrl).hostname;

  while (queue.length > 0 && pages.length < maxPages) {
    const { url, depth, referrer } = queue.shift();

    if (visited.has(url) || depth > maxDepth) {
      continue;
    }

    visited.add(url);

    try {
      console.log(`Crawling [depth=${depth}]: ${url}`);
      
      const response = await axios.get(url, {
        timeout,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; FlowMapperBot/1.0)'
        },
        maxRedirects: 5
      });

      const html = response.data;
      const $ = cheerio.load(html);

      // Extract page metadata
      const title = $('title').text().trim() || $('h1').first().text().trim() || 'Untitled';
      
      // Extract all links
      const links = [];
      $('a[href]').each((i, elem) => {
        const href = $(elem).attr('href');
        const text = $(elem).text().trim();
        const context = extractLinkContext($, elem);
        
        try {
          const absoluteUrl = new URL(href, url).href;
          const linkDomain = new URL(absoluteUrl).hostname;
          
          // Only include internal links
          if (linkDomain === baseDomain) {
            links.push({
              href: absoluteUrl,
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
        referrer
      });

      // Add new links to queue
      if (depth < maxDepth) {
        links.forEach(link => {
          if (!visited.has(link.href)) {
            queue.push({
              url: link.href,
              depth: depth + 1,
              referrer: url
            });
          }
        });
      }

    } catch (error) {
      console.error(`Failed to crawl ${url}:`, error.message);
    }
  }

  return pages;
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
