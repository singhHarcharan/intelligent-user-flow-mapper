const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const cors = require('cors');
const SiteMapVisualizer = require('./siteMapVisualizer');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.static('public'));
app.use(express.json());

// API endpoint to generate sitemap visualization
app.get('/api/visualize/sitemap', async (req, res) => {
  try {
    const visualizer = new SiteMapVisualizer();
    const svg = await visualizer.generateSitemap();
    const filePath = await visualizer.saveSVGToFile(svg, 'sitemap.svg');
    
    res.json({
      success: true,
      svgPath: '/visualizations/sitemap.svg',
      message: 'Sitemap visualization generated successfully'
    });
  } catch (error) {
    console.error('Error generating sitemap visualization:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate sitemap visualization',
      details: error.message
    });
  }
});

// API endpoint to get raw data
app.get('/api/data', async (req, res) => {
  try {
    const data = await fs.readFile(path.join(__dirname, '../../output.json'), 'utf8');
    res.json(JSON.parse(data));
  } catch (error) {
    console.error('Error reading output file:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to read output data',
      details: error.message
    });
  }
});

// Serve the main visualization page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Start the server
app.listen(PORT, () => {
  console.log(`Visualization server running on http://localhost:${PORT}`);
  console.log(`- Sitemap: http://localhost:${PORT}/visualize/sitemap`);
  console.log(`- Raw Data: http://localhost:${PORT}/api/data`);
});
