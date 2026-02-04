// Main visualization controller
class VisualizationController {
  constructor() {
    this.data = null;
    this.filteredNodes = new Set();
    this.highlightedNode = null;
    this.highlightedFlow = null;
    this.zoom = d3.zoom().scaleExtent([0.1, 5]);
    
    this.initialize();
  }

  async initialize() {
    // Load data
    await this.loadData();
    
    // Initialize visualization
    this.initVisualization();
    
    // Setup event listeners
    this.setupEventListeners();
    
    // Render the initial visualization
    this.render();
  }

  async loadData() {
    try {
      const response = await fetch('/api/data');
      this.data = await response.json();
      this.analyzeData();
    } catch (error) {
      console.error('Error loading data:', error);
      alert('Failed to load data. Please check the console for details.');
    }
  }

  analyzeData() {
    // Count page types
    this.pageTypes = {};
    this.data.nodes.forEach(node => {
      const type = node.pageType || 'other';
      this.pageTypes[type] = (this.pageTypes[type] || 0) + 1;
    });

    // Sort flows by score
    this.sortedFlows = [...this.data.flows].sort((a, b) => b.score - a.score);
  }

  initVisualization() {
    // Set up the SVG container
    this.svg = d3.select('#sitemap');
    this.container = this.svg.append('g');
    
    // Set up zoom behavior
    this.zoom = d3.zoom()
      .scaleExtent([0.1, 5])
      .on('zoom', (event) => {
        this.container.attr('transform', event.transform);
      });
    
    this.svg.call(this.zoom);
    
    // Set up tooltip
    this.tooltip = d3.select('#tooltip');
  }

  setupEventListeners() {
    // Zoom controls
    d3.select('#zoomIn').on('click', () => {
      this.zoom.scaleBy(this.svg.transition().duration(300), 1.2);
    });
    
    d3.select('#zoomOut').on('click', () => {
      this.zoom.scaleBy(this.svg.transition().duration(300), 0.8);
    });
    
    d3.select('#resetZoom').on('click', () => {
      this.svg.transition().duration(300).call(
        this.zoom.transform,
        d3.zoomIdentity
      );
    });
  }

  render() {
    if (!this.data) return;

    // Clear existing elements
    this.container.selectAll('*').remove();

    // Create a D3 force simulation
    const simulation = d3.forceSimulation(this.data.nodes)
      .force('charge', d3.forceManyBody().strength(-500))
      .force('link', d3.forceLink(this.data.edges).id(d => d.id).distance(100))
      .force('center', d3.forceCenter(
        this.svg.node().clientWidth / 2,
        this.svg.node().clientHeight / 2
      ))
      .force('collision', d3.forceCollide().radius(60));

    // Create links
    const link = this.container.append('g')
      .selectAll('line')
      .data(this.data.edges)
      .enter().append('line')
      .attr('class', 'link')
      .attr('marker-end', 'url(#arrowhead)');

    // Create nodes
    const node = this.container.append('g')
      .selectAll('.node')
      .data(this.data.nodes)
      .enter().append('g')
      .attr('class', 'node')
      .call(d3.drag()
        .on('start', this.dragstarted.bind(this))
        .on('drag', this.dragged.bind(this))
        .on('end', this.dragended.bind(this)));

    // Add rectangles to nodes
    node.append('rect')
      .attr('width', 140)
      .attr('height', 40)
      .attr('rx', 5)
      .attr('ry', 5);

    // Add text to nodes
    node.append('text')
      .attr('dy', '.35em')
      .text(d => {
        // Truncate long labels
        const maxLength = 15;
        return d.label.length > maxLength 
          ? d.label.substring(0, maxLength) + '...' 
          : d.label;
      });

    // Add hover effects
    node.on('mouseover', (event, d) => this.handleNodeHover(event, d))
        .on('mouseout', () => this.handleNodeOut())
        .on('click', (event, d) => this.handleNodeClick(event, d));

    // Update positions on simulation tick
    simulation.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    // Add arrow marker for links
    this.svg.append('defs').append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 70) // Position the arrow at the end of the line
      .attr('refY', 0)
      .attr('orient', 'auto')
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#7f8c8d');

    // Render page type filters
    this.renderPageTypeFilters();
    
    // Render user flows
    this.renderUserFlows();
  }

  renderPageTypeFilters() {
    const container = d3.select('#pageTypeFilter');
    container.selectAll('*').remove();
    
    Object.entries(this.pageTypes).forEach(([type, count]) => {
      const div = container.append('div')
        .attr('class', 'flex items-center')
        .on('click', () => this.togglePageTypeFilter(type));
      
      div.append('input')
        .attr('type', 'checkbox')
        .attr('id', `filter-${type}`)
        .attr('class', 'mr-2');
      
      div.append('label')
        .attr('for', `filter-${type}`)
        .text(`${type} (${count})`);
    });
  }

  renderUserFlows() {
    const container = d3.select('#userFlows');
    container.selectAll('*').remove();
    
    // Show top 5 flows
    this.sortedFlows.slice(0, 5).forEach((flow, i) => {
      const flowDiv = container.append('div')
        .attr('class', 'p-2 border rounded hover:bg-gray-50 cursor-pointer')
        .on('click', () => this.highlightFlow(flow));
      
      flowDiv.append('div')
        .attr('class', 'font-medium text-blue-600')
        .text(`Flow #${i + 1} (Score: ${flow.score})`);
      
      flowDiv.append('div')
        .attr('class', 'text-sm text-gray-600 truncate')
        .text(flow.name);
    });
  }

  togglePageTypeFilter(type) {
    if (this.filteredNodes.has(type)) {
      this.filteredNodes.delete(type);
    } else {
      this.filteredNodes.add(type);
    }
    this.updateNodeVisibility();
  }

  updateNodeVisibility() {
    this.container.selectAll('.node')
      .style('display', d => {
        if (this.filteredNodes.size === 0) return 'block';
        return this.filteredNodes.has(d.pageType) ? 'block' : 'none';
      });
    
    // Update links based on visible nodes
    this.container.selectAll('.link')
      .style('display', d => {
        if (this.filteredNodes.size === 0) return 'block';
        return (this.filteredNodes.has(d.source.pageType) && 
                this.filteredNodes.has(d.target.pageType)) 
               ? 'block' : 'none';
      });
  }

  handleNodeHover(event, d) {
    // Highlight node and connected links
    d3.select(event.currentTarget).classed('highlighted', true);
    
    // Show tooltip
    this.tooltip
      .style('opacity', 1)
      .html(`
        <div class="font-bold">${d.label || d.id}</div>
        <div>Type: ${d.pageType || 'N/A'}</div>
        <div class="mt-1">
          <a href="${d.url}" target="_blank" class="text-blue-400 hover:underline">
            ${d.url}
          </a>
        </div>
      `)
      .style('left', (event.pageX + 10) + 'px')
      .style('top', (event.pageY - 10) + 'px');
  }

  handleNodeOut() {
    // Remove highlights
    d3.selectAll('.node.highlighted').classed('highlighted', false);
    
    // Hide tooltip
    this.tooltip.style('opacity', 0);
  }

  handleNodeClick(event, d) {
    // Update node info panel
    const infoDiv = d3.select('#nodeInfo');
    infoDiv.html(`
      <div class="font-semibold">${d.label || d.id}</div>
      <div>Type: ${d.pageType || 'N/A'}</div>
      <div class="mt-2">
        <a href="${d.url}" target="_blank" class="text-blue-500 hover:underline">
          Visit Page →
        </a>
      </div>
      <div class="mt-2 text-sm">
        <div>Incoming: ${this.countIncomingLinks(d.id)}</div>
        <div>Outgoing: ${this.countOutgoingLinks(d.id)}</div>
      </div>
    `);
  }

  highlightFlow(flow) {
    // Reset previous highlights
    this.container.selectAll('.link.highlighted').classed('highlighted', false);
    this.container.selectAll('.node.highlighted').classed('highlighted', false);
    
    // Parse flow path (this is a simplified example)
    const path = flow.id.split('->');
    
    // Highlight nodes in the flow
    path.forEach(nodeId => {
      this.container.selectAll('.node')
        .filter(d => d.id === nodeId)
        .classed('highlighted', true);
    });
    
    // Highlight links in the flow
    for (let i = 0; i < path.length - 1; i++) {
      const source = path[i];
      const target = path[i + 1];
      
      this.container.selectAll('.link')
        .filter(d => d.source.id === source && d.target.id === target)
        .classed('highlighted', true);
    }
    
    // Update node info with flow details
    const infoDiv = d3.select('#nodeInfo');
    infoDiv.html(`
      <div class="font-semibold">Flow: ${flow.name}</div>
      <div>Score: ${flow.score}</div>
      <div class="mt-2 text-sm">
        <div>Path: ${path.join(' → ')}</div>
      </div>
    `);
  }

  countIncomingLinks(nodeId) {
    return this.data.edges.filter(edge => edge.target === nodeId).length;
  }

  countOutgoingLinks(nodeId) {
    return this.data.edges.filter(edge => edge.source === nodeId).length;
  }

  // Drag functions
  dragstarted(event, d) {
    if (!event.active) this.simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }

  dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
  }

  dragended(event, d) {
    if (!event.active) this.simulation.alphaTarget(0);
    d.fx = event.x;
    d.fy = event.y;
  }
}

// Initialize the visualization when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.viz = new VisualizationController();
});
