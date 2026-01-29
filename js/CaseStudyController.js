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
        this.loadButton = null;
        this.syncButton = null;
        this.detrendToggle = null;
        this.controlsElement = null;
        
        // Display elements
        this.loadingElement = null;
        this.errorElement = null;
        this.contentElement = null;
        this.mediaContainer = null;
        
        // Data and utilities
        this.dateUtils = new CaseStudyDateUtils();
        this.yearOptions = [];
        this.monthOptions = [];
        this.selectedYear = null;
        this.selectedMonth = null;
        this.currentCaseStudy = null;
        this.useDetrendedGroundTruth = true;
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
        
        this.loadButton = document.querySelector(SELECTORS.CASE_STUDY_LOAD_BUTTON);
        this.syncButton = document.querySelector(SELECTORS.CASE_STUDY_SYNC_BUTTON);
        this.detrendToggle = document.querySelector(SELECTORS.CASE_STUDY_DETREND_TOGGLE);
        this.controlsElement = document.querySelector(SELECTORS.CASE_STUDY_CONTROLS);
        
        this.loadingElement = document.querySelector(SELECTORS.CASE_STUDY_LOADING);
        this.errorElement = document.querySelector(SELECTORS.CASE_STUDY_ERROR);
        this.contentElement = document.querySelector(SELECTORS.CASE_STUDY_CONTENT);
        this.mediaContainer = document.querySelector(SELECTORS.CASE_STUDY_MEDIA_CONTAINER);
        
        if (!this.targetYearInput || !this.targetMonthInput || !this.loadButton) {
            Logger.error('Required case study UI elements not found');
            return;
        }
        
        // Generate options
        this.yearOptions = this.generateYearOptions();
        this.monthOptions = this.generateMonthOptions();
        
        // Setup event listeners
        this.setupEventListeners();
        
        Logger.debug(`CaseStudyController initialized with ${this.yearOptions.length} year and ${this.monthOptions.length} month options`);
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
        
        // Load button event
        this.loadButton.addEventListener(EVENTS.CLICK, () => {
            if (this.validateAllInputs().isValid && this.onCaseStudySelected) {
                const caseStudyData = this.buildCaseStudyData();
                this.onCaseStudySelected(caseStudyData);
            }
        });

        if (this.syncButton) {
            this.syncButton.addEventListener(EVENTS.CLICK, () => {
                this.syncGroundTruthToCaseStudy({ alignTime: true, respectPlayState: true });
            });
        }

        if (this.detrendToggle) {
            this.detrendToggle.addEventListener(EVENTS.CHANGE, () => {
                this.useDetrendedGroundTruth = this.detrendToggle.checked;
                this.swapGroundTruthVideo();
            });
        }
        
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
    }

    validateInputs() {
        this.updateLoadButton();
    }

    validateAllInputs() {
        const year = this.selectedYear ? this.selectedYear.value : null;
        const month = this.selectedMonth ? this.selectedMonth.value : null;

        if (!year || !month) {
            return {
                isValid: false,
                error: 'Please select target year and month',
                data: null
            };
        }
        
        return this.dateUtils.validateCaseStudyParameters(year, month);
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
     */
    displayCaseStudy(caseStudyData) {
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

        // Build identical video containers for case study and ground truth
        const caseStudyVideoSrc = caseStudyData.filePaths.caseStudyVideo;
        const groundTruthVideoSrc = this.useDetrendedGroundTruth
            ? caseStudyData.filePaths.groundTruthVideoDetrended
            : caseStudyData.filePaths.groundTruthVideo;
        const caseStudyContent = this.buildVideoMarkup('case-study-video', caseStudyVideoSrc, true);
        const groundTruthContent = this.buildVideoMarkup('case-study-ground-truth-video', groundTruthVideoSrc, false);

        // Set up the media container with exact modal behavior
        this.mediaContainer.style.display = 'flex';
        this.mediaContainer.style.flexDirection = mediaFlexDirection;
        this.mediaContainer.style.gap = `${mediaGap}px`;
        this.mediaContainer.style.alignItems = 'flex-start';
        this.mediaContainer.style.justifyContent = 'center';
        this.mediaContainer.innerHTML = caseStudyContent + groundTruthContent;

        const { caseStudyVideo, groundTruthVideo } = this.getCaseStudyVideos();
        if (caseStudyVideo) {
            caseStudyVideo.load();
        }
        if (groundTruthVideo) {
            groundTruthVideo.load();
        }

        if (this.controlsElement) {
            this.controlsElement.style.display = 'flex';
        }
        if (this.detrendToggle) {
            this.detrendToggle.checked = this.useDetrendedGroundTruth;
        }

        // Show content
        if (this.contentElement) {
            this.contentElement.style.display = 'block';
        }
        
        // Let CSS handle the sizing naturally - both video and image will respect max constraints

        this.currentCaseStudy = caseStudyData;
        this.setupCaseStudyVideoSync();
        Logger.info('Case study displayed successfully with modal-matching layout');
    }

    buildVideoMarkup(videoId, videoSrc, autoplay) {
        if (!videoSrc) {
            return '';
        }
        const autoplayAttribute = autoplay ? 'autoplay' : '';
        return `
            <div class="video-container">
                <video id="${videoId}" controls loop muted playsinline preload="auto" ${autoplayAttribute}
                       style="width: auto; height: auto; aspect-ratio: ${CONFIG.VIDEO_ASPECT_RATIO}; border-radius: 0.5rem; object-fit: contain;">
                    <source src="${videoSrc}" type="video/mp4">
                    <p>Your browser does not support the video tag. Video file: ${videoSrc}</p>
                </video>
            </div>
        `;
    }

    getCaseStudyVideos() {
        if (!this.mediaContainer) {
            return { caseStudyVideo: null, groundTruthVideo: null };
        }
        return {
            caseStudyVideo: this.mediaContainer.querySelector('#case-study-video'),
            groundTruthVideo: this.mediaContainer.querySelector('#case-study-ground-truth-video')
        };
    }

    setupCaseStudyVideoSync() {
        const { caseStudyVideo, groundTruthVideo } = this.getCaseStudyVideos();
        if (!caseStudyVideo || !groundTruthVideo) {
            Logger.warn('[Case Study Sync] Videos not found for sync setup');
            return;
        }

        const syncWhenReady = () => {
            if (caseStudyVideo.readyState >= 1 && groundTruthVideo.readyState >= 1) {
                this.syncGroundTruthToCaseStudy({ alignTime: true, respectPlayState: true });
            }
        };

        caseStudyVideo.addEventListener('loadedmetadata', syncWhenReady);
        groundTruthVideo.addEventListener('loadedmetadata', syncWhenReady);

        caseStudyVideo.addEventListener('play', () => {
            this.syncGroundTruthToCaseStudy({ alignTime: true, respectPlayState: true });
        });

        caseStudyVideo.addEventListener('pause', () => {
            this.syncGroundTruthToCaseStudy({ alignTime: true, respectPlayState: true });
        });

        caseStudyVideo.addEventListener('seeked', () => {
            this.syncGroundTruthToCaseStudy({ alignTime: true, respectPlayState: true });
        });

        caseStudyVideo.addEventListener('ratechange', () => {
            this.syncGroundTruthToCaseStudy({ alignTime: false, respectPlayState: false });
        });
    }

    syncGroundTruthToCaseStudy({ alignTime = true, respectPlayState = true } = {}) {
        const { caseStudyVideo, groundTruthVideo } = this.getCaseStudyVideos();
        if (!caseStudyVideo || !groundTruthVideo) {
            Logger.debug('[Case Study Sync] Videos not found for sync');
            return;
        }

        if (alignTime && Number.isFinite(caseStudyVideo.currentTime)) {
            groundTruthVideo.currentTime = caseStudyVideo.currentTime;
        }

        groundTruthVideo.playbackRate = caseStudyVideo.playbackRate || 1;

        if (respectPlayState) {
            if (caseStudyVideo.paused) {
                groundTruthVideo.pause();
            } else {
                const playPromise = groundTruthVideo.play();
                if (playPromise && typeof playPromise.catch === 'function') {
                    playPromise.catch(() => {});
                }
            }
        }
    }

    swapGroundTruthVideo() {
        if (!this.currentCaseStudy) {
            return;
        }

        const { caseStudyVideo, groundTruthVideo } = this.getCaseStudyVideos();
        if (!groundTruthVideo) {
            return;
        }

        const targetSrc = this.useDetrendedGroundTruth
            ? this.currentCaseStudy.filePaths.groundTruthVideoDetrended
            : this.currentCaseStudy.filePaths.groundTruthVideo;

        if (groundTruthVideo.src && groundTruthVideo.src.includes(targetSrc)) {
            return;
        }

        const fallbackTime = caseStudyVideo ? caseStudyVideo.currentTime : 0;
        const preservedTime = Number.isFinite(groundTruthVideo.currentTime)
            ? groundTruthVideo.currentTime
            : fallbackTime;
        const shouldPlay = caseStudyVideo ? !caseStudyVideo.paused : false;
        const playbackRate = caseStudyVideo ? caseStudyVideo.playbackRate || 1 : 1;

        groundTruthVideo.pause();
        groundTruthVideo.src = targetSrc;
        groundTruthVideo.load();

        const handleLoaded = () => {
            groundTruthVideo.currentTime = preservedTime;
            groundTruthVideo.playbackRate = playbackRate;
            if (shouldPlay) {
                const playPromise = groundTruthVideo.play();
                if (playPromise && typeof playPromise.catch === 'function') {
                    playPromise.catch(() => {});
                }
            }
            groundTruthVideo.removeEventListener('loadedmetadata', handleLoaded);
        };

        groundTruthVideo.addEventListener('loadedmetadata', handleLoaded);
    }

    reset() {
        this.targetYearInput.value = '';
        this.targetMonthInput.value = '';
        this.selectedYear = null;
        this.selectedMonth = null;
        this.currentCaseStudy = null;
        
        this.hideLoading();
        this.hideError();
        if (this.contentElement) {
            this.contentElement.style.display = 'none';
        }

        if (this.controlsElement) {
            this.controlsElement.style.display = 'none';
        }

        this.updateLoadButton();
        this.hideAllDropdowns();
        
        Logger.debug('CaseStudyController reset');
    }

    getCurrentCaseStudy() {
        return this.currentCaseStudy;
    }


    getStats() {
        return {
            hasSelectedYear: !!this.selectedYear,
            hasSelectedMonth: !!this.selectedMonth,
            hasCurrentCaseStudy: !!this.currentCaseStudy,
            isValid: this.validateAllInputs().isValid,
            dateUtilsSummary: this.dateUtils.getValidationSummary()
        };
    }
}
