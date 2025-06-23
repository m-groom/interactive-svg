// Base Data Loader - Common functionality for all data loading operations
// Provides standard loading, error handling, and validation patterns

import { Logger } from './Logger.js';
import { Utils } from './Utils.js';
import { ErrorHandler, DataLoadError } from './ErrorHandler.js';
import { CONFIG, ERROR_MESSAGES } from './constants.js';

export class BaseDataLoader {
    constructor() {
        this.loadingElement = null;
        this.errorElement = null;
        this.isLoading = false;
        this.loadedData = new Map(); // Cache for loaded data
    }

    /**
     * Initialize loader with UI elements
     * @param {HTMLElement} loadingElement - Loading indicator element
     * @param {HTMLElement} errorElement - Error display element
     */
    initialize(loadingElement, errorElement) {
        this.loadingElement = loadingElement;
        this.errorElement = errorElement;
        Logger.debug('BaseDataLoader initialized');
    }

    /**
     * Generic file loader with error handling and caching
     * @param {string} url - URL to load
     * @param {string} dataType - 'json', 'text', or 'xml'
     * @param {Object} options - Loading options
     * @returns {Promise<any>} - Loaded data
     */
    async loadFile(url, dataType = 'json', options = {}) {
        const {
            useCache = true,
            timeout = CONFIG.DEFAULT_TIMEOUT || 30000,
            retries = CONFIG.DEFAULT_RETRIES || 1
        } = options;

        // Check cache first
        if (useCache && this.loadedData.has(url)) {
            Logger.debug(`Cache hit for ${url}`);
            return this.loadedData.get(url);
        }

        let lastError;
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                if (attempt > 0) {
                    Logger.debug(`Retry attempt ${attempt} for ${url}`);
                }

                const data = await this.performLoad(url, dataType, timeout);
                
                // Cache successful loads
                if (useCache) {
                    this.loadedData.set(url, data);
                }

                Logger.debug(`Successfully loaded ${dataType} from ${url}`);
                return data;

            } catch (error) {
                lastError = error;
                Logger.warn(`Load attempt ${attempt + 1} failed for ${url}:`, error.message);
                
                if (attempt < retries) {
                    await Utils.delay(1000 * (attempt + 1)); // Exponential backoff
                }
            }
        }

        throw new DataLoadError(`Failed to load ${url} after ${retries + 1} attempts: ${lastError.message}`);
    }

    /**
     * Perform the actual loading operation
     * @param {string} url - URL to load
     * @param {string} dataType - Data type expected
     * @param {number} timeout - Timeout in milliseconds
     * @returns {Promise<any>} - Loaded data
     */
    async performLoad(url, dataType, timeout) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            const response = await fetch(url, {
                signal: controller.signal,
                method: 'GET',
                headers: {
                    'Accept': this.getAcceptHeader(dataType),
                    'Cache-Control': 'no-cache'
                }
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return await this.parseResponse(response, dataType);

        } catch (error) {
            clearTimeout(timeoutId);
            
            if (error.name === 'AbortError') {
                throw new Error(`Request timeout after ${timeout}ms`);
            }
            throw error;
        }
    }

    /**
     * Get appropriate Accept header for data type
     * @param {string} dataType - Data type
     * @returns {string} - Accept header value
     */
    getAcceptHeader(dataType) {
        switch (dataType) {
            case 'json': return 'application/json, text/plain';
            case 'xml': return 'application/xml, text/xml';
            case 'text': return 'text/plain';
            default: return '*/*';
        }
    }

    /**
     * Parse response based on data type
     * @param {Response} response - Fetch response
     * @param {string} dataType - Expected data type
     * @returns {Promise<any>} - Parsed data
     */
    async parseResponse(response, dataType) {
        switch (dataType) {
            case 'json':
                const text = await response.text();
                if (!text.trim()) {
                    throw new Error('Empty response body');
                }
                try {
                    return JSON.parse(text);
                } catch (parseError) {
                    throw new Error(`Invalid JSON: ${parseError.message}`);
                }
            
            case 'xml':
                const xmlText = await response.text();
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(xmlText, 'application/xml');
                
                const parseError = xmlDoc.querySelector('parsererror');
                if (parseError) {
                    throw new Error(`XML parse error: ${parseError.textContent}`);
                }
                return xmlDoc;
            
            case 'text':
                return await response.text();
            
            default:
                throw new Error(`Unsupported data type: ${dataType}`);
        }
    }

    /**
     * Load multiple files in parallel
     * @param {Array<Object>} requests - Array of {url, dataType, options} objects
     * @param {Object} options - Global options
     * @returns {Promise<Array>} - Array of loaded data
     */
    async loadMultiple(requests, options = {}) {
        const { failFast = true, maxConcurrency = 5 } = options;

        Logger.debug(`Loading ${requests.length} files with max concurrency ${maxConcurrency}`);

        if (failFast) {
            // Use Promise.all for fail-fast behavior
            const chunks = Utils.chunkArray(requests, maxConcurrency);
            const results = [];

            for (const chunk of chunks) {
                const chunkPromises = chunk.map(req => 
                    this.loadFile(req.url, req.dataType, req.options)
                );
                const chunkResults = await Promise.all(chunkPromises);
                results.push(...chunkResults);
            }

            return results;
        } else {
            // Use Promise.allSettled for partial failure tolerance
            const allPromises = requests.map(req => 
                this.loadFile(req.url, req.dataType, req.options)
            );
            
            const results = await Promise.allSettled(allPromises);
            const successes = [];
            const failures = [];

            results.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    successes.push({ index, data: result.value });
                } else {
                    failures.push({ index, error: result.reason, url: requests[index].url });
                }
            });

            if (failures.length > 0) {
                Logger.warn(`${failures.length}/${requests.length} files failed to load:`, failures);
            }

            return results.map(result => 
                result.status === 'fulfilled' ? result.value : null
            );
        }
    }

    /**
     * Check if a file exists (HEAD request)
     * @param {string} url - URL to check
     * @param {number} timeout - Timeout in milliseconds
     * @returns {Promise<boolean>} - True if file exists
     */
    async fileExists(url, timeout = 5000) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            const response = await fetch(url, {
                method: 'HEAD',
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            return response.ok;

        } catch (error) {
            Logger.debug(`File existence check failed for ${url}: ${error.message}`);
            return false;
        }
    }

    /**
     * Validate multiple files exist with enhanced batch processing and caching
     * @param {Array<string>} urls - URLs to validate
     * @param {string} description - Description for logging
     * @param {Object} options - Validation options
     * @returns {Promise<Object>} - Validation results
     */
    async validateFilesExist(urls, description = 'files', options = {}) {
        const {
            useCache = true,
            batchSize = CONFIG.BATCH_FILE_CHECK_SIZE || 10,
            timeout = CONFIG.FILE_CHECK_TIMEOUT || 5000,
            maxConcurrency = 5,
            retryFailures = false
        } = options;

        Logger.debug(`Validating existence of ${urls.length} ${description} (batch size: ${batchSize})`);

        const results = [];
        const failed = [];
        const cached = [];

        // Check cache first if enabled
        if (useCache) {
            for (const url of urls) {
                const cacheKey = `file_exists_${url}`;
                if (this.loadedData.has(cacheKey)) {
                    const exists = this.loadedData.get(cacheKey);
                    results.push({ url, exists, cached: true });
                    cached.push(url);
                }
            }
        }

        // Get uncached URLs
        const uncachedUrls = urls.filter(url => !cached.includes(url));
        
        if (uncachedUrls.length > 0) {
            Logger.debug(`Checking ${uncachedUrls.length} uncached files (${cached.length} from cache)`);

            // Process in batches with concurrency control
            const batches = Utils.chunkArray(uncachedUrls, batchSize);
            
            for (const batch of batches) {
                const batchPromises = batch.map(async (url) => {
                    try {
                        const exists = await this.fileExists(url, timeout);
                        
                        // Cache result
                        if (useCache) {
                            const cacheKey = `file_exists_${url}`;
                            this.loadedData.set(cacheKey, exists);
                        }
                        
                        return { url, exists, cached: false };
                    } catch (error) {
                        Logger.debug(`File check failed for ${url}: ${error.message}`);
                        failed.push({ url, error: error.message });
                        return { url, exists: false, cached: false, error: error.message };
                    }
                });

                // Limit concurrency within each batch
                const batchResults = await Promise.all(batchPromises);
                results.push(...batchResults);
                
                // Small delay between batches to avoid overwhelming the server
                if (batches.indexOf(batch) < batches.length - 1) {
                    await Utils.delay(100);
                }
            }
        }

        // Retry failed checks if requested
        if (retryFailures && failed.length > 0) {
            Logger.debug(`Retrying ${failed.length} failed file checks`);
            
            for (const failedItem of failed) {
                try {
                    const exists = await this.fileExists(failedItem.url, timeout * 2);
                    
                    // Update result
                    const resultIndex = results.findIndex(r => r.url === failedItem.url);
                    if (resultIndex !== -1) {
                        results[resultIndex] = { 
                            url: failedItem.url, 
                            exists, 
                            cached: false, 
                            retried: true 
                        };
                    }
                    
                    // Cache successful retry
                    if (useCache && exists) {
                        const cacheKey = `file_exists_${failedItem.url}`;
                        this.loadedData.set(cacheKey, exists);
                    }
                } catch (retryError) {
                    Logger.debug(`Retry failed for ${failedItem.url}: ${retryError.message}`);
                }
            }
        }

        // Compile final results
        const existing = results.filter(r => r.exists);
        const missing = results.filter(r => !r.exists);
        const isValid = missing.length === 0;

        const summary = {
            isValid,
            total: urls.length,
            existing: existing.length,
            missing: missing.length,
            missingUrls: missing.map(r => r.url),
            existingUrls: existing.map(r => r.url),
            cached: cached.length,
            failed: failed.length,
            retried: results.filter(r => r.retried).length
        };

        if (!isValid) {
            Logger.warn(`File validation failed: ${missing.length}/${urls.length} ${description} missing`);
        } else {
            Logger.debug(`File validation passed: All ${urls.length} ${description} exist (${cached.length} cached)`);
        }

        return summary;
    }

    /**
     * Show loading indicator
     */
    showLoading() {
        this.isLoading = true;
        if (this.loadingElement) {
            this.loadingElement.style.display = 'block';
        }
    }

    /**
     * Hide loading indicator
     */
    hideLoading() {
        this.isLoading = false;
        if (this.loadingElement) {
            this.loadingElement.style.display = 'none';
        }
    }

    /**
     * Show error message
     * @param {string} message - Error message
     * @param {Error} error - Original error object
     */
    showError(message, error = null) {
        if (this.errorElement) {
            this.errorElement.innerHTML = Utils.escapeHTML(message);
            this.errorElement.style.display = 'block';
        }
        
        if (error) {
            ErrorHandler.handleError(error, 'DataLoader', this.errorElement);
        }
    }

    /**
     * Hide error message
     */
    hideError() {
        if (this.errorElement) {
            this.errorElement.style.display = 'none';
        }
    }

    /**
     * Clear cache
     * @param {string} url - Specific URL to clear, or null to clear all
     */
    clearCache(url = null) {
        if (url) {
            this.loadedData.delete(url);
            Logger.debug(`Cleared cache for ${url}`);
        } else {
            this.loadedData.clear();
            Logger.debug('Cleared all cache');
        }
    }

    /**
     * Get cache statistics
     * @returns {Object} - Cache stats
     */
    getCacheStats() {
        return {
            size: this.loadedData.size,
            urls: Array.from(this.loadedData.keys())
        };
    }

    /**
     * Load with comprehensive error handling and UI updates
     * @param {Function} loadFunction - Function that performs the actual loading
     * @param {string} operation - Description of the operation
     * @returns {Promise<any>} - Result of load function
     */
    async loadWithErrorHandling(loadFunction, operation = 'load data') {
        this.showLoading();
        this.hideError();

        try {
            const result = await loadFunction();
            Logger.debug(`Successfully completed: ${operation}`);
            return result;
        } catch (error) {
            const message = `Failed to ${operation}: ${error.message}`;
            Logger.error(message, error);
            this.showError(message, error);
            throw error;
        } finally {
            this.hideLoading();
        }
    }

    /**
     * Get loading status
     * @returns {boolean} - True if currently loading
     */
    isCurrentlyLoading() {
        return this.isLoading;
    }
}