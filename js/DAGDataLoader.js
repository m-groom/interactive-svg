// DAG Data Loader - Handles loading and validation of DAG visualization data
// Loads K_max.json, vertical_transition_graph.json, and validates data integrity

import { DAGIndexUtils } from './DAGIndexUtils.js';
import { ERROR_MESSAGES } from './constants.js';
import { Logger } from './Logger.js';
import { BaseDataLoader } from './BaseDataLoader.js';

export class DAGDataLoader extends BaseDataLoader {
    constructor() {
        super();
        this.kMaxData = null;
        this.dagData = null;
        this.indexUtils = null;
        this.validationResults = {
            kMaxValidation: false,
            mp4Validation: false,
            nodeCountValidation: false,
            indexConsistencyValidation: false
        };
    }
    
    /**
     * Load K_max.json data
     * @returns {Promise<Array<number>>} - Array of cluster counts per level
     */
    async loadKMaxData() {
        try {
            const kMaxJson = await this.loadFile('json_files/K_max.json', 'json');
            
            // Convert object format to array format expected by DAGIndexUtils
            // Input: {"0": {"n_clusters": 3}, "1": {"n_clusters": 10}, ...}
            // Output: [3, 10, 14, 16, ...]
            const kMaxArray = [];
            const maxLevel = Math.max(...Object.keys(kMaxJson).map(Number));
            
            for (let level = 0; level <= maxLevel; level++) {
                const levelStr = level.toString();
                if (kMaxJson[levelStr] && kMaxJson[levelStr].n_clusters) {
                    kMaxArray[level] = kMaxJson[levelStr].n_clusters;
                } else {
                    throw new Error(`Missing n_clusters data for level ${level}`);
                }
            }
            
            this.kMaxData = kMaxArray;
            this.indexUtils = new DAGIndexUtils(kMaxArray);
            
            Logger.debug('K_max data loaded successfully:', kMaxArray);
            Logger.debug('Index utils summary:', this.indexUtils.getSummary());
            
            return kMaxArray;
            
        } catch (error) {
            Logger.error('Failed to load K_max data:', error);
            throw new Error(`K_max data loading failed: ${error.message}`);
        }
    }
    
    /**
     * Load vertical_transition_graph.json data
     * @returns {Promise<Object>} - DAG graph data
     */
    async loadDAGData() {
        try {
            const dagData = await this.loadFile('json_files/vertical_transition_graph.json', 'json');
            
            if (!dagData.graph || !dagData.graph.nodes || !dagData.graph.links) {
                throw new Error('Invalid DAG data structure: missing graph.nodes or graph.links');
            }
            
            this.dagData = dagData;
            
            Logger.debug(`DAG data loaded: ${dagData.graph.nodes.length} nodes, ${dagData.graph.links.length} links`);
            
            return dagData;
            
        } catch (error) {
            Logger.error('Failed to load DAG data:', error);
            throw new Error(`DAG data loading failed: ${error.message}`);
        }
    }
    
    /**
     * Load both K_max and DAG data, then validate
     * @returns {Promise<Object>} - {kMaxData, dagData, indexUtils, validationResults}
     */
    async loadAndValidateData() {
        return await this.loadWithErrorHandling(async () => {
            // Load both data sources
            const [kMaxData, dagData] = await Promise.all([
                this.loadKMaxData(),
                this.loadDAGData()
            ]);
            
            // Perform comprehensive validation
            await this.validateDataIntegrity();
            
            return {
                kMaxData: this.kMaxData,
                dagData: this.dagData,
                indexUtils: this.indexUtils,
                validationResults: this.validationResults
            };
        }, 'load and validate DAG data');
    }
    
    /**
     * Validate MP4 file counts against K_max data
     * @returns {Promise<boolean>} - True if validation passes
     */
    async validateMP4Files() {
        if (!this.kMaxData) {
            throw new Error('K_max data must be loaded before MP4 validation');
        }
        
        try {
            const validationResults = [];
            
            // Check each level (skip level 0 as it has no MP4 files)
            for (let level = 1; level < this.kMaxData.length; level++) {
                const expectedCount = this.kMaxData[level];
                
                // Check if MP4 files exist by attempting to fetch a few
                const checks = [];
                for (let cluster = 1; cluster <= Math.min(expectedCount, 3); cluster++) {
                    const filename = `mp4_files/combined-cluster${cluster}-${level}months.mp4`;
                    checks.push(this.checkFileExists(filename));
                }
                
                const results = await Promise.all(checks);
                const successCount = results.filter(Boolean).length;
                
                validationResults.push({
                    level,
                    expected: expectedCount,
                    checked: checks.length,
                    foundSamples: successCount,
                    valid: successCount === checks.length
                });
                
                Logger.debug(`Level ${level}: Expected ${expectedCount} clusters, checked ${checks.length} samples, found ${successCount}`);
            }
            
            const allValid = validationResults.every(result => result.valid);
            this.validationResults.mp4Validation = allValid;
            
            if (allValid) {
                Logger.debug('MP4 file validation passed');
            } else {
                Logger.warn('MP4 file validation failed for some levels');
            }
            
            return allValid;
            
        } catch (error) {
            Logger.error('MP4 validation failed:', error);
            this.validationResults.mp4Validation = false;
            return false;
        }
    }
    
    /**
     * Check if a file exists by attempting to fetch its head
     * @param {string} filename - File to check
     * @returns {Promise<boolean>} - True if file exists
     */
    async checkFileExists(filename) {
        return await this.fileExists(filename);
    }
    
    /**
     * Validate node counts in DAG data against K_max
     * @returns {boolean} - True if validation passes
     */
    validateNodeCounts() {
        if (!this.kMaxData || !this.dagData) {
            throw new Error('Both K_max and DAG data must be loaded before node count validation');
        }
        
        try {
            // Group nodes by level
            const nodesByLevel = {};
            for (const node of this.dagData.graph.nodes) {
                const level = node.level;
                if (!nodesByLevel[level]) {
                    nodesByLevel[level] = [];
                }
                nodesByLevel[level].push(node);
            }
            
            // Validate each level
            let allValid = true;
            for (let level = 0; level < this.kMaxData.length; level++) {
                const expected = this.kMaxData[level];
                const actual = nodesByLevel[level] ? nodesByLevel[level].length : 0;
                
                if (actual !== expected) {
                    Logger.error(`Level ${level}: Expected ${expected} nodes, found ${actual}`);
                    allValid = false;
                } else {
                    Logger.debug(`Level ${level}: Node count validated (${actual} nodes)`);
                }
            }
            
            this.validationResults.nodeCountValidation = allValid;
            
            if (allValid) {
                Logger.debug('Node count validation passed');
            } else {
                Logger.error('Node count validation failed');
            }
            
            return allValid;
            
        } catch (error) {
            Logger.error('Node count validation failed:', error);
            this.validationResults.nodeCountValidation = false;
            return false;
        }
    }
    
    /**
     * Validate index consistency between global IDs and level/local_idx
     * @returns {boolean} - True if validation passes
     */
    validateIndexConsistency() {
        if (!this.indexUtils || !this.dagData) {
            throw new Error('Index utils and DAG data must be loaded before index validation');
        }
        
        try {
            let validCount = 0;
            let totalCount = 0;
            
            for (const node of this.dagData.graph.nodes) {
                totalCount++;
                
                const globalId = node.id;
                const expectedLevel = node.level;
                const expectedLocalIdx = node.local_idx;
                
                // Validate using our index utilities
                const isValid = this.indexUtils.validateGlobalIndex(globalId, expectedLevel, expectedLocalIdx);
                
                if (isValid) {
                    validCount++;
                } else {
                    Logger.error(`Index mismatch for node ${globalId}: expected level ${expectedLevel}, local ${expectedLocalIdx}`);
                }
            }
            
            const allValid = validCount === totalCount;
            this.validationResults.indexConsistencyValidation = allValid;
            
            Logger.debug(`Index consistency validation: ${validCount}/${totalCount} nodes valid`);
            
            if (allValid) {
                Logger.debug('Index consistency validation passed');
            } else {
                Logger.error('Index consistency validation failed');
            }
            
            return allValid;
            
        } catch (error) {
            Logger.error('Index consistency validation failed:', error);
            this.validationResults.indexConsistencyValidation = false;
            return false;
        }
    }
    
    /**
     * Perform comprehensive validation of all data
     * @returns {Promise<boolean>} - True if all validations pass
     */
    async validateDataIntegrity() {
        Logger.debug('Starting comprehensive DAG data validation...');
        
        try {
            // Validate node counts
            const nodeCountValid = this.validateNodeCounts();
            
            // Validate index consistency  
            const indexValid = this.validateIndexConsistency();
            
            // Validate MP4 files (this is async)
            const mp4Valid = await this.validateMP4Files();
            
            // Mark K_max validation as passed (if we got this far, it loaded successfully)
            this.validationResults.kMaxValidation = true;
            
            const allValid = nodeCountValid && indexValid && mp4Valid;
            
            if (allValid) {
                Logger.debug('✅ All DAG data validations passed');
            } else {
                Logger.warn('⚠️  Some DAG data validations failed');
                Logger.debug('Validation results:', this.validationResults);
            }
            
            return allValid;
            
        } catch (error) {
            Logger.error('Data integrity validation failed:', error);
            return false;
        }
    }
    
    /**
     * Get validation summary for debugging
     * @returns {Object} - Detailed validation results
     */
    getValidationSummary() {
        return {
            ...this.validationResults,
            kMaxDataLoaded: !!this.kMaxData,
            dagDataLoaded: !!this.dagData,
            indexUtilsCreated: !!this.indexUtils,
            summary: this.indexUtils ? this.indexUtils.getSummary() : null
        };
    }
    
    /**
     * Get the loaded index utilities
     * @returns {DAGIndexUtils|null} - Index utilities or null if not loaded
     */
    getIndexUtils() {
        return this.indexUtils;
    }
    
    /**
     * Get the loaded DAG data
     * @returns {Object|null} - DAG data or null if not loaded
     */
    getDAGData() {
        return this.dagData;
    }
    
    /**
     * Get the loaded K_max data
     * @returns {Array<number>|null} - K_max array or null if not loaded
     */
    getKMaxData() {
        return this.kMaxData;
    }
}