// Case Study Controller - Manages case study interface and interactions
// Follows existing UIController patterns for consistency

import { CONFIG, SELECTORS, CSS_CLASSES, EVENTS, KEYS } from './constants.js';
import { Logger } from './Logger.js';
import { Utils } from './Utils.js';
import { CaseStudyDateUtils } from './CaseStudyDateUtils.js';

export class CaseStudyController {
    constructor() {
        // UI elements
        this.targetYearInput = null;
        this.targetMonthSelect = null;
        this.leadTimeInput = null;
        this.leadTimeDropdown = null;
        this.leadTimeDropdownContent = null;
        this.loadButton = null;
        
        // Display elements
        this.loadingElement = null;
        this.errorElement = null;
        this.contentElement = null;
        this.videoElement = null;
        this.imageElement = null;
        
        // Info display elements
        this.displayTargetDate = null;
        this.displayLeadTime = null;
        this.displayInitialDate = null;
        
        // Data and utilities
        this.dateUtils = new CaseStudyDateUtils();
        this.leadTimeOptions = [];
        this.selectedLeadTime = null;
        this.currentCaseStudy = null;
        this.onCaseStudySelected = null; // Callback
        
        Logger.debug('CaseStudyController initialized');
    }

    /**
     * Initialize controller with DOM elements
     */
    initialize() {
        // Find UI elements
        this.targetYearInput = document.querySelector('#target-year');
        this.targetMonthSelect = document.querySelector('#target-month');
        this.leadTimeInput = document.querySelector('#case-study-leadtime');
        this.leadTimeDropdown = document.querySelector('#case-study-leadtime-dropdown');
        this.leadTimeDropdownContent = document.querySelector('#case-study-leadtime-dropdown-content');
        this.loadButton = document.querySelector('#case-study-load-btn');
        
        // Find display elements
        this.loadingElement = document.querySelector('#case-study-loading');
        this.errorElement = document.querySelector('#case-study-error');
        this.contentElement = document.querySelector('#case-study-content');
        this.videoElement = document.querySelector('#case-study-video');
        this.imageElement = document.querySelector('#case-study-image');
        
        // Find info display elements
        this.displayTargetDate = document.querySelector('#display-target-date');
        this.displayLeadTime = document.querySelector('#display-lead-time');
        this.displayInitialDate = document.querySelector('#display-initial-date');
        
        if (!this.targetYearInput || !this.targetMonthSelect || !this.leadTimeInput || !this.loadButton) {
            Logger.error('Required case study UI elements not found');
            return;
        }
        
        // Generate lead time options (reuse from existing pattern)
        this.leadTimeOptions = this.generateLeadTimeOptions();
        
        // Setup event listeners
        this.setupEventListeners();
        
        Logger.debug(`CaseStudyController initialized with ${this.leadTimeOptions.length} lead time options`);
    }

    /**
     * Generate lead time options (following UIController pattern)
     * @returns {Array} - Array of lead time option objects
     */
    generateLeadTimeOptions() {
        const options = [];
        const availableLeadTimes = this.dateUtils.getAvailableLeadTimes();
        
        for (const leadTime of availableLeadTimes) {
            options.push({
                value: leadTime,
                title: `${leadTime} Month${leadTime > 1 ? 's' : ''}`,
                subtitle: `${leadTime}-month lead time`,
                searchTerms: [`${leadTime} month`, `${leadTime} months`, `${leadTime}`],
                leadTime: leadTime
            });
        }
        
        return options;
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Target year input events
        this.targetYearInput.addEventListener(EVENTS.INPUT, () => this.validateInputs());
        this.targetYearInput.addEventListener('blur', () => this.validateInputs());
        
        // Target month select events
        this.targetMonthSelect.addEventListener('change', () => this.validateInputs());
        
        // Lead time input events (following UIController pattern)
        this.leadTimeInput.addEventListener(EVENTS.INPUT, (e) => this.handleLeadTimeSearch(e.target.value));
        this.leadTimeInput.addEventListener(EVENTS.CLICK, (e) => {
            e.stopPropagation();
            this.showLeadTimeDropdown(this.leadTimeOptions);
        });
        this.leadTimeInput.addEventListener(EVENTS.KEYDOWN, (e) => this.handleLeadTimeKeyNavigation(e));
        
        // Load button event
        this.loadButton.addEventListener(EVENTS.CLICK, () => {
            if (this.validateAllInputs().isValid && this.onCaseStudySelected) {
                const caseStudyData = this.buildCaseStudyData();
                this.onCaseStudySelected(caseStudyData);
            }
        });
        
        // Global click to close dropdowns
        document.addEventListener(EVENTS.CLICK, (e) => {
            if (!e.target.closest('.search-container')) {
                this.hideLeadTimeDropdown();
            }
        });
    }

    /**
     * Handle lead time search input
     * @param {string} query - Search query
     */
    handleLeadTimeSearch(query) {
        if (!query.trim()) {
            this.showLeadTimeDropdown(this.leadTimeOptions);
            this.selectedLeadTime = null;
            this.validateInputs();
            return;
        }

        const searchText = query.toLowerCase();
        const filtered = this.leadTimeOptions.filter(option =>
            option.title.toLowerCase().includes(searchText) ||
            option.searchTerms.some(term => term.includes(searchText))
        );
        
        this.showLeadTimeDropdown(filtered);
    }

    /**
     * Show lead time dropdown
     * @param {Array} options - Options to display
     */
    showLeadTimeDropdown(options) {
        if (options.length === 0) {
            this.hideLeadTimeDropdown();
            return;
        }

        this.leadTimeDropdownContent.innerHTML = '';
        
        options.forEach(option => {
            const item = document.createElement('div');
            item.className = CSS_CLASSES.DROPDOWN_ITEM;
            
            item.innerHTML = `
                <div class="${CSS_CLASSES.ITEM_TITLE}">${Utils.escapeHTML(option.title)}</div>
            `;
            
            item.addEventListener(EVENTS.CLICK, () => this.selectLeadTimeOption(option));
            this.leadTimeDropdownContent.appendChild(item);
        });

        this.leadTimeDropdown.classList.add(CSS_CLASSES.SHOW);
        this.updateSearchContainerState(this.leadTimeInput, true);
    }

    /**
     * Hide lead time dropdown
     */
    hideLeadTimeDropdown() {
        this.leadTimeDropdown.classList.remove(CSS_CLASSES.SHOW);
        this.updateSearchContainerState(this.leadTimeInput, false);
    }

    /**
     * Update search container visual state
     * @param {HTMLElement} inputElement - Input element
     * @param {boolean} isOpen - Whether dropdown is open
     */
    updateSearchContainerState(inputElement, isOpen) {
        const searchContainer = inputElement.closest('.search-container');
        if (searchContainer) {
            if (isOpen) {
                searchContainer.classList.add(CSS_CLASSES.OPEN);
            } else {
                searchContainer.classList.remove(CSS_CLASSES.OPEN);
            }
        }
    }

    /**
     * Select lead time option
     * @param {Object} option - Selected option
     */
    selectLeadTimeOption(option) {
        this.selectedLeadTime = option;
        this.leadTimeInput.value = option.title;
        this.validateInputs();
        this.hideLeadTimeDropdown();
        
        Logger.debug(`Selected lead time option: ${option.title} (${option.value} months)`);
    }

    /**
     * Handle keyboard navigation in lead time dropdown
     * @param {KeyboardEvent} e - Keyboard event
     */
    handleLeadTimeKeyNavigation(e) {
        const items = this.leadTimeDropdown.querySelectorAll(`.${CSS_CLASSES.DROPDOWN_ITEM}`);
        const currentSelected = this.leadTimeDropdown.querySelector(`.${CSS_CLASSES.SELECTED}`);
        let selectedIndex = -1;

        if (currentSelected) {
            selectedIndex = Array.from(items).indexOf(currentSelected);
        }

        switch (e.key) {
            case KEYS.ARROW_DOWN:
                e.preventDefault();
                selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
                this.highlightItem(items, selectedIndex);
                break;
                
            case KEYS.ARROW_UP:
                e.preventDefault();
                selectedIndex = Math.max(selectedIndex - 1, 0);
                this.highlightItem(items, selectedIndex);
                break;
                
            case KEYS.ENTER:
                e.preventDefault();
                if (currentSelected) {
                    currentSelected.click();
                }
                break;
                
            case KEYS.ESCAPE:
                this.hideLeadTimeDropdown();
                this.leadTimeInput.blur();
                break;
        }
    }

    /**
     * Highlight dropdown item
     * @param {NodeList} items - Dropdown items
     * @param {number} index - Index to highlight
     */
    highlightItem(items, index) {
        items.forEach(item => item.classList.remove(CSS_CLASSES.SELECTED));
        if (items[index]) {
            items[index].classList.add(CSS_CLASSES.SELECTED);
            items[index].scrollIntoView({ block: 'nearest' });
        }
    }

    /**
     * Validate individual inputs and update UI
     */
    validateInputs() {
        this.updateLoadButton();
    }

    /**
     * Validate all inputs comprehensively
     * @returns {Object} - Validation result
     */
    validateAllInputs() {
        const year = parseInt(this.targetYearInput.value);
        const month = parseInt(this.targetMonthSelect.value);
        const leadTime = this.selectedLeadTime ? this.selectedLeadTime.value : null;
        
        if (!year || !month || !leadTime) {
            return {
                isValid: false,
                error: 'Please select target year, month, and lead time',
                data: null
            };
        }
        
        return this.dateUtils.validateCaseStudyParameters(year, month, leadTime);
    }

    /**
     * Update load button state
     */
    updateLoadButton() {
        if (this.loadButton) {
            const validation = this.validateAllInputs();
            this.loadButton.disabled = !validation.isValid;
            
            if (!validation.isValid && validation.error) {
                this.loadButton.title = validation.error;
            } else {
                this.loadButton.title = 'Load case study';
            }
        }
    }

    /**
     * Build case study data object for loading
     * @returns {Object} - Case study data
     */
    buildCaseStudyData() {
        const validation = this.validateAllInputs();
        if (!validation.isValid) {
            return null;
        }
        
        return validation.data;
    }

    /**
     * Set callback for case study selection
     * @param {Function} callback - Callback function
     */
    setOnCaseStudySelectedCallback(callback) {
        this.onCaseStudySelected = callback;
    }

    /**
     * Show loading state
     */
    showLoading() {
        if (this.loadingElement) {
            this.loadingElement.style.display = 'block';
        }
        if (this.contentElement) {
            this.contentElement.style.display = 'none';
        }
        this.hideError();
    }

    /**
     * Hide loading state
     */
    hideLoading() {
        if (this.loadingElement) {
            this.loadingElement.style.display = 'none';
        }
    }

    /**
     * Show error message
     * @param {string} message - Error message
     */
    showError(message) {
        if (this.errorElement) {
            this.errorElement.innerHTML = Utils.escapeHTML(message);
            this.errorElement.style.display = 'block';
        }
        if (this.contentElement) {
            this.contentElement.style.display = 'none';
        }
        Logger.error('Case Study Error:', message);
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
     * Display case study content
     * @param {Object} caseStudyData - Case study data
     * @param {string} videoSrc - Video source URL
     * @param {string} imageSrc - Image source URL
     */
    displayCaseStudy(caseStudyData, videoSrc, imageSrc) {
        this.hideLoading();
        this.hideError();
        
        // Update info display
        if (this.displayTargetDate) {
            this.displayTargetDate.textContent = caseStudyData.target.displayString;
        }
        if (this.displayLeadTime) {
            this.displayLeadTime.textContent = `${caseStudyData.leadTime} month${caseStudyData.leadTime > 1 ? 's' : ''}`;
        }
        if (this.displayInitialDate) {
            this.displayInitialDate.textContent = caseStudyData.initial.displayString;
        }
        
        // Set video source
        if (this.videoElement) {
            this.videoElement.src = videoSrc;
            this.videoElement.load(); // Reload video element
        }
        
        // Set image source
        if (this.imageElement) {
            this.imageElement.src = imageSrc;
            this.imageElement.alt = `Climate pattern for ${caseStudyData.initial.displayString}`;
        }
        
        // Show content
        if (this.contentElement) {
            this.contentElement.style.display = 'block';
        }
        
        this.currentCaseStudy = caseStudyData;
        Logger.info('Case study displayed successfully');
    }

    /**
     * Reset controller state
     */
    reset() {
        this.targetYearInput.value = '2024';
        this.targetMonthSelect.value = '';
        this.leadTimeInput.value = '';
        this.selectedLeadTime = null;
        this.currentCaseStudy = null;
        
        this.hideLoading();
        this.hideError();
        if (this.contentElement) {
            this.contentElement.style.display = 'none';
        }
        
        this.updateLoadButton();
        this.hideLeadTimeDropdown();
        
        Logger.debug('CaseStudyController reset');
    }

    /**
     * Get current case study data
     * @returns {Object|null} - Current case study data or null
     */
    getCurrentCaseStudy() {
        return this.currentCaseStudy;
    }

    /**
     * Get controller statistics for debugging
     * @returns {Object} - Controller statistics
     */
    getStats() {
        return {
            hasSelectedLeadTime: !!this.selectedLeadTime,
            hasCurrentCaseStudy: !!this.currentCaseStudy,
            leadTimeOptionsCount: this.leadTimeOptions.length,
            isValid: this.validateAllInputs().isValid,
            dateUtilsSummary: this.dateUtils.getValidationSummary()
        };
    }
}