/**
 * Extracts meaningful user flows from analyzed pages
 * 
 * Core philosophy:
 * - User flows represent sequences of intentional navigation
 * - Not all links create meaningful flows
 * - Focus on goal-oriented paths (checkout, support, onboarding)
 * 
 * Strategy:
 * 1. Build a directed graph from contextual links only
 * 2. Identify common flow patterns (e.g., home → login → product → checkout)
 * 3. Group related paths into semantic flows
 * 4. Handle both linear flows AND hub-and-spoke patterns
 */
function extractFlows(analyzedPages, startUrl) {
  // Build adjacency map using only contextual links
  const graph = buildContextualGraph(analyzedPages);
  
  // Identify entry points (typically home, landing pages)
  const entryPoints = identifyEntryPoints(analyzedPages, startUrl);
  
  // Extract flows from each entry point
  const flows = [];
  
  // Pattern 1: E-commerce flows (home → product → checkout)
  flows.push(...extractEcommerceFlows(graph, analyzedPages, entryPoints));
  
  // Pattern 2: Authentication flows (home → login/signup)
  flows.push(...extractAuthFlows(graph, analyzedPages, entryPoints));
  
  // Pattern 3: Support/Contact flows
  flows.push(...extractSupportFlows(graph, analyzedPages, entryPoints));
  
  // Pattern 4: Content exploration flows (linear sequences)
  flows.push(...extractContentFlows(graph, analyzedPages, entryPoints));
  
  // Pattern 5: Hub-and-spoke flows (home → major sections)
  flows.push(...extractHubAndSpokeFlows(graph, analyzedPages, entryPoints));
  
  return flows;
}

/**
 * Builds a directed graph using only contextual (non-global) links
 * Global navigation links are excluded to reduce noise
 */
function buildContextualGraph(analyzedPages) {
  const graph = new Map();
  
  analyzedPages.forEach(page => {
    const edges = [];
    
    // Only use contextual links
    page.links.contextual.forEach(link => {
      const targetPage = analyzedPages.find(p => p.url === link.href);
      if (targetPage) {
        edges.push({
          target: link.href,
          text: link.text,
          targetType: targetPage.pageType
        });
      }
    });
    
    graph.set(page.url, {
      page,
      edges
    });
  });
  
  return graph;
}

/**
 * Identifies pages that serve as natural entry points
 */
function identifyEntryPoints(analyzedPages, startUrl) {
  return analyzedPages
    .filter(page => 
      page.url === startUrl ||
      page.pageType === 'home' ||
      page.depth === 0
    )
    .map(p => p.url);
}

/**
 * Extracts e-commerce user flows
 * Pattern: Home → [Login] → Product List → Product Detail → Checkout
 */
function extractEcommerceFlows(graph, analyzedPages, entryPoints) {
  const flows = [];
  
  entryPoints.forEach(entryUrl => {
    const path = [];
    const visited = new Set();
    
    // Try to find: entry → product-list → product-detail → checkout
    const flow = findFlowByPageTypes(
      graph,
      entryUrl,
      ['product-list', 'product-detail', 'checkout'],
      visited,
      path
    );
    
    if (flow && flow.length >= 2) {
      flows.push({
        type: 'ecommerce',
        name: 'Product Purchase Flow',
        path: flow
      });
    }
  });
  
  return flows;
}

/**
 * Extracts authentication flows
 * Pattern: Home → Login/Signup
 */
function extractAuthFlows(graph, analyzedPages, entryPoints) {
  const flows = [];
  
  entryPoints.forEach(entryUrl => {
    const loginPages = analyzedPages.filter(p => p.pageType === 'login');
    const signupPages = analyzedPages.filter(p => p.pageType === 'signup');
    
    loginPages.forEach(loginPage => {
      if (graph.has(entryUrl)) {
        const hasPath = graph.get(entryUrl).edges.some(e => e.target === loginPage.url);
        if (hasPath) {
          flows.push({
            type: 'authentication',
            name: 'Login Flow',
            path: [entryUrl, loginPage.url]
          });
        }
      }
    });
    
    signupPages.forEach(signupPage => {
      if (graph.has(entryUrl)) {
        const hasPath = graph.get(entryUrl).edges.some(e => e.target === signupPage.url);
        if (hasPath) {
          flows.push({
            type: 'authentication',
            name: 'Signup Flow',
            path: [entryUrl, signupPage.url]
          });
        }
      }
    });
  });
  
  return flows;
}

/**
 * Extracts support/contact flows
 * Pattern: Entry → Support → Contact/Form
 */
function extractSupportFlows(graph, analyzedPages, entryPoints) {
  const flows = [];
  
  entryPoints.forEach(entryUrl => {
    const path = [];
    const visited = new Set();
    
    const flow = findFlowByPageTypes(
      graph,
      entryUrl,
      ['support', 'contact'],
      visited,
      path
    );
    
    if (flow && flow.length >= 2) {
      flows.push({
        type: 'support',
        name: 'Support Flow',
        path: flow
      });
    }
  });
  
  return flows;
}

/**
 * Extracts general content exploration flows
 * This captures any other meaningful sequential navigation
 */
function extractContentFlows(graph, analyzedPages, entryPoints) {
  const flows = [];
  
  // Find linear paths of length 3+ that aren't already captured
  entryPoints.forEach(entryUrl => {
    const visited = new Set();
    const linearPaths = findLinearPaths(graph, entryUrl, visited, 3);
    
    linearPaths.forEach(path => {
      if (path.length >= 3) {
        flows.push({
          type: 'content',
          name: 'Content Exploration Flow',
          path
        });
      }
    });
  });
  
  return flows;
}

/**
 * Extracts hub-and-spoke flows (common in marketing/SaaS sites)
 * Pattern: Home → Major Section (Products, Pricing, Docs, etc.)
 * 
 * This handles sites like Stripe where the homepage links to many
 * major sections, but those sections don't necessarily link to each other
 */
function extractHubAndSpokeFlows(graph, analyzedPages, entryPoints) {
  const flows = [];
  
  entryPoints.forEach(entryUrl => {
    if (!graph.has(entryUrl)) return;
    
    const node = graph.get(entryUrl);
    const majorSections = node.edges.filter(edge => {
      // Consider it a "major section" if:
      // 1. It's a direct child of the entry point
      // 2. It has significant content or specific page types
      const targetPage = analyzedPages.find(p => p.url === edge.target);
      if (!targetPage) return false;
      
      const isMajorSection = 
        targetPage.pageType !== 'content' || // Non-generic pages
        targetPage.title.length > 10 || // Has substantial title
        edge.text.length > 5; // Substantial link text
      
      return isMajorSection;
    });
    
    // Create flows for each major section
    majorSections.forEach(section => {
      const targetPage = analyzedPages.find(p => p.url === section.target);
      if (!targetPage) return;
      
      // Check if this section leads anywhere (2-step flow)
      let flowPath = [entryUrl, section.target];
      let flowName = `${section.text || targetPage.pageType} Flow`;
      
      // Try to extend the flow one more step if possible
      if (graph.has(section.target)) {
        const sectionNode = graph.get(section.target);
        if (sectionNode.edges.length > 0) {
          // Find the most relevant next step
          const nextStep = sectionNode.edges[0]; // Take first for simplicity
          flowPath.push(nextStep.target);
        }
      }
      
      flows.push({
        type: 'navigation',
        name: flowName,
        path: flowPath
      });
    });
  });
  
  return flows;
}

/**
 * Helper: Finds a flow that visits specific page types in sequence
 */
function findFlowByPageTypes(graph, startUrl, targetTypes, visited, path, currentPath = []) {
  if (!graph.has(startUrl) || visited.has(startUrl)) {
    return null;
  }
  
  visited.add(startUrl);
  currentPath.push(startUrl);
  
  const node = graph.get(startUrl);
  const currentPageType = node.page.pageType;
  
  // Check if we've hit our next target type
  if (targetTypes.length > 0 && currentPageType === targetTypes[0]) {
    const remainingTypes = targetTypes.slice(1);
    
    if (remainingTypes.length === 0) {
      // Found complete flow
      return [...currentPath];
    }
    
    // Continue looking for remaining types
    for (const edge of node.edges) {
      const result = findFlowByPageTypes(
        graph,
        edge.target,
        remainingTypes,
        new Set(visited),
        path,
        [...currentPath]
      );
      
      if (result) {
        return result;
      }
    }
  } else {
    // Keep searching
    for (const edge of node.edges) {
      const result = findFlowByPageTypes(
        graph,
        edge.target,
        targetTypes,
        new Set(visited),
        path,
        [...currentPath]
      );
      
      if (result) {
        return result;
      }
    }
  }
  
  return null;
}

/**
 * Helper: Finds linear paths (no branching) of minimum length
 */
function findLinearPaths(graph, startUrl, visited, minLength, currentPath = []) {
  if (!graph.has(startUrl) || visited.has(startUrl)) {
    return [];
  }
  
  visited.add(startUrl);
  currentPath.push(startUrl);
  
  const node = graph.get(startUrl);
  const paths = [];
  
  if (node.edges.length === 1) {
    // Linear continuation
    const nextPaths = findLinearPaths(
      graph,
      node.edges[0].target,
      new Set(visited),
      minLength,
      [...currentPath]
    );
    paths.push(...nextPaths);
  } else if (currentPath.length >= minLength) {
    // End of linear path
    paths.push([...currentPath]);
  }
  
  return paths;
}

module.exports = { extractFlows };
