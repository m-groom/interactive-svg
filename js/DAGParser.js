// DAG Parser - Handles parsing and processing of DAG-specific data
// Extends BaseParser functionality for DAG visualization needs

import { BaseParser } from './BaseParser.js';
import { DAGIndexUtils } from './DAGIndexUtils.js';
import { Logger } from './Logger.js';

export class DAGParser extends BaseParser {
    constructor() {
        super();
        this.indexUtils = null;
        this.nodesByLevel = {};
        this.nodesByGlobalId = {};
        this.edgesBySource = {};
        this.edgesByTarget = {};
        this.levelInfo = {};
    }
    
    /**
     * Parse DAG data with index utilities
     * @param {Object} dagData - The loaded vertical_transition_graph.json data
     * @param {Array<number>} kMaxArray - Array of cluster counts per level
     */
    parseDAGData(dagData, kMaxArray) {
        return this.parseAndValidate(dagData, { kMaxArray });
    }

    parseData(rawData, options = {}) {
        const { kMaxArray } = options;
        
        // Initialize index utilities
        this.indexUtils = new DAGIndexUtils(kMaxArray);
        
        // Process nodes with DAG-specific logic
        this.processDAGNodes(rawData.graph.nodes);
        
        // Process edges with DAG-specific logic
        this.processDAGEdges(rawData.graph.links);
        
        // Build level information
        this.buildLevelInfo();
        
        Logger.debug('DAG data parsed successfully');
        Logger.debug(`Processed ${Object.keys(this.nodesByGlobalId).length} nodes across ${Object.keys(this.nodesByLevel).length} levels`);
        Logger.debug(`Processed ${Object.keys(this.edgesBySource).length} edge relationships`);
        
        return rawData;
    }

    validateParsedData(parsedData, options = {}) {
        super.validateParsedData(parsedData, options);
        this.validateDAGStructure(parsedData);
    }
    
    /**
     * Validate DAG-specific data structure
     * @param {Object} dagData - The DAG data to validate
     */
    validateDAGStructure(dagData) {
        // Check top-level structure
        if (!dagData || typeof dagData !== 'object') {
            throw new Error('DAG data must be an object');
        }
        
        if (!dagData.graph) {
            throw new Error('DAG data must contain a "graph" property');
        }
        
        if (!dagData.graph.nodes || !Array.isArray(dagData.graph.nodes)) {
            throw new Error('DAG graph must contain a "nodes" array');
        }
        
        if (!dagData.graph.links || !Array.isArray(dagData.graph.links)) {
            throw new Error('DAG graph must contain a "links" array');
        }
        
        // Basic node validation
        if (dagData.graph.nodes.length === 0) {
            throw new Error('DAG graph must contain at least one node');
        }
        
        // Basic link validation
        if (dagData.graph.links.length === 0) {
            throw new Error('DAG graph must contain at least one link');
        }
        
        // Validate a few sample nodes have required fields
        const sampleNodes = dagData.graph.nodes.slice(0, Math.min(5, dagData.graph.nodes.length));
        for (const node of sampleNodes) {
            if (!node.hasOwnProperty('id') || typeof node.id !== 'number') {
                throw new Error(`Node missing or invalid "id" field: ${JSON.stringify(node)}`);
            }
            if (!node.hasOwnProperty('level') || typeof node.level !== 'number') {
                throw new Error(`Node missing or invalid "level" field: ${JSON.stringify(node)}`);
            }
            if (!node.hasOwnProperty('local_idx') || typeof node.local_idx !== 'number') {
                throw new Error(`Node missing or invalid "local_idx" field: ${JSON.stringify(node)}`);
            }
            if (!node.hasOwnProperty('dates') || !Array.isArray(node.dates)) {
                throw new Error(`Node missing or invalid "dates" field: ${JSON.stringify(node)}`);
            }
            if (!node.hasOwnProperty('ev') || typeof node.ev !== 'number') {
                throw new Error(`Node missing or invalid "ev" field: ${JSON.stringify(node)}`);
            }
        }
        
        // Validate a few sample links have required fields
        const sampleLinks = dagData.graph.links.slice(0, Math.min(5, dagData.graph.links.length));
        for (const link of sampleLinks) {
            if (!link.hasOwnProperty('source') || typeof link.source !== 'number') {
                throw new Error(`Link missing or invalid "source" field: ${JSON.stringify(link)}`);
            }
            if (!link.hasOwnProperty('target') || typeof link.target !== 'number') {
                throw new Error(`Link missing or invalid "target" field: ${JSON.stringify(link)}`);
            }
            if (!link.hasOwnProperty('weight') || typeof link.weight !== 'number') {
                throw new Error(`Link missing or invalid "weight" field: ${JSON.stringify(link)}`);
            }
            if (!link.hasOwnProperty('ci') || !Array.isArray(link.ci) || link.ci.length !== 2) {
                throw new Error(`Link missing or invalid "ci" field: ${JSON.stringify(link)}`);
            }
        }
        
        Logger.debug(`DAG structure validation passed: ${dagData.graph.nodes.length} nodes, ${dagData.graph.links.length} links`);
    }
    
    /**
     * Process DAG nodes with level grouping and validation
     * @param {Array} nodes - Array of node objects from DAG data
     */
    processDAGNodes(nodes) {
        for (const node of nodes) {
            const globalId = node.id;
            const level = node.level;
            const localIdx = node.local_idx;
            
            // Validate node structure
            if (!this.isValidDAGNode(node)) {
                Logger.warn(`Invalid DAG node structure for node ${globalId}`);
                continue;
            }
            
            // Validate index consistency
            if (!this.indexUtils.validateGlobalIndex(globalId, level, localIdx)) {
                Logger.warn(`Index validation failed for node ${globalId} (level ${level}, local ${localIdx})`);
            }
            
            // Store node by global ID
            this.nodesByGlobalId[globalId] = {
                ...node,
                // Add computed properties
                videoFilename: this.indexUtils.getVideoFilename(globalId),
                isObservedClass: level === 0,
                levelName: this.getLevelName(level),
                clusterName: this.getClusterName(level, localIdx)
            };
            
            // Group nodes by level
            if (!this.nodesByLevel[level]) {
                this.nodesByLevel[level] = {};
            }
            this.nodesByLevel[level][globalId] = this.nodesByGlobalId[globalId];
        }
    }
    
    /**
     * Process DAG edges with source/target indexing
     * @param {Array} links - Array of link objects from DAG data
     */
    processDAGEdges(links) {
        for (const link of links) {
            const sourceId = link.source;
            const targetId = link.target;
            
            // Validate edge structure
            if (!this.isValidDAGEdge(link)) {
                Logger.warn(`Invalid DAG edge structure for edge ${sourceId} -> ${targetId}`);
                continue;
            }
            
            // Get source and target nodes to determine levels
            const sourceNode = this.nodesByGlobalId[sourceId];
            const targetNode = this.nodesByGlobalId[targetId];
            
            if (!sourceNode || !targetNode) {
                Logger.warn(`Missing node data for edge ${sourceId} -> ${targetId}`);
                continue;
            }
            
            // Enhanced edge data
            const enhancedEdge = {
                ...link,
                sourceLevel: sourceNode.level,
                targetLevel: targetNode.level,
                isDAGEdge: sourceNode.level === targetNode.level + 1, // DAG edges go from level n to level n-1
                edgeType: this.getEdgeType(sourceNode.level, targetNode.level),
                transitionDirection: `Level ${sourceNode.level} → Level ${targetNode.level}`
            };
            
            // Index by source
            if (!this.edgesBySource[sourceId]) {
                this.edgesBySource[sourceId] = [];
            }
            this.edgesBySource[sourceId].push(enhancedEdge);
            
            // Index by target
            if (!this.edgesByTarget[targetId]) {
                this.edgesByTarget[targetId] = [];
            }
            this.edgesByTarget[targetId].push(enhancedEdge);
        }
    }
    
    /**
     * Build level information summary
     */
    buildLevelInfo() {
        for (let level = 0; level < this.indexUtils.numLevels; level++) {
            const nodesAtLevel = this.nodesByLevel[level] || {};
            const nodeCount = Object.keys(nodesAtLevel).length;
            const expectedCount = this.indexUtils.getNumNodesAtLevel(level);
            
            this.levelInfo[level] = {
                level,
                nodeCount,
                expectedCount,
                isComplete: nodeCount === expectedCount,
                isObservedLevel: level === 0,
                levelName: this.getLevelName(level),
                globalIndices: this.indexUtils.getGlobalIndicesForLevel(level),
                nodes: nodesAtLevel
            };
        }
    }
    
    /**
     * Validate DAG node structure
     * @param {Object} node - Node to validate
     * @returns {boolean} - True if valid
     */
    isValidDAGNode(node) {
        return node &&
               typeof node.id === 'number' &&
               typeof node.level === 'number' &&
               typeof node.local_idx === 'number' &&
               Array.isArray(node.dates) &&
               typeof node.ev === 'number';
    }
    
    /**
     * Validate DAG edge structure
     * @param {Object} edge - Edge to validate
     * @returns {boolean} - True if valid
     */
    isValidDAGEdge(edge) {
        return edge &&
               typeof edge.source === 'number' &&
               typeof edge.target === 'number' &&
               typeof edge.weight === 'number' &&
               Array.isArray(edge.ci) &&
               edge.ci.length === 2;
    }
    
    /**
     * Get node data formatted for tooltips and modals
     * @param {number} globalId - Global node ID
     * @returns {Object|null} - Formatted node data or null if not found
     */
    getNodeData(globalId) {
        const node = this.nodesByGlobalId[globalId];
        if (!node) {
            Logger.warn(`Node data not found for global ID ${globalId}`);
            return null;
        }
        
        // Format lambda values into the object structure expected by tooltips
        let lambdaValues = null;
        if (node.lambda && Array.isArray(node.lambda) && node.lambda.length === 3) {
            lambdaValues = {
                laNina: node.lambda[0],
                neutral: node.lambda[1],
                elNino: node.lambda[2]
            };
        }

        // Format data compatible with existing tooltip/modal system
        return {
            id: globalId,
            level: node.level,
            localIdx: node.local_idx,
            clusterName: node.clusterName,
            levelName: node.levelName,
            
            // Data for tooltips
            dates: node.dates,
            dateCount: node.dates.length,
            ev: node.ev,
            isObservedClass: node.isObservedClass,
            
            // Data for modals
            videoFilename: node.videoFilename,
            placeholderVideo: node.isObservedClass ? this.indexUtils.getPlaceholderVideo() : null,
            
            // Class probabilities (for observed classes or cluster info)
            lambda: lambdaValues,
            
            // Formatting helpers
            formattedEV: this.formatEV(node.ev),
            formattedDates: this.formatDatesForDisplay(node.dates),
            
            // Additional metadata
            nodeType: node.isObservedClass ? 'observed' : 'predicted',
            hasVideo: !node.isObservedClass,
            
            // For compatibility with existing system
            title: node.clusterName,
            subtitle: `${node.levelName} | ${node.dates.length} dates`,
            searchTerms: [node.clusterName.toLowerCase(), node.levelName.toLowerCase()]
        };
    }
    
    /**
     * Get edge data formatted for tooltips
     * @param {number} sourceId - Source node global ID
     * @param {number} targetId - Target node global ID
     * @returns {Object|null} - Formatted edge data or null if not found
     */
    getEdgeData(sourceId, targetId) {
        const sourceEdges = this.edgesBySource[sourceId] || [];
        const edge = sourceEdges.find(e => e.target === targetId);
        
        if (!edge) {
            Logger.warn(`Edge data not found for ${sourceId} -> ${targetId}`);
            return null;
        }
        
        const sourceNode = this.nodesByGlobalId[sourceId];
        const targetNode = this.nodesByGlobalId[targetId];
        
        // Format data for DAG edge tooltips
        return {
            source: sourceId,
            target: targetId,
            sourceLevel: edge.sourceLevel,
            targetLevel: edge.targetLevel,
            
            // Edge statistics
            weight: edge.weight,
            probability: edge.weight, // Same as weight for transition probability
            ci: edge.ci,
            cost: edge.cost || null,
            
            // Transition information
            transitionDirection: edge.transitionDirection,
            edgeType: edge.edgeType,
            isDAGEdge: edge.isDAGEdge,
            
            // Node information for context
            sourceCluster: sourceNode ? sourceNode.clusterName : `Cluster ${sourceId}`,
            targetCluster: targetNode ? targetNode.clusterName : `Cluster ${targetId}`,
            
            // Formatting helpers
            formattedWeight: this.formatProbability(edge.weight),
            formattedCI: this.formatConfidenceInterval(edge.ci),
            formattedCost: edge.cost ? this.formatCost(edge.cost) : null,
            
            // For tooltip display
            title: `${sourceNode?.clusterName || sourceId} → ${targetNode?.clusterName || targetId}`,
            subtitle: edge.transitionDirection,
            description: `Transition probability: ${this.formatProbability(edge.weight)}`
        };
    }
    
    /**
     * Get level name for display
     * @param {number} level - 0-based level number
     * @returns {string} - Human-readable level name
     */
    getLevelName(level) {
        if (level === 0) {
            return 'Observed Classes';
        }
        return `${level} Month${level > 1 ? 's' : ''} Lead Time`;
    }
    
    /**
     * Get cluster name for display
     * @param {number} level - 0-based level number
     * @param {number} localIdx - 1-based local index
     * @returns {string} - Human-readable cluster name
     */
    getClusterName(level, localIdx) {
        if (level === 0) {
            // Special names for observed classes
            const classNames = ['La Niña', 'Neutral', 'El Niño'];
            return classNames[localIdx - 1] || `Class ${localIdx}`;
        }
        return `Cluster ${localIdx}`;
    }
    
    /**
     * Get edge type classification
     * @param {number} sourceLevel - Source node level
     * @param {number} targetLevel - Target node level
     * @returns {string} - Edge type classification
     */
    getEdgeType(sourceLevel, targetLevel) {
        if (sourceLevel === targetLevel + 1) {
            return 'DAG Transition'; // Normal DAG edge (level n to level n-1)
        } else if (sourceLevel === targetLevel) {
            return 'Same Level'; // Unexpected but possible
        } else {
            return 'Skip Level'; // Skips levels
        }
    }
    
    /**
     * Format EV value for display
     * @param {number} ev - Expected value
     * @returns {string} - Formatted EV
     */
    formatEV(ev) {
        return ev.toFixed(2);
    }
    
    /**
     * Format probability for display
     * @param {number} prob - Probability value
     * @returns {string} - Formatted probability
     */
    formatProbability(prob) {
        return (prob * 100).toFixed(1) + '%';
    }
    
    /**
     * Format confidence interval for display
     * @param {Array<number>} ci - [lower, upper] confidence interval
     * @returns {string} - Formatted CI
     */
    formatConfidenceInterval(ci) {
        if (!Array.isArray(ci) || ci.length !== 2) return 'N/A';
        return `[${this.formatProbability(ci[0])}, ${this.formatProbability(ci[1])}]`;
    }
    
    /**
     * Format cost value for display
     * @param {number} cost - Cost value
     * @returns {string} - Formatted cost
     */
    formatCost(cost) {
        return cost.toFixed(3);
    }
    
    /**
     * Format dates for display (show first few and count)
     * @param {Array<string>} dates - Array of date strings
     * @returns {string} - Formatted date summary
     */
    formatDatesForDisplay(dates) {
        if (!Array.isArray(dates) || dates.length === 0) return 'No dates';
        
        if (dates.length <= 3) {
            return dates.join(', ');
        } else {
            return `${dates.slice(0, 3).join(', ')} ... (${dates.length} total)`;
        }
    }
    
    /**
     * Get all nodes at a specific level
     * @param {number} level - 0-based level number
     * @returns {Object} - Object with global IDs as keys, node data as values
     */
    getNodesAtLevel(level) {
        return this.nodesByLevel[level] || {};
    }
    
    /**
     * Get level information
     * @param {number} level - 0-based level number
     * @returns {Object|null} - Level info or null if not found
     */
    getLevelInfo(level) {
        return this.levelInfo[level] || null;
    }
    
    /**
     * Get all edges from a node
     * @param {number} globalId - Source node global ID
     * @returns {Array} - Array of edge objects
     */
    getEdgesFromNode(globalId) {
        return this.edgesBySource[globalId] || [];
    }
    
    /**
     * Get all edges to a node
     * @param {number} globalId - Target node global ID
     * @returns {Array} - Array of edge objects
     */
    getEdgesToNode(globalId) {
        return this.edgesByTarget[globalId] || [];
    }
    
    /**
     * Get summary statistics
     * @returns {Object} - Summary information
     */
    getSummary() {
        const baseStats = super.getSummary();
        
        return {
            ...baseStats,
            totalNodes: Object.keys(this.nodesByGlobalId).length,
            totalEdges: Object.values(this.edgesBySource).reduce((sum, edges) => sum + edges.length, 0),
            levels: Object.keys(this.nodesByLevel).length,
            observedClasses: Object.keys(this.nodesByLevel[0] || {}).length,
            indexUtilsSummary: this.indexUtils ? this.indexUtils.getSummary() : null,
            levelBreakdown: Object.fromEntries(
                Object.entries(this.levelInfo).map(([level, info]) => [
                    level, 
                    { nodeCount: info.nodeCount, expectedCount: info.expectedCount, isComplete: info.isComplete }
                ])
            )
        };
    }
}