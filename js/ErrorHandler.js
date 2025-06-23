import { Logger } from './Logger.js';

// Custom error classes
export class DataLoadError extends Error {
    constructor(message, filename = null, originalError = null) {
        super(message);
        this.name = 'DataLoadError';
        this.filename = filename;
        this.originalError = originalError;
    }
}

export class ValidationError extends Error {
    constructor(message, data = null, validationType = null) {
        super(message);
        this.name = 'ValidationError';
        this.data = data;
        this.validationType = validationType;
    }
}

export class FileNotFoundError extends Error {
    constructor(message, filename = null) {
        super(message);
        this.name = 'FileNotFoundError';
        this.filename = filename;
    }
}

export class ErrorHandler {
    static errorCounts = {
        total: 0,
        dataLoad: 0,
        validation: 0,
        fileNotFound: 0,
        general: 0
    };
    
    static errorHistory = [];
    static maxHistorySize = 50;
    
    static handleError(error, context = '', userErrorElement = null) {
        // Increment counters
        ErrorHandler.errorCounts.total++;
        
        if (error instanceof DataLoadError) {
            ErrorHandler.errorCounts.dataLoad++;
        } else if (error instanceof ValidationError) {
            ErrorHandler.errorCounts.validation++;
        } else if (error instanceof FileNotFoundError) {
            ErrorHandler.errorCounts.fileNotFound++;
        } else {
            ErrorHandler.errorCounts.general++;
        }
        
        // Add to history
        const errorEntry = {
            timestamp: new Date().toISOString(),
            type: error.name || 'Error',
            message: error.message,
            context: context,
            stack: error.stack
        };
        
        ErrorHandler.errorHistory.unshift(errorEntry);
        if (ErrorHandler.errorHistory.length > ErrorHandler.maxHistorySize) {
            ErrorHandler.errorHistory.pop();
        }
        
        // Log the error
        Logger.error(`${context ? `[${context}] ` : ''}${error.name || 'Error'}: ${error.message}`, error);
        
        // Show user-friendly error if element provided
        if (userErrorElement) {
            ErrorHandler.showUserError(error, userErrorElement, context);
        }
        
        return errorEntry;
    }
    
    static showUserError(error, errorElement, context = '') {
        if (!errorElement) return;
        
        let userMessage = '';
        let errorClass = 'error-message';
        
        if (error instanceof DataLoadError) {
            userMessage = `Failed to load data${error.filename ? ` from ${error.filename}` : ''}. Please check your internet connection and try again.`;
        } else if (error instanceof ValidationError) {
            userMessage = `Data validation failed${error.validationType ? ` (${error.validationType})` : ''}. The data may be corrupted or incompatible.`;
        } else if (error instanceof FileNotFoundError) {
            userMessage = `Required file not found${error.filename ? `: ${error.filename}` : ''}. Some features may not work properly.`;
        } else {
            userMessage = `An unexpected error occurred${context ? ` in ${context}` : ''}. Please try again.`;
        }
        
        errorElement.innerHTML = `
            <div class="${errorClass}">
                <strong>Error:</strong> ${userMessage}
                <br><small>Error type: ${error.name || 'Unknown'}</small>
            </div>
        `;
        errorElement.style.display = 'block';
    }
    
    static hideUserError(errorElement) {
        if (errorElement) {
            errorElement.style.display = 'none';
            errorElement.innerHTML = '';
        }
    }
    
    static createError(type, message, details = {}) {
        switch (type) {
            case 'DataLoad':
                return new DataLoadError(message, details.filename, details.originalError);
            case 'Validation':
                return new ValidationError(message, details.data, details.validationType);
            case 'FileNotFound':
                return new FileNotFoundError(message, details.filename);
            default:
                return new Error(message);
        }
    }
    
    static wrapAsync(asyncFn, context = '') {
        return async (...args) => {
            try {
                return await asyncFn(...args);
            } catch (error) {
                ErrorHandler.handleError(error, context);
                throw error; // Re-throw to allow caller to handle if needed
            }
        };
    }
    
    static wrapSync(syncFn, context = '') {
        return (...args) => {
            try {
                return syncFn(...args);
            } catch (error) {
                ErrorHandler.handleError(error, context);
                throw error; // Re-throw to allow caller to handle if needed
            }
        };
    }
    
    static getErrorSummary() {
        return {
            counts: { ...ErrorHandler.errorCounts },
            recentErrors: ErrorHandler.errorHistory.slice(0, 10),
            totalHistory: ErrorHandler.errorHistory.length
        };
    }
    
    static clearErrorHistory() {
        ErrorHandler.errorHistory = [];
        ErrorHandler.errorCounts = {
            total: 0,
            dataLoad: 0,
            validation: 0,
            fileNotFound: 0,
            general: 0
        };
        Logger.info('Error history cleared');
    }
    
    // Recovery strategies
    static async retryOperation(operation, maxRetries = 3, delay = 1000, context = '') {
        let lastError;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                Logger.debug(`Attempt ${attempt}/${maxRetries} for ${context}`);
                return await operation();
            } catch (error) {
                lastError = error;
                Logger.warn(`${context} attempt ${attempt} failed:`, error.message);
                
                if (attempt < maxRetries) {
                    Logger.debug(`Waiting ${delay}ms before retry...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    delay *= 1.5; // Exponential backoff
                }
            }
        }
        
        const retryError = ErrorHandler.createError('DataLoad', 
            `${context} failed after ${maxRetries} attempts: ${lastError.message}`, 
            { originalError: lastError }
        );
        
        ErrorHandler.handleError(retryError, context);
        throw retryError;
    }
}