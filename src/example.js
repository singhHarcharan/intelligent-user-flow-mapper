/**
 * Example script demonstrating the Intelligent User Flow Mapper
 * 
 * This script shows how to use the flow mapper programmatically
 * without running the Express server.
 */

const { crawlAndExtractFlows } = require('./services/flowMapper');
const fs = require('fs');
const path = require('path');

async function runExample() {
  console.log('='.repeat(60));
  console.log('Intelligent User Flow Mapper - Example');
  console.log('='.repeat(60));
  console.log();

  // Example 1: E-commerce site (simulated)
  // In production, you'd use a real URL like:
  // const startUrl = 'https://www.shopify.com';
  
  // For demonstration, we'll use a smaller site
  const startUrl = 'https://example.com';
  
  const config = {
    startUrl,
    crawlConfig: {
      maxDepth: 2,
      maxPages: 10,
      timeout: 15000
    }
  };

  console.log('Configuration:');
  console.log(JSON.stringify(config, null, 2));
  console.log();
  console.log('Starting extraction...');
  console.log();

  try {
    const result = await crawlAndExtractFlows(config);

    console.log();
    console.log('='.repeat(60));
    console.log('RESULTS');
    console.log('='.repeat(60));
    console.log();

    // Display metadata
    console.log('📊 Metadata:');
    console.log(`   Start URL: ${result.metadata.startUrl}`);
    console.log(`   Total Pages Crawled: ${result.metadata.totalPages}`);
    console.log(`   Total Flows Extracted: ${result.metadata.totalFlows}`);
    console.log(`   Generated At: ${result.metadata.generatedAt}`);
    console.log();

    // Display nodes
    console.log('📍 Nodes (Pages):');
    result.nodes.forEach(node => {
      console.log(`   [${node.id}] ${node.label} (${node.pageType})`);
      console.log(`       URL: ${node.url}`);
    });
    console.log();

    // Display edges
    console.log('🔗 Edges (Connections):');
    result.edges.forEach(edge => {
      console.log(`   ${edge.source} → ${edge.target}`);
      console.log(`       Flow Types: ${edge.flowTypes.join(', ')}`);
    });
    console.log();

    // Display flows
    console.log('🌊 User Flows:');
    result.flows.forEach((flow, index) => {
      console.log(`   ${index + 1}. ${flow.name} (${flow.type})`);
      console.log(`      Score: ${flow.score}`);
      console.log(`      Steps: ${flow.stepCount}`);
      flow.steps.forEach(step => {
        console.log(`         ${step.stepNumber}. ${step.label} (${step.pageType})`);
      });
      console.log();
    });

    // Save output to file
    const outputPath = path.join(__dirname, '..', 'output', 'example-output.json');
    const outputDir = path.dirname(outputPath);
    
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    
    console.log('='.repeat(60));
    console.log(`✅ Output saved to: ${outputPath}`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the example
runExample();
