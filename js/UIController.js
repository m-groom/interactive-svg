import { CONFIG, SELECTORS, CSS_CLASSES, EVENTS, KEYS } from './constants.js';
import { Logger } from './Logger.js';
import { Utils } from './Utils.js';

export class UIController {
    constructor(selectors = null, seasonOnlyMode = false, leadTimeOnlyMode = false) {
        // Use provided selectors or default to Markov Chain selectors
        this.selectors = selectors || {
            searchInput: SELECTORS.SEARCH_INPUT,
            searchDropdown: SELECTORS.SEARCH_DROPDOWN,
            dropdownContent: SELECTORS.DROPDOWN_CONTENT,
            seasonInput: SELECTORS.SEASON_INPUT,
            seasonDropdown: SELECTORS.SEASON_DROPDOWN,
            seasonDropdownContent: SELECTORS.SEASON_DROPDOWN_CONTENT,
            loadButton: SELECTORS.LOAD_BUTTON
        };

        this.seasonOnlyMode = seasonOnlyMode;
        this.leadTimeOnlyMode = leadTimeOnlyMode;
        
        this.searchInput = null;
        this.searchDropdown = null;
        this.dropdownContent = null;
        this.seasonInput = null;
        this.seasonDropdown = null;
        this.seasonDropdownContent = null;
        this.loadButton = null;
        this.svgOptions = [];
        this.seasonOptions = [];
        this.selectedSvg = null;
        this.selectedSeason = null;
        this.onSvgSelected = null; // Callback for when SVG is selected
    }

    initialize() {
        // In season-only mode, we only initialize season-related elements
        if (this.seasonOnlyMode) {
            this.seasonInput = document.querySelector(this.selectors.seasonInput);
            this.seasonDropdown = document.querySelector(this.selectors.seasonDropdown);
            this.seasonDropdownContent = document.querySelector(this.selectors.seasonDropdownContent);
            this.loadButton = document.querySelector(this.selectors.loadButton);

            this.seasonOptions = this.generateSeasonOptions();
            this.setupSeasonOnlyEventListeners();

            Logger.debug(`UIController initialized in season-only mode with ${this.seasonOptions.length} season options`);
        } else if (this.leadTimeOnlyMode) {
            // Lead-time-only mode for Markov Chain
            this.searchInput = document.querySelector(this.selectors.searchInput);
            this.searchDropdown = document.querySelector(this.selectors.searchDropdown);
            this.dropdownContent = document.querySelector(this.selectors.dropdownContent);
            this.loadButton = document.querySelector(this.selectors.loadButton);

            this.svgOptions = this.generateSvgOptions();
            this.seasonOptions = this.generateSeasonOptions();
            // Auto-select "All" season
            this.selectedSeason = this.seasonOptions.find(opt => opt.value === 'all');
            this.setupLeadTimeOnlyEventListeners();

            Logger.debug(`UIController initialized in lead-time-only mode with ${this.svgOptions.length} SVG options`);
        } else {
            // Original initialization for full mode (both lead time and season)
            this.searchInput = document.querySelector(this.selectors.searchInput);
            this.searchDropdown = document.querySelector(this.selectors.searchDropdown);
            this.dropdownContent = document.querySelector(this.selectors.dropdownContent);
            this.seasonInput = document.querySelector(this.selectors.seasonInput);
            this.seasonDropdown = document.querySelector(this.selectors.seasonDropdown);
            this.seasonDropdownContent = document.querySelector(this.selectors.seasonDropdownContent);
            this.loadButton = document.querySelector(this.selectors.loadButton);

            this.svgOptions = this.generateSvgOptions();
            this.seasonOptions = this.generateSeasonOptions();
            this.setupEventListeners();

            Logger.debug(`UIController initialized with ${this.svgOptions.length} SVG options and ${this.seasonOptions.length} season options`);
        }
    }

    generateSvgOptions() {
        const options = [];

        // Add lead time SVGs (1-24 months)
        for (let i = CONFIG.MIN_LEAD_TIME; i <= CONFIG.MAX_LEAD_TIME; i++) {
            options.push({
                filename: `svg_files/transition_graph_${i}months.svg`,
                title: `${i} Month${i > 1 ? 's' : ''} Lead Time`,
                subtitle: `transition_graph_${i}months.svg`,
                searchTerms: [`${i} month`, `${i} months`, `${i}`],
                leadTime: i
            });
        }

        return options;
    }

    generateSeasonOptions() {
        const options = [];
        
        if (this.seasonOnlyMode) {
            // DAG mode: Add "All" and seasonal options
            options.push({
                value: 'all',
                title: 'All',
                subtitle: 'All seasons combined',
                searchTerms: ['all']
            });
            
            // Add seasonal periods
            const seasons = [
                { value: 'DJF', title: 'DJF (Dec-Jan-Feb)', subtitle: 'Winter season' },
                { value: 'JFM', title: 'JFM (Jan-Feb-Mar)', subtitle: 'Late winter/early spring' },
                { value: 'FMA', title: 'FMA (Feb-Mar-Apr)', subtitle: 'Early spring' },
                { value: 'MAM', title: 'MAM (Mar-Apr-May)', subtitle: 'Spring season' },
                { value: 'AMJ', title: 'AMJ (Apr-May-Jun)', subtitle: 'Late spring/early summer' },
                { value: 'MJJ', title: 'MJJ (May-Jun-Jul)', subtitle: 'Early summer' },
                { value: 'JJA', title: 'JJA (Jun-Jul-Aug)', subtitle: 'Summer season' },
                { value: 'JAS', title: 'JAS (Jul-Aug-Sep)', subtitle: 'Late summer/early fall' },
                { value: 'ASO', title: 'ASO (Aug-Sep-Oct)', subtitle: 'Early fall' },
                { value: 'SON', title: 'SON (Sep-Oct-Nov)', subtitle: 'Fall season' },
                { value: 'OND', title: 'OND (Oct-Nov-Dec)', subtitle: 'Late fall/early winter' },
                { value: 'NDJ', title: 'NDJ (Nov-Dec-Jan)', subtitle: 'Early winter' }
            ];
            
            seasons.forEach(season => {
                options.push({
                    value: season.value,
                    title: season.title,
                    subtitle: season.subtitle,
                    searchTerms: [season.value.toLowerCase(), season.title.toLowerCase()]
                });
            });
        } else {
            // Markov Chain mode: Add "All" and seasonal options (same behavior as "All" for now)
            options.push({
                value: 'all',
                title: 'All',
                subtitle: 'Standard monthly transition graphs',
                searchTerms: ['all']
            });
            
            // Add seasonal periods (same as DAG mode but with different subtitle)
            const seasons = [
                { value: 'DJF', title: 'DJF (Dec-Jan-Feb)', subtitle: 'Winter season' },
                { value: 'JFM', title: 'JFM (Jan-Feb-Mar)', subtitle: 'Late winter/early spring' },
                { value: 'FMA', title: 'FMA (Feb-Mar-Apr)', subtitle: 'Early spring' },
                { value: 'MAM', title: 'MAM (Mar-Apr-May)', subtitle: 'Spring season' },
                { value: 'AMJ', title: 'AMJ (Apr-May-Jun)', subtitle: 'Late spring/early summer' },
                { value: 'MJJ', title: 'MJJ (May-Jun-Jul)', subtitle: 'Early summer' },
                { value: 'JJA', title: 'JJA (Jun-Jul-Aug)', subtitle: 'Summer season' },
                { value: 'JAS', title: 'JAS (Jul-Aug-Sep)', subtitle: 'Late summer/early fall' },
                { value: 'ASO', title: 'ASO (Aug-Sep-Oct)', subtitle: 'Early fall' },
                { value: 'SON', title: 'SON (Sep-Oct-Nov)', subtitle: 'Fall season' },
                { value: 'OND', title: 'OND (Oct-Nov-Dec)', subtitle: 'Late fall/early winter' },
                { value: 'NDJ', title: 'NDJ (Nov-Dec-Jan)', subtitle: 'Early winter' }
            ];
            
            seasons.forEach(season => {
                options.push({
                    value: season.value,
                    title: season.title,
                    subtitle: season.subtitle,
                    searchTerms: [season.value.toLowerCase(), season.title.toLowerCase()]
                });
            });
        }
        
        return options;
    }

    setupEventListeners() {
        if (!this.searchInput || !this.seasonInput || !this.loadButton) {
            Logger.error('Required UI elements not found');
            return;
        }

        // Lead time search input events
        this.searchInput.addEventListener(EVENTS.INPUT, (e) => this.handleLeadTimeSearch(e.target.value));
        this.searchInput.addEventListener(EVENTS.CLICK, (e) => {
            e.stopPropagation();
            this.showLeadTimeDropdown(this.svgOptions);
        });
        this.searchInput.addEventListener(EVENTS.KEYDOWN, (e) => this.handleLeadTimeKeyNavigation(e));

        // Season search input events
        this.seasonInput.addEventListener(EVENTS.INPUT, (e) => this.handleSeasonSearch(e.target.value));
        this.seasonInput.addEventListener(EVENTS.CLICK, (e) => {
            e.stopPropagation();
            this.showSeasonDropdown(this.seasonOptions);
        });
        this.seasonInput.addEventListener(EVENTS.KEYDOWN, (e) => this.handleSeasonKeyNavigation(e));

        // Load button event
        this.loadButton.addEventListener(EVENTS.CLICK, () => {
            if (this.selectedSvg && this.selectedSeason && this.onSvgSelected) {
                const finalSelection = this.buildFinalSelection();
                this.onSvgSelected(finalSelection);
            }
        });

        // Global click to close dropdowns
        document.addEventListener(EVENTS.CLICK, (e) => {
            if (!e.target.closest(`.${CSS_CLASSES.SEARCH_CONTAINER}`)) {
                this.hideAllDropdowns();
            }
        });
    }

    setupSeasonOnlyEventListeners() {
        if (!this.seasonInput || !this.loadButton) {
            Logger.error('Required UI elements not found for season-only mode');
            return;
        }

        // Season search input events
        this.seasonInput.addEventListener(EVENTS.INPUT, (e) => this.handleSeasonSearch(e.target.value));
        this.seasonInput.addEventListener(EVENTS.CLICK, (e) => {
            e.stopPropagation();
            this.showSeasonDropdown(this.seasonOptions);
        });
        this.seasonInput.addEventListener(EVENTS.KEYDOWN, (e) => this.handleSeasonKeyNavigation(e));

        // Load button event - for season-only mode
        this.loadButton.addEventListener(EVENTS.CLICK, () => {
            if (this.selectedSeason && this.onSvgSelected) {
                const finalSelection = this.buildSeasonOnlySelection();
                this.onSvgSelected(finalSelection);
            }
        });

        // Global click to close dropdowns
        document.addEventListener(EVENTS.CLICK, (e) => {
            if (!e.target.closest(`.${CSS_CLASSES.SEARCH_CONTAINER}`)) {
                this.hideSeasonDropdown();
            }
        });
    }

    setupLeadTimeOnlyEventListeners() {
        if (!this.searchInput || !this.loadButton) {
            Logger.error('Required UI elements not found for lead-time-only mode');
            return;
        }

        // Lead time search input events
        this.searchInput.addEventListener(EVENTS.INPUT, (e) => this.handleLeadTimeSearch(e.target.value));
        this.searchInput.addEventListener(EVENTS.CLICK, (e) => {
            e.stopPropagation();
            this.showLeadTimeDropdown(this.svgOptions);
        });
        this.searchInput.addEventListener(EVENTS.KEYDOWN, (e) => this.handleLeadTimeKeyNavigation(e));

        // Load button event - for lead-time-only mode
        this.loadButton.addEventListener(EVENTS.CLICK, () => {
            if (this.selectedSvg && this.onSvgSelected) {
                const finalSelection = this.buildFinalSelection();
                this.onSvgSelected(finalSelection);
            }
        });

        // Global click to close dropdowns
        document.addEventListener(EVENTS.CLICK, (e) => {
            if (!e.target.closest(`.${CSS_CLASSES.SEARCH_CONTAINER}`)) {
                this.hideLeadTimeDropdown();
            }
        });
    }

    setOnSvgSelectedCallback(callback) {
        this.onSvgSelected = callback;
    }

    buildFinalSelection() {
        if (!this.selectedSvg || !this.selectedSeason) return null;
        
        // For Markov Chain mode, all seasonal selections currently use the same file as "All"
        // In the future, this could be extended to load season-specific files
        return {
            ...this.selectedSvg,
            season: this.selectedSeason,
            finalFilename: this.selectedSvg.filename
        };
    }

    buildSeasonOnlySelection() {
        if (!this.selectedSeason) return null;
        
        // For season-only mode, load DAG visualization
        return {
            season: this.selectedSeason,
            finalFilename: 'svg_files/vertical_transition_graph.svg',
            title: `${this.selectedSeason.title} - DAG Visualization`,
            isDag: true,
            seasonValue: this.selectedSeason.value
        };
    }

    handleLeadTimeSearch(query) {
        if (!query.trim()) {
            this.showLeadTimeDropdown(this.svgOptions);
            this.selectedSvg = null;
            this.updateLoadButton();
            return;
        }

        const searchText = query.toLowerCase();
        const filtered = this.svgOptions.filter(option =>
            option.title.toLowerCase().includes(searchText) ||
            option.searchTerms.some(term => term.includes(searchText))
        );
        
        this.showLeadTimeDropdown(filtered);
    }

    handleSeasonSearch(query) {
        if (!query.trim()) {
            this.showSeasonDropdown(this.seasonOptions);
            this.selectedSeason = null;
            this.updateLoadButton();
            return;
        }

        const searchText = query.toLowerCase();
        const filtered = this.seasonOptions.filter(option =>
            option.title.toLowerCase().includes(searchText) ||
            option.searchTerms.some(term => term.includes(searchText))
        );
        
        this.showSeasonDropdown(filtered);
    }

    showLeadTimeDropdown(options) {
        if (options.length === 0) {
            this.hideLeadTimeDropdown();
            return;
        }

        this.dropdownContent.innerHTML = '';
        
        options.forEach(option => {
            const item = document.createElement('div');
            item.className = CSS_CLASSES.DROPDOWN_ITEM;
            
            item.innerHTML = `
                <div class="${CSS_CLASSES.ITEM_TITLE}">${this.escapeHTML(option.title)}</div>
            `;
            
            item.addEventListener(EVENTS.CLICK, () => this.selectLeadTimeOption(option));
            this.dropdownContent.appendChild(item);
        });

        this.searchDropdown.classList.add(CSS_CLASSES.SHOW);
        this.updateSearchContainerState(this.searchInput, true);
    }

    showSeasonDropdown(options) {
        if (options.length === 0) {
            this.hideSeasonDropdown();
            return;
        }

        this.seasonDropdownContent.innerHTML = '';
        
        options.forEach(option => {
            const item = document.createElement('div');
            item.className = CSS_CLASSES.DROPDOWN_ITEM;
            
            item.innerHTML = `
                <div class="${CSS_CLASSES.ITEM_TITLE}">${this.escapeHTML(option.title)}</div>
            `;
            
            item.addEventListener(EVENTS.CLICK, () => this.selectSeasonOption(option));
            this.seasonDropdownContent.appendChild(item);
        });

        this.seasonDropdown.classList.add(CSS_CLASSES.SHOW);
        this.updateSearchContainerState(this.seasonInput, true);
    }

    hideLeadTimeDropdown() {
        this.searchDropdown.classList.remove(CSS_CLASSES.SHOW);
        this.updateSearchContainerState(this.searchInput, false);
    }

    hideSeasonDropdown() {
        this.seasonDropdown.classList.remove(CSS_CLASSES.SHOW);
        this.updateSearchContainerState(this.seasonInput, false);
    }

    hideAllDropdowns() {
        this.hideLeadTimeDropdown();
        this.hideSeasonDropdown();
    }

    updateSearchContainerState(inputElement, isOpen) {
        const searchContainer = inputElement.closest(`.${CSS_CLASSES.SEARCH_CONTAINER}`);
        if (searchContainer) {
            if (isOpen) {
                searchContainer.classList.add(CSS_CLASSES.OPEN);
            } else {
                searchContainer.classList.remove(CSS_CLASSES.OPEN);
            }
        }
    }

    selectLeadTimeOption(option) {
        this.selectedSvg = option;
        this.searchInput.value = option.title;
        this.updateLoadButton();
        this.hideLeadTimeDropdown();
        
        Logger.debug(`Selected lead time option: ${option.title} (${option.filename})`);
    }

    selectSeasonOption(option) {
        this.selectedSeason = option;
        this.seasonInput.value = option.title;
        this.updateLoadButton();
        this.hideSeasonDropdown();
        
        Logger.debug(`Selected season option: ${option.title} (${option.value})`);
    }

    updateLoadButton() {
        if (this.loadButton) {
            if (this.seasonOnlyMode) {
                this.loadButton.disabled = !this.selectedSeason;
            } else if (this.leadTimeOnlyMode) {
                this.loadButton.disabled = !this.selectedSvg;
            } else {
                this.loadButton.disabled = !this.selectedSvg || !this.selectedSeason;
            }
        }
    }

    handleLeadTimeKeyNavigation(e) {
        const items = this.searchDropdown.querySelectorAll(`.${CSS_CLASSES.DROPDOWN_ITEM}`);
        const currentSelected = this.searchDropdown.querySelector(`.${CSS_CLASSES.DROPDOWN_ITEM_SELECTED}`);
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
                this.searchInput.blur();
                break;
        }
    }

    handleSeasonKeyNavigation(e) {
        const items = this.seasonDropdown.querySelectorAll(`.${CSS_CLASSES.DROPDOWN_ITEM}`);
        const currentSelected = this.seasonDropdown.querySelector(`.${CSS_CLASSES.DROPDOWN_ITEM_SELECTED}`);
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
                this.hideSeasonDropdown();
                this.seasonInput.blur();
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

    escapeHTML(str) {
        return Utils.escapeHTML(str);
    }

    showError(message) {
        // This could be enhanced to show UI-specific errors
        Logger.error('UIController error:', message);
    }

    reset() {
        if (this.searchInput) {
            this.searchInput.value = '';
        }
        if (this.seasonInput) {
            this.seasonInput.value = '';
        }
        this.selectedSvg = null;
        this.selectedSeason = null;
        this.updateLoadButton();
        this.hideAllDropdowns();
    }

    getSelectedSvg() {
        return this.selectedSvg;
    }

    getSelectedSeason() {
        return this.selectedSeason;
    }

    setSelectedSvg(option) {
        this.selectLeadTimeOption(option);
    }

    setSelectedSeason(option) {
        this.selectSeasonOption(option);
    }

    // Utility method to get option by lead time
    getOptionByLeadTime(leadTime) {
        return this.svgOptions.find(option => option.leadTime === leadTime);
    }

    // Utility method to get all available lead times
    getAvailableLeadTimes() {
        return this.svgOptions.map(option => option.leadTime);
    }
}