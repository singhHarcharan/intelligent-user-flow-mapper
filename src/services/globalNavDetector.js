const { URL } = require('url');

/**
 * Detects global navigation links based on frequency across pages.
 * Links that appear on most pages are likely global nav and should
 * be excluded from contextual flow extraction.
 */
function classifyGlobalNavigation(analyzedPages, options = {}) {
  const threshold = options.threshold ?? 0.6;
  const totalPages = analyzedPages.length || 1;

  const linkCounts = new Map();

  analyzedPages.forEach(page => {
    const uniqueLinks = new Set();
    (page.links?.all || []).forEach(link => {
      const normalized = normalizeUrl(link.href);
      if (normalized) uniqueLinks.add(normalized);
    });

    uniqueLinks.forEach(href => {
      linkCounts.set(href, (linkCounts.get(href) || 0) + 1);
    });
  });

  const globalHrefSet = new Set();
  linkCounts.forEach((count, href) => {
    if (count / totalPages >= threshold) {
      globalHrefSet.add(href);
    }
  });

  // Reclassify links using both context and frequency signals
  return analyzedPages.map(page => {
    const global = [];
    const contextual = [];

    (page.links?.all || []).forEach(link => {
      const normalized = normalizeUrl(link.href);
      const isGlobalByFrequency = normalized && globalHrefSet.has(normalized);
      const isGlobalByContext = Boolean(link.context?.isGlobalNav);

      if (isGlobalByFrequency || isGlobalByContext) {
        global.push({
          ...link,
          linkType: 'global',
          globalReason: isGlobalByFrequency ? 'frequency' : 'context'
        });
      } else {
        contextual.push({
          ...link,
          linkType: 'contextual'
        });
      }
    });

    return {
      ...page,
      links: {
        ...page.links,
        global,
        contextual
      }
    };
  });
}

function normalizeUrl(href) {
  try {
    const urlObj = new URL(href);
    urlObj.hash = '';
    urlObj.search = '';
    const normalizedPath = urlObj.pathname.replace(/\/+$/, '');
    urlObj.pathname = normalizedPath || '/';
    return urlObj.toString();
  } catch {
    return null;
  }
}

module.exports = { classifyGlobalNavigation };
