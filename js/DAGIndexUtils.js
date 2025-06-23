// DAG Index Utilities - JavaScript implementation of Julia conversion functions
// Handles conversion between global indices and level/local indices for DAG visualization

import { Logger } from './Logger.js';

export class DAGIndexUtils {
    constructor(kMaxArray) {
        if (!Array.isArray(kMaxArray) || kMaxArray.length === 0) {
            throw new Error('kMaxArray must be a non-empty array');
        }
        
        this.kMax = [...kMaxArray]; // Create a copy to avoid mutation
        this.numLevels = this.kMax.length;
        this.totalNodes = this.kMax.reduce((sum, k) => sum + k, 0);
        
        // Pre-compute cumulative sums for efficiency
        this.cumulativeReversed = this.computeCumulativeReversed();
        
        Logger.debug(`DAGIndexUtils initialized with ${this.numLevels} levels, ${this.totalNodes} total nodes`);
    }
    
    /**
     * Pre-compute cumulative sums from top (level 24) downward
     * This mirrors the Julia cumsum(reverse(K_max)) operation
     */
    computeCumulativeReversed() {
        const kMaxReversed = [...this.kMax].reverse();
        const cumulative = [0]; // Start with 0
        
        let sum = 0;
        for (const k of kMaxReversed) {
            sum += k;
            cumulative.push(sum);
        }
        
        return cumulative;
    }
    
    /**
     * Convert level number and local index to global index
     * @param {number} levelNum - 1-based level number (0 = observed, 24 = highest lead time, matches JSON)
     * @param {number} localIdx - 1-based local index within the level
     * @returns {number} - Global index (1-based)
     * 
     * CORRECTED: Now accepts 1-based levelNum to match JSON data structure
     */
    globalIndexFromLevel(levelNum, localIdx) {
        // Validate inputs - levelNum should be 0-24 to match JSON
        if (levelNum < 0 || levelNum >= this.numLevels) {
            throw new Error(`Invalid levelNum: ${levelNum}. Must be between 0 and ${this.numLevels - 1}.`);
        }
        
        const maxLocalIdxForLevel = this.kMax[levelNum];
        if (localIdx < 1 || localIdx > maxLocalIdxForLevel) {
            throw new Error(`Local index ${localIdx} out of bounds for level ${levelNum} (max = ${maxLocalIdxForLevel}).`);
        }
        
        // Convert JSON level (0-24) to position from top (24 = position 0, 0 = position 24)
        const levelFromTop = (this.numLevels - 1) - levelNum;
        
        // Calculate the first global index for this level
        const firstGlobalIdxInLevel = this.cumulativeReversed[levelFromTop] + 1;
        const globalIndex = firstGlobalIdxInLevel + localIdx - 1;
        
        return globalIndex;
    }
    
    /**
     * Convert global index to level number and local index
     * @param {number} globalIdx - Global index (1-based)
     * @returns {Object} - {level: 1-based level (matches JSON), localIdx: 1-based local index}
     * 
     * CORRECTED: This now returns 1-based levels to match the JSON data structure
     * where Level 0 = observed, Level 24 = highest prediction level
     */
    localLevelFromGlobal(globalIdx) {
        // Validate input
        if (globalIdx < 1 || globalIdx > this.totalNodes) {
            throw new Error(`globalIdx ${globalIdx} out of range. Must be between 1 and ${this.totalNodes}.`);
        }
        
        // The JSON data assigns global IDs from highest level (24) to lowest level (0)
        // So we need to work backwards through the cumulative array
        
        // Find which level this global index belongs to by finding the 
        // cumulative range it falls into
        let levelFromTop = 0; // 0 = top level (level 24), increasing downward
        
        for (let i = 1; i < this.cumulativeReversed.length; i++) {
            if (globalIdx <= this.cumulativeReversed[i]) {
                levelFromTop = i - 1;
                break;
            }
        }
        
        // Convert to the JSON's 1-based level numbering system
        // levelFromTop 0 = Level 24, levelFromTop 1 = Level 23, etc.
        const jsonLevel = (this.numLevels - 1) - levelFromTop;
        
        // Calculate local index within the level
        const prevCum = this.cumulativeReversed[levelFromTop];
        const localIdx = globalIdx - prevCum;
        
        return {
            level: jsonLevel,    // 1-based level matching JSON (0-24)
            localIdx: localIdx   // 1-based local index
        };
    }
    
    /**
     * Get the video filename for a given global index
     * @param {number} globalIdx - Global index (1-based)
     * @returns {string|null} - Video filename or null for level 0 (observed classes)
     */
    getVideoFilename(globalIdx) {
        const { level, localIdx } = this.localLevelFromGlobal(globalIdx);
        
        // Level 0 are observed classes - no videos available
        if (level === 0) {
            return null;
        }
        
        // For other levels, construct video filename
        // Format: combined-cluster{localIdx}-{level}months.mp4
        return `mp4_files/combined-cluster${localIdx}-${level}months.mp4`;
    }
    
    /**
     * Get placeholder video for level 0 nodes
     * @returns {string} - Placeholder video filename
     */
    getPlaceholderVideo() {
        return 'mp4_files/combined-cluster1-1months.mp4';
    }
    
    /**
     * Get the number of nodes at a specific level
     * @param {number} levelNum - JSON-based level number (0 = observed, 24 = highest prediction)
     * @returns {number} - Number of nodes at this level
     */
    getNumNodesAtLevel(levelNum) {
        if (levelNum < 0 || levelNum >= this.numLevels) {
            throw new Error(`Invalid levelNum: ${levelNum}. Must be between 0 and ${this.numLevels - 1}.`);
        }
        return this.kMax[levelNum];
    }
    
    /**
     * Get all global indices for a specific level
     * @param {number} levelNum - JSON-based level number (0 = observed, 24 = highest prediction)
     * @returns {Array<number>} - Array of global indices for this level
     */
    getGlobalIndicesForLevel(levelNum) {
        const numNodes = this.getNumNodesAtLevel(levelNum);
        const indices = [];
        
        for (let localIdx = 1; localIdx <= numNodes; localIdx++) {
            indices.push(this.globalIndexFromLevel(levelNum, localIdx));
        }
        
        return indices;
    }
    
    /**
     * Validate that a global index corresponds to expected level and local index
     * @param {number} globalIdx - Global index to validate
     * @param {number} expectedLevel - Expected JSON-based level (0-24)
     * @param {number} expectedLocalIdx - Expected 1-based local index
     * @returns {boolean} - True if validation passes
     */
    validateGlobalIndex(globalIdx, expectedLevel, expectedLocalIdx) {
        try {
            const { level, localIdx } = this.localLevelFromGlobal(globalIdx);
            return level === expectedLevel && localIdx === expectedLocalIdx;
        } catch (error) {
            Logger.error('Index validation failed:', error.message);
            return false;
        }
    }
    
    /**
     * Debug method to print index mapping for a specific level
     * @param {number} levelNum - JSON-based level number (0-24)
     */
    debugLevel(levelNum) {
        Logger.debug(`\n=== Level ${levelNum} Debug Info ===`);
        Logger.debug(`Number of nodes: ${this.getNumNodesAtLevel(levelNum)}`);
        
        const globalIndices = this.getGlobalIndicesForLevel(levelNum);
        Logger.debug(`Global indices: [${globalIndices.join(', ')}]`);
        
        // Verify round-trip conversion
        for (const globalIdx of globalIndices) {
            const { level, localIdx } = this.localLevelFromGlobal(globalIdx);
            const backToGlobal = this.globalIndexFromLevel(level, localIdx);
            const isValid = backToGlobal === globalIdx;
            Logger.debug(`Global ${globalIdx} -> Level ${level}, Local ${localIdx} -> Global ${backToGlobal} (${isValid ? 'OK' : 'ERROR'})`);
        }
    }
    
    /**
     * Get summary statistics about the DAG structure
     * @returns {Object} - Summary information
     */
    getSummary() {
        return {
            numLevels: this.numLevels,
            totalNodes: this.totalNodes,
            levelRange: `0-${this.numLevels - 1}`,
            globalIndexRange: `1-${this.totalNodes}`,
            nodesPerLevel: [...this.kMax],
            observedClasses: this.kMax[0], // Level 0
            predictiveLevels: this.numLevels - 1
        };
    }
}