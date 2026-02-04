const express = require('express');
const { crawlAndExtractFlows } = require('./services/flowMapper');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

/**
 * POST /api/extract-flows
 * 
 * Request body:
 * {
 *   "startUrl": "https://example.com",
 *   "credentials": {
 *     "username": "user@example.com",
 *     "password": "password123"
 *   },
 *   "crawlConfig": {
 *     "maxDepth": 3,
 *     "maxPages": 50,
 *     "timeout": 30000
 *   }
 * }
 */
app.post('/api/extract-flows', async (req, res) => {
  try {
    const { startUrl, credentials, crawlConfig } = req.body;

    if (!startUrl) {
      return res.status(400).json({ error: 'startUrl is required' });
    }

    console.log(`Starting flow extraction for: ${startUrl}`);
    
    const result = await crawlAndExtractFlows({
      startUrl,
      credentials,
      crawlConfig
    });

    res.json(result);
  } catch (error) {
    console.error('Error extracting flows:', error);
    res.status(500).json({ 
      error: 'Failed to extract user flows',
      message: error.message 
    });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Intelligent User Flow Mapper API running on port ${PORT}`);
  console.log(`POST /api/extract-flows - Extract user flows from a website`);
});

module.exports = app;
