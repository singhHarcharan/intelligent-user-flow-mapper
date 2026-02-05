# Intelligent User Flow Mapper

A backend service that extracts meaningful user navigation flows from websites (not raw link graphs).

## Overview

This service crawls a site, classifies pages, removes global navigation noise, and returns user-flow JSON suitable for visualization.

## Architecture

The system follows a clear pipeline with separation of concerns:

```
Input → Crawler → Page Analyzer → Flow Extractor → Noise Reducer → Output Formatter → JSON
```

### 1. Crawler (`src/services/crawler.js`)
- Fetches pages and extracts links (BFS + depth limits)
- Captures link context (header/footer/nav/position)

### 2. Page Analyzer (`src/services/pageAnalyzer.js`)
- Classifies pages by type using URL/title/content heuristics
- Separates global vs contextual links

### 3. Flow Extractor (`src/services/flowExtractor.js`)
- Extracts goal-oriented flows using page types and graph structure
- Patterns: ecommerce, auth, support, content

### 4. Noise Reducer (`src/services/noiseReducer.js`)
- Removes redundant/low-value flows
- Dedupes by URL and by page-type sequence
- Collapses consecutive identical page types

### 5. Output Formatter (`src/services/outputFormatter.js`)
- Produces JSON for frontend visualization

## Flow Extraction Notes

Meaningful flows are goal-oriented paths, not raw link graphs. The pipeline focuses on:

- Page type detection (login, checkout, product list/detail, support, contact, home)
- Global vs contextual links (header/footer/nav vs in-content)
- Deduplication (URL-based and page-type sequence)
- Subset removal and circular path filtering

This keeps output concise and readable while preserving intent-driven navigation.

## Output Format

The service outputs JSON structured for frontend visualization:

```json
{
  "metadata": {
    "startUrl": "https://example.com",
    "totalPages": 15,
    "totalFlows": 4,
    "generatedAt": "2026-02-04T00:00:00.000Z"
  },
  "nodes": [
    {
      "id": "home",
      "url": "https://example.com/",
      "label": "Home Page",
      "pageType": "home",
      "title": "Welcome - Example Site",
      "metadata": {
        "hasForm": false,
        "hasLogin": false,
        "hasCheckout": false
      }
    },
    {
      "id": "products",
      "url": "https://example.com/products",
      "label": "Product Listing",
      "pageType": "product-list",
      "title": "Our Products",
      "metadata": {
        "hasForm": false,
        "hasLogin": false,
        "hasCheckout": false
      }
    }
  ],
  "edges": [
    {
      "id": "home->products",
      "source": "home",
      "target": "products",
      "sourceUrl": "https://example.com/",
      "targetUrl": "https://example.com/products",
      "flowTypes": ["ecommerce"]
    }
  ],
  "flows": [
    {
      "id": "ecommerce-home-products-checkout",
      "type": "ecommerce",
      "name": "Product Purchase Flow",
      "score": 85,
      "steps": [
        {
          "stepNumber": 1,
          "nodeId": "home",
          "url": "https://example.com/",
          "label": "Home Page",
          "pageType": "home",
          "title": "Welcome"
        },
        {
          "stepNumber": 2,
          "nodeId": "products",
          "url": "https://example.com/products",
          "label": "Product Listing",
          "pageType": "product-list",
          "title": "Our Products"
        }
      ],
      "stepCount": 2
    }
  ]
}
```

### Frontend Usage

The output is designed for flow visualization libraries:

1. **Nodes**: Render as boxes/cards with labels
2. **Edges**: Draw arrows between nodes
3. **Flows**: Group nodes into distinct user journeys
4. **Layout**: Use force-directed or hierarchical layout algorithms

Example frontend libraries:
- React Flow
- D3.js force layout
- Cytoscape.js
- vis.js

## Usage

### Installation

```bash
npm install
```

### Running the Server

```bash
npm start
```

The UI + API will be available at `http://localhost:3001`

If you want the API-only server:

```bash
node src/index.js
```

This runs at `http://localhost:3000`.

### SPA / Auth Crawling (Playwright)

Playwright requires browser binaries:

```bash
npx playwright install
```

### API Endpoint

**POST** `/api/extract-flows`

**Request:**
```json
{
  "startUrl": "https://example.com",
  "credentials": {
    "username": "user@example.com",
    "password": "password123"
  },
  "crawlConfig": {
    "maxDepth": 3,
    "maxPages": 50,
    "timeout": 30000,
    "rendering": "auto",
    "delayMs": 250,
    "maxRetries": 3,
    "retryBaseMs": 500,
    "retryMaxMs": 5000,
    "authMode": "auto",
    "loginUrl": "https://example.com/login"
  }
}
```

**Response:** See Output Format section above

### Testing with Example

```bash
npm test
```

This runs an example against a demo site and outputs the result.

## Configuration

### Default Values

| Parameter | Default | Description |
|-----------|---------|-------------|
| `maxDepth` | 3 | Maximum crawl depth |
| `maxPages` | 50 | Maximum pages to crawl |
| `timeout` | 30000ms | Request timeout |
| `rendering` | `auto` | `static` (axios), `playwright`, or `auto` |
| `delayMs` | 250 | Delay between requests |
| `maxRetries` | 3 | Retry count for 429/5xx |
| `retryBaseMs` | 500 | Base backoff for retries |
| `retryMaxMs` | 5000 | Max backoff for retries |
| `authMode` | `auto` | `none`, `basic`, `form`, or `auto` |
| `loginUrl` | null | Optional login URL for form auth |

### Optional Authentication

The service supports both basic auth and form-based auth. If provided, it will be used for all requests:

```json
{
  "credentials": {
    "username": "user@example.com",
    "password": "password123"
  },
  "crawlConfig": {
    "authMode": "basic"
  }
}
```

For SPA / form login flows:

```json
{
  "credentials": {
    "username": "user@example.com",
    "password": "password123"
  },
  "crawlConfig": {
    "authMode": "form",
    "loginUrl": "https://example.com/login",
    "rendering": "playwright"
  }
}
```

## Technology Stack

- **Node.js** - Runtime
- **Express.js** - API framework
- **axios** - HTTP client
- **cheerio** - HTML parsing and DOM traversal

### Design Notes

- No database; flows are computed in-memory.
- Cheerio for HTML parsing; Playwright optional for SPAs.

## Tradeoffs & Limitations

### Known Limitations

1. **JavaScript-rendered content**: Default is static HTML. Use `rendering: "playwright"` for SPAs.

2. **Authentication**: Basic and simple form login only. OAuth/SSO not supported.

3. **Scale**: In-memory processing limits crawl size.
   - **Mitigation**: Adequate for most sites (50-100 pages). Can add streaming for larger sites.

4. **Heuristics accuracy**: Page type detection based on patterns, not perfect.
   - **Mitigation**: Heuristics tuned for common patterns. Can be improved with ML.

### Design Tradeoffs

| Decision | Rationale | Tradeoff |
|----------|-----------|----------|
| In-memory only | Simplicity, no DB overhead | Can't handle huge sites (1000+ pages) |
| No Playwright default | 90% of sites don't need it | SPAs require manual intervention |
| Pattern-based extraction | Explainable, debuggable | Less accurate than ML approaches |
| Aggressive filtering | High precision flows | May miss some valid paths |

## Testing Strategy

To test this system effectively:

1. **Simple static site**: Should extract basic flows
2. **E-commerce site**: Should identify product → checkout flow
3. **Documentation site**: Should capture content hierarchy
4. **SPA**: Should identify limitations (requires Playwright)

## Future Enhancements

1. **Playwright integration** - Optional for JS-heavy sites
2. **Cookie/session support** - Full auth workflows
3. **Machine learning** - Improve page type classification
4. **Graph algorithms** - Better flow detection (PageRank, centrality)
5. **Streaming output** - Handle larger sites
6. **Diff mode** - Compare flows across site versions

## When to Use This

Good for:
- User journey mapping
- Conversion funnel analysis
- Navigation/UX audits

Not for:
- Full sitemap generation
- SEO crawling
- Link validation

## License

MIT
