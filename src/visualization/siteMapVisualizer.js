const fs = require('fs').promises;
const path = require('path');
const { createCanvas, loadImage } = require('canvas');
const { graphlib } = require('dagre');
const Graph = graphlib.Graph;

class SiteMapVisualizer {
  constructor(outputPath = './output.json') {
    this.outputPath = path.resolve(process.cwd(), outputPath);
    this.graph = new Graph();
    this.nodePositions = new Map();
  }

  async loadData() {
    try {
      const data = await fs.readFile(this.outputPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error loading output file:', error);
      throw error;
    }
  }

  async generateSitemap() {
    const data = await this.loadData();
    
    // Set up the graph
    this.graph.setDefaultEdgeLabel(() => ({}));
    this.graph.setGraph({
      rankdir: 'TB',  // Top to Bottom layout
      nodesep: 50,
      ranksep: 100,
    });

    // Add nodes
    data.nodes.forEach(node => {
      this.graph.setNode(node.id, {
        label: node.label || node.id,
        width: 150,
        height: 50,
        url: node.url,
        pageType: node.pageType
      });
    });

    // Add edges
    data.edges.forEach(edge => {
      if (this.graph.hasNode(edge.source) && this.graph.hasNode(edge.target)) {
        this.graph.setEdge(edge.source, edge.target);
      }
    });

    return this.generateSVG();
  }

  async generateSVG() {
    const { createSVGWindow } = require('svgdom');
    const { SVG, registerWindow } = require('@svgdotjs/svg.js');
    
    const window = createSVGWindow();
    const document = window.document;
    registerWindow(window, document);

    const width = 1200;
    const height = 800;
    const svg = SVG(document.documentElement).size(width, height);

    // Draw nodes
    this.graph.nodes().forEach(nodeId => {
      const node = this.graph.node(nodeId);
      const x = Math.random() * (width - 200) + 100;
      const y = Math.random() * (height - 100) + 50;
      
      // Store position for edges
      node.x = x;
      node.y = y;

      // Draw node
      const group = svg.group();
      group.rect(140, 40)
        .move(x - 70, y - 20)
        .radius(5)
        .fill('#4a6da7')
        .stroke({ width: 2, color: '#2c3e50' });
      
      group.text(node.label || nodeId)
        .font({
          size: 10,
          family: 'Arial',
          anchor: 'middle',
          leading: '1.5em'
        })
        .center(x, y);
    });

    // Draw edges
    this.graph.edges().forEach(edge => {
      const source = this.graph.node(edge.v);
      const target = this.graph.node(edge.w);
      
      if (source && target) {
        svg.line(source.x, source.y, target.x, target.y)
          .stroke({ width: 1, color: '#7f8c8d', linecap: 'round' })
          .opacity(0.5);
      }
    });

    const svgString = svg.svg();
    return svgString;
  }

  async saveSVGToFile(svgString, filename = 'sitemap.svg') {
    try {
      const outputPath = path.join(process.cwd(), 'public', 'visualizations');
      await fs.mkdir(outputPath, { recursive: true });
      
      const filePath = path.join(outputPath, filename);
      await fs.writeFile(filePath, svgString);
      return filePath;
    } catch (error) {
      console.error('Error saving SVG file:', error);
      throw error;
    }
  }
}

module.exports = SiteMapVisualizer;
