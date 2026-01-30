// Precursor Plots Controller - Manages precursor plot interface and interactions

import { CONFIG, SELECTORS, CSS_CLASSES, EVENTS, KEYS } from './constants.js';
import { Logger } from './Logger.js';
import { Utils } from './Utils.js';

export class PrecursorPlotsController {
    constructor() {
        // UI elements - dropdowns
        this.seasonInput = null;
        this.seasonDropdown = null;
        this.seasonDropdownContent = null;
        this.classInput = null;
        this.classDropdown = null;
        this.classDropdownContent = null;
        this.typeToggle = null;
        this.loadButton = null;
        this.syncButton = null;
        this.controlsElement = null;

        // Display elements
        this.loadingElement = null;
        this.errorElement = null;
        this.contentElement = null;
        this.mediaContainer = null;

        // Data and state
        this.seasonOptions = [];
        this.classOptions = [];
        this.selectedSeason = null;
        this.selectedClass = null;
        this.selectedType = 'importance';
        this.currentSelection = null;
        this.onPrecursorSelected = null; // Callback

        Logger.debug('PrecursorPlotsController initialized');
    }

    /**
     * Initialize controller with DOM elements
     */
    initialize() {
        this.seasonInput = document.querySelector(SELECTORS.PRECURSOR_SEASON_INPUT);
        this.seasonDropdown = document.querySelector(SELECTORS.PRECURSOR_SEASON_DROPDOWN);
        this.seasonDropdownContent = document.querySelector(SELECTORS.PRECURSOR_SEASON_DROPDOWN_CONTENT);

        this.classInput = document.querySelector(SELECTORS.PRECURSOR_CLASS_INPUT);
        this.classDropdown = document.querySelector(SELECTORS.PRECURSOR_CLASS_DROPDOWN);
        this.classDropdownContent = document.querySelector(SELECTORS.PRECURSOR_CLASS_DROPDOWN_CONTENT);

        this.typeToggle = document.querySelector(SELECTORS.PRECURSOR_TYPE_TOGGLE);
        this.loadButton = document.querySelector(SELECTORS.PRECURSOR_LOAD_BUTTON);
        this.syncButton = document.querySelector(SELECTORS.PRECURSOR_SYNC_BUTTON);
        this.controlsElement = document.querySelector(SELECTORS.PRECURSOR_CONTROLS);

        this.loadingElement = document.querySelector(SELECTORS.PRECURSOR_LOADING);
        this.errorElement = document.querySelector(SELECTORS.PRECURSOR_ERROR);
        this.contentElement = document.querySelector(SELECTORS.PRECURSOR_CONTENT);
        this.mediaContainer = document.querySelector(SELECTORS.PRECURSOR_MEDIA_CONTAINER);

        if (!this.seasonInput || !this.classInput || !this.typeToggle || !this.loadButton) {
            Logger.error('Required precursor UI elements not found');
            return;
        }

        this.seasonOptions = this.generateSeasonOptions();
        this.classOptions = this.generateClassOptions();
        this.selectedType = this.typeToggle.checked ? 'correlation' : 'importance';

        this.setupEventListeners();
        this.updateLoadButton();

        Logger.debug(`PrecursorPlotsController initialized with ${this.seasonOptions.length} season and ${this.classOptions.length} class options`);
    }

    generateSeasonOptions() {
        const options = [];
        options.push({
            value: 'all',
            title: 'All',
            searchTerms: ['all']
        });

        const seasons = [
            { value: 'DJF', title: 'DJF (Dec-Jan-Feb)' },
            { value: 'JFM', title: 'JFM (Jan-Feb-Mar)' },
            { value: 'FMA', title: 'FMA (Feb-Mar-Apr)' },
            { value: 'MAM', title: 'MAM (Mar-Apr-May)' },
            { value: 'AMJ', title: 'AMJ (Apr-May-Jun)' },
            { value: 'MJJ', title: 'MJJ (May-Jun-Jul)' },
            { value: 'JJA', title: 'JJA (Jun-Jul-Aug)' },
            { value: 'JAS', title: 'JAS (Jul-Aug-Sep)' },
            { value: 'ASO', title: 'ASO (Aug-Sep-Oct)' },
            { value: 'SON', title: 'SON (Sep-Oct-Nov)' },
            { value: 'OND', title: 'OND (Oct-Nov-Dec)' },
            { value: 'NDJ', title: 'NDJ (Nov-Dec-Jan)' }
        ];

        seasons.forEach(season => {
            options.push({
                value: season.value,
                title: season.title,
                searchTerms: [season.value.toLowerCase(), season.title.toLowerCase()]
            });
        });

        return options;
    }

    generateClassOptions() {
        return [
            { value: 'all', title: 'All', searchTerms: ['all'] },
            { value: 'LaNina', title: 'La Nina', searchTerms: ['la nina', 'lanina', 'la-nina'] },
            { value: 'neutral', title: 'Neutral', searchTerms: ['neutral'] },
            { value: 'ElNino', title: 'El Nino', searchTerms: ['el nino', 'elnino', 'el-nino'] }
        ];
    }

    setupEventListeners() {
        this.seasonInput.addEventListener(EVENTS.INPUT, (e) => this.handleSeasonSearch(e.target.value));
        this.seasonInput.addEventListener(EVENTS.CLICK, (e) => {
            e.stopPropagation();
            this.showSeasonDropdown(this.seasonOptions);
        });
        this.seasonInput.addEventListener(EVENTS.KEYDOWN, (e) => this.handleSeasonKeyNavigation(e));

        this.classInput.addEventListener(EVENTS.INPUT, (e) => this.handleClassSearch(e.target.value));
        this.classInput.addEventListener(EVENTS.CLICK, (e) => {
            e.stopPropagation();
            this.showClassDropdown(this.classOptions);
        });
        this.classInput.addEventListener(EVENTS.KEYDOWN, (e) => this.handleClassKeyNavigation(e));

        this.typeToggle.addEventListener(EVENTS.CHANGE, () => {
            this.selectedType = this.typeToggle.checked ? 'correlation' : 'importance';
            this.updateLoadButton();
            if (this.currentSelection && this.onPrecursorSelected) {
                const selection = this.buildSelectionData();
                this.onPrecursorSelected(selection);
            }
        });

        this.loadButton.addEventListener(EVENTS.CLICK, () => {
            if (this.validateAllInputs().isValid && this.onPrecursorSelected) {
                const selection = this.buildSelectionData();
                this.onPrecursorSelected(selection);
            }
        });

        if (this.syncButton) {
            this.syncButton.addEventListener(EVENTS.CLICK, () => {
                this.syncCompositeToPrecursor({ alignTime: true, respectPlayState: true });
            });
        }

        document.addEventListener(EVENTS.CLICK, (e) => {
            if (!e.target.closest('.search-container')) {
                this.hideAllDropdowns();
            }
        });
    }

    handleSeasonSearch(query) {
        if (!query.trim()) {
            this.showSeasonDropdown(this.seasonOptions);
            this.selectedSeason = null;
            this.validateInputs();
            return;
        }

        const searchText = query.toLowerCase();
        const filtered = this.seasonOptions.filter(option =>
            option.title.toLowerCase().includes(searchText) ||
            option.searchTerms.some(term => term.includes(searchText))
        );

        this.showSeasonDropdown(filtered);
    }

    showSeasonDropdown(options) {
        this.populateDropdown(this.seasonDropdownContent, options, (option) => this.selectSeasonOption(option));
        this.seasonDropdown.classList.add(CSS_CLASSES.SHOW);
        this.updateSearchContainerState(this.seasonInput, true);
    }

    hideSeasonDropdown() {
        this.seasonDropdown.classList.remove(CSS_CLASSES.SHOW);
        this.updateSearchContainerState(this.seasonInput, false);
    }

    selectSeasonOption(option) {
        this.selectedSeason = option;
        this.seasonInput.value = option.title;
        this.validateInputs();
        this.hideSeasonDropdown();
    }

    handleSeasonKeyNavigation(e) {
        this.handleKeyNavigation(e, this.seasonDropdown, this.hideSeasonDropdown.bind(this), this.seasonInput);
    }

    handleClassSearch(query) {
        if (!query.trim()) {
            this.showClassDropdown(this.classOptions);
            this.selectedClass = null;
            this.validateInputs();
            return;
        }

        const searchText = query.toLowerCase();
        const filtered = this.classOptions.filter(option =>
            option.title.toLowerCase().includes(searchText) ||
            option.searchTerms.some(term => term.includes(searchText))
        );

        this.showClassDropdown(filtered);
    }

    showClassDropdown(options) {
        this.populateDropdown(this.classDropdownContent, options, (option) => this.selectClassOption(option));
        this.classDropdown.classList.add(CSS_CLASSES.SHOW);
        this.updateSearchContainerState(this.classInput, true);
    }

    hideClassDropdown() {
        this.classDropdown.classList.remove(CSS_CLASSES.SHOW);
        this.updateSearchContainerState(this.classInput, false);
    }

    selectClassOption(option) {
        this.selectedClass = option;
        this.classInput.value = option.title;
        this.validateInputs();
        this.hideClassDropdown();
    }

    handleClassKeyNavigation(e) {
        this.handleKeyNavigation(e, this.classDropdown, this.hideClassDropdown.bind(this), this.classInput);
    }

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
        this.hideSeasonDropdown();
        this.hideClassDropdown();
    }

    validateInputs() {
        this.updateLoadButton();
    }

    validateAllInputs() {
        const season = this.selectedSeason ? this.selectedSeason.value : null;
        const targetClass = this.selectedClass ? this.selectedClass.value : null;

        if (!season || !targetClass) {
            return {
                isValid: false,
                error: 'Please select target season and class',
                data: null
            };
        }

        return {
            isValid: true,
            error: null,
            data: this.buildSelectionData()
        };
    }

    updateLoadButton() {
        if (this.loadButton) {
            const validation = this.validateAllInputs();
            this.loadButton.disabled = !validation.isValid;
            this.loadButton.title = validation.isValid ? 'Load precursor plots' : (validation.error || 'Please complete selections');
        }
    }

    buildSelectionData() {
        const season = this.selectedSeason ? this.selectedSeason.value : null;
        const targetClass = this.selectedClass ? this.selectedClass.value : null;
        const type = this.selectedType;

        if (!season || !targetClass || !type) {
            return null;
        }

        const classForFilename = targetClass === 'neutral' ? 'Neutral' : targetClass;
        const precursorVideo = `mp4_files/${type}-${classForFilename}-${season}.mp4`;
        const compositeVideo = `mp4_files/composites/${type}-${classForFilename}-${season}.mp4`;

        return {
            target: {
                season: season,
                class: targetClass,
                type: type
            },
            filePaths: {
                precursorVideo: precursorVideo,
                compositeVideo: compositeVideo
            }
        };
    }

    setOnPrecursorSelectedCallback(callback) {
        this.onPrecursorSelected = callback;
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
        Logger.error('Precursor Plots Error:', message);
    }

    hideError() {
        if (this.errorElement) {
            this.errorElement.style.display = 'none';
        }
    }

    displayPrecursorPlots(selectionData) {
        this.hideLoading();
        this.hideError();

        if (!this.mediaContainer) {
            Logger.error('Precursor media container not found');
            return;
        }

        const isNarrowLayout = window.innerWidth < 900;
        const mediaFlexDirection = isNarrowLayout ? 'column' : 'row';
        const mediaGap = isNarrowLayout ? 10 : 20;

        const precursorVideoSrc = selectionData.filePaths.precursorVideo;
        const compositeVideoSrc = selectionData.filePaths.compositeVideo;

        // Use the same aspect ratio for both videos (composite ratio) - importance video will be letterboxed
        const precursorContent = this.buildVideoMarkup('precursor-video', precursorVideoSrc, true, CONFIG.VIDEO_ASPECT_RATIO);
        const compositeContent = this.buildVideoMarkup('precursor-composite-video', compositeVideoSrc, false, CONFIG.VIDEO_ASPECT_RATIO);

        this.mediaContainer.style.display = 'flex';
        this.mediaContainer.style.flexDirection = mediaFlexDirection;
        this.mediaContainer.style.gap = `${mediaGap}px`;
        this.mediaContainer.style.alignItems = 'flex-start';
        this.mediaContainer.style.justifyContent = 'center';
        this.mediaContainer.innerHTML = precursorContent + compositeContent;

        const { precursorVideo, compositeVideo } = this.getPrecursorVideos();
        if (precursorVideo) {
            precursorVideo.load();
        }
        if (compositeVideo) {
            compositeVideo.load();
        }

        if (this.controlsElement) {
            this.controlsElement.style.display = 'flex';
        }

        if (this.contentElement) {
            this.contentElement.style.display = 'block';
        }

        this.currentSelection = selectionData;
        this.setupPrecursorVideoSync();
        Logger.info('Precursor plots displayed successfully');
    }

    buildVideoMarkup(videoId, videoSrc, autoplay, aspectRatio) {
        if (!videoSrc) {
            return '';
        }
        const autoplayAttribute = autoplay ? 'autoplay' : '';
        return `
            <div class="video-container">
                <video id="${videoId}" controls loop muted playsinline preload="auto" ${autoplayAttribute}
                       style="width: auto; height: auto; aspect-ratio: ${aspectRatio}; border-radius: 0.5rem; object-fit: contain;">
                    <source src="${videoSrc}" type="video/mp4">
                    <p>Your browser does not support the video tag. Video file: ${videoSrc}</p>
                </video>
            </div>
        `;
    }

    getPrecursorVideos() {
        if (!this.mediaContainer) {
            return { precursorVideo: null, compositeVideo: null };
        }
        return {
            precursorVideo: this.mediaContainer.querySelector('#precursor-video'),
            compositeVideo: this.mediaContainer.querySelector('#precursor-composite-video')
        };
    }

    setupPrecursorVideoSync() {
        const { precursorVideo, compositeVideo } = this.getPrecursorVideos();
        if (!precursorVideo || !compositeVideo) {
            Logger.warn('[Precursor Sync] Videos not found for sync setup');
            return;
        }

        const syncWhenReady = () => {
            if (precursorVideo.readyState >= 1 && compositeVideo.readyState >= 1) {
                this.syncCompositeToPrecursor({ alignTime: true, respectPlayState: true });
            }
        };

        precursorVideo.addEventListener('loadedmetadata', syncWhenReady);
        compositeVideo.addEventListener('loadedmetadata', syncWhenReady);

        precursorVideo.addEventListener('play', () => {
            this.syncCompositeToPrecursor({ alignTime: true, respectPlayState: true });
        });

        precursorVideo.addEventListener('pause', () => {
            this.syncCompositeToPrecursor({ alignTime: true, respectPlayState: true });
        });

        precursorVideo.addEventListener('seeked', () => {
            this.syncCompositeToPrecursor({ alignTime: true, respectPlayState: true });
        });

        precursorVideo.addEventListener('ratechange', () => {
            this.syncCompositeToPrecursor({ alignTime: false, respectPlayState: false });
        });
    }

    syncCompositeToPrecursor({ alignTime = true, respectPlayState = true } = {}) {
        const { precursorVideo, compositeVideo } = this.getPrecursorVideos();
        if (!precursorVideo || !compositeVideo) {
            Logger.debug('[Precursor Sync] Videos not found for sync');
            return;
        }

        if (alignTime && Number.isFinite(precursorVideo.currentTime)) {
            compositeVideo.currentTime = precursorVideo.currentTime;
        }

        compositeVideo.playbackRate = precursorVideo.playbackRate || 1;

        if (respectPlayState) {
            if (precursorVideo.paused) {
                compositeVideo.pause();
            } else {
                const playPromise = compositeVideo.play();
                if (playPromise && typeof playPromise.catch === 'function') {
                    playPromise.catch(() => {});
                }
            }
        }
    }
}
