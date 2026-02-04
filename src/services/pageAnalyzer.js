const cheerio = require('cheerio');

/**
 * Analyzes a crawled page to extract semantic meaning
 * 
 * Key responsibilities:
 * - Identify page type (home, login, product, checkout, etc.)
 * - Classify links as global vs contextual
 * - Detect common UI patterns
 * - Extract actionable elements (forms, buttons)
 */
function analyzePage(page) {
  const $ = cheerio.load(page.html);
  
  const pageType = identifyPageType(page, $);
  const globalLinks = identifyGlobalLinks(page.links);
  const contextualLinks = page.links.filter(link => !globalLinks.has(link.href));
  const actionElements = extractActionElements($);
  
  return {
    url: page.url,
    title: page.title,
    pageType,
    depth: page.depth,
    referrer: page.referrer,
    links: {
      all: page.links,
      global: Array.from(globalLinks).map(href => 
        page.links.find(l => l.href === href)
      ),
      contextual: contextualLinks
    },
    actionElements,
    metadata: {
      hasForm: $('form').length > 0,
      hasLogin: detectLoginPage($),
      hasCheckout: detectCheckoutPage($),
      hasProductList: detectProductListPage($),
      hasProductDetail: detectProductDetailPage($)
    }
  };
}

/**
 * Identifies the type/purpose of a page
 * 
 * Heuristics:
 * - URL patterns (/login, /checkout, /product, etc.)
 * - Page title keywords
 * - Presence of specific elements (forms, product grids, etc.)
 */
function identifyPageType(page, $) {
  const url = page.url.toLowerCase();
  const title = page.title.toLowerCase();
  
  // Check URL patterns first
  if (url.includes('/login') || url.includes('/signin')) return 'login';
  if (url.includes('/signup') || url.includes('/register')) return 'signup';
  if (url.includes('/checkout') || url.includes('/cart')) return 'checkout';
  if (url.includes('/product') && url.includes('/')) return 'product-detail';
  if (url.includes('/products') || url.includes('/shop') || url.includes('/catalog')) return 'product-list';
  if (url.includes('/contact')) return 'contact';
  if (url.includes('/support') || url.includes('/help')) return 'support';
  if (url.includes('/about')) return 'about';
  if (url === new URL(page.url).origin + '/') return 'home';
  
  // Check title patterns
  if (title.includes('login') || title.includes('sign in')) return 'login';
  if (title.includes('checkout') || title.includes('cart')) return 'checkout';
  if (title.includes('contact')) return 'contact';
  
  // Check page content
  if (detectLoginPage($)) return 'login';
  if (detectCheckoutPage($)) return 'checkout';
  if (detectProductListPage($)) return 'product-list';
  if (detectProductDetailPage($)) return 'product-detail';
  
  return 'content';
}

/**
 * Identifies global navigation links that appear on most pages
 * 
 * Strategy:
 * - Links marked as being in header/footer/nav
 * - Links with navigation-related classes
 * - Links that would create redundant edges
 * 
 * UPDATED: Be less aggressive - only filter truly global elements
 * to avoid over-filtering on marketing sites
 */
function identifyGlobalLinks(links) {
  const globalLinks = new Set();
  
  links.forEach(link => {
    // Only mark as global if it's clearly in structural navigation
    // AND in footer or has very short/generic text
    const isStructuralNav = link.context.inHeader || link.context.inFooter || link.context.inNav;
    const isGenericLink = !link.text || link.text.length < 3;
    
    // More lenient: only filter footer links and truly generic nav
    if (link.context.inFooter || (isStructuralNav && isGenericLink)) {
      globalLinks.add(link.href);
    }
  });
  
  return globalLinks;
}

/**
 * Extracts interactive elements that indicate user actions
 */
function extractActionElements($) {
  const actions = [];
  
  // Forms
  $('form').each((i, elem) => {
    const $form = $(elem);
    const action = $form.attr('action') || '';
    const method = $form.attr('method') || 'GET';
    
    actions.push({
      type: 'form',
      action,
      method,
      hasPassword: $form.find('input[type="password"]').length > 0,
      hasEmail: $form.find('input[type="email"]').length > 0
    });
  });
  
  // Buttons with significant text
  $('button, input[type="submit"]').each((i, elem) => {
    const text = $(elem).text().trim() || $(elem).attr('value') || '';
    if (text.length > 0) {
      actions.push({
        type: 'button',
        text
      });
    }
  });
  
  return actions;
}

// Page type detection helpers

function detectLoginPage($) {
  return $('input[type="password"]').length > 0 &&
         ($('input[type="email"]').length > 0 || $('input[type="text"]').length > 0);
}

function detectCheckoutPage($) {
  const text = $('body').text().toLowerCase();
  return (text.includes('checkout') || text.includes('payment')) &&
         ($('input[type="text"]').length > 3 || $('form').length > 0);
}

function detectProductListPage($) {
  // Look for multiple product-like elements
  const productIndicators = $(
    '.product, .item, [class*="product"], [data-product]'
  ).length;
  
  return productIndicators > 3;
}

function detectProductDetailPage($) {
  const hasPrice = $('.price, [class*="price"]').length > 0;
  const hasAddToCart = $('button, a').filter((i, el) => {
    const text = $(el).text().toLowerCase();
    return text.includes('add to cart') || text.includes('buy now');
  }).length > 0;
  
  return hasPrice && hasAddToCart;
}

module.exports = { analyzePage };
