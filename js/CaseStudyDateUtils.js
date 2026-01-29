// Case Study Date Utilities - Date calculation and validation for case studies
// Handles target date validation and file path generation

export class CaseStudyDateUtils {
    constructor() {
        // Date range constants
        this.MIN_YEAR = 2002;
        this.MAX_YEAR = 2024;
        this.MIN_MONTH = 1;
        this.MAX_MONTH = 12;
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
     * Generate case study video filename for target date
     * @param {number} targetYear - Target year
     * @param {number} targetMonth - Target month
     * @returns {string} - Video filename path
     */
    generateCaseStudyVideoFilename(targetYear, targetMonth) {
        const dateString = this.formatDateString(targetYear, targetMonth);
        return `mp4_files/case_study_${dateString}.mp4`;
    }

    /**
     * Generate ground truth video filename for target date
     * @param {number} targetYear - Target year
     * @param {number} targetMonth - Target month
     * @param {boolean} isDetrended - Whether to use detrended version
     * @returns {string} - Video filename path
     */
    generateGroundTruthVideoFilename(targetYear, targetMonth, isDetrended) {
        const dateString = this.formatDateString(targetYear, targetMonth);
        const suffix = isDetrended ? '-detrended' : '';
        return `mp4_files/ground_truth_${dateString}${suffix}.mp4`;
    }

    /**
     * Validate complete case study parameters
     * @param {number} targetYear - Target year
     * @param {number} targetMonth - Target month
     * @returns {Object} - Complete validation result with file paths
     */
    validateCaseStudyParameters(targetYear, targetMonth) {
        // Validate target date
        const targetValidation = this.validateTargetDate(targetYear, targetMonth);
        if (!targetValidation.isValid) {
            return {
                isValid: false,
                error: targetValidation.error,
                data: null
            };
        }

        // Generate file paths
        const caseStudyVideo = this.generateCaseStudyVideoFilename(targetYear, targetMonth);
        const groundTruthVideo = this.generateGroundTruthVideoFilename(targetYear, targetMonth, false);
        const groundTruthVideoDetrended = this.generateGroundTruthVideoFilename(targetYear, targetMonth, true);

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
                filePaths: {
                    caseStudyVideo: caseStudyVideo,
                    groundTruthVideo: groundTruthVideo,
                    groundTruthVideoDetrended: groundTruthVideoDetrended
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
            totalAvailableMonths: (this.MAX_YEAR - this.MIN_YEAR + 1) * 12
        };
    }
}
