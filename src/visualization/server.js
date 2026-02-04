const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const cors = require('cors');
const { crawlAndExtractFlows } = require('../services/flowMapper');
const activeJobs = new Map();
const activeLogs = new Map();

const app = express();
const PORT = process.env.PORT || 3001;

// Get the project root directory (two levels up from src/visualization)
const projectRoot = path.join(__dirname, '../..');

// Middleware
app.use(cors());
app.use(express.json());

// Fetch logs for a job
app.get('/api/job-logs/:jobId', (req, res) => {
  const { jobId } = req.params;
  if (!jobId || !activeLogs.has(jobId)) {
    return res.status(404).json({ error: 'Job not found' });
  }
  const job = activeLogs.get(jobId);
  return res.json({ logs: job.logs, done: job.done });
});

// Cancel an in-flight crawl by jobId
app.post('/api/cancel-crawl', (req, res) => {
  const { jobId } = req.body || {};
  if (!jobId || !activeJobs.has(jobId)) {
    return res.status(404).json({ error: 'Job not found' });
  }

  const controller = activeJobs.get(jobId);
  controller.abort();
  activeJobs.delete(jobId);
  if (activeLogs.has(jobId)) {
    activeLogs.get(jobId).done = true;
  }
  return res.json({ cancelled: true, jobId });
});

// API endpoint to trigger a fresh crawl + flow extraction
app.post('/api/extract-flows', async (req, res) => {
  try {
    const { startUrl, credentials, crawlConfig, jobId } = req.body || {};

    if (!startUrl) {
      return res.status(400).json({ error: 'startUrl is required' });
    }

    const controller = new AbortController();
    const requestJobId = jobId || `job-${Date.now()}`;
    activeJobs.set(requestJobId, controller);
    activeLogs.set(requestJobId, { logs: [], done: false });

    const log = (message) => {
      const record = { ts: new Date().toISOString(), message };
      const bucket = activeLogs.get(requestJobId);
      if (bucket) {
        bucket.logs.push(record);
        if (bucket.logs.length > 200) {
          bucket.logs.shift();
        }
      }
      console.log(message);
    };

    log(`Job ${requestJobId} started for ${startUrl}`);

    const output = await crawlAndExtractFlows({
      startUrl,
      credentials,
      crawlConfig,
      onLog: log,
      abortSignal: controller.signal
    });

    activeJobs.delete(requestJobId);
    if (activeLogs.has(requestJobId)) {
      activeLogs.get(requestJobId).done = true;
    }
    log(`Job ${requestJobId} completed`);
    res.json(output);
  } catch (error) {
    if (error?.name === 'AbortError') {
      console.log('Crawl cancelled by user.');
      if (jobId && activeLogs.has(jobId)) {
        activeLogs.get(jobId).done = true;
      }
      return res.status(409).json({
        error: 'Crawl cancelled',
        message: 'Crawl cancelled by user'
      });
    }

    console.error('Error extracting flows:', error);
    res.status(500).json({
      error: 'Failed to extract user flows',
      message: error.message
    });
  }
});

// Serve static files from the public directory
app.use(express.static(path.join(projectRoot, 'public')));

// API endpoint to get raw data
app.get('/api/data', async (req, res) => {
  try {
    const data = await fs.readFile(path.join(projectRoot, 'output.json'), 'utf8');
    res.json(JSON.parse(data));
  } catch (error) {
    console.error('Error reading output file:', error);
    // Try to serve a sample file if the main one doesn't exist
    try {
      const sampleData = await fs.readFile(path.join(projectRoot, 'output/sample-output.json'), 'utf8');
      console.log('Serving sample data instead');
      return res.json(JSON.parse(sampleData));
    } catch (sampleError) {
      console.error('Error reading sample output file:', sampleError);
      res.status(500).json({
        success: false,
        error: 'Failed to read output data',
        details: error.message
      });
    }
  }
});

// Serve the main visualization page
app.get('*', (req, res) => {
  res.sendFile(path.join(projectRoot, 'public/index.html'));
});

// Start the server
app.listen(PORT, () => {
  console.log(`Visualization server running on http://localhost:${PORT}`);
  console.log(`Project root: ${projectRoot}`);
});
