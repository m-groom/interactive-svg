import { ERROR_MESSAGES, CONFIG } from './constants.js';
import { Logger } from './Logger.js';
import { Utils } from './Utils.js';
import { BaseParser } from './BaseParser.js';

export class JSONParser extends BaseParser {
    constructor() {
        super();
    }

    parseAndValidate(jsonData) {
        return super.parseAndValidate(jsonData);
    }

    parseData(rawData, options = {}) {
        this.parsedData = rawData;
        return rawData;
    }

    validateRawData(rawData, options = {}) {
        super.validateRawData(rawData, options);
        // Additional JSON-specific validation if needed
    }

    validateParsedData(parsedData, options = {}) {
        super.validateParsedData(parsedData, options);
        
        const validation = this.validateStructure(parsedData);
        if (!validation.isValid) {
            throw new Error(ERROR_MESSAGES.JSON_VALIDATION_FAILED.replace('{reason}', validation.error));
        }
    }

    validateStructure(jsonData) {
        // Use unified graph structure validation
        const structureValidation = Utils.validateGraphStructure(jsonData, {
            requireLeadTime: true,
            minNodes: 1,
            maxNodes: 1000
        });
        
        if (!structureValidation.isValid) {
            return structureValidation;
        }

        // Use batch validation for nodes
        const nodeValidation = Utils.validateBatch(
            jsonData.graph.nodes, 
            (node, index) => Utils.validateMarkovChainNode(node, index),
            { stopOnFirstError: true }
        );

        if (!nodeValidation.isValid) {
            return { 
                isValid: false, 
                error: nodeValidation.errors[0]?.error || 'Node validation failed' 
            };
        }

        // Use batch validation for links
        const linkValidation = Utils.validateBatch(
            jsonData.graph.links,
            (link, index) => Utils.validateMarkovChainLink(link, index, jsonData.graph.nodes),
            { stopOnFirstError: true }
        );

        if (!linkValidation.isValid) {
            return { 
                isValid: false, 
                error: linkValidation.errors[0]?.error || 'Link validation failed' 
            };
        }

        return { isValid: true };
    }

    validateNode(node, index) {
        if (!node || typeof node !== 'object') {
            return { isValid: false, error: `Node ${index} is not an object` };
        }

        if (typeof node.id !== 'number') {
            return { isValid: false, error: `Node ${index} missing or invalid id field` };
        }

        if (!Array.isArray(node.lambda) || node.lambda.length !== 3) {
            return { isValid: false, error: `Node ${index} missing or invalid lambda array (should be length 3)` };
        }

        // Validate lambda values are numbers
        for (const [i, lambda] of node.lambda.entries()) {
            if (typeof lambda !== 'number') {
                return { isValid: false, error: `Node ${index} lambda[${i}] is not a number` };
            }
        }

        // Validate lambda values sum to 1 (with small tolerance for floating point)
        const lambdaSum = node.lambda.reduce((sum, val) => sum + val, 0);
        if (Math.abs(lambdaSum - 1.0) > CONFIG.LAMBDA_SUM_TOLERANCE) {
            return { isValid: false, error: `Node ${index} lambda values don't sum to 1 (sum: ${lambdaSum})` };
        }

        if (typeof node.ev !== 'number') {
            return { isValid: false, error: `Node ${index} missing or invalid ev field` };
        }

        return { isValid: true };
    }

    validateLink(link, index, nodes) {
        if (!link || typeof link !== 'object') {
            return { isValid: false, error: `Link ${index} is not an object` };
        }

        // Required fields
        const requiredFields = ['source', 'target', 'probability', 'weight'];
        for (const field of requiredFields) {
            if (typeof link[field] !== 'number') {
                return { isValid: false, error: `Link ${index} missing or invalid ${field} field` };
            }
        }

        // Validate source and target exist in nodes
        const nodeIds = nodes.map(n => n.id);
        if (!nodeIds.includes(link.source)) {
            return { isValid: false, error: `Link ${index} source ${link.source} not found in nodes` };
        }
        if (!nodeIds.includes(link.target)) {
            return { isValid: false, error: `Link ${index} target ${link.target} not found in nodes` };
        }

        // Validate probability range
        if (link.probability < 0 || link.probability > 1) {
            return { isValid: false, error: `Link ${index} probability ${link.probability} out of range [0,1]` };
        }

        // Validate confidence interval if present
        if (link.ci) {
            if (!Array.isArray(link.ci) || link.ci.length !== 2) {
                return { isValid: false, error: `Link ${index} confidence interval should be array of length 2` };
            }
            
            if (typeof link.ci[0] !== 'number' || typeof link.ci[1] !== 'number') {
                return { isValid: false, error: `Link ${index} confidence interval values should be numbers` };
            }
            
            if (link.ci[0] > link.ci[1]) {
                return { isValid: false, error: `Link ${index} confidence interval lower bound > upper bound` };
            }
        }

        return { isValid: true };
    }

    validateCompatibility(svgNodeCount, svgEdgeCount) {
        if (!this.parsedData) {
            return { isValid: false, error: 'No JSON data loaded' };
        }

        // Check node counts match
        const jsonNodeCount = this.parsedData.graph.nodes.length;
        if (svgNodeCount !== jsonNodeCount) {
            return { 
                isValid: false, 
                error: `Node count mismatch: SVG has ${svgNodeCount}, JSON has ${jsonNodeCount}` 
            };
        }

        // Validate that node IDs are sequential from 1 to N
        const nodeIds = this.parsedData.graph.nodes.map(n => n.id).sort((a, b) => a - b);
        const expectedIds = Array.from({ length: jsonNodeCount }, (_, i) => i + 1);
        
        if (JSON.stringify(nodeIds) !== JSON.stringify(expectedIds)) {
            return { 
                isValid: false, 
                error: `Node IDs should be sequential from 1 to ${jsonNodeCount}, got: [${nodeIds.join(', ')}]` 
            };
        }

        // Validate probability sums for each source node
        const probabilitySums = {};
        for (const link of this.parsedData.graph.links) {
            probabilitySums[link.source] = (probabilitySums[link.source] || 0) + link.probability;
        }

        for (const [nodeId, sum] of Object.entries(probabilitySums)) {
            if (Math.abs(sum - 1.0) > CONFIG.LAMBDA_SUM_TOLERANCE) {
                return { 
                    isValid: false, 
                    error: `Probabilities from node ${nodeId} don't sum to 1 (sum: ${sum})` 
                };
            }
        }

        return { isValid: true };
    }

    getNodeData(nodeId) {
        if (!this.parsedData) return null;
        
        return this.parsedData.graph.nodes.find(node => node.id === nodeId);
    }

    getLinkData(sourceId, targetId) {
        if (!this.parsedData) return null;
        
        return this.parsedData.graph.links.find(link => 
            link.source === sourceId && link.target === targetId
        );
    }

    getTransitionProbability(sourceId, targetId) {
        const link = this.getLinkData(sourceId, targetId);
        return link?.probability || null;
    }

    getConfidenceInterval(sourceId, targetId) {
        const link = this.getLinkData(sourceId, targetId);
        return link?.ci || null;
    }

    getNodeLambdaValues(nodeId) {
        const node = this.getNodeData(nodeId);
        if (!node?.lambda) return null;
        
        return {
            laNina: node.lambda[0],
            neutral: node.lambda[1],
            elNino: node.lambda[2]
        };
    }

    getLeadTime() {
        return this.parsedData?.lead_time || null;
    }

    getAllNodes() {
        return this.parsedData?.graph?.nodes || [];
    }

    getAllLinks() {
        return this.parsedData?.graph?.links || [];
    }
}