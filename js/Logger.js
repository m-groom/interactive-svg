export class Logger {
    static DEBUG = false; // Will be overridden by constants.js
    
    static levels = {
        ERROR: 0,
        WARN: 1,
        INFO: 2,
        DEBUG: 3
    };
    
    static currentLevel = Logger.levels.INFO; // Default to INFO level
    
    static setDebug(enabled) {
        Logger.DEBUG = enabled;
        Logger.currentLevel = enabled ? Logger.levels.DEBUG : Logger.levels.INFO;
    }
    
    static setLevel(level) {
        Logger.currentLevel = level;
    }
    
    static error(message, ...args) {
        if (Logger.currentLevel >= Logger.levels.ERROR) {
            console.error(`[ERROR] ${message}`, ...args);
        }
    }
    
    static warn(message, ...args) {
        if (Logger.currentLevel >= Logger.levels.WARN) {
            console.warn(`[WARN] ${message}`, ...args);
        }
    }
    
    static info(message, ...args) {
        if (Logger.currentLevel >= Logger.levels.INFO) {
            console.log(`[INFO] ${message}`, ...args);
        }
    }
    
    static debug(message, ...args) {
        if (Logger.DEBUG && Logger.currentLevel >= Logger.levels.DEBUG) {
            console.log(`[DEBUG] ${message}`, ...args);
        }
    }
    
    static log(message, ...args) {
        // Alias for info for backward compatibility
        Logger.info(message, ...args);
    }
}