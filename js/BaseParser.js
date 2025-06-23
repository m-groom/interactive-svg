// Base Parser - Common functionality for all data parsing operations
// Provides standard validation, parsing, and data processing patterns

import { Logger } from './Logger.js';
import { Utils } from './Utils.js';
import { ErrorHandler, ValidationError } from './ErrorHandler.js';
import { CONFIG, ERROR_MESSAGES } from './constants.js';

export class BaseParser {
    constructor() {
        this.parsedData = null;
        this.validationResults = {};
        this.parsingErrors = [];
        this.stats = {
            parseTime: 0,
            validationTime: 0,
            itemsProcessed: 0
        };
    }

    /**
     * Parse and validate data with timing and error collection
     * @param {any} rawData - Raw data to parse
     * @param {Object} options - Parsing options
     * @returns {any} - Parsed and validated data
     */
    parseAndValidate(rawData, options = {}) {
        const startTime = performance.now();
        this.clearErrors();

        try {
            // Pre-validation
            this.validateRawData(rawData, options);

            // Main parsing
            const parseStart = performance.now();
            this.parsedData = this.parseData(rawData, options);
            this.stats.parseTime = performance.now() - parseStart;

            // Post-validation
            const validationStart = performance.now();
            this.validateParsedData(this.parsedData, options);
            this.stats.validationTime = performance.now() - validationStart;

            // Update stats
            this.stats.itemsProcessed = this.countProcessedItems(this.parsedData);
            
            const totalTime = performance.now() - startTime;
            Logger.debug(`Parsing completed in ${totalTime.toFixed(2)}ms (parse: ${this.stats.parseTime.toFixed(2)}ms, validation: ${this.stats.validationTime.toFixed(2)}ms)`);

            return this.parsedData;

        } catch (error) {
            this.recordError(error);
            Logger.error('Parsing failed:', error);
            throw error;
        }
    }

    /**
     * Validate raw input data before parsing
     * @param {any} rawData - Raw data to validate
     * @param {Object} options - Validation options
     */
    validateRawData(rawData, options = {}) {
        if (rawData === null || rawData === undefined) {
            throw new ValidationError('Raw data cannot be null or undefined');
        }

        // Override in subclasses for specific validation
        Logger.debug('Base raw data validation passed');
    }

    /**
     * Main parsing logic - override in subclasses
     * @param {any} rawData - Raw data to parse
     * @param {Object} options - Parsing options
     * @returns {any} - Parsed data
     */
    parseData(rawData, options = {}) {
        // Base implementation just returns the data as-is
        // Subclasses should override this method
        Logger.debug('Using base parseData implementation (no transformation)');
        return rawData;
    }

    /**
     * Validate parsed data after processing
     * @param {any} parsedData - Parsed data to validate
     * @param {Object} options - Validation options
     */
    validateParsedData(parsedData, options = {}) {
        if (parsedData === null || parsedData === undefined) {
            throw new ValidationError('Parsed data cannot be null or undefined');
        }

        // Override in subclasses for specific validation
        Logger.debug('Base parsed data validation passed');
    }

    /**
     * Count processed items for statistics
     * @param {any} parsedData - Parsed data
     * @returns {number} - Number of items processed
     */
    countProcessedItems(parsedData) {
        if (Array.isArray(parsedData)) {
            return parsedData.length;
        } else if (parsedData && typeof parsedData === 'object') {
            return Object.keys(parsedData).length;
        }
        return 1;
    }

    /**
     * Validate array structure with detailed error reporting
     * @param {any} data - Data to validate as array
     * @param {string} fieldName - Name of the field for error messages
     * @param {Object} requirements - Validation requirements
     * @returns {Object} - Validation result
     */
    validateArray(data, fieldName, requirements = {}) {
        const {
            minLength = 0,
            maxLength = Infinity,
            itemValidator = null,
            allowEmpty = true
        } = requirements;

        if (!Array.isArray(data)) {
            return this.createValidationResult(false, `${fieldName} must be an array`);
        }

        if (!allowEmpty && data.length === 0) {
            return this.createValidationResult(false, `${fieldName} cannot be empty`);
        }

        if (data.length < minLength) {
            return this.createValidationResult(false, `${fieldName} must have at least ${minLength} items`);
        }

        if (data.length > maxLength) {
            return this.createValidationResult(false, `${fieldName} must have at most ${maxLength} items`);
        }

        // Validate individual items if validator provided
        if (itemValidator && typeof itemValidator === 'function') {
            for (let i = 0; i < data.length; i++) {
                const itemResult = itemValidator(data[i], i);
                if (itemResult && !itemResult.isValid) {
                    return this.createValidationResult(false, `${fieldName}[${i}]: ${itemResult.error}`);
                }
            }
        }

        return this.createValidationResult(true, `${fieldName} validation passed`);
    }

    /**
     * Validate object structure with field requirements
     * @param {any} data - Data to validate as object
     * @param {string} fieldName - Name of the field for error messages
     * @param {Object} schema - Object schema requirements
     * @returns {Object} - Validation result
     */
    validateObject(data, fieldName, schema = {}) {
        const {
            requiredFields = [],
            optionalFields = [],
            fieldValidators = {},
            allowExtraFields = true
        } = schema;

        if (!data || typeof data !== 'object' || Array.isArray(data)) {
            return this.createValidationResult(false, `${fieldName} must be an object`);
        }

        // Check required fields
        for (const field of requiredFields) {
            if (!(field in data)) {
                return this.createValidationResult(false, `${fieldName} missing required field: ${field}`);
            }
        }

        // Check for unexpected fields
        if (!allowExtraFields) {
            const allowedFields = [...requiredFields, ...optionalFields];
            const extraFields = Object.keys(data).filter(key => !allowedFields.includes(key));
            if (extraFields.length > 0) {
                return this.createValidationResult(false, `${fieldName} has unexpected fields: ${extraFields.join(', ')}`);
            }
        }

        // Validate individual fields
        for (const [field, validator] of Object.entries(fieldValidators)) {
            if (field in data) {
                const fieldResult = validator(data[field]);
                if (fieldResult && !fieldResult.isValid) {
                    return this.createValidationResult(false, `${fieldName}.${field}: ${fieldResult.error}`);
                }
            }
        }

        return this.createValidationResult(true, `${fieldName} validation passed`);
    }

    /**
     * Validate numeric value with range checking
     * @param {any} value - Value to validate
     * @param {string} fieldName - Name of the field
     * @param {Object} constraints - Numeric constraints
     * @returns {Object} - Validation result
     */
    validateNumber(value, fieldName, constraints = {}) {
        const {
            min = -Infinity,
            max = Infinity,
            integer = false,
            allowNaN = false,
            allowInfinity = false
        } = constraints;

        if (typeof value !== 'number') {
            return this.createValidationResult(false, `${fieldName} must be a number`);
        }

        if (!allowNaN && isNaN(value)) {
            return this.createValidationResult(false, `${fieldName} cannot be NaN`);
        }

        if (!allowInfinity && !isFinite(value)) {
            return this.createValidationResult(false, `${fieldName} cannot be infinite`);
        }

        if (value < min) {
            return this.createValidationResult(false, `${fieldName} must be >= ${min}`);
        }

        if (value > max) {
            return this.createValidationResult(false, `${fieldName} must be <= ${max}`);
        }

        if (integer && !Number.isInteger(value)) {
            return this.createValidationResult(false, `${fieldName} must be an integer`);
        }

        return this.createValidationResult(true, `${fieldName} validation passed`);
    }

    /**
     * Create standardized validation result object
     * @param {boolean} isValid - Whether validation passed
     * @param {string} message - Validation message
     * @param {any} data - Additional data
     * @returns {Object} - Validation result
     */
    createValidationResult(isValid, message, data = null) {
        return {
            isValid,
            error: isValid ? null : message,
            message,
            data,
            timestamp: Date.now()
        };
    }

    /**
     * Validate data compatibility between two datasets
     * @param {any} dataset1 - First dataset
     * @param {any} dataset2 - Second dataset
     * @param {Object} compatibilityRules - Rules for compatibility checking
     * @returns {Object} - Compatibility result
     */
    validateCompatibility(dataset1, dataset2, compatibilityRules = {}) {
        Logger.debug('Starting compatibility validation');

        const results = [];
        
        // Override in subclasses for specific compatibility checks
        // Base implementation just checks basic structure alignment
        
        if (Array.isArray(dataset1) && Array.isArray(dataset2)) {
            if (dataset1.length !== dataset2.length) {
                results.push(this.createValidationResult(false, 
                    `Array length mismatch: ${dataset1.length} vs ${dataset2.length}`));
            } else {
                results.push(this.createValidationResult(true, 'Array lengths match'));
            }
        }

        const isValid = results.every(r => r.isValid);
        
        return {
            isValid,
            results,
            summary: isValid ? 'Compatibility validation passed' : 'Compatibility validation failed'
        };
    }

    /**
     * Validate cross-system compatibility between Markov Chain and DAG data
     * @param {Object} markovData - Markov Chain JSON data
     * @param {Object} dagData - DAG JSON data
     * @param {Object} options - Validation options
     * @returns {Object} - Cross-system validation result
     */
    static validateCrossSystemCompatibility(markovData, dagData, options = {}) {
        const {
            checkNodeConsistency = true,
            checkLambdaConsistency = true,
            checkDateConsistency = true,
            leadTimeLevel = null
        } = options;

        Logger.debug('Starting cross-system compatibility validation');

        const results = {
            isCompatible: true,
            issues: [],
            statistics: {
                markovNodes: 0,
                dagNodes: 0,
                commonNodes: 0,
                lambdaMatches: 0,
                dateMatches: 0
            },
            details: {}
        };

        try {
            // Basic structure validation
            if (!markovData?.graph?.nodes || !dagData?.graph?.nodes) {
                results.isCompatible = false;
                results.issues.push('Missing graph structure in one or both datasets');
                return results;
            }

            const markovNodes = markovData.graph.nodes;
            const dagNodes = dagData.graph.nodes;

            results.statistics.markovNodes = markovNodes.length;
            results.statistics.dagNodes = dagNodes.length;

            // Node consistency check
            if (checkNodeConsistency) {
                const markovNodeIds = new Set(markovNodes.map(n => n.id));
                const dagNodeIds = new Set(dagNodes.map(n => n.id));

                const commonNodeIds = [...markovNodeIds].filter(id => dagNodeIds.has(id));
                results.statistics.commonNodes = commonNodeIds.length;

                if (commonNodeIds.length === 0) {
                    results.isCompatible = false;
                    results.issues.push('No common node IDs found between datasets');
                } else {
                    Logger.debug(`Found ${commonNodeIds.length} common nodes between systems`);

                    // Lambda consistency check for common nodes
                    if (checkLambdaConsistency) {
                        for (const nodeId of commonNodeIds) {
                            const markovNode = markovNodes.find(n => n.id === nodeId);
                            const dagNode = dagNodes.find(n => n.id === nodeId);

                            if (markovNode?.lambda && dagNode?.lambda) {
                                const lambdaConsistency = Utils.validateDataConsistency(
                                    { lambda: markovNode.lambda },
                                    { lambda: dagNode.lambda },
                                    { tolerance: 0.01 }
                                );

                                if (lambdaConsistency.isConsistent) {
                                    results.statistics.lambdaMatches++;
                                } else {
                                    results.issues.push(`Lambda mismatch for node ${nodeId}: ${lambdaConsistency.issues.join(', ')}`);
                                }
                            }
                        }
                    }

                    // Date consistency check for common nodes
                    if (checkDateConsistency) {
                        for (const nodeId of commonNodeIds) {
                            const markovNode = markovNodes.find(n => n.id === nodeId);
                            const dagNode = dagNodes.find(n => n.id === nodeId);

                            if (markovNode?.dates && dagNode?.dates) {
                                const commonDates = markovNode.dates.filter(date => 
                                    dagNode.dates.includes(date)
                                );

                                if (commonDates.length > 0) {
                                    results.statistics.dateMatches++;
                                } else {
                                    results.issues.push(`No common dates for node ${nodeId}`);
                                }
                            }
                        }
                    }
                }
            }

            // Lead time consistency (if applicable)
            if (leadTimeLevel !== null && markovData.lead_time) {
                if (markovData.lead_time !== leadTimeLevel) {
                    results.issues.push(`Lead time mismatch: Markov data shows ${markovData.lead_time}, expected ${leadTimeLevel}`);
                }
            }

            // Summary evaluation
            if (results.issues.length > 0) {
                results.isCompatible = false;
            }

            results.details = {
                compatibilityRatio: results.statistics.commonNodes / Math.max(results.statistics.markovNodes, results.statistics.dagNodes),
                lambdaMatchRatio: results.statistics.commonNodes > 0 ? results.statistics.lambdaMatches / results.statistics.commonNodes : 0,
                dateMatchRatio: results.statistics.commonNodes > 0 ? results.statistics.dateMatches / results.statistics.commonNodes : 0
            };

            Logger.debug('Cross-system compatibility validation completed:', results);

        } catch (error) {
            results.isCompatible = false;
            results.issues.push(`Validation error: ${error.message}`);
            Logger.error('Cross-system validation failed:', error);
        }

        return results;
    }

    /**
     * Extract and format data for display/tooltips
     * @param {string} key - Data key or identifier
     * @param {Object} options - Formatting options
     * @returns {any} - Formatted data or null if not found
     */
    getData(key, options = {}) {
        // Override in subclasses for specific data retrieval
        Logger.debug(`Base getData called for key: ${key}`);
        return null;
    }

    /**
     * Get all data items of a specific type
     * @param {string} type - Type of data to retrieve
     * @param {Object} filter - Filter criteria
     * @returns {Array} - Array of matching items
     */
    getAllData(type = 'all', filter = {}) {
        // Override in subclasses for specific data retrieval
        Logger.debug(`Base getAllData called for type: ${type}`);
        return [];
    }

    /**
     * Record parsing error
     * @param {Error} error - Error to record
     */
    recordError(error) {
        this.parsingErrors.push({
            error,
            message: error.message,
            timestamp: Date.now(),
            stack: error.stack
        });
    }

    /**
     * Clear errors and reset state
     */
    clearErrors() {
        this.parsingErrors = [];
        this.validationResults = {};
    }

    /**
     * Get parsing statistics
     * @returns {Object} - Statistics object
     */
    getStats() {
        return {
            ...this.stats,
            hasData: this.parsedData !== null,
            errorCount: this.parsingErrors.length,
            validationResults: Object.keys(this.validationResults).length
        };
    }

    /**
     * Get detailed error information
     * @returns {Array} - Array of error objects
     */
    getErrors() {
        return [...this.parsingErrors];
    }

    /**
     * Check if parser has valid data
     * @returns {boolean} - True if valid data is available
     */
    hasValidData() {
        return this.parsedData !== null && this.parsingErrors.length === 0;
    }

    /**
     * Generate summary of parsed data
     * @returns {Object} - Summary information
     */
    getSummary() {
        return {
            hasData: this.hasValidData(),
            itemsProcessed: this.stats.itemsProcessed,
            parseTime: this.stats.parseTime,
            validationTime: this.stats.validationTime,
            errorCount: this.parsingErrors.length,
            dataType: this.parsedData ? typeof this.parsedData : 'none'
        };
    }

    /**
     * Reset parser state
     */
    reset() {
        this.parsedData = null;
        this.clearErrors();
        this.stats = {
            parseTime: 0,
            validationTime: 0,
            itemsProcessed: 0
        };
        Logger.debug('Parser state reset');
    }
}