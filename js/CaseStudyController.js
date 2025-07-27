// Case Study Controller - Manages case study interface and interactions
// Updated to match modal layout and behavior exactly

import { CONFIG, SELECTORS, CSS_CLASSES, EVENTS, KEYS } from './constants.js';
import { Logger } from './Logger.js';
import { Utils } from './Utils.js';
import { CaseStudyDateUtils } from './CaseStudyDateUtils.js';

export class CaseStudyController {
    constructor() {
        // UI elements - year dropdown
        this.targetYearInput = null;
        this.targetYearDropdown = null;
        this.targetYearDropdownContent = null;
        
        // UI elements - month dropdown
        this.targetMonthInput = null;
        this.targetMonthDropdown = null;
        this.targetMonthDropdownContent = null;
        
        // UI elements - lead time dropdown
        this.leadTimeInput = null;
        this.leadTimeDropdown = null;
        this.leadTimeDropdownContent = null;
        this.loadButton = null;
        
        // Display elements
        this.loadingElement = null;
        this.errorElement = null;
        this.contentElement = null;
        this.mediaContainer = null;
        
        // Data and utilities
        this.dateUtils = new CaseStudyDateUtils();
        this.yearOptions = [];
        this.monthOptions = [];
        this.leadTimeOptions = [];
        this.selectedYear = null;
        this.selectedMonth = null;
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
        this.targetYearInput = document.querySelector(SELECTORS.CASE_STUDY_YEAR_INPUT);
        this.targetYearDropdown = document.querySelector(SELECTORS.CASE_STUDY_YEAR_DROPDOWN);
        this.targetYearDropdownContent = document.querySelector(SELECTORS.CASE_STUDY_YEAR_DROPDOWN_CONTENT);
        
        this.targetMonthInput = document.querySelector(SELECTORS.CASE_STUDY_MONTH_INPUT);
        this.targetMonthDropdown = document.querySelector(SELECTORS.CASE_STUDY_MONTH_DROPDOWN);
        this.targetMonthDropdownContent = document.querySelector(SELECTORS.CASE_STUDY_MONTH_DROPDOWN_CONTENT);
        
        this.leadTimeInput = document.querySelector(SELECTORS.CASE_STUDY_LEADTIME_INPUT);
        this.leadTimeDropdown = document.querySelector(SELECTORS.CASE_STUDY_LEADTIME_DROPDOWN);
        this.leadTimeDropdownContent = document.querySelector(SELECTORS.CASE_STUDY_LEADTIME_DROPDOWN_CONTENT);
        this.loadButton = document.querySelector(SELECTORS.CASE_STUDY_LOAD_BUTTON);
        
        this.loadingElement = document.querySelector(SELECTORS.CASE_STUDY_LOADING);
        this.errorElement = document.querySelector(SELECTORS.CASE_STUDY_ERROR);
        this.contentElement = document.querySelector(SELECTORS.CASE_STUDY_CONTENT);
        this.mediaContainer = document.querySelector(SELECTORS.CASE_STUDY_MEDIA_CONTAINER);
        
        if (!this.targetYearInput || !this.targetMonthInput || !this.leadTimeInput || !this.loadButton) {
            Logger.error('Required case study UI elements not found');
            return;
        }
        
        // Generate options
        this.yearOptions = this.generateYearOptions();
        this.monthOptions = this.generateMonthOptions();
        this.leadTimeOptions = this.generateLeadTimeOptions();
        
        // Setup event listeners
        this.setupEventListeners();
        
        Logger.debug(`CaseStudyController initialized with ${this.yearOptions.length} year, ${this.monthOptions.length} month, and ${this.leadTimeOptions.length} lead time options`);
    }

    generateYearOptions() {
        const options = [];
        const availableYears = this.dateUtils.getAvailableYears();
        
        for (const year of availableYears) {
            options.push({
                value: year,
                title: `${year}`,
                searchTerms: [`${year}`]
            });
        }
        
        return options;
    }

    generateMonthOptions() {
        const options = [];
        const monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        
        monthNames.forEach((name, index) => {
            options.push({
                value: index + 1,
                title: name,
                searchTerms: [name.toLowerCase(), `${index + 1}`, name.slice(0, 3).toLowerCase()]
            });
        });
        
        return options;
    }

    generateLeadTimeOptions() {
        const options = [];
        const availableLeadTimes = this.dateUtils.getAvailableLeadTimes();
        
        for (const leadTime of availableLeadTimes) {
            options.push({
                value: leadTime,
                title: `${leadTime} Month${leadTime > 1 ? 's' : ''}`,
                searchTerms: [`${leadTime} month`, `${leadTime} months`, `${leadTime}`],
                leadTime: leadTime
            });
        }
        
        return options;
    }

    setupEventListeners() {
        // Year input events
        this.targetYearInput.addEventListener(EVENTS.INPUT, (e) => this.handleYearSearch(e.target.value));
        this.targetYearInput.addEventListener(EVENTS.CLICK, (e) => {
            e.stopPropagation();
            this.showYearDropdown(this.yearOptions);
        });
        this.targetYearInput.addEventListener(EVENTS.KEYDOWN, (e) => this.handleYearKeyNavigation(e));
        
        // Month input events
        this.targetMonthInput.addEventListener(EVENTS.INPUT, (e) => this.handleMonthSearch(e.target.value));
        this.targetMonthInput.addEventListener(EVENTS.CLICK, (e) => {
            e.stopPropagation();
            this.showMonthDropdown(this.monthOptions);
        });
        this.targetMonthInput.addEventListener(EVENTS.KEYDOWN, (e) => this.handleMonthKeyNavigation(e));
        
        // Lead time input events
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
                this.hideAllDropdowns();
            }
        });
    }

    // Year dropdown methods
    handleYearSearch(query) {
        if (!query.trim()) {
            this.showYearDropdown(this.yearOptions);
            this.selectedYear = null;
            this.validateInputs();
            return;
        }

        const searchText = query.toLowerCase();
        const filtered = this.yearOptions.filter(option =>
            option.title.toLowerCase().includes(searchText) ||
            option.searchTerms.some(term => term.includes(searchText))
        );
        
        this.showYearDropdown(filtered);
    }

    showYearDropdown(options) {
        this.populateDropdown(this.targetYearDropdownContent, options, (option) => this.selectYearOption(option));
        this.targetYearDropdown.classList.add(CSS_CLASSES.SHOW);
        this.updateSearchContainerState(this.targetYearInput, true);
    }

    hideYearDropdown() {
        this.targetYearDropdown.classList.remove(CSS_CLASSES.SHOW);
        this.updateSearchContainerState(this.targetYearInput, false);
    }

    selectYearOption(option) {
        this.selectedYear = option;
        this.targetYearInput.value = option.title;
        this.validateInputs();
        this.hideYearDropdown();
        Logger.debug(`Selected year: ${option.title}`);
    }

    handleYearKeyNavigation(e) {
        this.handleKeyNavigation(e, this.targetYearDropdown, this.hideYearDropdown.bind(this), this.targetYearInput);
    }

    // Month dropdown methods
    handleMonthSearch(query) {
        if (!query.trim()) {
            this.showMonthDropdown(this.monthOptions);
            this.selectedMonth = null;
            this.validateInputs();
            return;
        }

        const searchText = query.toLowerCase();
        const filtered = this.monthOptions.filter(option =>
            option.title.toLowerCase().includes(searchText) ||
            option.searchTerms.some(term => term.includes(searchText))
        );
        
        this.showMonthDropdown(filtered);
    }

    showMonthDropdown(options) {
        this.populateDropdown(this.targetMonthDropdownContent, options, (option) => this.selectMonthOption(option));
        this.targetMonthDropdown.classList.add(CSS_CLASSES.SHOW);
        this.updateSearchContainerState(this.targetMonthInput, true);
    }

    hideMonthDropdown() {
        this.targetMonthDropdown.classList.remove(CSS_CLASSES.SHOW);
        this.updateSearchContainerState(this.targetMonthInput, false);
    }

    selectMonthOption(option) {
        this.selectedMonth = option;
        this.targetMonthInput.value = option.title;
        this.validateInputs();
        this.hideMonthDropdown();
        Logger.debug(`Selected month: ${option.title}`);
    }

    handleMonthKeyNavigation(e) {
        this.handleKeyNavigation(e, this.targetMonthDropdown, this.hideMonthDropdown.bind(this), this.targetMonthInput);
    }

    // Lead time dropdown methods
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

    showLeadTimeDropdown(options) {
        this.populateDropdown(this.leadTimeDropdownContent, options, (option) => this.selectLeadTimeOption(option));
        this.leadTimeDropdown.classList.add(CSS_CLASSES.SHOW);
        this.updateSearchContainerState(this.leadTimeInput, true);
    }

    hideLeadTimeDropdown() {
        this.leadTimeDropdown.classList.remove(CSS_CLASSES.SHOW);
        this.updateSearchContainerState(this.leadTimeInput, false);
    }

    selectLeadTimeOption(option) {
        this.selectedLeadTime = option;
        this.leadTimeInput.value = option.title;
        this.validateInputs();
        this.hideLeadTimeDropdown();
        Logger.debug(`Selected lead time: ${option.title}`);
    }

    handleLeadTimeKeyNavigation(e) {
        this.handleKeyNavigation(e, this.leadTimeDropdown, this.hideLeadTimeDropdown.bind(this), this.leadTimeInput);
    }

    // Shared dropdown utilities
    populateDropdown(container, options, selectCallback) {
        if (options.length === 0) return;

        container.innerHTML = '';
        
        options.forEach(option => {
            const item = document.createElement('div');
            item.className = CSS_CLASSES.DROPDOWN_ITEM;
            item.innerHTML = `<div class="${CSS_CLASSES.ITEM_TITLE}">${Utils.escapeHTML(option.title)}</div>`;
            item.addEventListener(EVENTS.CLICK, () => selectCallback(option));
            container.appendChild(item);
        });
    }

    handleKeyNavigation(e, dropdown, hideCallback, inputElement) {
        const items = dropdown.querySelectorAll(`.${CSS_CLASSES.DROPDOWN_ITEM}`);
        const currentSelected = dropdown.querySelector(`.${CSS_CLASSES.SELECTED}`);
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
                hideCallback();
                inputElement.blur();
                break;
        }
    }

    highlightItem(items, index) {
        items.forEach(item => item.classList.remove(CSS_CLASSES.SELECTED));
        if (items[index]) {
            items[index].classList.add(CSS_CLASSES.SELECTED);
            items[index].scrollIntoView({ block: 'nearest' });
        }
    }

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

    hideAllDropdowns() {
        this.hideYearDropdown();
        this.hideMonthDropdown();
        this.hideLeadTimeDropdown();
    }

    validateInputs() {
        this.updateLoadButton();
    }

    validateAllInputs() {
        const year = this.selectedYear ? this.selectedYear.value : null;
        const month = this.selectedMonth ? this.selectedMonth.value : null;
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

    buildCaseStudyData() {
        const validation = this.validateAllInputs();
        if (!validation.isValid) {
            return null;
        }
        
        return validation.data;
    }

    setOnCaseStudySelectedCallback(callback) {
        this.onCaseStudySelected = callback;
    }

    showLoading() {
        if (this.loadingElement) {
            this.loadingElement.style.display = 'block';
        }
        if (this.contentElement) {
            this.contentElement.style.display = 'none';
        }
        this.hideError();
    }

    hideLoading() {
        if (this.loadingElement) {
            this.loadingElement.style.display = 'none';
        }
    }

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

    hideError() {
        if (this.errorElement) {
            this.errorElement.style.display = 'none';
        }
    }

    /**
     * Display case study content using exact modal layout
     * @param {Object} caseStudyData - Case study data
     * @param {string} videoSrc - Video source URL
     * @param {string} imageSrc - Image source URL
     */
    displayCaseStudy(caseStudyData, videoSrc, imageSrc) {
        this.hideLoading();
        this.hideError();
        
        if (!this.mediaContainer) {
            Logger.error('Media container not found');
            return;
        }

        // Create content using exact modal structure and logic
        const isNarrowLayout = window.innerWidth < 900;
        const mediaFlexDirection = isNarrowLayout ? 'column' : 'row';
        const mediaGap = isNarrowLayout ? 10 : 20;

        // Calculate video sizing (same logic as modal)
        let videoContent = '';
        if (videoSrc) {
            const availableWidthPx = window.innerWidth * 0.8; // Approximate available width
            const minColWidthPx = CONFIG.MIN_COLUMN_WIDTH_REM * 16; // Convert rem to px
            const maxColWidthPx = CONFIG.MAX_COLUMN_WIDTH_REM * 16;
            
            const maxVideoHeightVh = CONFIG.MAX_VIDEO_HEIGHT_VH;
            const vhInPx = window.innerHeight * (maxVideoHeightVh / 100);
            let calculatedVideoWidth = vhInPx * CONFIG.VIDEO_ASPECT_RATIO;
            const actualVideoColumnWidthPx = Math.max(minColWidthPx, Math.min(calculatedVideoWidth, maxColWidthPx));
            
            // Let CSS handle sizing instead of JavaScript
            videoContent = `
                <div class="video-container">
                    <video controls autoplay loop muted playsinline preload="metadata" 
                           style="width: auto; height: auto; aspect-ratio: ${CONFIG.VIDEO_ASPECT_RATIO}; border-radius: 0.5rem; object-fit: contain;">
                        <source src="${videoSrc}" type="video/mp4">
                        <p>Your browser does not support the video tag. Video file: ${videoSrc}</p>
                    </video>
                </div>
            `;
        }

        // Image container (same logic as modal) - let CSS handle sizing
        const imageContainer = `
            <div id="case-study-image-container" class="image-container">
                <img id="case-study-image" style="border-radius: 0.5rem; object-fit: contain; display: block; margin: 0; padding: 0; border: none; width: auto; height: auto;" src="${imageSrc}" alt="Climate pattern for ${caseStudyData.initial.displayString}" />
            </div>
        `;

        // Set up the media container with exact modal behavior
        this.mediaContainer.style.display = 'flex';
        this.mediaContainer.style.flexDirection = mediaFlexDirection;
        this.mediaContainer.style.gap = `${mediaGap}px`;
        this.mediaContainer.style.alignItems = 'flex-start';
        this.mediaContainer.style.justifyContent = 'center';
        this.mediaContainer.innerHTML = videoContent + imageContainer;

        // Show content
        if (this.contentElement) {
            this.contentElement.style.display = 'block';
        }
        
        // Let CSS handle the sizing naturally - both video and image will respect max constraints
        
        this.currentCaseStudy = caseStudyData;
        Logger.info('Case study displayed successfully with modal-matching layout');
    }

    reset() {
        this.targetYearInput.value = '';
        this.targetMonthInput.value = '';
        this.leadTimeInput.value = '';
        this.selectedYear = null;
        this.selectedMonth = null;
        this.selectedLeadTime = null;
        this.currentCaseStudy = null;
        
        this.hideLoading();
        this.hideError();
        if (this.contentElement) {
            this.contentElement.style.display = 'none';
        }
        
        this.updateLoadButton();
        this.hideAllDropdowns();
        
        Logger.debug('CaseStudyController reset');
    }

    getCurrentCaseStudy() {
        return this.currentCaseStudy;
    }

    /**
     * Sync image size to match video size exactly (same as modal)
     */
    syncImageToVideoSize() {
        const video = this.mediaContainer?.querySelector('video');
        const image = this.mediaContainer?.querySelector('#case-study-image');
        
        if (!video || !image) {
            Logger.debug('[Case Study Sync] Video or image not found for size sync');
            return;
        }

        const videoRect = video.getBoundingClientRect();
        const isRowLayout = this.mediaContainer && this.mediaContainer.style.flexDirection === 'row';
        
        let finalVideoWidth = videoRect.width;
        let finalVideoHeight = videoRect.height;
        
        // Check for overflow in side-by-side layout (same logic as modal)
        if (isRowLayout) {
            // Calculate available content width
            const availableWidth = this.mediaContainer.offsetWidth;
            
            // Calculate required total width (video + image + gap)
            const gapPx = parseFloat(this.mediaContainer.style.gap) || 20;
            const requiredWidth = (videoRect.width * 2) + gapPx;
            
            // Apply scaling if content would overflow
            if (requiredWidth > availableWidth) {
                const scalingFactor = availableWidth / requiredWidth;
                finalVideoWidth = videoRect.width * scalingFactor;
                finalVideoHeight = videoRect.height * scalingFactor;
                
                Logger.debug(`[Case Study Sync] Scaling content by ${scalingFactor.toFixed(3)} (${requiredWidth}px → ${availableWidth}px)`);
                
                // Apply scaling to video as well
                video.style.width = `${finalVideoWidth}px`;
                video.style.height = `${finalVideoHeight}px`;
            }
        }
        
        Logger.debug(`[Case Study Sync] Setting image to match video: ${finalVideoWidth.toFixed(1)}px × ${finalVideoHeight.toFixed(1)}px`);
        
        // Apply exact video dimensions to image but respect CSS max constraints
        image.style.width = `${finalVideoWidth}px`;
        image.style.height = `${finalVideoHeight}px`;
        // Don't override CSS max-width and max-height constraints
        // image.style.maxWidth = 'none';
        // image.style.maxHeight = 'none';
        
        // Verify the sizes match
        setTimeout(() => {
            const finalVideoRect = video.getBoundingClientRect();
            const imageRect = image.getBoundingClientRect();
            Logger.debug(`[Case Study Sync] Video: ${finalVideoRect.width.toFixed(1)}x${finalVideoRect.height.toFixed(1)}, Image: ${imageRect.width.toFixed(1)}x${imageRect.height.toFixed(1)}`);
            
            if (Math.abs(finalVideoRect.width - imageRect.width) > 1 || Math.abs(finalVideoRect.height - imageRect.height) > 1) {
                Logger.warn(`[Case Study Sync] Video and image sizes don't match after sync!`);
            } else {
                Logger.debug(`[Case Study Sync] ✓ Video and image sizes match perfectly`);
            }
        }, 10);
    }

    getStats() {
        return {
            hasSelectedYear: !!this.selectedYear,
            hasSelectedMonth: !!this.selectedMonth,
            hasSelectedLeadTime: !!this.selectedLeadTime,
            hasCurrentCaseStudy: !!this.currentCaseStudy,
            isValid: this.validateAllInputs().isValid,
            dateUtilsSummary: this.dateUtils.getValidationSummary()
        };
    }
}