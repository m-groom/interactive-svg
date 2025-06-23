import { CONFIG, SELECTORS, CSS_CLASSES, ERROR_MESSAGES } from './constants.js';
import { Logger } from './Logger.js';

export class SVGParser {
    constructor() {
        this.nodeData = {};
        this.edgeData = {};
        this.jsonParser = null;
    }

    parseAndSetupInteractivity(svgElement, jsonParser) {
        this.jsonParser = jsonParser;
        this.nodeData = {};
        this.edgeData = {};

        if (!svgElement) {
            throw new Error(ERROR_MESSAGES.SVG_NOT_FOUND);
        }

        // Get all path elements and separate nodes from edges
        const allPaths = svgElement.querySelectorAll('path');
        const { nodes, edges } = this.classifyPaths(allPaths);

        Logger.debug(`Found ${nodes.length} nodes and ${edges.length} edges in SVG`);

        // Validate compatibility with JSON data if available
        if (jsonParser?.parsedData) {
            const validation = jsonParser.validateCompatibility(nodes.length, edges.length);
            if (!validation.isValid) {
                Logger.warn('JSON-SVG compatibility warning:', validation.error);
                // Continue anyway, but log the issue
            }
        }

        // Generate simplified node and edge data using JSON
        this.generateNodeData(nodes, jsonParser);
        this.generateEdgeData(edges, jsonParser);

        // Make elements interactive
        this.makeNodesInteractive(nodes);
        this.makeArrowsInteractive(svgElement, edges);

        Logger.debug(`Generated data for ${Object.keys(this.nodeData).length} nodes and ${Object.keys(this.edgeData).length} edges`);

        return {
            nodeCount: nodes.length,
            edgeCount: edges.length,
            nodeData: this.nodeData,
            edgeData: this.edgeData
        };
    }

    classifyPaths(allPaths) {
        const nodes = [];
        const edges = [];

        allPaths.forEach((path) => {
            const fill = path.getAttribute('fill');
            const strokeWidth = path.getAttribute('stroke-width');
            const fillRule = path.getAttribute('fill-rule');

            // Nodes are paths with fill-rule="nonzero" and stroke-width="1" (the circles)
            if (fillRule === 'nonzero' && strokeWidth === '1') {
                nodes.push(path);
            }
            // Edges are paths with fill="none" and various stroke-widths (the connecting lines)
            else if (fill === 'none' && strokeWidth && strokeWidth !== '1') {
                edges.push(path);
            }
        });

        return { nodes, edges };
    }

    generateNodeData(nodes, jsonParser) {
        nodes.forEach((node, index) => {
            // SIMPLIFIED: Use element index directly as node ID
            const nodeId = index + 1;
            const nodeKey = `node-${index}`;

            // Get data from JSON if available
            let nodeInfo = { id: nodeId };
            
            if (jsonParser?.parsedData) {
                const jsonNode = jsonParser.getNodeData(nodeId);
                if (jsonNode) {
                    nodeInfo = {
                        id: nodeId,
                        lambda: jsonParser.getNodeLambdaValues(nodeId),
                        ev: jsonNode.ev,
                        dates: jsonNode.dates
                    };
                } else {
                    Logger.warn(`No JSON data found for node ${nodeId}`);
                }
            }

            // Fallback to cluster naming if no JSON data
            if (!nodeInfo.lambda) {
                nodeInfo.displayName = `Cluster ${nodeId}`;
            }

            this.nodeData[nodeKey] = nodeInfo;
        });
    }

    generateEdgeData(edges, jsonParser) {
        edges.forEach((edge, index) => {
            const edgeKey = `edge-${index}`;
            
            // Extract basic edge properties
            const strokeWidth = parseFloat(edge.getAttribute('stroke-width')) || 1;
            const strokeColor = edge.getAttribute('stroke');
            
            let edgeInfo = {
                strokeWidth: strokeWidth,
                strokeColor: strokeColor
            };

            // Use JSON data directly if available (preferred approach)
            if (jsonParser?.parsedData) {
                const jsonLinks = jsonParser.getAllLinks();
                
                // Try to match edge to JSON link by stroke width (which correlates with probability)
                const matchedLink = this.findMatchingJSONLink(edge, jsonLinks, strokeWidth);
                
                if (matchedLink) {
                    const sourceId = matchedLink.source;
                    const targetId = matchedLink.target;
                    
                    edgeInfo = {
                        ...edgeInfo,
                        source: `Cluster ${sourceId}`,
                        target: `Cluster ${targetId}`,
                        sourceId: sourceId,
                        targetId: targetId,
                        type: sourceId === targetId ? 'Self-loop' : 'Transition',
                        probability: matchedLink.probability,
                        confidenceInterval: matchedLink.ci || null
                    };
                    
                    Logger.debug(`Edge ${index}: Cluster ${sourceId} -> Cluster ${targetId} (p=${matchedLink.probability.toFixed(3)}, width=${strokeWidth})`);
                } else {
                    Logger.warn(`No matching JSON link found for edge ${index} (width=${strokeWidth})`);
                    edgeInfo = {
                        ...edgeInfo,
                        ...this.fallbackEdgeAnalysis(edge, index),
                        probability: this.calculateEdgeProbabilityFromWidth(strokeWidth)
                    };
                }
            } else {
                // Fallback to SVG analysis if no JSON data
                edgeInfo = {
                    ...edgeInfo,
                    ...this.fallbackEdgeAnalysis(edge, index),
                    probability: this.calculateEdgeProbabilityFromWidth(strokeWidth)
                };
            }

            this.edgeData[edgeKey] = edgeInfo;
        });
    }

    findMatchingJSONLink(edge, jsonLinks, strokeWidth) {
        // Calculate expected probability from stroke width using the original formula
        const expectedProbability = this.calculateEdgeProbabilityFromWidth(strokeWidth);
        
        // Find JSON link with closest probability match
        let bestMatch = null;
        let bestDifference = Infinity;
        
        for (const link of jsonLinks) {
            const difference = Math.abs(link.probability - expectedProbability);
            if (difference < bestDifference) {
                bestDifference = difference;
                bestMatch = link;
            }
        }
        
        // Only accept the match if it's reasonably close (within 10% tolerance)
        if (bestMatch && bestDifference <= 0.1) {
            return bestMatch;
        }
        
        return null;
    }

    fallbackEdgeAnalysis(edge, edgeIndex) {
        // Fallback method for when JSON data is not available
        // This provides basic edge information using simple heuristics
        
        Logger.warn(`Using fallback edge analysis for edge ${edgeIndex}`);
        
        return {
            source: `Edge ${edgeIndex} Source`,
            target: `Edge ${edgeIndex} Target`,
            sourceId: null,
            targetId: null,
            type: 'Connection'
        };
    }

    calculateEdgeProbabilityFromWidth(edgeWidth) {
        // Legacy calculation: probability = (edge width - 0.4) / 6
        const probability = (edgeWidth - 0.4) / 6;
        return Math.max(0, Math.min(1, probability));
    }

    makeNodesInteractive(nodes) {
        nodes.forEach((node, index) => {
            node.classList.add(CSS_CLASSES.NODE_INTERACTIVE);
            node.setAttribute('data-node-id', `node-${index}`);
        });
    }

    makeArrowsInteractive(svgElement, edges) {
        // Find arrow elements and make them interactive
        const arrows = svgElement.querySelectorAll(SELECTORS.SVG_ARROWS);
        
        arrows.forEach((arrow) => {
            // Skip if this is a node (nodes have stroke-width="1")
            const strokeWidth = arrow.getAttribute('stroke-width');
            if (strokeWidth === '1') return;

            // Find the corresponding edge by matching arrow color to edge color
            const arrowColor = arrow.getAttribute('fill');
            let matchingEdgeIndex = -1;
            let matchingEdge = null;

            edges.forEach((edge, edgeIndex) => {
                const edgeColor = edge.getAttribute('stroke');
                if (arrowColor === edgeColor) {
                    matchingEdgeIndex = edgeIndex;
                    matchingEdge = edge;
                }
            });

            // Only add interaction if we found a matching edge
            if (matchingEdgeIndex >= 0 && matchingEdge) {
                const edgeKey = `edge-${matchingEdgeIndex}`;
                
                // Make both arrow and edge path interactive
                arrow.classList.add(CSS_CLASSES.EDGE_INTERACTIVE);
                arrow.setAttribute('data-edge-id', edgeKey);
                
                matchingEdge.classList.add(CSS_CLASSES.EDGE_INTERACTIVE);
                matchingEdge.setAttribute('data-edge-id', edgeKey);
            }
        });
    }

    getNodeData(nodeKey) {
        return this.nodeData[nodeKey];
    }

    getEdgeData(edgeKey) {
        return this.edgeData[edgeKey];
    }

    getAllNodeData() {
        return this.nodeData;
    }

    getAllEdgeData() {
        return this.edgeData;
    }
}