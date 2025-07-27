// Case Study Date Utilities - Date calculation and validation for case studies
// Handles target date validation, lead time calculations, and file path generation

import { Logger } from './Logger.js';
import { Utils } from './Utils.js';

export class CaseStudyDateUtils {
    constructor() {
        // Date range constants
        this.MIN_YEAR = 2002;
        this.MAX_YEAR = 2024;
        this.MIN_MONTH = 1;
        this.MAX_MONTH = 12;
        this.MIN_LEAD_TIME = 1;
        this.MAX_LEAD_TIME = 24;
        
        // Date when PNG files start being available (based on existing codebase)
        this.PNG_START_YEAR = 2000;
        this.PNG_START_MONTH = 1;
    }

    /**
     * Validate target year input
     * @param {number|string} year - Year to validate
     * @returns {Object} - {isValid, error, year}
     */
    validateYear(year) {
        const yearNum = parseInt(year);
        
        if (isNaN(yearNum)) {
            return { isValid: false, error: 'Year must be a valid number', year: null };
        }
        
        if (yearNum < this.MIN_YEAR || yearNum > this.MAX_YEAR) {
            return { 
                isValid: false, 
                error: `Year must be between ${this.MIN_YEAR} and ${this.MAX_YEAR}`, 
                year: null 
            };
        }
        
        return { isValid: true, error: null, year: yearNum };
    }

    /**
     * Validate target month input
     * @param {number|string} month - Month to validate
     * @returns {Object} - {isValid, error, month}
     */
    validateMonth(month) {
        const monthNum = parseInt(month);
        
        if (isNaN(monthNum)) {
            return { isValid: false, error: 'Month must be a valid number', month: null };
        }
        
        if (monthNum < this.MIN_MONTH || monthNum > this.MAX_MONTH) {
            return { 
                isValid: false, 
                error: `Month must be between ${this.MIN_MONTH} and ${this.MAX_MONTH}`, 
                month: null 
            };
        }
        
        return { isValid: true, error: null, month: monthNum };
    }

    /**
     * Validate lead time input
     * @param {number|string} leadTime - Lead time to validate
     * @returns {Object} - {isValid, error, leadTime}
     */
    validateLeadTime(leadTime) {
        const leadTimeNum = parseInt(leadTime);
        
        if (isNaN(leadTimeNum)) {
            return { isValid: false, error: 'Lead time must be a valid number', leadTime: null };
        }
        
        if (leadTimeNum < this.MIN_LEAD_TIME || leadTimeNum > this.MAX_LEAD_TIME) {
            return { 
                isValid: false, 
                error: `Lead time must be between ${this.MIN_LEAD_TIME} and ${this.MAX_LEAD_TIME} months`, 
                leadTime: null 
            };
        }
        
        return { isValid: true, error: null, leadTime: leadTimeNum };
    }

    /**
     * Validate complete target date
     * @param {number} year - Target year
     * @param {number} month - Target month
     * @returns {Object} - {isValid, error, date}
     */
    validateTargetDate(year, month) {
        const yearValidation = this.validateYear(year);
        if (!yearValidation.isValid) {
            return { isValid: false, error: yearValidation.error, date: null };
        }
        
        const monthValidation = this.validateMonth(month);
        if (!monthValidation.isValid) {
            return { isValid: false, error: monthValidation.error, date: null };
        }
        
        // Check if date is within our valid range
        const targetDate = new Date(yearValidation.year, monthValidation.month - 1, 1);
        const minDate = new Date(this.MIN_YEAR, 0, 1); // Jan 2002
        const maxDate = new Date(this.MAX_YEAR, 11, 1); // Dec 2024
        
        if (targetDate < minDate || targetDate > maxDate) {
            return { 
                isValid: false, 
                error: `Target date must be between January ${this.MIN_YEAR} and December ${this.MAX_YEAR}`, 
                date: null 
            };
        }
        
        return { 
            isValid: true, 
            error: null, 
            date: {
                year: yearValidation.year,
                month: monthValidation.month,
                dateString: this.formatDateString(yearValidation.year, monthValidation.month)
            }
        };
    }

    /**
     * Calculate initial forecast date (target date minus lead time)
     * @param {number} targetYear - Target year
     * @param {number} targetMonth - Target month  
     * @param {number} leadTimeMonths - Lead time in months
     * @returns {Object} - {year, month, dateString, isValid, error}
     */
    calculateInitialDate(targetYear, targetMonth, leadTimeMonths) {
        try {
            let initialYear = targetYear;
            let initialMonth = targetMonth - leadTimeMonths;
            
            // Handle month underflow
            while (initialMonth <= 0) {
                initialMonth += 12;
                initialYear--;
            }
            
            // Check if calculated date is before PNG availability
            const initialDate = new Date(initialYear, initialMonth - 1, 1);
            const pngStartDate = new Date(this.PNG_START_YEAR, this.PNG_START_MONTH - 1, 1);
            
            if (initialDate < pngStartDate) {
                return {
                    year: initialYear,
                    month: initialMonth,
                    dateString: this.formatDateString(initialYear, initialMonth),
                    isValid: false,
                    error: `Initial forecast date (${this.formatDateString(initialYear, initialMonth)}) is before PNG data availability (${this.formatDateString(this.PNG_START_YEAR, this.PNG_START_MONTH)})`
                };
            }
            
            return {
                year: initialYear,
                month: initialMonth,
                dateString: this.formatDateString(initialYear, initialMonth),
                isValid: true,
                error: null
            };
            
        } catch (error) {
            Logger.error('Date calculation failed:', error);
            return {
                year: null,
                month: null,
                dateString: null,
                isValid: false,
                error: `Date calculation failed: ${error.message}`
            };
        }
    }

    /**
     * Format date as YYYY-MM-DD string (always using day 01)
     * @param {number} year - Year
     * @param {number} month - Month (1-12)
     * @returns {string} - Formatted date string
     */
    formatDateString(year, month) {
        return `${year}-${month.toString().padStart(2, '0')}-01`;
    }

    /**
     * Format date for display
     * @param {number} year - Year
     * @param {number} month - Month (1-12)
     * @returns {string} - Human-readable date string
     */
    formatDateForDisplay(year, month) {
        const monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        
        return `${monthNames[month - 1]} ${year}`;
    }

    /**
     * Generate video filename for target date and lead time
     * @param {number} targetYear - Target year
     * @param {number} targetMonth - Target month
     * @param {number} leadTime - Lead time in months
     * @returns {string} - Video filename path
     */
    generateVideoFilename(targetYear, targetMonth, leadTime) {
        const dateString = this.formatDateString(targetYear, targetMonth);
        return `mp4_files/${dateString}-${leadTime}months.mp4`;
    }

    /**
     * Generate image filename for initial forecast date
     * @param {number} initialYear - Initial forecast year
     * @param {number} initialMonth - Initial forecast month
     * @returns {string} - Image filename path
     */
    generateImageFilename(initialYear, initialMonth) {
        const dateString = this.formatDateString(initialYear, initialMonth);
        return `png_files/${dateString}-detrended.png`;
    }

    /**
     * Validate complete case study parameters
     * @param {number} targetYear - Target year
     * @param {number} targetMonth - Target month
     * @param {number} leadTime - Lead time in months
     * @returns {Object} - Complete validation result with file paths
     */
    validateCaseStudyParameters(targetYear, targetMonth, leadTime) {
        // Validate target date
        const targetValidation = this.validateTargetDate(targetYear, targetMonth);
        if (!targetValidation.isValid) {
            return {
                isValid: false,
                error: targetValidation.error,
                data: null
            };
        }

        // Validate lead time
        const leadTimeValidation = this.validateLeadTime(leadTime);
        if (!leadTimeValidation.isValid) {
            return {
                isValid: false,
                error: leadTimeValidation.error,
                data: null
            };
        }

        // Calculate initial date
        const initialDate = this.calculateInitialDate(targetYear, targetMonth, leadTime);
        if (!initialDate.isValid) {
            return {
                isValid: false,
                error: initialDate.error,
                data: null
            };
        }

        // Generate file paths
        const videoFilename = this.generateVideoFilename(targetYear, targetMonth, leadTime);
        const imageFilename = this.generateImageFilename(initialDate.year, initialDate.month);

        return {
            isValid: true,
            error: null,
            data: {
                target: {
                    year: targetYear,
                    month: targetMonth,
                    dateString: targetValidation.date.dateString,
                    displayString: this.formatDateForDisplay(targetYear, targetMonth)
                },
                initial: {
                    year: initialDate.year,
                    month: initialDate.month,
                    dateString: initialDate.dateString,
                    displayString: this.formatDateForDisplay(initialDate.year, initialDate.month)
                },
                leadTime: leadTime,
                filePaths: {
                    video: videoFilename,
                    image: imageFilename
                }
            }
        };
    }

    /**
     * Get available year range
     * @returns {Array<number>} - Array of available years
     */
    getAvailableYears() {
        const years = [];
        for (let year = this.MIN_YEAR; year <= this.MAX_YEAR; year++) {
            years.push(year);
        }
        return years;
    }

    /**
     * Get available month range
     * @returns {Array<Object>} - Array of month objects with value and name
     */
    getAvailableMonths() {
        const monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        
        return monthNames.map((name, index) => ({
            value: index + 1,
            name: name
        }));
    }

    /**
     * Get available lead time range
     * @returns {Array<number>} - Array of available lead times
     */
    getAvailableLeadTimes() {
        const leadTimes = [];
        for (let leadTime = this.MIN_LEAD_TIME; leadTime <= this.MAX_LEAD_TIME; leadTime++) {
            leadTimes.push(leadTime);
        }
        return leadTimes;
    }

    /**
     * Get validation summary for debugging
     * @returns {Object} - Summary of validation rules and ranges
     */
    getValidationSummary() {
        return {
            dateRange: {
                minYear: this.MIN_YEAR,
                maxYear: this.MAX_YEAR,
                minMonth: this.MIN_MONTH,
                maxMonth: this.MAX_MONTH
            },
            leadTimeRange: {
                min: this.MIN_LEAD_TIME,
                max: this.MAX_LEAD_TIME
            },
            pngAvailability: {
                startYear: this.PNG_START_YEAR,
                startMonth: this.PNG_START_MONTH
            },
            totalAvailableMonths: (this.MAX_YEAR - this.MIN_YEAR + 1) * 12
        };
    }
}