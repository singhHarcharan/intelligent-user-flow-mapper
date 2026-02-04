# Intelligent User Flow Mapper

A backend service that extracts **meaningful user navigation flows** from websites, not raw link graphs.

## 🎯 Core Philosophy

This is **not** a traditional web crawler. While it uses crawling to collect data, the primary goal is to identify **intent-driven user journeys** by:

- Aggressively filtering noise (global navigation, redundant links)
- Detecting semantic page types (login, checkout, product, etc.)
- Building flows that represent actual user goals
- Prioritizing quality over quantity

## 🏗️ Architecture

The system follows a clear pipeline with separation of concerns:

```
Input → Crawler → Page Analyzer → Flow Extractor → Noise Reducer → Output Formatter → JSON
```

### 1. Crawler (`src/services/crawler.js`)
- **Purpose**: Fetch pages and extract links
- **Strategy**: BFS traversal with depth limiting
- **Key Feature**: Extracts link context (header, footer, nav, position)

### 2. Page Analyzer (`src/services/pageAnalyzer.js`)
- **Purpose**: Understand what each page represents
- **Strategy**: Pattern matching on URLs, titles, and content
- **Output**: Page type classification + link categorization

### 3. Flow Extractor (`src/services/flowExtractor.js`)
- **Purpose**: Build meaningful user journeys (THE CORE)
- **Strategy**: Pattern-based flow detection
- **Patterns Detected**:
  - **E-commerce**: Home → Product List → Product Detail → Checkout
  - **Authentication**: Home → Login/Signup
  - **Support**: Entry → Support → Contact
  - **Content Exploration**: Linear navigation paths

### 4. Noise Reducer (`src/services/noiseReducer.js`)
- **Purpose**: Remove redundant and low-quality flows
- **Techniques**:
  - Deduplication
  - Subset removal (A→B removed if A→B→C exists)
  - Generic content filtering
  - Circular path detection
  - Meaningfulness scoring

### 5. Output Formatter (`src/services/outputFormatter.js`)
- **Purpose**: Create frontend-ready JSON
- **Output Structure**: Nodes + Edges + Flows

## 🧠 Flow Extraction Strategy

### What Makes a Meaningful Flow?

A meaningful flow represents a **goal-oriented user journey**, not just arbitrary navigation.

**Good flows:**
- Home → Login → Dashboard
- Home → Product Listing → Product Details → Checkout
- Home → Support → Contact Form

**Bad flows (filtered out):**
- Home → About → Terms → Privacy (just clicking footer links)
- Home → Header Nav → Footer Nav → Header Nav (random navigation)

### Noise Reduction Heuristics

#### 1. **Global vs Contextual Link Classification**

Links are classified based on their position and context:

**Global Navigation** (filtered out):
- Links in `<header>`, `<footer>`, `<nav>`, `<aside>`
- Links with classes like `nav-`, `menu-`, `header-`, `footer-`
- Links appearing in top 20% or bottom 20% of page

**Contextual Navigation** (kept):
- Links in main content area
- Links with semantic meaning (buttons, CTAs)
- Links that advance user toward a goal

**Why this matters**: Global navigation creates noise. If every page links to "About" in the footer, it doesn't represent a meaningful user flow.

#### 2. **Page Type Detection**

Pages are classified into types to understand flow semantics:

| Page Type | Detection Heuristics |
|-----------|---------------------|
| `login` | URL contains `/login`, has password input |
| `checkout` | URL contains `/checkout`, has payment forms |
| `product-list` | Multiple product elements, grid layout |
| `product-detail` | Price + "Add to Cart" button |
| `contact` | URL contains `/contact`, has form |
| `support` | URL contains `/support` or `/help` |
| `home` | Root URL |

#### 3. **Flow Scoring**

Flows are scored based on:
- **Length**: Longer flows (up to 5 steps) are more meaningful
- **Diversity**: Flows with varied page types are richer
- **Goal pages**: Flows ending in checkout/contact are prioritized
- **Type**: E-commerce > Auth > Support > Generic content

#### 4. **Subset Removal**

If flow `A→B` exists and flow `A→B→C` exists, we keep only `A→B→C`.

**Rationale**: The longer flow provides more complete information.

#### 5. **Generic Content Filtering**

Flows where >70% of pages are generic "content" pages are removed.

**Rationale**: These are usually random exploration, not goal-driven.

## 📊 Output Format

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

### How Frontend Should Use This

The output is designed for flow visualization libraries:

1. **Nodes**: Render as boxes/cards with labels
2. **Edges**: Draw arrows between nodes
3. **Flows**: Group nodes into distinct user journeys
4. **Layout**: Use force-directed or hierarchical layout algorithms

Example frontend libraries that work well with this format:
- React Flow
- D3.js force layout
- Cytoscape.js
- vis.js

## 🚀 Usage

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

## ⚙️ Configuration

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

## 🔧 Technology Stack

- **Node.js** - Runtime
- **Express.js** - API framework
- **axios** - HTTP client
- **cheerio** - HTML parsing and DOM traversal

### Why These Choices?

- **No database**: Flows are computed in-memory. No persistent storage needed.
- **No Playwright by default**: Most sites work with static HTML parsing. Playwright can be added for SPA-heavy sites.
- **Cheerio over JSDOM**: Faster, lighter, sufficient for link extraction.
- **In-memory processing**: Keeps the service stateless and scalable.

## 📈 Tradeoffs & Limitations

### Known Limitations

1. **JavaScript-rendered content**: Default is static HTML parsing. For SPAs, use `rendering: "playwright"` or `authMode: "form"`.

2. **Authentication**: Supports basic and form-based login. OAuth and complex multi-step SSO are not supported.

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

## 🧪 Testing Strategy

To test this system effectively:

1. **Simple static site**: Should extract basic flows
2. **E-commerce site**: Should identify product → checkout flow
3. **Documentation site**: Should capture content hierarchy
4. **SPA**: Should identify limitations (requires Playwright)

## 🔮 Future Enhancements

1. **Playwright integration** - Optional for JS-heavy sites
2. **Cookie/session support** - Full auth workflows
3. **Machine learning** - Improve page type classification
4. **Graph algorithms** - Better flow detection (PageRank, centrality)
5. **Streaming output** - Handle larger sites
6. **Diff mode** - Compare flows across site versions

## 💡 Key Insights

### Why This Approach Works

1. **Context matters**: Links in headers/footers mean different things than links in content
2. **Page types are semantic**: A checkout page has different navigation meaning than a blog post
3. **Goal-oriented thinking**: Users navigate with intent, not randomly
4. **Less is more**: 5 meaningful flows > 50 noisy link graphs

### When to Use This

✅ **Good for:**
- Understanding user journeys on your site
- Identifying conversion funnels
- UX audits and navigation analysis
- Onboarding flow optimization

❌ **Not for:**
- Full site mapping/sitemap generation
- SEO crawling
- Link validation
- Content extraction

## 📝 License

MIT

---

**Built with engineering judgment and simplicity in mind.**
