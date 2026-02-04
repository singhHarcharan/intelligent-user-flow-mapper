/**
 * Reduces noise in extracted flows
 * 
 * Noise reduction strategies:
 * 1. Remove duplicate flows (same sequence of page types)
 * 2. Remove flows that are subsets of longer flows
 * 3. Filter out flows with too many generic pages
 * 4. Merge similar flows
 * 5. Remove flows with circular paths
 */
function reduceNoise(rawFlows, analyzedPages) {
  let flows = [...rawFlows];
  
  // Step 1: Remove duplicate flows (same URLs in same order)
  flows = removeDuplicateFlows(flows);
  
  // Step 2: Remove flows that are subsets of other flows
  flows = removeSubsetFlows(flows);
  
  // Step 3: Remove flows with too many generic 'content' pages
  flows = removeGenericFlows(flows, analyzedPages);
  
  // Step 4: Remove circular flows
  flows = removeCircularFlows(flows);
  
  // Step 5: Score and rank flows by meaningfulness
  flows = scoreAndRankFlows(flows, analyzedPages);
  
  return flows;
}

/**
 * Removes flows with identical URL sequences
 */
function removeDuplicateFlows(flows) {
  const seen = new Set();
  const unique = [];
  
  flows.forEach(flow => {
    const signature = flow.path.join('→');
    if (!seen.has(signature)) {
      seen.add(signature);
      unique.push(flow);
    }
  });
  
  return unique;
}

/**
 * Removes flows that are complete subsets of longer flows
 * Example: [A, B] is removed if [A, B, C] exists
 */
function removeSubsetFlows(flows) {
  const filtered = [];
  
  flows.forEach(flow => {
    const isSubset = flows.some(otherFlow => {
      if (flow === otherFlow) return false;
      if (flow.path.length >= otherFlow.path.length) return false;
      
      // Check if flow.path is a prefix of otherFlow.path
      return flow.path.every((url, idx) => otherFlow.path[idx] === url);
    });
    
    if (!isSubset) {
      filtered.push(flow);
    }
  });
  
  return filtered;
}

/**
 * Removes flows dominated by generic 'content' pages
 * These are usually less meaningful than specific page type flows
 * 
 * UPDATED: More lenient for 2-step flows (hub-and-spoke patterns)
 */
function removeGenericFlows(flows, analyzedPages) {
  return flows.filter(flow => {
    const pageTypes = flow.path.map(url => {
      const page = analyzedPages.find(p => p.url === url);
      return page ? page.pageType : 'unknown';
    });
    
    const contentPageCount = pageTypes.filter(t => t === 'content').length;
    const ratio = contentPageCount / pageTypes.length;
    
    // For short flows (2 steps), be more lenient
    if (flow.path.length <= 2) {
      return ratio < 0.9; // Allow up to 90% content
    }
    
    // For longer flows, keep original threshold
    return ratio < 0.7;
  });
}

/**
 * Removes flows with circular paths (A → B → A)
 */
function removeCircularFlows(flows) {
  return flows.filter(flow => {
    const uniqueUrls = new Set(flow.path);
    return uniqueUrls.size === flow.path.length;
  });
}

/**
 * Scores flows by meaningfulness and ranks them
 * 
 * Scoring criteria:
 * - Length (longer flows are more meaningful, up to a point)
 * - Page type diversity (varied page types indicate richer flow)
 * - Presence of goal pages (checkout, contact, etc.)
 * - Flow type priority (ecommerce > auth > support > navigation > content)
 * 
 * UPDATED: Better scoring for 2-step hub-and-spoke flows
 */
function scoreAndRankFlows(flows, analyzedPages) {
  const scored = flows.map(flow => {
    let score = 0;
    
    // Length score - adjusted to value 2-step flows better
    let lengthScore;
    if (flow.path.length === 2) {
      lengthScore = 25; // Base score for 2-step flows
    } else {
      lengthScore = Math.min(flow.path.length * 10, 50);
    }
    score += lengthScore;
    
    // Page type diversity score
    const pageTypes = flow.path.map(url => {
      const page = analyzedPages.find(p => p.url === url);
      return page ? page.pageType : 'unknown';
    });
    const uniqueTypes = new Set(pageTypes);
    score += uniqueTypes.size * 5;
    
    // Goal page bonus
    const hasGoalPage = pageTypes.some(type => 
      ['checkout', 'contact', 'login', 'signup'].includes(type)
    );
    if (hasGoalPage) score += 20;
    
    // Flow type priority - added 'navigation' type
    const typePriority = {
      'ecommerce': 30,
      'authentication': 25,
      'support': 20,
      'navigation': 15, // Hub-and-spoke flows
      'content': 10
    };
    score += typePriority[flow.type] || 0;
    
    // Bonus for flows with meaningful link text
    const hasSubstantialText = flow.path.length > 1; // Basic check
    if (hasSubstantialText) score += 5;
    
    return { ...flow, score };
  });
  
  // Sort by score (highest first)
  return scored.sort((a, b) => b.score - a.score);
}

module.exports = { reduceNoise };
