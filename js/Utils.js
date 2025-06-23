import { Logger } from './Logger.js';

export class Utils {
    
    // HTML Utilities
    static escapeHTML(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
    
    // Date Utilities
    static formatDateToMonthYear(dateString) {
        if (!dateString) return '';
        try {
            const date = new Date(dateString + 'T00:00:00');
            return date.toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long' 
            });
        } catch (error) {
            Logger.warn(`Failed to format date: ${dateString}`, error);
            return dateString;
        }
    }
    
    static formatDatesForDisplay(dates) {
        if (!Array.isArray(dates) || dates.length === 0) return 'No dates';
        
        if (dates.length <= 3) {
            return dates.join(', ');
        } else {
            return `${dates.slice(0, 3).join(', ')} ... (${dates.length} total)`;
        }
    }
    
    // Number/Value Formatting Utilities
    static formatProbability(prob) {
        if (typeof prob !== 'number') return 'N/A';
        return prob.toFixed(2);
    }
    
    static formatProbabilityAsPercentage(prob) {
        if (typeof prob !== 'number') return 'N/A';
        return (prob * 100).toFixed(1) + '%';
    }
    
    static formatConfidenceInterval(ci) {
        if (!Array.isArray(ci) || ci.length !== 2) return 'N/A';
        return `[${Utils.formatProbability(ci[0])}, ${Utils.formatProbability(ci[1])}]`;
    }
    
    static formatEV(ev) {
        if (typeof ev !== 'number') return 'N/A';
        return ev.toFixed(2);
    }
    
    // File Utilities
    static async checkFileExists(filename) {
        try {
            const response = await fetch(filename, { method: 'HEAD' });
            return response.ok;
        } catch (error) {
            Logger.debug(`File check failed for ${filename}:`, error);
            return false;
        }
    }
    
    static async validateFileAvailability(files, description = 'files') {
        if (!Array.isArray(files) || files.length === 0) {
            return { isValid: true, availableCount: 0, missingFiles: [] };
        }

        const missingFiles = [];
        let availableCount = 0;

        Logger.debug(`Validating ${files.length} ${description}...`);

        for (const filename of files) {
            const exists = await Utils.checkFileExists(filename);
            if (exists) {
                availableCount++;
            } else {
                missingFiles.push(filename);
            }
        }

        const result = {
            isValid: missingFiles.length === 0,
            totalFiles: files.length,
            availableCount: availableCount,
            missingFiles: missingFiles
        };

        if (!result.isValid) {
            Logger.warn(`${description} validation: ${missingFiles.length}/${files.length} files missing:`, missingFiles);
        } else {
            Logger.info(`${description} validation: All ${files.length} files available`);
        }

        return result;
    }
    
    static async validatePngAvailability(dates) {
        if (!Array.isArray(dates) || dates.length === 0) {
            return { isValid: true, availableCount: 0, missingDates: [] };
        }

        const pngFiles = dates.map(dateString => `png_files/${dateString}.png`);
        const result = await Utils.validateFileAvailability(pngFiles, 'PNG files');
        
        // Convert missing files back to dates for backward compatibility
        return {
            isValid: result.isValid,
            totalDates: result.totalFiles,
            availableCount: result.availableCount,
            missingDates: result.missingFiles.map(file => file.replace('png_files/', '').replace('.png', ''))
        };
    }
    
    // Video filename generation
    static generateVideoFilename(nodeNumber, leadTime) {
        if (!nodeNumber || !leadTime) {
            return null;
        }
        
        return `mp4_files/combined-cluster${nodeNumber}-${leadTime}months.mp4`;
    }
    
    // JSON filename generation
    static generateJSONFilename(leadTime) {
        if (!leadTime) return null;
        return `json_files/transition_graph_data_${leadTime}months.json`;
    }
    
    // DOM Utilities
    static createElement(tag, attributes = {}, content = '') {
        const element = document.createElement(tag);
        
        Object.entries(attributes).forEach(([key, value]) => {
            if (key === 'style' && typeof value === 'object') {
                Object.assign(element.style, value);
            } else {
                element.setAttribute(key, value);
            }
        });
        
        if (content) {
            element.innerHTML = content;
        }
        
        return element;
    }
    
    static removeAllChildren(element) {
        if (element) {
            while (element.firstChild) {
                element.removeChild(element.firstChild);
            }
        }
    }
    
    // Unified Validation Utilities
    static validateNodeStructure(node, requiredFields = ['id']) {
        if (!node || typeof node !== 'object') {
            return { isValid: false, error: 'Node is not an object' };
        }
        
        for (const field of requiredFields) {
            if (!node.hasOwnProperty(field)) {
                return { isValid: false, error: `Missing required field: ${field}` };
            }
        }
        
        return { isValid: true };
    }
    
    static validateLambdaArray(lambda, index = '') {
        if (!Array.isArray(lambda) || lambda.length !== 3) {
            return { isValid: false, error: `${index} lambda array should be length 3` };
        }
        
        for (const [i, value] of lambda.entries()) {
            if (typeof value !== 'number') {
                return { isValid: false, error: `${index} lambda[${i}] is not a number` };
            }
        }
        
        // Validate lambda values sum to 1 (with small tolerance for floating point)
        const sum = lambda.reduce((sum, val) => sum + val, 0);
        if (Math.abs(sum - 1.0) > 0.001) {
            return { isValid: false, error: `${index} lambda values don't sum to 1 (sum: ${sum})` };
        }
        
        return { isValid: true };
    }

    // Enhanced Graph Data Validation
    static validateGraphStructure(graphData, options = {}) {
        const {
            requireLeadTime = false,
            minNodes = 0,
            maxNodes = Infinity,
            minLinks = 0,
            maxLinks = Infinity
        } = options;

        if (!graphData || typeof graphData !== 'object') {
            return { isValid: false, error: 'Graph data is not an object' };
        }

        // Validate lead_time if required
        if (requireLeadTime && typeof graphData.lead_time !== 'number') {
            return { isValid: false, error: 'Missing or invalid lead_time field' };
        }

        if (!graphData.graph || typeof graphData.graph !== 'object') {
            return { isValid: false, error: 'Missing or invalid graph field' };
        }

        // Validate nodes array
        if (!Array.isArray(graphData.graph.nodes)) {
            return { isValid: false, error: 'Missing or invalid graph.nodes array' };
        }

        const nodeCount = graphData.graph.nodes.length;
        if (nodeCount < minNodes || nodeCount > maxNodes) {
            return { 
                isValid: false, 
                error: `Node count ${nodeCount} outside valid range [${minNodes}, ${maxNodes}]` 
            };
        }

        // Validate links array
        if (!Array.isArray(graphData.graph.links)) {
            return { isValid: false, error: 'Missing or invalid graph.links array' };
        }

        const linkCount = graphData.graph.links.length;
        if (linkCount < minLinks || linkCount > maxLinks) {
            return { 
                isValid: false, 
                error: `Link count ${linkCount} outside valid range [${minLinks}, ${maxLinks}]` 
            };
        }

        return { isValid: true };
    }

    static validateMarkovChainNode(node, index) {
        if (!node || typeof node !== 'object') {
            return { isValid: false, error: `Node ${index} is not an object` };
        }

        // Validate ID field
        if (typeof node.id !== 'number') {
            return { isValid: false, error: `Node ${index} missing or invalid id field` };
        }

        // Validate lambda array using existing utility
        const lambdaValidation = Utils.validateLambdaArray(node.lambda, `Node ${index}`);
        if (!lambdaValidation.isValid) {
            return lambdaValidation;
        }

        // Validate ev field (expected value)
        if (typeof node.ev !== 'number') {
            return { isValid: false, error: `Node ${index} missing or invalid ev field` };
        }

        return { isValid: true };
    }

    static validateMarkovChainLink(link, index, nodes) {
        if (!link || typeof link !== 'object') {
            return { isValid: false, error: `Link ${index} is not an object` };
        }

        // Use the correct field names that the actual Markov Chain data uses
        const requiredFields = ['source', 'target', 'probability', 'weight'];
        for (const field of requiredFields) {
            if (typeof link[field] !== 'number') {
                return { isValid: false, error: `Link ${index} missing or invalid ${field} field` };
            }
        }

        // Validate node references exist
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
        if (link.ci && (!Array.isArray(link.ci) || link.ci.length !== 2)) {
            return { isValid: false, error: `Link ${index} has invalid confidence interval` };
        }

        return { isValid: true };
    }

    static validateDAGNode(node, index) {
        const basicValidation = Utils.validateNodeStructure(node, ['id']);
        if (!basicValidation.isValid) {
            return { isValid: false, error: `DAG Node ${index}: ${basicValidation.error}` };
        }

        // DAG nodes may have different structure than Markov Chain nodes
        if ('lambda' in node) {
            const lambdaValidation = Utils.validateLambdaArray(node.lambda, `DAG Node ${index}`);
            if (!lambdaValidation.isValid) {
                return lambdaValidation;
            }
        }

        if ('dates' in node && !Array.isArray(node.dates)) {
            return { isValid: false, error: `DAG Node ${index}: dates must be an array` };
        }

        return { isValid: true };
    }

    static validateDAGLink(link, index, nodes) {
        if (!link || typeof link !== 'object') {
            return { isValid: false, error: `DAG Link ${index} is not an object` };
        }

        const requiredFields = ['source', 'target'];
        for (const field of requiredFields) {
            if (!(field in link)) {
                return { isValid: false, error: `DAG Link ${index}: missing ${field}` };
            }
        }

        // Validate node references exist
        const sourceExists = nodes.some(node => node.id === link.source);
        const targetExists = nodes.some(node => node.id === link.target);

        if (!sourceExists) {
            return { isValid: false, error: `DAG Link ${index}: source node '${link.source}' not found` };
        }

        if (!targetExists) {
            return { isValid: false, error: `DAG Link ${index}: target node '${link.target}' not found` };
        }

        return { isValid: true };
    }

    // Batch Validation Utilities
    static validateBatch(items, validator, options = {}) {
        const {
            stopOnFirstError = false,
            maxErrors = 10,
            includeIndex = true
        } = options;

        const results = {
            isValid: true,
            totalItems: items.length,
            validItems: 0,
            invalidItems: 0,
            errors: [],
            validationTime: 0
        };

        const startTime = performance.now();

        for (let i = 0; i < items.length; i++) {
            try {
                const result = validator(items[i], includeIndex ? i : undefined);
                
                if (result && !result.isValid) {
                    results.isValid = false;
                    results.invalidItems++;
                    results.errors.push({
                        index: i,
                        error: result.error,
                        item: items[i]
                    });

                    if (stopOnFirstError || results.errors.length >= maxErrors) {
                        break;
                    }
                } else {
                    results.validItems++;
                }
            } catch (error) {
                results.isValid = false;
                results.invalidItems++;
                results.errors.push({
                    index: i,
                    error: `Validation threw error: ${error.message}`,
                    item: items[i]
                });

                if (stopOnFirstError || results.errors.length >= maxErrors) {
                    break;
                }
            }
        }

        results.validationTime = performance.now() - startTime;
        
        Logger.debug(`Batch validation completed: ${results.validItems}/${results.totalItems} valid items in ${results.validationTime.toFixed(2)}ms`);
        
        return results;
    }

    // Data Consistency Validation
    static validateDataConsistency(dataset1, dataset2, comparisonRules = {}) {
        const {
            compareNodeIds = true,
            compareLinkStructure = true,
            compareDataTypes = true
        } = comparisonRules;

        const results = {
            isConsistent: true,
            issues: [],
            summary: {}
        };

        // Basic structure comparison
        if (compareDataTypes) {
            if (typeof dataset1 !== typeof dataset2) {
                results.isConsistent = false;
                results.issues.push('Datasets have different types');
            }
        }

        // Graph structure comparison
        if (dataset1?.graph && dataset2?.graph) {
            const nodes1 = dataset1.graph.nodes || [];
            const nodes2 = dataset2.graph.nodes || [];
            const links1 = dataset1.graph.links || [];
            const links2 = dataset2.graph.links || [];

            // Node count comparison
            if (nodes1.length !== nodes2.length) {
                results.isConsistent = false;
                results.issues.push(`Node count mismatch: ${nodes1.length} vs ${nodes2.length}`);
            }

            // Node ID comparison
            if (compareNodeIds) {
                const ids1 = new Set(nodes1.map(n => n.id));
                const ids2 = new Set(nodes2.map(n => n.id));
                
                const missingIn2 = [...ids1].filter(id => !ids2.has(id));
                const missingIn1 = [...ids2].filter(id => !ids1.has(id));

                if (missingIn2.length > 0) {
                    results.isConsistent = false;
                    results.issues.push(`Nodes in dataset1 missing from dataset2: ${missingIn2.join(', ')}`);
                }

                if (missingIn1.length > 0) {
                    results.isConsistent = false;
                    results.issues.push(`Nodes in dataset2 missing from dataset1: ${missingIn1.join(', ')}`);
                }
            }

            // Link structure comparison
            if (compareLinkStructure) {
                if (links1.length !== links2.length) {
                    results.isConsistent = false;
                    results.issues.push(`Link count mismatch: ${links1.length} vs ${links2.length}`);
                }
            }

            results.summary = {
                dataset1: { nodes: nodes1.length, links: links1.length },
                dataset2: { nodes: nodes2.length, links: links2.length }
            };
        }

        Logger.debug('Data consistency validation completed:', results);
        return results;
    }
    
    // Array utilities
    static groupBy(array, keyFn) {
        return array.reduce((groups, item) => {
            const key = keyFn(item);
            if (!groups[key]) {
                groups[key] = [];
            }
            groups[key].push(item);
            return groups;
        }, {});
    }
    
    static sortBy(array, keyFn, descending = false) {
        return array.slice().sort((a, b) => {
            const aKey = keyFn(a);
            const bKey = keyFn(b);
            const comparison = aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
            return descending ? -comparison : comparison;
        });
    }
    
    // Debouncing utility
    static debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
    
    // Object deep cloning
    static deepClone(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        if (obj instanceof Date) return new Date(obj.getTime());
        if (obj instanceof Array) return obj.map(item => Utils.deepClone(item));
        
        const cloned = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                cloned[key] = Utils.deepClone(obj[key]);
            }
        }
        return cloned;
    }

    /**
     * Async delay function
     * @param {number} ms - Milliseconds to delay
     * @returns {Promise} - Promise that resolves after delay
     */
    static delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Split array into chunks of specified size
     * @param {Array} array - Array to chunk
     * @param {number} size - Chunk size
     * @returns {Array} - Array of chunks
     */
    static chunkArray(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }
}