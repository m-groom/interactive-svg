// DAG Interaction Manager - Handles user interactions for DAG visualizations
// Extends BaseInteractionManager with DAG-specific functionality

import { BaseInteractionManager } from './BaseInteractionManager.js';
import { InteractionManager } from './InteractionManager.js';
import { SELECTORS, EVENTS, DAG_CONFIG } from './constants.js';
import { Logger } from './Logger.js';
import { Utils } from './Utils.js';

export class DAGInteractionManager extends BaseInteractionManager {
    constructor(svgLoader, dagParser) {
        super();
        this.svgLoader = svgLoader;
        this.dagParser = dagParser;
        this.indexUtils = null;
        this.isDagMode = true;
        
        // DAG-specific properties
        this.svgIndexToGlobalId = {};
        this.globalIdToSvgIndex = {};
        this.nodePositions = [];
        this.svgIndexToEdgeData = {};
        
        // DAG-specific interaction properties
        this.edgeTooltipTimer = null;
        this.edgeTooltipDelay = 3000; // 3 seconds auto-dismiss for edge tooltips on mobile
    }
    
    /**
     * Initialize DAG interaction manager
     */
    initialize() {
        super.initialize();
        Logger.debug('DAG interaction manager initialized (data will be loaded on demand)');
    }
    
    /**
     * Ensure index utilities are available (called when DAG data is loaded)
     */
    ensureIndexUtils() {
        if (this.dagParser && this.dagParser.indexUtils) {
            this.indexUtils = this.dagParser.indexUtils;
            Logger.debug('DAG index utilities connected successfully');
            return true;
        } else {
            Logger.warn('DAG parser or index utilities not available');
            return false;
        }
    }
    
    /**
     * Setup DAG-specific SVG interactions
     * @param {SVGElement} svgElement - The DAG SVG element
     */
    setupDAGInteractions(svgElement) {
        if (!svgElement) {
            Logger.error('No SVG element provided for DAG interactions');
            return;
        }
        
        if (!this.dagParser) {
            Logger.error('DAG parser required for DAG interactions');
            return;
        }
        
        // Ensure index utilities are connected now that we have data
        if (!this.ensureIndexUtils()) {
            Logger.error('Failed to connect DAG index utilities');
            return;
        }
        
        try {
            // Use proper SVG element identification based on stroke-linejoin="miter"
            const nodeSelector = 'path[fill-rule="nonzero"][stroke-linejoin="miter"]';
            const edgeSelector = 'path[fill="none"][stroke-linejoin="miter"]';
            
            const detectedNodes = svgElement.querySelectorAll(nodeSelector);
            const detectedEdges = svgElement.querySelectorAll(edgeSelector);
            
            Logger.debug(`DAG Debug: Found ${detectedNodes.length} nodes with selector "${nodeSelector}"`);
            Logger.debug(`DAG Debug: Found ${detectedEdges.length} edges with selector "${edgeSelector}"`);
            
            // Build mapping from SVG element index to DAG node global ID
            this.buildNodeMapping(detectedNodes);
            
            // Build spatial mapping for edges
            this.buildSpatialEdgeMapping(detectedNodes, detectedEdges);
            
            // Setup interactions
            this.setupSVGInteractions(svgElement);
            
            Logger.debug('DAG interactions setup completed');
        } catch (error) {
            Logger.error('Failed to setup DAG interactions:', error);
        }
    }
    
    /**
     * Build mapping between SVG element indices and DAG node global IDs
     * @param {NodeList} svgNodes - The detected SVG node elements
     */
    buildNodeMapping(svgNodes) {
        const allNodeIds = Object.keys(this.dagParser.nodesByGlobalId)
            .map(id => parseInt(id))
            .sort((a, b) => a - b);
        
        Logger.debug(`DAG Debug: Found ${allNodeIds.length} nodes in data, ${svgNodes.length} SVG elements`);
        
        this.svgIndexToGlobalId = {};
        this.globalIdToSvgIndex = {};
        
        for (let i = 0; i < Math.min(svgNodes.length, allNodeIds.length); i++) {
            const globalId = allNodeIds[i];
            this.svgIndexToGlobalId[i] = globalId;
            this.globalIdToSvgIndex[globalId] = i;
        }
        
        Logger.debug(`DAG Debug: Built mapping for ${Object.keys(this.svgIndexToGlobalId).length} nodes`);
    }
    
    /**
     * Build spatial mapping between SVG elements and JSON data
     * @param {NodeList} svgNodes - The detected SVG node elements  
     * @param {NodeList} svgEdges - The detected SVG edge elements
     */
    buildSpatialEdgeMapping(svgNodes, svgEdges) {
        if (!this.dagParser || !this.dagParser.edgesBySource) {
            Logger.warn('DAG parser or edge data not available for spatial mapping');
            return;
        }
        
        Logger.debug(`DAG Spatial Mapping: Processing ${svgNodes.length} nodes and ${svgEdges.length} edges`);
        
        // Step 1: Extract node positions with their global IDs
        this.nodePositions = [];
        svgNodes.forEach((svgNode, index) => {
            const globalId = this.svgIndexToGlobalId[index];
            if (globalId !== undefined) {
                const pathData = svgNode.getAttribute('d');
                const center = this.extractNodeCenter(pathData);
                
                if (center) {
                    this.nodePositions.push({
                        x: center.x,
                        y: center.y,
                        globalId: globalId,
                        svgIndex: index,
                        element: svgNode
                    });
                }
            }
        });
        
        Logger.debug(`DAG Spatial Mapping: Extracted ${this.nodePositions.length} node positions`);
        
        // Step 2: Process edges and find spatial matches
        this.svgIndexToEdgeData = {};
        let successfulMappings = 0;
        
        svgEdges.forEach((svgEdge, index) => {
            const pathData = svgEdge.getAttribute('d');
            const edgeCoords = this.extractEdgeCoordinates(pathData);
            
            if (edgeCoords) {
                // Find closest nodes to edge endpoints with increased threshold
                const sourceNode = this.findClosestNode(edgeCoords.start, this.nodePositions, 30);
                const targetNode = this.findClosestNode(edgeCoords.end, this.nodePositions, 30);
                
                if (!sourceNode) {
                    Logger.warn(`Edge ${index}: No source node found within 30px of (${edgeCoords.start.x.toFixed(1)}, ${edgeCoords.start.y.toFixed(1)})`);
                }
                if (!targetNode) {
                    Logger.warn(`Edge ${index}: No target node found within 30px of (${edgeCoords.end.x.toFixed(1)}, ${edgeCoords.end.y.toFixed(1)})`);
                }
                
                if (sourceNode && targetNode && sourceNode.globalId !== targetNode.globalId) {
                    // Validate DAG constraint: source level should be target level + 1
                    const sourceData = this.dagParser.nodesByGlobalId[sourceNode.globalId];
                    const targetData = this.dagParser.nodesByGlobalId[targetNode.globalId];
                    
                    if (sourceData && targetData && sourceData.level === targetData.level + 1) {
                        // Find corresponding JSON edge
                        const jsonEdge = this.findJSONEdgeByNodes(sourceNode.globalId, targetNode.globalId);
                        
                        if (jsonEdge) {
                            this.svgIndexToEdgeData[index] = {
                                jsonEdge: jsonEdge,
                                svgElement: svgEdge,
                                sourceNode: sourceNode,
                                targetNode: targetNode,
                                coordinates: edgeCoords
                            };
                            
                            svgEdge.setAttribute('data-edge-index', index.toString());
                            successfulMappings++;
                        } else {
                            Logger.warn(`No JSON edge found for ${sourceNode.globalId} -> ${targetNode.globalId}`);
                        }
                    } else {
                        Logger.warn(`DAG constraint violation: ${sourceNode.globalId}(L${sourceData?.level}) -> ${targetNode.globalId}(L${targetData?.level})`);
                    }
                } else {
                    Logger.warn(`Failed to find valid source/target nodes for edge ${index}`);
                }
            }
        });
        
        Logger.debug(`DAG Spatial Mapping: Successfully mapped ${successfulMappings}/${svgEdges.length} edges`);
    }
    
    /**
     * Extract center coordinates from SVG node path data
     * @param {string} pathData - SVG path d attribute containing circle/arc data
     * @returns {Object|null} - {x, y} center coordinates or null if parsing fails
     */
    extractNodeCenter(pathData) {
        if (!pathData) return null;
        
        // More robust approach: extract all coordinate pairs and find the geometric center
        const coordMatches = pathData.matchAll(/([\d.]+)\s+([\d.]+)/g);
        
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        let coordCount = 0;
        
        for (const match of coordMatches) {
            const x = parseFloat(match[1]);
            const y = parseFloat(match[2]);
            
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
            coordCount++;
        }
        
        if (coordCount > 0) {
            // Calculate center as midpoint of bounding box
            const center = {
                x: (minX + maxX) / 2,
                y: (minY + maxY) / 2
            };
            
            return center;
        }
        
        return null;
    }
    
    /**
     * Extract start and end coordinates from SVG path data
     * @param {string} pathData - SVG path d attribute (e.g., "M 346.171875 253.636719 L 380.789062 322.84375")
     * @returns {Object|null} - {start: {x, y}, end: {x, y}} or null if parsing fails
     */
    extractEdgeCoordinates(pathData) {
        if (!pathData) return null;
        
        // DAG edges use simple "M x1 y1 L x2 y2" format
        const matches = pathData.match(/M\s+([\d.]+)\s+([\d.]+)\s+L\s+([\d.]+)\s+([\d.]+)/);
        
        if (matches) {
            return {
                start: { x: parseFloat(matches[1]), y: parseFloat(matches[2]) },
                end: { x: parseFloat(matches[3]), y: parseFloat(matches[4]) }
            };
        }
        
        return null;
    }
    
    /**
     * Find the closest node to a given point using Euclidean distance
     * @param {Object} point - Point with {x, y} coordinates
     * @param {Array} nodePositions - Array of node position objects
     * @param {number} threshold - Maximum distance threshold (default: 30 pixels)
     * @returns {Object|null} - Closest node or null if none within threshold
     */
    findClosestNode(point, nodePositions, threshold = 30) {
        let closestNode = null;
        let minDistance = Infinity;
        
        for (const node of nodePositions) {
            const distance = Math.sqrt(
                Math.pow(point.x - node.x, 2) + Math.pow(point.y - node.y, 2)
            );
            
            if (distance < minDistance && distance <= threshold) {
                minDistance = distance;
                closestNode = node;
            }
        }
        
        // Only log when no match found for debugging
        if (!closestNode) {
            // Find the actual closest node regardless of threshold for debugging
            let debugClosest = null;
            let debugMinDistance = Infinity;
            
            for (const node of nodePositions) {
                const distance = Math.sqrt(
                    Math.pow(point.x - node.x, 2) + Math.pow(point.y - node.y, 2)
                );
                
                if (distance < debugMinDistance) {
                    debugMinDistance = distance;
                    debugClosest = node;
                }
            }
            
            Logger.warn(`No node within ${threshold}px of (${point.x.toFixed(1)}, ${point.y.toFixed(1)}). Closest is node ${debugClosest?.globalId} at ${debugMinDistance.toFixed(2)}px`);
        }
        
        return closestNode;
    }
    
    /**
     * Find JSON edge data for given source and target node global IDs
     * @param {number} sourceGlobalId - Source node global ID
     * @param {number} targetGlobalId - Target node global ID
     * @returns {Object|null} - JSON edge data or null if not found
     */
    findJSONEdgeByNodes(sourceGlobalId, targetGlobalId) {
        const sourceEdges = this.dagParser.edgesBySource[sourceGlobalId];
        if (!sourceEdges) return null;
        
        return sourceEdges.find(edge => edge.target === targetGlobalId) || null;
    }
    
    /**
     * Sets up event listeners for DAG nodes and edges.
     * This is a custom implementation for the DAG SVG which lacks data-attributes.
     * @param {SVGElement} svgElement - The SVG element to set up interactions on.
     */
    setupSVGInteractions(svgElement) {
        if (!svgElement) return;

        // --- Node Interactions ---
        const nodes = svgElement.querySelectorAll('path[fill-rule="nonzero"][stroke-linejoin="miter"]');
        nodes.forEach((node, index) => {
            const nodeKey = `node-${index}`;

            if (this.isTouchDevice) {
                // Touch: tap for tooltip, long press for modal
                node.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.startLongPress(async () => {
                        this.hideTooltip();
                        await this.showNodeModal(nodeKey);
                    });
                });

                node.addEventListener('touchend', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.endLongPress(() => this.showNodeTooltip(e, nodeKey, node));
                });

                node.addEventListener('touchmove', () => this.cancelLongPress());
                node.addEventListener('touchcancel', () => this.cancelLongPress());

            } else {
                // Desktop: hover for tooltip, click for modal
                node.addEventListener(EVENTS.MOUSEENTER, (e) => {
                    e.stopPropagation();
                    this.showNodeTooltip(e, nodeKey, node);
                });

                node.addEventListener(EVENTS.MOUSELEAVE, (e) => {
                    e.stopPropagation();
                    this.hideTooltip();
                    this.unhighlightElement(node);
                });

                node.addEventListener(EVENTS.CLICK, async (e) => {
                    e.stopPropagation();
                    await this.showNodeModal(nodeKey);
                });
            }
        });

        // --- Edge Interactions ---
        const edges = svgElement.querySelectorAll('path[fill="none"][stroke-linejoin="miter"]');
        edges.forEach((edge, index) => {
            if (this.isTouchDevice) {
                edge.addEventListener('touchend', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.showDAGEdgeTooltip(e, index);
                    this.highlightEdge(edge);
                    setTimeout(() => {
                        this.hideTooltip();
                        this.unhighlightEdge(edge);
                    }, 2000);
                });
            } else {
                edge.addEventListener(EVENTS.MOUSEENTER, (e) => {
                    e.stopPropagation();
                    this.showDAGEdgeTooltip(e, index);
                    this.highlightEdge(edge);
                });

                edge.addEventListener(EVENTS.MOUSELEAVE, (e) => {
                    e.stopPropagation();
                    this.hideTooltip();
                    this.unhighlightEdge(edge);
                });
            }
        });

        // Make text elements non-interactive
        const textElements = svgElement.querySelectorAll(SELECTORS.SVG_TEXT);
        textElements.forEach(el => {
            el.style.pointerEvents = 'none';
        });

        Logger.debug(`DAG Interaction Setup: ${nodes.length} nodes, ${edges.length} edges`);
    }

    /**
     * Calculate climatological probability for level 0 observed classes
     * @param {number} globalId - Global ID of the observed class node
     * @returns {number} - Probability as a fraction (0-1)
     */
    calculateClimatologicalProbability(globalId) {
        // Get all level 0 nodes (observed classes)
        const level0Nodes = this.dagParser.getNodesAtLevel(0);
        
        // Calculate total active dates across all observed classes
        let totalDates = 0;
        let currentNodeDates = 0;
        
        for (const [nodeGlobalId, nodeData] of Object.entries(level0Nodes)) {
            const dateCount = nodeData.dates ? nodeData.dates.length : 0;
            totalDates += dateCount;
            
            if (parseInt(nodeGlobalId) === globalId) {
                currentNodeDates = dateCount;
            }
        }
        
        // Calculate probability as fraction of dates for this class / total dates
        const probability = totalDates > 0 ? currentNodeDates / totalDates : 0;
        
        Logger.debug(`Climatological probability for global ID ${globalId}: ${currentNodeDates}/${totalDates} = ${probability.toFixed(3)}`);
        return probability;
    }

    /**
     * Gathers and formats all outgoing transition probabilities from a given node.
     * @param {number} sourceNodeId - The global ID of the source node.
     * @returns {Array<Object>} - An array of transition probability objects.
     */
    getTransitionProbabilities(sourceNodeId) {
        if (!this.dagParser) return [];
        
        const edges = this.dagParser.getEdgesFromNode(sourceNodeId);
        const transitionProbs = edges
            .map(edge => {
                const targetNodeData = this.dagParser.getNodeData(edge.target);
                if (!targetNodeData) return null;

                return {
                    target: edge.target,
                    targetLocalIndex: targetNodeData.localIdx,
                    probability: edge.weight,
                    confidenceInterval: edge.ci
                };
            })
            .filter(Boolean)
            .sort((a, b) => b.probability - a.probability);
        
        return transitionProbs;
    }

    /**
     * Shows a tooltip for a DAG node with the correct content.
     * @param {Event} event - Mouse event
     * @param {string} nodeKey - Node key (node-{index})
     * @param {Element} nodeElement - The SVG element for the node.
     */
    showNodeTooltip(event, nodeKey, nodeElement) {
        const nodeIndex = parseInt(nodeKey.replace('node-', ''));
        const globalId = this.svgIndexToGlobalId[nodeIndex];
        if (globalId === undefined) return;
        
        const nodeData = this.dagParser.getNodeData(globalId);
        if (!nodeData) return;

        let content = '';

        if (nodeData.level === 0) {
            // Calculate climatological probability for observed classes
            const climatologicalProb = this.calculateClimatologicalProbability(globalId);
            const probNumber = climatologicalProb.toFixed(2);
            
            content = `
                <h4 style="margin-bottom: 1rem;">${Utils.escapeHTML(nodeData.clusterName)}</h4>
                <p style="text-align: left;"><strong>Climatological Probability:</strong> ${probNumber}</p>
            `;
        } else {
            let classProbContent = '';
            if (nodeData.lambda) {
                classProbContent = `
                    <p style="text-align: left;"><strong>Class Probabilities:</strong></p>
                    <ul style="margin: 5px 0; padding-left: 20px;">
                        <li>La Niña: ${nodeData.lambda.laNina.toFixed(2)}</li>
                        <li>Neutral: ${nodeData.lambda.neutral.toFixed(2)}</li>
                        <li>El Niño: ${nodeData.lambda.elNino.toFixed(2)}</li>
                    </ul>
                `;
            }

            let transitionProbContent = '';
            const transitionProbs = this.getTransitionProbabilities(globalId);
            if (transitionProbs.length > 0) {
                const targetLevel = nodeData.level - 1;
                const monthsStr = targetLevel === 1 ? 'month' : 'months';

                const transitionList = transitionProbs
                    .map(t => {
                        // Get target node data to determine proper display name
                        const targetNodeData = this.dagParser.getNodeData(t.target);
                        let targetDisplayName;
                        
                        if (targetLevel === 0) {
                            // Level 0 = observed classes, use class names without lead time
                            targetDisplayName = targetNodeData ? targetNodeData.clusterName : `Class ${t.targetLocalIndex}`;
                        } else {
                            // Regular clusters with lead time
                            targetDisplayName = `Cluster ${t.targetLocalIndex} (${targetLevel} ${monthsStr})`;
                        }
                        
                        let line = `${targetDisplayName}: ${t.probability.toFixed(2)}`;
                        if (t.confidenceInterval && t.confidenceInterval.length >= 2) {
                            const ci1 = t.confidenceInterval[0].toFixed(2);
                            const ci2 = t.confidenceInterval[1].toFixed(2);
                            line += ` [${ci1}, ${ci2}]`;
                        }
                        return `<li>${line}</li>`;
                    })
                    .join('');
                
                transitionProbContent = `
                    <p style="text-align: left;"><strong>Transition Probabilities:</strong></p>
                    <ul style="margin: 5px 0; padding-left: 20px;">
                        ${transitionList}
                    </ul>
                `;
            }

            const months = nodeData.level === 1 ? 'month' : 'months';
            const displayName = `Cluster ${nodeData.localIdx} (${nodeData.level} ${months})`;

            content = `
                <h4 style="margin-bottom: 1rem;">${Utils.escapeHTML(displayName)}</h4>
                ${classProbContent}
                ${transitionProbContent}
            `;
        }
        
        // This is a call to the parent method in InteractionManager.js
        this.showTooltip(event, content);
        
        this.highlightElement(nodeElement);
    }


    /**
     * Convert DAG node data to Markov Chain compatible format
     * @param {number} globalId - Global node ID
     * @returns {Object|null} - Converted node data or null if conversion fails
     */
    convertDAGToMarkovData(globalId) {
        const nodeData = this.dagParser.getNodeData(globalId);
        if (!nodeData) {
            Logger.error(`DAG node data not found for global ID ${globalId}`);
            return null;
        }
        
        // Use the actual level and local_idx from the node data instead of conversion
        // The conversion utilities may not be perfectly aligned with the JSON data ordering
        const levelNum = nodeData.level;
        const localIdx = nodeData.localIdx;
        
        // Convert lambda array to object format expected by Markov Chain system
        let lambdaObj = null;
        if (nodeData.lambda && Array.isArray(nodeData.lambda) && nodeData.lambda.length === 3) {
            lambdaObj = {
                laNina: nodeData.lambda[0],
                neutral: nodeData.lambda[1],
                elNino: nodeData.lambda[2]
            };
        }
        
        // Convert to Markov Chain expected format
        const convertedData = {
            id: localIdx,  // Local index for video filename generation
            dates: nodeData.dates || [],
            lambda: lambdaObj,
            displayName: nodeData.clusterName || `Cluster ${localIdx}`,
            
            // Pass through other necessary data for compatibility
            level: nodeData.level,
            localIdx: nodeData.localIdx,
            isObservedClass: nodeData.isObservedClass,
            ev: nodeData.ev
        };
        
        Logger.debug(`DAG→Markov conversion: Global ID ${globalId} → Level ${levelNum}, Local ${localIdx} (${convertedData.displayName})`);
        return convertedData;
    }
    
    /**
     * Set up compatibility layer to make DAG data work with Markov Chain modal system
     * @param {number} globalId - Global node ID to set up compatibility for
     */
    setupMarkovCompatibility(globalId) {
        const nodeData = this.dagParser.getNodeData(globalId);
        if (!nodeData) {
            throw new Error(`Cannot setup compatibility for global ID ${globalId}: node data not found`);
        }
        
        // Use actual node data instead of conversion utilities
        const levelNum = nodeData.level;
        const localIdx = nodeData.localIdx;
        
        // Create mock svgLoader interface that Markov Chain modal expects
        this.svgLoader = {
            // Return leadTime, but ensure level 0 is handled properly (0 is falsy in JS)
            getCurrentLeadTime: () => levelNum === 0 ? 1 : levelNum, // Use 1 as placeholder for level 0
            generateVideoFilename: (nodeNumber, leadTime) => {
                // The Markov Chain modal will call this with the local node ID and lead time
                // Note: leadTime might be modified (1 instead of 0) to avoid falsy condition, use original levelNum
                let filename;
                
                if (levelNum === 0) {
                    // Level 0 observed classes: Use specific MP4 videos based on ev values
                    // ev = -1.0 → La Nina, ev = 0.0 → Neutral, ev = 1.0 → El Nino
                    const nodeData = this.dagParser.getNodeData(globalId);
                    if (nodeData && nodeData.ev !== undefined) {
                        if (nodeData.ev === -1.0) {
                            filename = `mp4_files/lanina-detrended.mp4`;
                        } else if (nodeData.ev === 0.0) {
                            filename = `mp4_files/neutral-detrended.mp4`;
                        } else if (nodeData.ev === 1.0) {
                            filename = `mp4_files/elnino-detrended.mp4`;
                        } else {
                            // Fallback for unexpected ev values
                            filename = `mp4_files/neutral-detrended.mp4`;
                            Logger.warn(`Unexpected ev value ${nodeData.ev} for level 0 node ${globalId}, using neutral MP4`);
                        }
                        Logger.debug(`Level 0 MP4 mapping: ev=${nodeData.ev} → ${filename} (global ID ${globalId})`);
                    } else {
                        // Fallback if nodeData not available
                        filename = `mp4_files/neutral-detrended.mp4`;
                        Logger.warn(`No nodeData found for level 0 global ID ${globalId}, using neutral MP4 fallback`);
                    }
                } else {
                    // Generate filename using the standard template for predicted clusters
                    // Use original levelNum instead of potentially modified leadTime parameter
                    filename = `mp4_files/combined-cluster${localIdx}-${levelNum}months.mp4`;
                    Logger.debug(`Video filename request: node ${nodeNumber}, lead time ${leadTime} → ${filename} (global ID ${globalId}, original level ${levelNum})`);
                }
                
                return filename;
            }
        };
        
        // Convert DAG data to Markov Chain format
        const markovData = this.convertDAGToMarkovData(globalId);
        if (!markovData) {
            throw new Error(`Data conversion failed for global ID ${globalId}`);
        }
        
        // Create mock svgParser interface
        this.svgParser = {
            getNodeData: (nodeKey) => {
                Logger.debug(`Node data request for key ${nodeKey} → returning converted DAG data for global ID ${globalId}`);
                return markovData;
            },
            jsonParser: null // Not needed for modal functionality
        };
        
        Logger.debug(`DAG compatibility setup complete: Global ID ${globalId} → Lead time ${levelNum}, Local index ${localIdx}`);
    }

    /**
     * Shows a modal for a DAG node using the identical Markov Chain modal system.
     * @param {string} nodeKey - Node key (node-{index})
     */
    async showNodeModal(nodeKey) {
        const nodeIndex = parseInt(nodeKey.replace('node-', ''));
        const globalId = this.svgIndexToGlobalId[nodeIndex];
        
        if (globalId === undefined) {
            Logger.error(`No global ID found for node index ${nodeIndex}`);
            return;
        }
        
        try {
            // Set up compatibility layer with Markov Chain modal system
            this.setupMarkovCompatibility(globalId);
            
            // Call the Markov Chain modal system by using InteractionManager's showNodeModal method
            Logger.debug(`Opening DAG modal using Markov Chain system for global ID ${globalId}`);
            await this.showMarkovChainModal(nodeKey);
            
            const nodeData = this.dagParser.getNodeData(globalId);
            Logger.debug(`DAG modal opened successfully for ${nodeData?.clusterName || `global ID ${globalId}`}`);
            
        } catch (error) {
            Logger.error(`Failed to show DAG modal for node ${globalId}:`, error);
            
            // Fallback to simple error display
            const nodeData = this.dagParser.getNodeData(globalId);
            const nodeName = nodeData?.clusterName || `Node ${globalId}`;
            this.showSimpleErrorModal(`Unable to display modal for ${nodeName}. ${error.message}`);
        }
    }
    
    /**
     * Use the Markov Chain modal system to display identical modals for DAG nodes
     * @param {string} nodeKey - Node key (node-{index})
     */
    async showMarkovChainModal(nodeKey) {
        // Create a temporary InteractionManager instance with our compatibility layer
        const tempInteractionManager = new InteractionManager(this.svgLoader, this.svgParser);
        
        // Initialize it with our DOM elements
        tempInteractionManager.initialize();
        
        // Use InteractionManager's showNodeModal method which provides the identical modal experience
        await tempInteractionManager.showNodeModal(nodeKey);
    }
    
    /**
     * Show a simple error modal when the main modal system fails
     * @param {string} message - Error message to display
     */
    showSimpleErrorModal(message) {
        if (this.modalBody) {
            this.modalBody.innerHTML = `
                <div style="text-align: center; padding: 2rem;">
                    <h3 style="color: #d32f2f; margin-bottom: 1rem;">Modal Error</h3>
                    <p>${Utils.escapeHTML(message)}</p>
                    <button onclick="document.querySelector('#modal').style.display='none'" 
                            style="margin-top: 1rem; padding: 0.5rem 1rem; background: #1976d2; color: white; border: none; border-radius: 0.25rem; cursor: pointer;">
                        Close
                    </button>
                </div>
            `;
            
            this.modal.style.display = "block";
            setTimeout(() => this.modal.classList.add('show'), 10);
        }
    }

    
    /**
     * Show enhanced tooltip for DAG edges with transition information
     * @param {Event} event - Mouse event for positioning
     * @param {number} edgeIndex - Index of the SVG edge element
     */
    showDAGEdgeTooltip(event, edgeIndex) {
        // Get mapped edge data
        const edgeMapping = this.svgIndexToEdgeData[edgeIndex];
        
        if (!edgeMapping || !edgeMapping.jsonEdge) {
            // Fallback to simple tooltip if no mapping found
            this.showTooltip(event, "Transition Edge");
            return;
        }
        
        const jsonEdge = edgeMapping.jsonEdge;
        
        // Get source and target node information
        const sourceNodeData = this.dagParser.getNodeData(jsonEdge.source);
        const targetNodeData = this.dagParser.getNodeData(jsonEdge.target);
        
        if (!sourceNodeData || !targetNodeData) {
            Logger.warn(`Missing node data for edge ${jsonEdge.source} -> ${jsonEdge.target}`);
            this.showTooltip(event, "Transition Edge");
            return;
        }
        
        // Format probability as decimal (not percentage) to match Markov Chain
        const probabilityText = jsonEdge.weight.toFixed(2);
        
        // Format confidence interval as decimals to match Markov Chain
        let probabilityLine = `<strong>Transition Probability:</strong> ${probabilityText}`;
        if (jsonEdge.ci && Array.isArray(jsonEdge.ci) && jsonEdge.ci.length >= 2) {
            const ci1 = jsonEdge.ci[0].toFixed(2);
            const ci2 = jsonEdge.ci[1].toFixed(2);
            probabilityLine += ` [${ci1}, ${ci2}]`;
        }
        
        // Format level information for title
        const sourceLevel = sourceNodeData.level;
        const targetLevel = targetNodeData.level;
        
        // Format source level (always has lead time)
        const sourceMonths = sourceLevel === 1 ? '1 month' : `${sourceLevel} months`;
        const sourceTitle = `${Utils.escapeHTML(sourceNodeData.clusterName)} (${sourceMonths})`;
        
        // Format target level (level 0 = observed classes, no lead time shown)
        const targetTitle = targetLevel === 0 ? 
            Utils.escapeHTML(targetNodeData.clusterName) : 
            `${Utils.escapeHTML(targetNodeData.clusterName)} (${targetLevel === 1 ? '1 month' : `${targetLevel} months`})`;
        
        // Build tooltip content identical to Markov Chain format, with lead time in title
        const content = `
            <h4>${sourceTitle} → ${targetTitle}</h4>
            <p>${probabilityLine}</p>
        `;
        
        // Use parent method to show tooltip with enhanced width
        this.showTooltip(event, content);
    }

    /**
     * Override parent showTooltip to set a wider width for DAG tooltips,
     * which have longer text lines.
     * @param {Event} event - Mouse event for positioning
     * @param {string} content - HTML content for tooltip
     */
    showTooltip(event, content) {
        // Call the parent method to handle the standard tooltip logic
        super.showTooltip(event, content);

        // Apply DAG-specific width adjustments
        if (this.tooltip) {
            if (content.includes('Climatological Probability:')) {
                // Level 0 observed class tooltips - wider to prevent text wrapping
                this.tooltip.style.minWidth = '275px';
            } else if (content.includes('Transition Probabilities:')) {
                // Node tooltips with transition probabilities
                this.tooltip.style.minWidth = '360px';
            } else if (content.includes('Transition Probability:')) {
                // Edge tooltips (similar to Markov Chain implementation)
                this.tooltip.style.minWidth = '330px';
            }
        }
    }

    /**
     * Get debug information about DAG interactions
     * @returns {Object} - Debug information
     */
    getDebugInfo() {
        return {
            isDagMode: this.isDagMode,
            hasDAGParser: !!this.dagParser,
            hasIndexUtils: !!this.indexUtils,
            parserSummary: this.dagParser ? this.dagParser.getSummary() : null,
            indexUtilsSummary: this.indexUtils ? this.indexUtils.getSummary() : null
        };
    }
}