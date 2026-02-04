# System Architecture

## Design Principles

### 1. Separation of Concerns
Each module has a single, well-defined responsibility:
- **Crawler**: Data collection
- **Page Analyzer**: Semantic understanding
- **Flow Extractor**: Pattern detection
- **Noise Reducer**: Quality filtering
- **Output Formatter**: Data transformation

### 2. Stateless Processing
- No database required
- All processing in-memory
- Each request is independent
- Scales horizontally

### 3. Heuristic-Driven Intelligence
- Pattern matching over machine learning
- Explainable decisions
- Tunable parameters
- Debuggable logic

## Data Flow

```
User Request
    ↓
Input Validation
    ↓
Crawler (BFS Traversal)
    ↓
Page Collection + Link Extraction
    ↓
Page Analyzer (Context + Type Detection)
    ↓
Flow Extractor (Pattern Matching)
    ↓
Noise Reducer (Filtering + Scoring)
    ↓
Output Formatter (JSON Generation)
    ↓
Response to User
```

## Core Algorithms

### 1. Crawling Algorithm (BFS)

```
FUNCTION crawl(startUrl, maxDepth, maxPages):
    queue = [(startUrl, 0, null)]
    visited = Set()
    pages = []
    
    WHILE queue is not empty AND pages.length < maxPages:
        (url, depth, referrer) = queue.dequeue()
        
        IF url in visited OR depth > maxDepth:
            CONTINUE
        
        visited.add(url)
        
        page = fetchPage(url)
        links = extractLinks(page)
        
        FOR each link in links:
            IF link.domain == startUrl.domain:
                IF depth < maxDepth:
                    queue.enqueue((link.url, depth + 1, url))
        
        pages.append(page)
    
    RETURN pages
```

**Time Complexity**: O(V + E) where V = pages, E = links
**Space Complexity**: O(V)

### 2. Flow Extraction Algorithm

```
FUNCTION extractFlows(analyzedPages, startUrl):
    graph = buildContextualGraph(analyzedPages)
    entryPoints = identifyEntryPoints(analyzedPages, startUrl)
    flows = []
    
    FOR each pattern in [ecommerce, auth, support, content]:
        FOR each entry in entryPoints:
            flow = detectPattern(graph, entry, pattern)
            IF flow is valid:
                flows.append(flow)
    
    RETURN flows
```

### 3. Noise Reduction Algorithm

```
FUNCTION reduceNoise(flows):
    flows = removeDuplicates(flows)
    flows = removeSubsets(flows)
    flows = removeCircular(flows)
    flows = filterGeneric(flows)
    flows = scoreAndRank(flows)
    
    RETURN flows
```

**Scoring Function**:
```
score(flow) = lengthScore(flow) 
            + diversityScore(flow)
            + goalScore(flow)
            + typeScore(flow)

lengthScore = min(length * 10, 50)
diversityScore = uniquePageTypes * 5
goalScore = hasGoalPage ? 20 : 0
typeScore = typePriority[flow.type]
```

## Heuristic Details

### Global Navigation Detection

A link is considered "global navigation" if:

```python
isGlobalNav = (
    inHeader OR 
    inFooter OR 
    inNav OR 
    inSidebar OR
    hasNavClass OR
    positionInPage in [TOP_20%, BOTTOM_20%]
)
```

**Rationale**: Global navigation appears on most pages and doesn't represent user intent or progression.

### Page Type Classification

Page types are detected using cascading rules:

1. **URL Pattern Match** (highest priority)
   - `/login` → login
   - `/checkout` → checkout
   - `/products/{id}` → product-detail

2. **Title Keywords**
   - "Login" or "Sign In" → login
   - "Checkout" or "Cart" → checkout

3. **Content Analysis**
   - Password input + email input → login
   - Multiple product elements → product-list
   - Price + "Add to Cart" → product-detail

**Precedence**: URL > Title > Content

### Flow Pattern Detection

#### E-commerce Pattern
```
Sequence: home → product-list → product-detail → checkout

Required: At least 2 pages from the sequence
Optional: login between home and product-list
```

#### Authentication Pattern
```
Sequence: entry → login | entry → signup

Required: Direct connection to auth page
```

#### Support Pattern
```
Sequence: entry → support → contact

Required: At least support page
Optional: Contact form completion
```

## Performance Characteristics

### Time Complexity

| Operation | Complexity | Notes |
|-----------|------------|-------|
| Crawling | O(V + E) | V = pages, E = links |
| Page Analysis | O(V) | Linear in pages |
| Flow Extraction | O(V² * P) | P = patterns (~4) |
| Noise Reduction | O(F²) | F = flows |
| Output Formatting | O(F) | Linear in flows |

**Overall**: O(V² * P) dominated by flow extraction

### Space Complexity

| Data Structure | Space | Notes |
|----------------|-------|-------|
| Crawled Pages | O(V * H) | H = avg HTML size |
| Graph | O(V + E) | Adjacency list |
| Flows | O(F * L) | L = avg flow length |

**Overall**: O(V * H) dominated by HTML storage

### Typical Performance

For a site with 50 pages:
- Crawling: 5-10 seconds
- Analysis: < 1 second
- Flow Extraction: 1-2 seconds
- Output: < 1 second

**Total**: ~10-15 seconds

## Scalability Considerations

### Current Limits

- **Max Pages**: 50-100 (in-memory constraint)
- **Max Depth**: 3-4 (prevents over-crawling)
- **Timeout**: 30s per request

### Scaling Strategies

1. **Horizontal Scaling**
   - Stateless design allows multiple instances
   - Load balancer distributes requests

2. **Streaming Processing**
   - Process pages as they're crawled
   - Don't wait for complete crawl

3. **Caching**
   - Cache crawled pages by URL
   - TTL-based invalidation

4. **Database Integration** (if needed)
   - Store crawled pages in DB
   - Query for flow extraction

## Error Handling Strategy

### Network Errors
- Retry with exponential backoff
- Skip failed pages, continue crawl
- Log errors for debugging

### Parsing Errors
- Graceful degradation
- Use partial data when available
- Mark pages with parsing issues

### Flow Extraction Errors
- Continue with other patterns
- Return partial results
- Log extraction failures

## Extension Points

### Adding New Page Types

1. Add detection logic to `pageAnalyzer.js`:
```javascript
function detectCustomType($) {
    // Your detection logic
}
```

2. Update `identifyPageType()` to include new type

### Adding New Flow Patterns

1. Create pattern detector in `flowExtractor.js`:
```javascript
function extractCustomFlows(graph, analyzedPages, entryPoints) {
    // Your pattern logic
}
```

2. Call from `extractFlows()` main function

### Adding Authentication Support

1. Extend `crawlWebsite()` in `crawler.js`
2. Add authentication logic before requests
3. Handle sessions/cookies

## Testing Strategy

### Unit Tests
- Test each module independently
- Mock dependencies
- Focus on heuristics logic

### Integration Tests
- Test full pipeline
- Use known test sites
- Verify output structure

### End-to-End Tests
- Real websites
- Compare against expected flows
- Performance benchmarks

## Monitoring & Observability

### Metrics to Track
- Pages crawled per request
- Flows extracted per request
- Average response time
- Error rate
- Cache hit rate (if implemented)

### Logging
- Request start/end
- Crawl progress
- Flow extraction steps
- Errors and warnings

## Security Considerations

### Input Validation
- Validate URLs
- Sanitize user input
- Rate limiting

### Resource Limits
- Max pages per request
- Max depth
- Timeout protection

### Privacy
- Don't store user credentials
- Don't log sensitive data
- Respect robots.txt (future)

## Future Architecture Improvements

1. **Plugin System**: Allow custom flow detectors
2. **ML Integration**: Learn page types from labeled data
3. **Real-time Processing**: WebSocket for live updates
4. **Distributed Crawling**: Scale across multiple workers
5. **Graph Database**: Better flow querying and analysis
