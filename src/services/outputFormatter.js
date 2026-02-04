/**
 * Formats extracted flows into frontend-friendly JSON
 * 
 * Output structure designed for easy visualization:
 * - Nodes: Pages with metadata
 * - Edges: Directed connections between pages
 * - Flows: Grouped sequences representing user journeys
 * 
 * The output can be directly consumed by frontend flow visualization
 * libraries like React Flow, D3.js, or custom renderers
 */
function formatOutput(cleanedFlows, analyzedPages, startUrl) {
  // Extract all unique nodes from flows
  const nodeMap = buildNodeMap(cleanedFlows, analyzedPages);
  
  // Build edges from flows
  const edges = buildEdges(cleanedFlows);
  
  // Format flows with enhanced metadata
  const formattedFlows = cleanedFlows.map(flow => formatFlow(flow, analyzedPages));
  
  return {
    metadata: {
      startUrl,
      totalPages: analyzedPages.length,
      totalFlows: cleanedFlows.length,
      generatedAt: new Date().toISOString()
    },
    nodes: Array.from(nodeMap.values()),
    edges,
    flows: formattedFlows
  };
}

/**
 * Builds a map of unique nodes from all flows
 */
function buildNodeMap(flows, analyzedPages) {
  const nodeMap = new Map();
  
  flows.forEach(flow => {
    flow.path.forEach(url => {
      if (!nodeMap.has(url)) {
        const page = analyzedPages.find(p => p.url === url);
        
        if (page) {
          nodeMap.set(url, {
            id: createNodeId(url),
            url,
            label: createNodeLabel(page),
            pageType: page.pageType,
            title: page.title,
            metadata: {
              hasForm: page.metadata.hasForm,
              hasLogin: page.metadata.hasLogin,
              hasCheckout: page.metadata.hasCheckout
            }
          });
        }
      }
    });
  });
  
  return nodeMap;
}

/**
 * Builds edge list from flows
 */
function buildEdges(flows) {
  const edgeSet = new Set();
  const edges = [];
  
  flows.forEach(flow => {
    for (let i = 0; i < flow.path.length - 1; i++) {
      const source = flow.path[i];
      const target = flow.path[i + 1];
      const edgeId = `${createNodeId(source)}->${createNodeId(target)}`;
      
      if (!edgeSet.has(edgeId)) {
        edgeSet.add(edgeId);
        edges.push({
          id: edgeId,
          source: createNodeId(source),
          target: createNodeId(target),
          sourceUrl: source,
          targetUrl: target,
          flowTypes: [flow.type]
        });
      } else {
        // Add flow type to existing edge
        const edge = edges.find(e => e.id === edgeId);
        if (edge && !edge.flowTypes.includes(flow.type)) {
          edge.flowTypes.push(flow.type);
        }
      }
    }
  });
  
  return edges;
}

/**
 * Formats a single flow with enhanced metadata
 */
function formatFlow(flow, analyzedPages) {
  const steps = flow.path.map((url, index) => {
    const page = analyzedPages.find(p => p.url === url);
    
    return {
      stepNumber: index + 1,
      nodeId: createNodeId(url),
      url,
      label: page ? createNodeLabel(page) : 'Unknown Page',
      pageType: page ? page.pageType : 'unknown',
      title: page ? page.title : 'Unknown'
    };
  });
  
  return {
    id: createFlowId(flow),
    type: flow.type,
    name: flow.name,
    score: flow.score || 0,
    steps,
    stepCount: steps.length
  };
}

/**
 * Creates a clean node ID from URL
 */
function createNodeId(url) {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname.replace(/^\/|\/$/g, '');
    return path || 'home';
  } catch {
    return 'unknown';
  }
}

/**
 * Creates a human-readable label for a node
 */
function createNodeLabel(page) {
  // Use page type as base
  const typeLabels = {
    'home': 'Home Page',
    'login': 'Login',
    'signup': 'Sign Up',
    'checkout': 'Checkout',
    'product-list': 'Product Listing',
    'product-detail': 'Product Details',
    'contact': 'Contact',
    'support': 'Support',
    'about': 'About',
    'content': 'Content Page'
  };
  
  let label = typeLabels[page.pageType] || page.pageType;
  
  // Enhance with title if it adds information
  if (page.title && page.title.length < 30 && !page.title.includes(label)) {
    label = page.title;
  }
  
  return label;
}

/**
 * Creates a unique flow ID
 */
function createFlowId(flow) {
  const pathSignature = flow.path.map(createNodeId).join('-');
  return `${flow.type}-${pathSignature}`.substring(0, 100);
}

module.exports = { formatOutput };
