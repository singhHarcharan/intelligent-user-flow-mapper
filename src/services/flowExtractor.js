/**
 * Extracts goal-oriented flows from analyzed pages.
 * Uses page types + link structure to build candidate paths.
 */
function extractFlows(analyzedPages, startUrl) {
  if (!analyzedPages || !analyzedPages.length) return [];
  
  // Build complete graph first (we'll filter later)
  const graph = buildCompleteGraph(analyzedPages);
  
  // Identify entry points (homepage, main navigation, etc.)
  const entryPoints = identifyEntryPoints(analyzedPages, startUrl);
  
  // If no entry points found, use the start URL as the only entry point
  if (entryPoints.length === 0 && startUrl) {
    entryPoints.push(startUrl);
  }
  
  // Extract flows using multiple strategies
  const flows = [];
  
  // 1. Extract flows based on common patterns
  const patternBasedFlows = [
    ...extractCommonPatterns(graph, analyzedPages, entryPoints, 'ecommerce'),
    ...extractCommonPatterns(graph, analyzedPages, entryPoints, 'auth'),
    ...extractCommonPatterns(graph, analyzedPages, entryPoints, 'support'),
    ...extractCommonPatterns(graph, analyzedPages, entryPoints, 'content')
  ];
  
  // 2. Extract structural flows (hub-and-spoke, linear paths)
  const structuralFlows = [
    ...extractHubAndSpokeFlows(graph, analyzedPages, entryPoints),
    ...extractLinearFlows(graph, analyzedPages, entryPoints, { minLength: 3 })
  ];
  
  // 3. Extract custom flows based on page types and relationships
  const customFlows = extractCustomFlows(graph, analyzedPages, entryPoints);
  
  // Combine and deduplicate flows
  const allFlows = [...patternBasedFlows, ...structuralFlows, ...customFlows];
  const uniqueFlows = deduplicateFlows(allFlows);
  
  return uniqueFlows;
}

// Build directed graph from all pages/links.
function buildCompleteGraph(analyzedPages) {
  const graph = new Map();
  
  // First pass: create nodes for all pages
  analyzedPages.forEach(page => {
    graph.set(page.url, {
      page,
      edges: [],
      inDegree: 0,  // Track incoming links for flow analysis
      outDegree: 0  // Track outgoing links for flow analysis
    });
  });
  
  // Second pass: add edges and update degrees
  analyzedPages.forEach(page => {
    const node = graph.get(page.url);
    if (!node) return;
    
    // Process all links (we'll filter later during flow extraction)
    const allLinks = [...(page.links?.contextual || []), ...(page.links?.global || [])];
    
    allLinks.forEach(link => {
      const targetNode = graph.get(link.href);
      if (targetNode) {
        const edge = {
          target: link.href,
          text: link.text,
          targetType: targetNode.page?.pageType,
          linkType: link.linkType || 'contextual',
          context: link.context || {}
        };
        
        node.edges.push(edge);
        node.outDegree++;
        targetNode.inDegree++;
      }
    });
  });
  
  return graph;
}

// Entry points are likely starting pages (home/root/startUrl).
function identifyEntryPoints(analyzedPages, startUrl) {
  const entryPoints = new Set();
  
  // 1. Explicit start URL
  if (startUrl) {
    entryPoints.add(startUrl);
  }
  
  // 2. Homepage and root pages
  analyzedPages.forEach(page => {
    if (
      page.pageType === 'home' || 
      page.depth === 0 || 
      (page.url.endsWith('/') && page.depth <= 1)
    ) {
      entryPoints.add(page.url);
    }
  });
  
  // 3. High-traffic pages (based on in-degree in the graph)
  // We'll add this in the flow extraction phase
  
  return Array.from(entryPoints);
}

// Pattern-based flows.
function extractCommonPatterns(graph, analyzedPages, entryPoints, patternType) {
  switch (patternType) {
    case 'ecommerce':
      return extractEcommerceFlows(graph, analyzedPages, entryPoints);
    case 'auth':
      return extractAuthFlows(graph, analyzedPages, entryPoints);
    case 'support':
      return extractSupportFlows(graph, analyzedPages, entryPoints);
    case 'content':
      return extractContentFlows(graph, analyzedPages, entryPoints);
    default:
      return [];
  }
}

// Linear flows (contextual links only).
function extractLinearFlows(graph, analyzedPages, entryPoints, options = {}) {
  const { minLength = 3, maxLength = 10 } = options;
  const flows = [];
  
  entryPoints.forEach(entryUrl => {
    const visited = new Set();
    const stack = [{ url: entryUrl, path: [entryUrl] }];
    
    while (stack.length > 0) {
      const { url, path } = stack.pop();
      
      if (visited.has(url) || path.length > maxLength) {
        continue;
      }
      
      visited.add(url);
      const node = graph.get(url);
      if (!node) continue;
      
      // Only consider contextual links for linear flows
      const contextualEdges = node.edges.filter(e => e.linkType === 'contextual');
      
      if (contextualEdges.length === 0 && path.length >= minLength) {
        // End of a potential flow
        flows.push({
          type: 'linear',
          path: [...path],
          confidence: calculateFlowConfidence(graph, path)
        });
      } else {
        // Continue building the path
        contextualEdges.forEach(edge => {
          if (!path.includes(edge.target)) {
            stack.push({
              url: edge.target,
              path: [...path, edge.target]
            });
          }
        });
      }
    }
  });
  
  return flows;
}

// Custom flows based on page type relationships.
function extractCustomFlows(graph, analyzedPages, entryPoints) {
  const flows = [];
  
  // 1. Find all pages that are likely to be part of a flow
  const flowCandidates = analyzedPages.filter(page => {
    const node = graph.get(page.url);
    return node && (node.inDegree > 0 || node.outDegree > 1);
  });
  
  // 2. Group pages by their types and relationships
  const pageGroups = groupPagesByType(flowCandidates);
  
  // 3. Generate flows based on common patterns between page groups
  for (const [type, pages] of Object.entries(pageGroups)) {
    if (pages.length > 1) {
      // Find connections between pages of the same type
      const connectedPaths = findConnectedPaths(graph, pages.map(p => p.url));
      flows.push(...connectedPaths);
    }
  }
  
  return flows;
}

// Group pages by type.
function groupPagesByType(pages) {
  const groups = {};
  
  pages.forEach(page => {
    const type = page.pageType || 'unknown';
    if (!groups[type]) {
      groups[type] = [];
    }
    groups[type].push(page);
  });
  
  return groups;
}

// Find connected paths between pages of same type.
function findConnectedPaths(graph, pageUrls, maxPathLength = 5) {
  const paths = [];
  
  for (let i = 0; i < pageUrls.length; i++) {
    const startUrl = pageUrls[i];
    const visited = new Set([startUrl]);
    const queue = [{ url: startUrl, path: [startUrl] }];
    
    while (queue.length > 0) {
      const { url, path } = queue.shift();
      const node = graph.get(url);
      if (!node) continue;
      
      // Check if current path connects to another target page
      for (let j = 0; j < pageUrls.length; j++) {
        const targetUrl = pageUrls[j];
        if (url === targetUrl || path.length >= maxPathLength) continue;
        
        // Check if any edge leads to the target
        const hasConnection = node.edges.some(edge => edge.target === targetUrl);
        if (hasConnection) {
          paths.push({
            type: 'connected',
            path: [...path, targetUrl],
            confidence: 0.7 // Medium confidence for connected paths
          });
        }
      }
      
      // Continue BFS
      node.edges.forEach(edge => {
        if (!visited.has(edge.target) && path.length < maxPathLength) {
          visited.add(edge.target);
          queue.push({
            url: edge.target,
            path: [...path, edge.target]
          });
        }
      });
    }
  }
  
  return paths;
}

// Simple confidence scoring.
function calculateFlowConfidence(graph, path) {
  if (path.length < 2) return 0;
  
  let totalScore = 0;
  
  // Score based on path length (longer paths are less likely by chance)
  totalScore += Math.min(0.3, path.length * 0.1);
  
  // Score based on edge types (contextual links are better)
  for (let i = 0; i < path.length - 1; i++) {
    const node = graph.get(path[i]);
    if (!node) continue;
    
    const nextUrl = path[i + 1];
    const edge = node.edges.find(e => e.target === nextUrl);
    
    if (edge) {
      if (edge.linkType === 'contextual') {
        totalScore += 0.2;
      } else if (edge.linkType === 'global') {
        totalScore += 0.1;
      }
    }
  }
  
  // Normalize to 0-1 range
  return Math.min(1, totalScore);
}

// Remove duplicate/subpath flows.
function deduplicateFlows(flows) {
  const uniqueFlows = [];
  const seen = new Set();
  
  flows.forEach(flow => {
    // Create a stable string representation of the flow
    const key = flow.path.join('→');
    
    // Skip if we've seen this exact path
    if (seen.has(key)) return;
    
    // Check for sub-paths
    let isSubpath = false;
    for (const existingKey of seen) {
      if (existingKey.includes(key) && existingKey !== key) {
        isSubpath = true;
        break;
      }
    }
    
    if (!isSubpath) {
      seen.add(key);
      uniqueFlows.push(flow);
    }
  });
  
  // Sort by confidence (highest first)
  return uniqueFlows.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
}

// Ecommerce flow: Home → Product List → Product Detail → Checkout
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

// Auth flow: Home → Login/Signup
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

// Support flow: Entry → Support → Contact
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

// Generic content exploration flows.
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

// Hub-and-spoke flows: Home → Major Section.
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

// Find flow visiting target page types in order.
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

// Find linear paths (no branching) with min length.
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
