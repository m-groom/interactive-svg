import { CONFIG, SELECTORS, DEBUG } from './constants.js';
import { Logger } from './Logger.js';
import { SVGLoader } from './SVGLoader.js';
import { SVGParser } from './SVGParser.js';
import { UIController } from './UIController.js';
import { InteractionManager } from './InteractionManager.js';
import { DAGDataLoader } from './DAGDataLoader.js';
import { DAGParser } from './DAGParser.js';
import { DAGInteractionManager } from './DAGInteractionManager.js';
import { JSONParser } from './JSONParser.js';
import { BaseParser } from './BaseParser.js';
import { CaseStudyController } from './CaseStudyController.js';
import { BaseDataLoader } from './BaseDataLoader.js';

export class InteractiveSVGApp {
    constructor() {
        // Initialize logging system
        Logger.setDebug(DEBUG);
        // Markov Chain section components
        this.svgLoader = new SVGLoader();
        this.svgParser = new SVGParser();
        this.uiController = new UIController(null, false, true); // leadTimeOnlyMode = true
        this.interactionManager = new InteractionManager(this.svgLoader, this.svgParser, this);
        
        // DAG section components
        this.dagDataLoader = new DAGDataLoader();
        this.dagSvgLoader = new SVGLoader();
        this.dagParser = new DAGParser();
        this.dagUiController = new UIController();
        this.dagInteractionManager = new DAGInteractionManager(this.dagSvgLoader, this.dagParser, this);
        
        // Case Study section components
        this.caseStudyController = new CaseStudyController();
        this.caseStudyDataLoader = new BaseDataLoader();
        
        this.isInitialized = false;

        // Affiliation matrix state (Markov Chain date slider)
        this.affiliationData = null;
        this.dateSlider = null;
        this.dateSliderLabel = null;
        this.dateSliderPrev = null;
        this.dateSliderNext = null;
        this.currentSvgElement = null;

        // MFPT controls (Markov Chain)
        this.mfptRow = null;
        this.mfptNodeISelect = null;
        this.mfptNodeJSelect = null;
        this.mfptValue = null;
        this.mfptNodeCount = null;
        this.kMaxData = null;

        // DAG affiliation matrix state (DAG date slider)
        this.dagAffiliationData = {}; // Map: level -> {dates, affiliations}
        this.dagDateSlider = null;
        this.dagDateSliderLabel = null;
        this.dagDateSliderPrev = null;
        this.dagDateSliderNext = null;
        this.currentDagSvgElement = null;

        // DAG cumulative probability controls
        this.dagProbRow = null;
        this.dagProbNodeISelect = null;
        this.dagProbLevelNSelect = null;
        this.dagProbNodeJSelect = null;
        this.dagProbLevelMSelect = null;
        this.dagProbValue = null;
        this.dagProbabilityCache = null;
        this.dagIndexUtils = null;
        this.dagKMaxData = null;

        // DAG most probable path controls
        this.dagPathRow = null;
        this.dagPathNodeISelect = null;
        this.dagPathLevelNSelect = null;
        this.dagPathNodeJSelect = null;
        this.dagPathLevelMSelect = null;
        this.dagPathValue = null;
        this.dagPathCache = null;
        this.dagNodeElementMap = null;
        this.dagEdgeElementMap = null;
        this.dagArrowElementMap = null;
        this.dagPathHighlightedNodes = [];
        this.dagPathHighlightedEdges = [];
        this.dagPathHighlightedArrows = [];
    }

    async initialize() {
        if (this.isInitialized) {
            Logger.warn('InteractiveSVGApp already initialized');
            return;
        }

        try {
            // Initialize Markov Chain section
            this.svgLoader.initialize(
                document.querySelector(SELECTORS.LOADING),
                document.querySelector(SELECTORS.ERROR),
                document.querySelector(SELECTORS.SVG_CONTAINER)
            );

            this.uiController.initialize();
            this.interactionManager.initialize();
            this.initializeMFPTControls();

            // Set up Markov Chain callbacks
            this.uiController.setOnSvgSelectedCallback((finalSelection) => {
                this.loadSVG(finalSelection.finalFilename);
            });

            // Initialize DAG section with different selectors
            this.dagSvgLoader.initialize(
                document.querySelector(SELECTORS.DAG_LOADING),
                document.querySelector(SELECTORS.DAG_ERROR),
                document.querySelector(SELECTORS.DAG_SVG_CONTAINER)
            );

            const dagSelectors = {
                seasonInput: SELECTORS.DAG_SEASON_INPUT,
                seasonDropdown: SELECTORS.DAG_SEASON_DROPDOWN,
                seasonDropdownContent: SELECTORS.DAG_SEASON_DROPDOWN_CONTENT,
                loadButton: SELECTORS.DAG_LOAD_BUTTON
            };
            
            this.dagUiController = new UIController(dagSelectors, true); // true for season-only mode
            this.dagUiController.initialize();
            this.dagInteractionManager.initialize();

            // Set up DAG callbacks
            this.dagUiController.setOnSvgSelectedCallback((finalSelection) => {
                if (finalSelection.isDag) {
                    this.loadDAGSVG(finalSelection.finalFilename);
                } else {
                    this.loadDAGSVG(finalSelection.finalFilename);
                }
            });

            this.isInitialized = true;
            Logger.info('InteractiveSVGApp initialized successfully');

        } catch (error) {
            Logger.error('Failed to initialize InteractiveSVGApp:', error);
            this.showError('Failed to initialise application: ' + error.message);
        }
    }

    async loadSVG(filename) {
        if (!this.isInitialized) {
            Logger.error('App not initialized');
            return;
        }

        try {
            Logger.debug(`Loading SVG: ${filename}`);

            // Clear previous affiliation highlighting
            this.clearDateHighlighting();
            this.resetMfptControls();
            this.setMfptControlsEnabled(false);

            // Load SVG and JSON data
            const { svgElement, jsonParser } = await this.svgLoader.loadSVGWithData(filename);

            Logger.info('Successfully loaded SVG and JSON data');

            // Parse SVG and setup interactivity with JSON data
            const parseResult = this.svgParser.parseAndSetupInteractivity(svgElement, jsonParser);

            Logger.info(`Parsed ${parseResult.nodeCount} nodes and ${parseResult.edgeCount} edges`);

            // Setup interactive events
            this.interactionManager.setupSVGInteractions(svgElement);

            // Store reference to current SVG element
            this.currentSvgElement = svgElement;

            Logger.info('SVG loading and setup completed successfully');

            // Load affiliation matrix for this lead time
            const leadTime = this.svgLoader.getCurrentLeadTime();
            if (leadTime) {
                await this.loadAffiliationMatrix(leadTime);
                await this.setupMfptForLeadTime(leadTime);
            }

        } catch (error) {
            Logger.error('Failed to load SVG:', error);
            this.showError('Failed to load visualisation: ' + error.message);
        }
    }

    // =========================================================================
    // DATE SLIDER & AFFILIATION MATRIX METHODS
    // =========================================================================

    /**
     * Set up the date slider event listener.
     */
    setupDateSlider() {
        if (!this.dateSlider) {
            Logger.warn('Date slider element not found');
            return;
        }

        this.dateSlider.addEventListener('input', () => {
            const dateIndex = parseInt(this.dateSlider.value, 10);
            this.onDateSliderChange(dateIndex);
        });

        if (this.dateSliderPrev) {
            this.dateSliderPrev.addEventListener('click', () => this.stepDateSlider(-1));
        }
        if (this.dateSliderNext) {
            this.dateSliderNext.addEventListener('click', () => this.stepDateSlider(1));
        }

        Logger.debug('Date slider event listeners set up');
    }

    /**
     * Load the affiliation matrix JSON for a given lead time.
     * On success, enables the slider and applies the first date's highlighting.
     * On failure (e.g. file not found), disables the slider gracefully.
     * @param {number} leadTime - Lead time in months
     */
    async loadAffiliationMatrix(leadTime) {
        const filename = CONFIG.AFFILIATION_FILENAME_TEMPLATE.replace('{leadTime}', leadTime);
        Logger.debug(`Loading affiliation matrix: ${filename}`);

        try {
            const response = await fetch(filename);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();

            // Validate structure
            if (!data.dates || !Array.isArray(data.dates) ||
                !data.affiliations || !Array.isArray(data.affiliations)) {
                throw new Error('Invalid affiliation matrix structure');
            }

            if (data.dates.length !== data.affiliations.length) {
                throw new Error(`Date count (${data.dates.length}) does not match affiliation count (${data.affiliations.length})`);
            }

            this.affiliationData = data;

            // Enable and configure the slider
            if (this.dateSlider) {
                this.dateSlider.min = 0;
                this.dateSlider.max = data.dates.length - 1;
                this.dateSlider.value = 0;
                this.dateSlider.disabled = false;
            }

            Logger.info(`Affiliation matrix loaded: ${data.n_timesteps} dates, ${data.n_clusters} clusters`);

            // Apply initial highlighting for the first date
            this.onDateSliderChange(0);

        } catch (error) {
            Logger.warn(`Could not load affiliation matrix for lead time ${leadTime}: ${error.message}`);
            this.affiliationData = null;
            this.disableDateSlider();
        }
    }

    /**
     * Step the date slider forward or backward by one month.
     * @param {number} direction - +1 for forward, -1 for backward
     */
    stepDateSlider(direction) {
        if (!this.dateSlider || this.dateSlider.disabled) return;

        const current = parseInt(this.dateSlider.value, 10);
        const next = current + direction;
        const min = parseInt(this.dateSlider.min, 10);
        const max = parseInt(this.dateSlider.max, 10);

        if (next < min || next > max) return;

        this.dateSlider.value = next;
        this.onDateSliderChange(next);
    }

    /**
     * Handle slider value change — update label, step button states,
     * and apply highlighting.
     * @param {number} dateIndex - Index into the affiliations/dates arrays
     */
    onDateSliderChange(dateIndex) {
        if (!this.affiliationData) return;

        const dates = this.affiliationData.dates;
        const affiliations = this.affiliationData.affiliations;

        if (dateIndex < 0 || dateIndex >= dates.length) {
            Logger.warn(`Date index ${dateIndex} out of range`);
            return;
        }

        // Update label with formatted date
        const dateString = dates[dateIndex];
        if (this.dateSliderLabel) {
            this.dateSliderLabel.textContent = this.formatSliderDate(dateString);
        }

        // Update step button disabled states
        this.updateStepButtons(dateIndex, dates.length);

        // Get the probability vector for this date
        const probVector = affiliations[dateIndex];
        if (!probVector || !Array.isArray(probVector)) {
            // No data for this date — clear highlighting
            this.clearDateHighlighting();
            return;
        }

        this.applyDateHighlighting(probVector);
    }

    /**
     * Enable/disable the prev/next step buttons based on current position.
     * @param {number} index - Current date index
     * @param {number} total - Total number of dates
     */
    updateStepButtons(index, total) {
        if (this.dateSliderPrev) {
            this.dateSliderPrev.disabled = (index <= 0);
        }
        if (this.dateSliderNext) {
            this.dateSliderNext.disabled = (index >= total - 1);
        }
    }

    /**
     * Apply brightness-based highlighting to SVG nodes proportional to
     * their affiliation probabilities.
     * @param {number[]} probVector - Probability vector (one entry per cluster)
     */
    applyDateHighlighting(probVector) {
        if (!this.currentSvgElement) return;

        const nodes = this.currentSvgElement.querySelectorAll(SELECTORS.SVG_NODES);
        const scale = CONFIG.BRIGHTNESS_SCALE;

        nodes.forEach((node, index) => {
            const probability = (index < probVector.length) ? probVector[index] : 0;
            const brightness = 1.0 + scale * probability;
            node.style.filter = `brightness(${brightness.toFixed(3)})`;
        });

        Logger.debug(`Applied date highlighting: ${probVector.length} nodes, max p=${Math.max(...probVector).toFixed(3)}`);
    }

    /**
     * Remove all brightness modifications from SVG nodes.
     */
    clearDateHighlighting() {
        if (!this.currentSvgElement) return;

        const nodes = this.currentSvgElement.querySelectorAll(SELECTORS.SVG_NODES);
        nodes.forEach(node => {
            node.style.filter = '';
        });

        Logger.debug('Cleared date highlighting');
    }

    /**
     * Disable the date slider and reset its label.
     */
    disableDateSlider() {
        if (this.dateSlider) {
            this.dateSlider.disabled = true;
            this.dateSlider.value = 0;
            this.dateSlider.min = 0;
            this.dateSlider.max = 0;
        }
        if (this.dateSliderLabel) {
            this.dateSliderLabel.textContent = '\u2014'; // em dash
        }
        if (this.dateSliderPrev) {
            this.dateSliderPrev.disabled = true;
        }
        if (this.dateSliderNext) {
            this.dateSliderNext.disabled = true;
        }
    }

    /**
     * Format a date string (e.g. "2002-01-01") for display on the slider label.
     * @param {string} dateString - ISO date string
     * @returns {string} - Formatted date (e.g. "Jan 2002")
     */
    formatSliderDate(dateString) {
        if (!dateString) return '\u2014';
        try {
            const date = new Date(dateString + 'T00:00:00');
            return date.toLocaleDateString('en-GB', {
                year: 'numeric',
                month: 'short'
            });
        } catch {
            return dateString;
        }
    }

    // =========================================================================
    // MFPT CONTROLS (MARKOV CHAIN)
    // =========================================================================

    initializeMFPTControls() {
        this.mfptRow = document.querySelector(SELECTORS.MFPT_ROW);
        this.mfptNodeISelect = document.querySelector(SELECTORS.MFPT_NODE_I);
        this.mfptNodeJSelect = document.querySelector(SELECTORS.MFPT_NODE_J);
        this.mfptValue = document.querySelector(SELECTORS.MFPT_VALUE);

        if (!this.mfptRow || !this.mfptNodeISelect || !this.mfptNodeJSelect || !this.mfptValue) {
            return;
        }

        this.resetMfptControls();
        this.setMfptControlsEnabled(false);

        this.mfptNodeISelect.addEventListener('change', () => {
            this.handleMfptNodeIChange();
        });

        this.mfptNodeJSelect.addEventListener('change', () => {
            this.updateMfptValue();
        });
    }

    setMfptControlsEnabled(enabled) {
        if (!this.mfptRow || !this.mfptNodeISelect || !this.mfptNodeJSelect) return;

        this.mfptRow.classList.toggle('is-disabled', !enabled);
        this.mfptNodeISelect.disabled = !enabled;
        this.mfptNodeJSelect.disabled = !enabled;
    }

    resetMfptControls() {
        if (!this.mfptNodeISelect || !this.mfptNodeJSelect || !this.mfptValue) return;

        this.mfptNodeCount = null;
        this.populateMfptSelect(this.mfptNodeISelect, 0, 'Select Cluster i');
        this.populateMfptSelect(this.mfptNodeJSelect, 0, 'Select Cluster j');
        this.mfptValue.textContent = '\u2014';
    }

    async loadKMaxDataIfNeeded() {
        if (this.kMaxData) return;
        try {
            this.kMaxData = await this.dagDataLoader.loadKMaxData();
        } catch (error) {
            Logger.warn('Failed to load K_max data for MFPT controls:', error.message);
            this.kMaxData = null;
        }
    }

    async setupMfptForLeadTime(leadTime) {
        if (!this.mfptRow || !this.mfptNodeISelect || !this.mfptNodeJSelect || !leadTime) return;

        await this.loadKMaxDataIfNeeded();
        const nodeCount = this.kMaxData?.[leadTime] || 0;

        if (!nodeCount) {
            this.resetMfptControls();
            this.setMfptControlsEnabled(false);
            return;
        }

        this.mfptNodeCount = nodeCount;
        this.populateMfptSelect(this.mfptNodeISelect, nodeCount, 'Select Cluster i');
        this.populateMfptSelect(this.mfptNodeJSelect, nodeCount, 'Select Cluster j');
        this.setMfptControlsEnabled(true);
    }

    populateMfptSelect(selectElement, nodeCount, placeholderText, excludedId = null) {
        selectElement.innerHTML = '';

        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = placeholderText;
        selectElement.appendChild(placeholder);

        for (let i = 1; i <= nodeCount; i++) {
            if (excludedId && i === excludedId) continue;
            const option = document.createElement('option');
            option.value = String(i);
            option.textContent = `Cluster ${i}`;
            selectElement.appendChild(option);
        }

        selectElement.value = '';
    }

    handleMfptNodeIChange() {
        if (!this.mfptNodeISelect || !this.mfptNodeJSelect) return;

        const selectedI = parseInt(this.mfptNodeISelect.value, 10);
        const excludeId = Number.isInteger(selectedI) ? selectedI : null;
        const currentJ = this.mfptNodeJSelect.value;

        this.populateMfptSelect(
            this.mfptNodeJSelect,
            this.mfptNodeCount || 0,
            'Select Cluster j',
            excludeId
        );

        if (currentJ && currentJ !== String(excludeId)) {
            this.mfptNodeJSelect.value = currentJ;
        }

        this.updateMfptValue();
    }

    updateMfptValue() {
        if (!this.mfptValue || !this.mfptNodeISelect || !this.mfptNodeJSelect) return;

        const nodeI = parseInt(this.mfptNodeISelect.value, 10);
        const nodeJ = parseInt(this.mfptNodeJSelect.value, 10);

        if (!Number.isInteger(nodeI) || !Number.isInteger(nodeJ)) {
            this.mfptValue.textContent = '\u2014';
            return;
        }

        const nodeData = this.svgParser?.jsonParser?.getNodeData(nodeI);
        const mfptTo = Array.isArray(nodeData?.mfpt_to) ? nodeData.mfpt_to[nodeJ - 1] : null;

        if (Number.isFinite(mfptTo)) {
            this.mfptValue.textContent = `${mfptTo.toFixed(2)} months`;
        } else {
            this.mfptValue.textContent = 'N/A';
        }
    }

    // =========================================================================
    // DAG DATE SLIDER & AFFILIATION MATRIX METHODS
    // =========================================================================

    /**
     * Set up the DAG date slider event listener.
     */
    setupDAGDateSlider() {
        if (!this.dagDateSlider) {
            Logger.warn('DAG date slider element not found');
            return;
        }

        this.dagDateSlider.addEventListener('input', () => {
            const dateIndex = parseInt(this.dagDateSlider.value, 10);
            this.onDAGDateSliderChange(dateIndex);
        });

        if (this.dagDateSliderPrev) {
            this.dagDateSliderPrev.addEventListener('click', () => this.stepDAGDateSlider(-1));
        }
        if (this.dagDateSliderNext) {
            this.dagDateSliderNext.addEventListener('click', () => this.stepDAGDateSlider(1));
        }

        Logger.debug('DAG date slider event listeners set up');
    }

    /**
     * Load all affiliation matrices for DAG (levels 0-24).
     * Called after DAG SVG is successfully loaded.
     */
    async loadAllDAGAffiliationMatrices() {
        Logger.debug('Loading all DAG affiliation matrices (levels 0-24)...');
        
        this.dagAffiliationData = {};
        const loadPromises = [];
        
        // Load matrices for levels 0-24 in parallel
        for (let level = 0; level <= 24; level++) {
            loadPromises.push(this.loadDAGAffiliationMatrix(level));
        }
        
        try {
            await Promise.all(loadPromises);
            
            // Check if we have data for at least level 0 to configure the slider
            const level0Data = this.dagAffiliationData[0];
            if (level0Data && level0Data.dates && level0Data.dates.length > 0) {
                // Enable and configure the slider using level 0 dates
                if (this.dagDateSlider) {
                    this.dagDateSlider.min = 0;
                    this.dagDateSlider.max = level0Data.dates.length - 1;
                    this.dagDateSlider.value = 0;
                    this.dagDateSlider.disabled = false;
                }
                
                const loadedLevels = Object.keys(this.dagAffiliationData).length;
                Logger.info(`DAG affiliation matrices loaded: ${loadedLevels}/25 levels, ${level0Data.dates.length} dates`);
                
                // Apply initial highlighting for the first date
                this.onDAGDateSliderChange(0);
            } else {
                Logger.warn('No valid affiliation data found for level 0');
                this.disableDAGDateSlider();
            }
        } catch (error) {
            Logger.error('Failed to load DAG affiliation matrices:', error);
            this.disableDAGDateSlider();
        }
    }

    /**
     * Load a single affiliation matrix for a DAG level.
     * @param {number} level - The level (0-24)
     */
    async loadDAGAffiliationMatrix(level) {
        const filename = CONFIG.AFFILIATION_FILENAME_TEMPLATE.replace('{leadTime}', level);
        
        try {
            const response = await fetch(filename);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();

            // Validate structure
            if (!data.dates || !Array.isArray(data.dates) ||
                !data.affiliations || !Array.isArray(data.affiliations)) {
                throw new Error('Invalid affiliation matrix structure');
            }

            if (data.dates.length !== data.affiliations.length) {
                throw new Error(`Date count (${data.dates.length}) does not match affiliation count (${data.affiliations.length})`);
            }

            this.dagAffiliationData[level] = data;
            Logger.debug(`Loaded affiliation matrix for level ${level}: ${data.n_clusters} clusters`);

        } catch (error) {
            Logger.warn(`Could not load affiliation matrix for level ${level}: ${error.message}`);
            // Don't throw - we want to continue loading other levels
        }
    }

    /**
     * Step the DAG date slider forward or backward by one month.
     * @param {number} direction - +1 for forward, -1 for backward
     */
    stepDAGDateSlider(direction) {
        if (!this.dagDateSlider || this.dagDateSlider.disabled) return;

        const current = parseInt(this.dagDateSlider.value, 10);
        const next = current + direction;
        const min = parseInt(this.dagDateSlider.min, 10);
        const max = parseInt(this.dagDateSlider.max, 10);

        if (next < min || next > max) return;

        this.dagDateSlider.value = next;
        this.onDAGDateSliderChange(next);
    }

    /**
     * Handle DAG slider value change — update label, step button states,
     * and apply highlighting.
     * @param {number} dateIndex - Index into the affiliations/dates arrays
     */
    onDAGDateSliderChange(dateIndex) {
        // Use level 0 data for dates (all levels should have same dates)
        const level0Data = this.dagAffiliationData[0];
        if (!level0Data) return;

        const dates = level0Data.dates;

        if (dateIndex < 0 || dateIndex >= dates.length) {
            Logger.warn(`DAG date index ${dateIndex} out of range`);
            return;
        }

        // Update label with formatted date
        const dateString = dates[dateIndex];
        if (this.dagDateSliderLabel) {
            this.dagDateSliderLabel.textContent = this.formatSliderDate(dateString);
        }

        // Update step button disabled states
        this.updateDAGStepButtons(dateIndex, dates.length);

        // Apply highlighting to all DAG nodes
        this.applyDAGDateHighlighting(dateIndex);
    }

    /**
     * Enable/disable the DAG prev/next step buttons based on current position.
     * @param {number} index - Current date index
     * @param {number} total - Total number of dates
     */
    updateDAGStepButtons(index, total) {
        if (this.dagDateSliderPrev) {
            this.dagDateSliderPrev.disabled = (index <= 0);
        }
        if (this.dagDateSliderNext) {
            this.dagDateSliderNext.disabled = (index >= total - 1);
        }
    }

    /**
     * Apply brightness-based highlighting to DAG SVG nodes proportional to
     * their affiliation probabilities. Each node uses its level's affiliation matrix.
     * @param {number} dateIndex - Index into the affiliations arrays
     */
    applyDAGDateHighlighting(dateIndex) {
        if (!this.currentDagSvgElement) return;

        // Get all DAG nodes using the DAG-specific selector
        const nodeSelector = 'path[fill-rule="nonzero"][stroke-linejoin="miter"]';
        const nodes = this.currentDagSvgElement.querySelectorAll(nodeSelector);
        const scale = CONFIG.BRIGHTNESS_SCALE;

        nodes.forEach((node, svgIndex) => {
            // Get the global ID for this SVG index from DAGInteractionManager's mapping
            const globalId = this.dagInteractionManager.svgIndexToGlobalId[svgIndex];
            if (globalId === undefined) {
                return;
            }

            // Get node data to find level and localIdx
            const nodeData = this.dagParser.getNodeData(globalId);
            if (!nodeData) {
                return;
            }

            const level = nodeData.level;
            const localIdx = nodeData.localIdx;

            // Get the affiliation data for this level
            const levelData = this.dagAffiliationData[level];
            if (!levelData || !levelData.affiliations || !levelData.affiliations[dateIndex]) {
                node.style.filter = '';
                return;
            }

            // Get the probability for this node (localIdx is 1-based, convert to 0-based array index)
            const probability = levelData.affiliations[dateIndex][localIdx - 1];
            if (typeof probability !== 'number' || isNaN(probability)) {
                node.style.filter = '';
                return;
            }

            const brightness = 1.0 + scale * probability;
            node.style.filter = `brightness(${brightness.toFixed(3)})`;
        });

        Logger.debug(`Applied DAG date highlighting for date index ${dateIndex}`);
    }

    /**
     * Remove all brightness modifications from DAG SVG nodes.
     */
    clearDAGDateHighlighting() {
        if (!this.currentDagSvgElement) return;

        const nodeSelector = 'path[fill-rule="nonzero"][stroke-linejoin="miter"]';
        const nodes = this.currentDagSvgElement.querySelectorAll(nodeSelector);
        nodes.forEach(node => {
            node.style.filter = '';
        });

        Logger.debug('Cleared DAG date highlighting');
    }

    /**
     * Disable the DAG date slider and reset its label.
     */
    disableDAGDateSlider() {
        if (this.dagDateSlider) {
            this.dagDateSlider.disabled = true;
            this.dagDateSlider.value = 0;
            this.dagDateSlider.min = 0;
            this.dagDateSlider.max = 0;
        }
        if (this.dagDateSliderLabel) {
            this.dagDateSliderLabel.textContent = '\u2014'; // em dash
        }
        if (this.dagDateSliderPrev) {
            this.dagDateSliderPrev.disabled = true;
        }
        if (this.dagDateSliderNext) {
            this.dagDateSliderNext.disabled = true;
        }
    }

    // =========================================================================
    // DAG CUMULATIVE PROBABILITY CONTROLS
    // =========================================================================

    initializeDagProbabilityControls() {
        this.dagProbRow = document.querySelector(SELECTORS.DAG_PROB_ROW);
        this.dagProbNodeISelect = document.querySelector(SELECTORS.DAG_PROB_NODE_I);
        this.dagProbLevelNSelect = document.querySelector(SELECTORS.DAG_PROB_LEVEL_N);
        this.dagProbNodeJSelect = document.querySelector(SELECTORS.DAG_PROB_NODE_J);
        this.dagProbLevelMSelect = document.querySelector(SELECTORS.DAG_PROB_LEVEL_M);
        this.dagProbValue = document.querySelector(SELECTORS.DAG_PROB_VALUE);

        if (!this.dagProbRow || !this.dagProbNodeISelect || !this.dagProbLevelNSelect ||
            !this.dagProbNodeJSelect || !this.dagProbLevelMSelect || !this.dagProbValue) {
            return;
        }

        this.resetDagProbabilityControls();
        this.setDagProbabilityControlsEnabled(false);

        this.dagProbLevelNSelect.addEventListener('change', () => {
            this.handleDagProbabilityLevelNChange();
        });

        this.dagProbLevelMSelect.addEventListener('change', () => {
            this.handleDagProbabilityLevelMChange();
        });

        this.dagProbNodeISelect.addEventListener('change', () => {
            this.updateDagProbabilityValue();
        });

        this.dagProbNodeJSelect.addEventListener('change', () => {
            this.updateDagProbabilityValue();
        });
    }

    setDagProbabilityControlsEnabled(enabled) {
        if (!this.dagProbRow) return;
        this.dagProbRow.classList.toggle('is-disabled', !enabled);
        const selects = [
            this.dagProbNodeISelect,
            this.dagProbLevelNSelect,
            this.dagProbNodeJSelect,
            this.dagProbLevelMSelect
        ];
        selects.forEach(select => {
            if (select) select.disabled = !enabled;
        });
    }

    resetDagProbabilityControls() {
        if (!this.dagProbNodeISelect || !this.dagProbLevelNSelect ||
            !this.dagProbNodeJSelect || !this.dagProbLevelMSelect || !this.dagProbValue) {
            return;
        }

        this.dagProbNodeISelect.innerHTML = '<option value="">Cluster i</option>';
        this.dagProbLevelNSelect.innerHTML = '<option value="">n months</option>';
        this.dagProbNodeJSelect.innerHTML = '<option value="">Cluster j</option>';
        this.dagProbLevelMSelect.innerHTML = '<option value="">m months</option>';
        this.dagProbValue.textContent = '\u2014';
    }

    setupDagProbabilityControls(kMaxData, dagData) {
        if (!this.dagProbRow || !this.dagProbNodeISelect || !this.dagProbLevelNSelect ||
            !this.dagProbNodeJSelect || !this.dagProbLevelMSelect || !this.dagProbValue) {
            return;
        }

        this.dagKMaxData = kMaxData;
        this.dagIndexUtils = this.dagDataLoader.indexUtils;
        this.buildDagProbabilityCache(dagData);

        this.populateDagLevelSelect(this.dagProbLevelNSelect, 1, kMaxData.length - 1, 'n months');
        this.dagProbNodeISelect.innerHTML = '<option value="">Cluster i</option>';
        this.dagProbLevelMSelect.innerHTML = '<option value="">m months</option>';
        this.dagProbNodeJSelect.innerHTML = '<option value="">Cluster j</option>';
        this.dagProbValue.textContent = '\u2014';

        this.setDagProbabilityControlsEnabled(true);
        this.dagProbNodeISelect.disabled = true;
        this.dagProbLevelMSelect.disabled = true;
        this.dagProbNodeJSelect.disabled = true;
    }

    populateDagLevelSelect(selectElement, minLevel, maxLevel, placeholderText) {
        selectElement.innerHTML = '';
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = placeholderText;
        selectElement.appendChild(placeholder);

        for (let level = minLevel; level <= maxLevel; level++) {
            const option = document.createElement('option');
            option.value = String(level);
            option.textContent = `${level} months`;
            selectElement.appendChild(option);
        }

        selectElement.value = '';
    }

    populateDagNodeSelect(selectElement, level, placeholderText) {
        selectElement.innerHTML = '';
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = placeholderText;
        selectElement.appendChild(placeholder);

        if (!Number.isInteger(level) || !this.dagKMaxData) {
            selectElement.value = '';
            return;
        }

        const nodeCount = this.dagKMaxData[level] || 0;
        for (let i = 1; i <= nodeCount; i++) {
            const option = document.createElement('option');
            option.value = String(i);
            option.textContent = `Cluster ${i}`;
            selectElement.appendChild(option);
        }

        selectElement.value = '';
    }

    handleDagProbabilityLevelNChange() {
        const levelN = parseInt(this.dagProbLevelNSelect.value, 10);

        if (!Number.isInteger(levelN)) {
            this.dagProbNodeISelect.disabled = true;
            this.dagProbLevelMSelect.disabled = true;
            this.dagProbNodeJSelect.disabled = true;
            this.populateDagNodeSelect(this.dagProbNodeISelect, null, 'Cluster i');
            this.dagProbLevelMSelect.innerHTML = '<option value="">m months</option>';
            this.populateDagNodeSelect(this.dagProbNodeJSelect, null, 'Cluster j');
            this.updateDagProbabilityValue();
            return;
        }

        this.populateDagNodeSelect(this.dagProbNodeISelect, levelN, 'Cluster i');
        this.dagProbNodeISelect.disabled = false;

        this.populateDagLevelSelect(this.dagProbLevelMSelect, 0, levelN - 1, 'm months');
        this.dagProbLevelMSelect.disabled = false;

        this.dagProbNodeJSelect.disabled = true;
        this.populateDagNodeSelect(this.dagProbNodeJSelect, null, 'Cluster j');
        this.updateDagProbabilityValue();
    }

    handleDagProbabilityLevelMChange() {
        const levelM = parseInt(this.dagProbLevelMSelect.value, 10);

        if (!Number.isInteger(levelM)) {
            this.dagProbNodeJSelect.disabled = true;
            this.populateDagNodeSelect(this.dagProbNodeJSelect, null, 'Cluster j');
            this.updateDagProbabilityValue();
            return;
        }

        this.populateDagNodeSelect(this.dagProbNodeJSelect, levelM, 'Cluster j');
        this.dagProbNodeJSelect.disabled = false;
        this.updateDagProbabilityValue();
    }

    buildDagProbabilityCache(dagData) {
        if (!dagData?.graph?.nodes || !dagData?.graph?.links) {
            this.dagProbabilityCache = null;
            return;
        }

        const totalNodes = dagData.graph.nodes.length;
        const adjacency = Array.from({ length: totalNodes + 1 }, () => []);
        const indegree = new Array(totalNodes + 1).fill(0);

        dagData.graph.links.forEach(link => {
            const source = link.source;
            const target = link.target;
            const weight = link.weight;
            const logWeight = (typeof weight === 'number' && weight > 0) ? Math.log(weight) : -Infinity;
            adjacency[source].push({ target, logWeight });
            indegree[target] += 1;
        });

        const queue = [];
        for (let i = 1; i <= totalNodes; i++) {
            if (indegree[i] === 0) queue.push(i);
        }

        const topoOrder = [];
        let idx = 0;
        while (idx < queue.length) {
            const node = queue[idx++];
            topoOrder.push(node);
            adjacency[node].forEach(edge => {
                indegree[edge.target] -= 1;
                if (indegree[edge.target] === 0) queue.push(edge.target);
            });
        }

        if (topoOrder.length !== totalNodes) {
            Logger.warn(`Topological sort incomplete: expected ${totalNodes}, got ${topoOrder.length}`);
        }

        this.dagProbabilityCache = {
            adjacency,
            topoOrder,
            totalNodes
        };
    }

    calculateDagCumulativeProbability(sourceId, targetId) {
        if (!this.dagProbabilityCache) return null;

        const { adjacency, topoOrder, totalNodes } = this.dagProbabilityCache;
        if (sourceId < 1 || sourceId > totalNodes || targetId < 1 || targetId > totalNodes) {
            return null;
        }

        const logp = new Array(totalNodes + 1).fill(-Infinity);
        logp[sourceId] = 0;

        const logsum2 = (a, b) => {
            if (a === -Infinity) return b;
            if (b === -Infinity) return a;
            const m = Math.max(a, b);
            return m + Math.log(Math.exp(a - m) + Math.exp(b - m));
        };

        topoOrder.forEach(node => {
            const currentLog = logp[node];
            if (currentLog === -Infinity) return;
            adjacency[node].forEach(edge => {
                if (edge.logWeight === -Infinity) return;
                const candidate = currentLog + edge.logWeight;
                logp[edge.target] = logsum2(logp[edge.target], candidate);
            });
        });

        const result = logp[targetId];
        return Number.isFinite(result) ? Math.exp(result) : 0;
    }

    updateDagProbabilityValue() {
        if (!this.dagProbValue) return;

        const nodeI = parseInt(this.dagProbNodeISelect.value, 10);
        const levelN = parseInt(this.dagProbLevelNSelect.value, 10);
        const nodeJ = parseInt(this.dagProbNodeJSelect.value, 10);
        const levelM = parseInt(this.dagProbLevelMSelect.value, 10);

        if (!Number.isInteger(nodeI) || !Number.isInteger(levelN) ||
            !Number.isInteger(nodeJ) || !Number.isInteger(levelM) || levelM >= levelN) {
            this.dagProbValue.textContent = '\u2014';
            return;
        }

        try {
            const sourceId = this.dagIndexUtils.globalIndexFromLevel(levelN, nodeI);
            const targetId = this.dagIndexUtils.globalIndexFromLevel(levelM, nodeJ);
            const probability = this.calculateDagCumulativeProbability(sourceId, targetId);

            if (typeof probability === 'number') {
                this.dagProbValue.textContent = probability.toFixed(2);
            } else {
                this.dagProbValue.textContent = 'N/A';
            }
        } catch (error) {
            Logger.warn('Failed to compute DAG cumulative probability:', error.message);
            this.dagProbValue.textContent = 'N/A';
        }
    }

    // =========================================================================
    // DAG MOST PROBABLE PATH CONTROLS
    // =========================================================================

    initializeDagPathControls() {
        this.dagPathRow = document.querySelector(SELECTORS.DAG_PATH_ROW);
        this.dagPathNodeISelect = document.querySelector(SELECTORS.DAG_PATH_NODE_I);
        this.dagPathLevelNSelect = document.querySelector(SELECTORS.DAG_PATH_LEVEL_N);
        this.dagPathNodeJSelect = document.querySelector(SELECTORS.DAG_PATH_NODE_J);
        this.dagPathLevelMSelect = document.querySelector(SELECTORS.DAG_PATH_LEVEL_M);
        this.dagPathValue = document.querySelector(SELECTORS.DAG_PATH_VALUE);

        if (!this.dagPathRow || !this.dagPathNodeISelect || !this.dagPathLevelNSelect ||
            !this.dagPathNodeJSelect || !this.dagPathLevelMSelect || !this.dagPathValue) {
            return;
        }

        this.resetDagPathControls();
        this.setDagPathControlsEnabled(false);

        this.dagPathLevelNSelect.addEventListener('change', () => {
            this.handleDagPathLevelNChange();
        });

        this.dagPathLevelMSelect.addEventListener('change', () => {
            this.handleDagPathLevelMChange();
        });

        this.dagPathNodeISelect.addEventListener('change', () => {
            this.updateDagPathValue();
        });

        this.dagPathNodeJSelect.addEventListener('change', () => {
            this.updateDagPathValue();
        });
    }

    setDagPathControlsEnabled(enabled) {
        if (!this.dagPathRow) return;
        this.dagPathRow.classList.toggle('is-disabled', !enabled);
        const selects = [
            this.dagPathNodeISelect,
            this.dagPathLevelNSelect,
            this.dagPathNodeJSelect,
            this.dagPathLevelMSelect
        ];
        selects.forEach(select => {
            if (select) select.disabled = !enabled;
        });
    }

    resetDagPathControls() {
        if (!this.dagPathNodeISelect || !this.dagPathLevelNSelect ||
            !this.dagPathNodeJSelect || !this.dagPathLevelMSelect || !this.dagPathValue) {
            return;
        }

        this.dagPathNodeISelect.innerHTML = '<option value="">Cluster i</option>';
        this.dagPathLevelNSelect.innerHTML = '<option value="">n months</option>';
        this.dagPathNodeJSelect.innerHTML = '<option value="">Cluster j</option>';
        this.dagPathLevelMSelect.innerHTML = '<option value="">m months</option>';
        this.dagPathValue.textContent = '\u2014';
        this.clearDagPathHighlight();
    }

    setupDagPathControls(kMaxData, dagData) {
        if (!this.dagPathRow || !this.dagPathNodeISelect || !this.dagPathLevelNSelect ||
            !this.dagPathNodeJSelect || !this.dagPathLevelMSelect || !this.dagPathValue) {
            return;
        }

        this.dagKMaxData = kMaxData;
        this.dagIndexUtils = this.dagDataLoader.indexUtils;
        this.buildDagPathCache(dagData);
        this.buildDagPathHighlightMaps();

        this.populateDagLevelSelect(this.dagPathLevelNSelect, 1, kMaxData.length - 1, 'n months');
        this.dagPathNodeISelect.innerHTML = '<option value="">Cluster i</option>';
        this.dagPathLevelMSelect.innerHTML = '<option value="">m months</option>';
        this.dagPathNodeJSelect.innerHTML = '<option value="">Cluster j</option>';
        this.dagPathValue.textContent = '\u2014';

        this.setDagPathControlsEnabled(true);
        this.dagPathNodeISelect.disabled = true;
        this.dagPathLevelMSelect.disabled = true;
        this.dagPathNodeJSelect.disabled = true;
    }

    handleDagPathLevelNChange() {
        const levelN = parseInt(this.dagPathLevelNSelect.value, 10);

        if (!Number.isInteger(levelN)) {
            this.dagPathNodeISelect.disabled = true;
            this.dagPathLevelMSelect.disabled = true;
            this.dagPathNodeJSelect.disabled = true;
            this.populateDagNodeSelect(this.dagPathNodeISelect, null, 'Cluster i');
            this.dagPathLevelMSelect.innerHTML = '<option value="">m months</option>';
            this.populateDagNodeSelect(this.dagPathNodeJSelect, null, 'Cluster j');
            this.updateDagPathValue();
            return;
        }

        this.populateDagNodeSelect(this.dagPathNodeISelect, levelN, 'Cluster i');
        this.dagPathNodeISelect.disabled = false;

        this.populateDagLevelSelect(this.dagPathLevelMSelect, 0, levelN - 1, 'm months');
        this.dagPathLevelMSelect.disabled = false;

        this.dagPathNodeJSelect.disabled = true;
        this.populateDagNodeSelect(this.dagPathNodeJSelect, null, 'Cluster j');
        this.updateDagPathValue();
    }

    handleDagPathLevelMChange() {
        const levelM = parseInt(this.dagPathLevelMSelect.value, 10);

        if (!Number.isInteger(levelM)) {
            this.dagPathNodeJSelect.disabled = true;
            this.populateDagNodeSelect(this.dagPathNodeJSelect, null, 'Cluster j');
            this.updateDagPathValue();
            return;
        }

        this.populateDagNodeSelect(this.dagPathNodeJSelect, levelM, 'Cluster j');
        this.dagPathNodeJSelect.disabled = false;
        this.updateDagPathValue();
    }

    buildDagPathCache(dagData) {
        if (!dagData?.graph?.nodes || !dagData?.graph?.links) {
            this.dagPathCache = null;
            return;
        }

        const totalNodes = dagData.graph.nodes.length;
        const adjacency = Array.from({ length: totalNodes + 1 }, () => []);
        const indegree = new Array(totalNodes + 1).fill(0);

        dagData.graph.links.forEach(link => {
            const source = link.source;
            const target = link.target;
            let cost = link.cost;
            if (!Number.isFinite(cost)) {
                const weight = link.weight;
                cost = (typeof weight === 'number' && weight > 0) ? -Math.log(weight) : Infinity;
            }
            adjacency[source].push({ target, cost });
            indegree[target] += 1;
        });

        const queue = [];
        for (let i = 1; i <= totalNodes; i++) {
            if (indegree[i] === 0) queue.push(i);
        }

        const topoOrder = [];
        let idx = 0;
        while (idx < queue.length) {
            const node = queue[idx++];
            topoOrder.push(node);
            adjacency[node].forEach(edge => {
                indegree[edge.target] -= 1;
                if (indegree[edge.target] === 0) queue.push(edge.target);
            });
        }

        this.dagPathCache = {
            adjacency,
            topoOrder,
            totalNodes
        };
    }

    calculateDagMostProbablePath(sourceId, targetId) {
        if (!this.dagPathCache) return null;

        const { adjacency, topoOrder, totalNodes } = this.dagPathCache;
        if (sourceId < 1 || sourceId > totalNodes || targetId < 1 || targetId > totalNodes) {
            return null;
        }

        const dist = new Array(totalNodes + 1).fill(Infinity);
        const prev = new Array(totalNodes + 1).fill(null);
        dist[sourceId] = 0;

        topoOrder.forEach(node => {
            const current = dist[node];
            if (!Number.isFinite(current)) return;
            adjacency[node].forEach(edge => {
                if (!Number.isFinite(edge.cost)) return;
                const candidate = current + edge.cost;
                if (candidate < dist[edge.target]) {
                    dist[edge.target] = candidate;
                    prev[edge.target] = node;
                }
            });
        });

        if (!Number.isFinite(dist[targetId])) {
            return null;
        }

        const path = [];
        let cursor = targetId;
        while (cursor !== null && cursor !== undefined) {
            path.push(cursor);
            if (cursor === sourceId) break;
            cursor = prev[cursor];
        }

        if (path[path.length - 1] !== sourceId) {
            return null;
        }

        path.reverse();
        return {
            path,
            totalCost: dist[targetId],
            totalProbability: Math.exp(-dist[targetId])
        };
    }

    buildDagPathHighlightMaps() {
        this.dagNodeElementMap = new Map();
        this.dagEdgeElementMap = new Map();
        this.dagArrowElementMap = new Map();

        const nodePositions = this.dagInteractionManager?.nodePositions || [];
        nodePositions.forEach(node => {
            if (node?.globalId && node?.element) {
                this.dagNodeElementMap.set(node.globalId, node.element);
            }
        });

        const edgeData = this.dagInteractionManager?.svgIndexToEdgeData || {};
        Object.values(edgeData).forEach(entry => {
            const source = entry?.jsonEdge?.source;
            const target = entry?.jsonEdge?.target;
            const element = entry?.svgElement;
            if (source && target && element) {
                this.dagEdgeElementMap.set(`${source}-${target}`, element);
            }
        });

        const svgElement = this.currentDagSvgElement;
        if (!svgElement) return;

        const arrowElements = Array.from(
            svgElement.querySelectorAll('path[fill-rule="nonzero"][fill]:not([fill="none"])')
        ).filter(el => el.getAttribute('stroke-linejoin') !== 'miter');

        const arrowCenters = arrowElements.map(element => {
            const pathData = element.getAttribute('d') || '';
            const coordMatches = pathData.matchAll(/([\d.]+)\s+([\d.]+)/g);
            let minX = Infinity;
            let maxX = -Infinity;
            let minY = Infinity;
            let maxY = -Infinity;
            let count = 0;

            for (const match of coordMatches) {
                const x = parseFloat(match[1]);
                const y = parseFloat(match[2]);
                if (Number.isNaN(x) || Number.isNaN(y)) continue;
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);
                count += 1;
            }

            if (count === 0) return null;
            return {
                element,
                x: (minX + maxX) / 2,
                y: (minY + maxY) / 2
            };
        }).filter(Boolean);

        const usedArrows = new Set();
        const maxDistance = 30;

        Object.values(edgeData).forEach(entry => {
            const source = entry?.jsonEdge?.source;
            const target = entry?.jsonEdge?.target;
            const coords = entry?.coordinates;
            if (!source || !target || !coords) return;

            let best = null;
            let bestDist = Infinity;

            arrowCenters.forEach((arrow, index) => {
                if (usedArrows.has(index)) return;
                const dx = arrow.x - coords.end.x;
                const dy = arrow.y - coords.end.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < bestDist) {
                    bestDist = dist;
                    best = { arrow, index };
                }
            });

            if (best && bestDist <= maxDistance) {
                this.dagArrowElementMap.set(`${source}-${target}`, best.arrow.element);
                usedArrows.add(best.index);
            }
        });
    }

    clearDagPathHighlight() {
        this.dagPathHighlightedNodes.forEach(node => {
            node.classList.remove('path-highlight-node');
        });
        this.dagPathHighlightedEdges.forEach(edge => {
            edge.classList.remove('path-highlight-edge');
        });
        this.dagPathHighlightedArrows.forEach(arrow => {
            arrow.classList.remove('path-highlight-arrow');
        });
        this.dagPathHighlightedNodes = [];
        this.dagPathHighlightedEdges = [];
        this.dagPathHighlightedArrows = [];
    }

    applyDagPathHighlight(path) {
        if (!Array.isArray(path) || path.length === 0) return;

        this.clearDagPathHighlight();

        path.forEach(nodeId => {
            const nodeElement = this.dagNodeElementMap?.get(nodeId);
            if (nodeElement) {
                nodeElement.classList.add('path-highlight-node');
                this.dagPathHighlightedNodes.push(nodeElement);
            }
        });

        for (let i = 0; i < path.length - 1; i++) {
            const source = path[i];
            const target = path[i + 1];
            const edgeElement = this.dagEdgeElementMap?.get(`${source}-${target}`);
            if (edgeElement) {
                edgeElement.classList.add('path-highlight-edge');
                this.dagPathHighlightedEdges.push(edgeElement);
            }

            const arrowElement = this.dagArrowElementMap?.get(`${source}-${target}`);
            if (arrowElement) {
                arrowElement.classList.add('path-highlight-arrow');
                this.dagPathHighlightedArrows.push(arrowElement);
            }
        }
    }

    updateDagPathValue() {
        if (!this.dagPathValue) return;

        const nodeI = parseInt(this.dagPathNodeISelect.value, 10);
        const levelN = parseInt(this.dagPathLevelNSelect.value, 10);
        const nodeJ = parseInt(this.dagPathNodeJSelect.value, 10);
        const levelM = parseInt(this.dagPathLevelMSelect.value, 10);

        if (!Number.isInteger(nodeI) || !Number.isInteger(levelN) ||
            !Number.isInteger(nodeJ) || !Number.isInteger(levelM) || levelM >= levelN) {
            this.dagPathValue.textContent = '\u2014';
            this.clearDagPathHighlight();
            return;
        }

        try {
            const sourceId = this.dagIndexUtils.globalIndexFromLevel(levelN, nodeI);
            const targetId = this.dagIndexUtils.globalIndexFromLevel(levelM, nodeJ);
            const result = this.calculateDagMostProbablePath(sourceId, targetId);

            if (result && Number.isFinite(result.totalProbability)) {
                this.dagPathValue.textContent = result.totalProbability.toFixed(2);
                this.applyDagPathHighlight(result.path);
            } else {
                this.dagPathValue.textContent = 'none';
                this.clearDagPathHighlight();
            }
        } catch (error) {
            Logger.warn('Failed to compute DAG most probable path:', error.message);
            this.dagPathValue.textContent = 'none';
            this.clearDagPathHighlight();
        }
    }

    // =========================================================================
    // DAG SECTION METHODS
    // =========================================================================

    async loadDAGSVG(filename) {
        if (!this.isInitialized) {
            Logger.error('App not initialized');
            return;
        }

        try {
            Logger.debug(`Loading DAG visualization: ${filename}`);
            
            // Show loading state
            this.showDAGLoading();
            this.hideDAGError();
            this.resetDagProbabilityControls();
            this.setDagProbabilityControlsEnabled(false);
            this.resetDagPathControls();
            this.setDagPathControlsEnabled(false);
            
            // Load and validate DAG data
            Logger.debug('Loading DAG data and validation...');
            const { kMaxData, dagData, validationResults } = await this.dagDataLoader.loadAndValidateData();
            
            if (!validationResults.kMaxValidation || !validationResults.nodeCountValidation) {
                throw new Error('DAG data validation failed. Check console for details.');
            }
            
            Logger.info('DAG data loaded and validated successfully');
            
            // Load SVG file
            Logger.debug(`Loading DAG SVG: ${filename}`);
            const response = await fetch(filename);
            if (!response.ok) {
                throw new Error(`Failed to load SVG: HTTP ${response.status}`);
            }
            
            const svgText = await response.text();
            const parser = new DOMParser();
            const svgDoc = parser.parseFromString(svgText, "image/svg+xml");
            const svgElement = svgDoc.documentElement;
            
            if (!svgElement || svgElement.tagName.toLowerCase() !== 'svg') {
                throw new Error('Invalid SVG content');
            }
            
            // Clear previous content and add new SVG
            const dagContainer = document.querySelector(SELECTORS.DAG_SVG_CONTAINER);
            dagContainer.innerHTML = '';
            dagContainer.appendChild(svgElement);
            
            // Store reference to current DAG SVG element for highlighting
            this.currentDagSvgElement = svgElement;
            
            // Clear previous date highlighting
            this.clearDAGDateHighlighting();
            
            // Parse DAG data
            Logger.debug('Parsing DAG data...');
            this.dagParser.parseDAGData(dagData, kMaxData);
            
            const summary = this.dagParser.getSummary();
            Logger.info(`DAG parsed: ${summary.totalNodes} nodes, ${summary.totalEdges} edges across ${summary.levels} levels`);
            
            // Setup DAG interactions
            Logger.debug('Setting up DAG interactions...');
            this.dagInteractionManager.setupDAGInteractions(svgElement);

            this.setupDagProbabilityControls(kMaxData, dagData);
            this.setupDagPathControls(kMaxData, dagData);
            
            // Hide loading and show content
            this.hideDAGLoading();
            dagContainer.style.display = 'block';
            
            Logger.info('DAG visualization loaded successfully');
            
            // Load affiliation matrices for all levels (0-24)
            await this.loadAllDAGAffiliationMatrices();
            
            // Log validation results
            if (validationResults.mp4Validation) {
                Logger.info('✅ MP4 file validation passed');
            } else {
                Logger.warn('⚠️ MP4 file validation failed - videos may not load correctly');
            }
            
            // Run data consistency validation against all corresponding Markov Chain files
            Logger.debug('--- Running Full Data Consistency Validation (Levels 1-24) ---');
            const validationPromises = [];
            for (let level = 1; level <= 24; level++) {
                validationPromises.push(this.validateDAGDataConsistency(level));
            }
            await Promise.all(validationPromises);
            Logger.debug('--- Full Data Consistency Validation Complete ---');

        } catch (error) {
            Logger.error('Failed to load DAG visualization:', error);
            this.hideDAGLoading();
            this.showDAGError('Failed to load DAG visualisation: ' + error.message);
            this.setDagProbabilityControlsEnabled(false);
            this.setDagPathControlsEnabled(false);
        }
    }

    /**
     * Validates that the node data in the DAG (lambda, ev) is consistent with
     * the data in the corresponding Markov Chain JSON file for a given level.
     * @param {number} level - The level (lead time) to validate.
     */
    async validateDAGDataConsistency(level) {
        Logger.debug(`--- Running Data Consistency Validation for Level ${level} ---`);
        let mismatches = 0;
        let isValid = false;

        try {
            // 1. Get DAG nodes for the specified level from the already-parsed data
            const dagNodesAtLevel = this.dagParser.getNodesAtLevel(level);
            if (!dagNodesAtLevel || Object.keys(dagNodesAtLevel).length === 0) {
                throw new Error(`No DAG nodes found for level ${level}.`);
            }

            // 2. Load and parse the corresponding Markov Chain JSON file
            const mcJsonFilename = `json_files/transition_graph_data_${level}months.json`;
            const response = await fetch(mcJsonFilename);
            if (!response.ok) throw new Error(`Could not load ${mcJsonFilename} (HTTP ${response.status})`);
            const mcData = await response.json();
            const mcParser = new JSONParser();
            mcParser.parseAndValidate(mcData);
            const mcNodes = mcParser.getAllNodes();

            // 3. Compare node counts
            if (Object.keys(dagNodesAtLevel).length !== mcNodes.length) {
                Logger.error(`Validation Error: Node count mismatch at level ${level}. DAG has ${Object.keys(dagNodesAtLevel).length}, Markov Chain has ${mcNodes.length}.`);
                mismatches++;
            }

            // 4. Iterate over Markov Chain nodes and compare with corresponding DAG nodes
            for (const mcNode of mcNodes) {
                const localIdx = mcNode.id; // In MC JSON, 'id' is the local cluster index
                const dagNode = Object.values(dagNodesAtLevel).find(n => n.local_idx === localIdx);

                if (!dagNode) {
                    Logger.error(`Validation Error: MC Node ${localIdx} not found in DAG data for level ${level}.`);
                    mismatches++;
                    continue;
                }

                // Compare 'ev' (expected value)
                if (Math.abs(dagNode.ev - mcNode.ev) > 0.0001) {
                    Logger.error(`EV Mismatch for Lvl ${level}, Local ${localIdx}: DAG=${dagNode.ev}, MC=${mcNode.ev}`);
                    mismatches++;
                }

                // Compare 'lambda' (class probabilities)
                const dagLambda = this.dagParser.getNodeData(dagNode.id)?.lambda;
                const mcLambda = mcParser.getNodeLambdaValues(localIdx);
                if (JSON.stringify(dagLambda) !== JSON.stringify(mcLambda)) {
                    Logger.error(`Lambda Mismatch for Lvl ${level}, Local ${localIdx}:`);
                    Logger.error('  DAG:', dagLambda);
                    Logger.error('  MC: ', mcLambda);
                    mismatches++;
                }
            }

        } catch (error) {
            Logger.error(`Data consistency validation failed for level ${level}: ${error.message}`);
            mismatches++;
        }

        if (mismatches === 0) {
            Logger.debug(`✅ --- Data Consistency Validation for Level ${level} PASSED ---`);
            isValid = true;
        } else {
            Logger.error(`❌ --- Data Consistency Validation for Level ${level} FAILED with ${mismatches} mismatch(es) ---`);
        }
        
        return isValid;
    }

    showError(message) {
        const errorElement = document.querySelector(SELECTORS.ERROR);
        if (errorElement) {
            errorElement.innerHTML = message;
            errorElement.style.display = 'block';
        }
        Logger.error('App Error:', message);
    }

    showDAGError(message) {
        const errorElement = document.querySelector(SELECTORS.DAG_ERROR);
        if (errorElement) {
            errorElement.innerHTML = message;
            errorElement.style.display = 'block';
        }
        Logger.error('DAG App Error:', message);
    }
    
    showDAGLoading() {
        const loadingElement = document.querySelector(SELECTORS.DAG_LOADING);
        if (loadingElement) {
            loadingElement.style.display = 'block';
        }
        const dagContainer = document.querySelector(SELECTORS.DAG_SVG_CONTAINER);
        if (dagContainer) {
            dagContainer.style.display = 'none';
        }
    }
    
    hideDAGLoading() {
        const loadingElement = document.querySelector(SELECTORS.DAG_LOADING);
        if (loadingElement) {
            loadingElement.style.display = 'none';
        }
    }

    hideError() {
        const errorElement = document.querySelector(SELECTORS.ERROR);
        if (errorElement) {
            errorElement.style.display = 'none';
        }
    }

    hideDAGError() {
        const errorElement = document.querySelector(SELECTORS.DAG_ERROR);
        if (errorElement) {
            errorElement.style.display = 'none';
        }
    }
    
    // Method to show date images (for DAG node modals)
    showDateImage(dateString) {
        try {
            // Construct the image filename
            const imageFilename = `png_files/${dateString}.png`;
            
            // Create modal content for the date image
            const modalContent = `
                <div class="modal-header">
                    <h3>Climate Data for ${dateString}</h3>
                </div>
                <div class="modal-image-container">
                    <img src="${imageFilename}" alt="Climate data for ${dateString}" style="max-width: 100%; height: auto;">
                </div>
                <div class="modal-info">
                    <p>This image shows the climate data pattern for the selected date.</p>
                    <p><strong>Date:</strong> ${dateString}</p>
                </div>
            `;
            
            // Use existing modal infrastructure
            const modal = document.querySelector(SELECTORS.MODAL);
            const modalBody = document.querySelector(SELECTORS.MODAL_BODY);
            
            if (modal && modalBody) {
                modalBody.innerHTML = modalContent;
                modal.style.display = 'block';
                
                // Handle image load errors
                const img = modalBody.querySelector('img');
                if (img) {
                    img.onerror = () => {
                        modalBody.innerHTML = `
                            <div class="modal-header">
                                <h3>Image Not Available</h3>
                            </div>
                            <div class="modal-info">
                                <p>Sorry, the image for ${dateString} could not be loaded.</p>
                                <p>This may be because the image file does not exist or there was a network error.</p>
                            </div>
                        `;
                    };
                }
            }
            
        } catch (error) {
            Logger.error('Failed to show date image:', error);
        }
    }

    // Utility methods for external access
    getCurrentSVG() {
        return this.uiController.getSelectedSvg();
    }

    getCurrentSeason() {
        return this.uiController.getSelectedSeason();
    }

    getAvailableLeadTimes() {
        return this.uiController.getAvailableLeadTimes();
    }

    loadByLeadTime(leadTime, season = 'all') {
        const svgOption = this.uiController.getOptionByLeadTime(leadTime);
        const seasonOption = this.uiController.seasonOptions.find(s => s.value === season);
        
        if (svgOption && seasonOption) {
            this.uiController.setSelectedSvg(svgOption);
            this.uiController.setSelectedSeason(seasonOption);
            const finalSelection = this.uiController.buildFinalSelection();
            this.loadSVG(finalSelection.finalFilename);
        } else {
            this.showError(`No option found for lead time: ${leadTime} months, season: ${season}`);
        }
    }

    /**
     * Enhanced cross-system validation using unified validation utilities
     * @param {number} leadTime - Lead time to compare
     * @returns {Promise<Object>} - Validation results
     */
    async validateCrossSystemCompatibilityEnhanced(leadTime) {
        try {
            Logger.info(`Starting enhanced cross-system validation for lead time ${leadTime}`);

            // Load Markov Chain data for the specified lead time
            const markovFilename = `json_files/transition_graph_data_${leadTime}months.json`;
            const markovData = await this.svgLoader.loadFile(markovFilename, 'json');

            // Get DAG data (should already be loaded)
            if (!this.dagDataLoader.dagData) {
                await this.dagDataLoader.loadDAGData();
            }

            const dagData = this.dagDataLoader.dagData;

            // Perform cross-system validation using the new unified system
            const validationResult = BaseParser.validateCrossSystemCompatibility(
                markovData, 
                dagData, 
                {
                    checkNodeConsistency: true,
                    checkLambdaConsistency: true,
                    checkDateConsistency: true,
                    leadTimeLevel: leadTime
                }
            );

            // Log detailed results
            Logger.info('Enhanced cross-system validation completed:', {
                isCompatible: validationResult.isCompatible,
                compatibilityRatio: validationResult.details.compatibilityRatio,
                lambdaMatchRatio: validationResult.details.lambdaMatchRatio,
                commonNodes: validationResult.statistics.commonNodes,
                totalIssues: validationResult.issues.length
            });

            if (validationResult.issues.length > 0) {
                Logger.warn('Cross-system validation issues found:', validationResult.issues);
            }

            return validationResult;

        } catch (error) {
            Logger.error('Enhanced cross-system validation failed:', error);
            throw error;
        }
    }

    /**
     * Run comprehensive validation suite using Phase 5 enhancements
     * @returns {Promise<Object>} - Complete validation results
     */
    async runEnhancedValidationSuite() {
        const results = {
            timestamp: new Date().toISOString(),
            phase5EnhancementsUsed: true,
            dagValidation: null,
            fileValidation: null,
            crossSystemValidations: [],
            summary: {
                totalTests: 0,
                passedTests: 0,
                failedTests: 0
            }
        };

        try {
            Logger.info('Starting comprehensive validation suite with Phase 5 enhancements');

            // 1. Enhanced file validation using batch processing
            Logger.debug('Running enhanced file validation...');
            const testFiles = [
                'json_files/transition_graph_data_1months.json',
                'json_files/transition_graph_data_12months.json',
                'json_files/vertical_transition_graph.json',
                'json_files/K_max.json'
            ];
            
            results.fileValidation = await this.svgLoader.validateFilesExist(
                testFiles, 
                'critical JSON files',
                {
                    useCache: true,
                    batchSize: 2,
                    retryFailures: true
                }
            );
            
            results.summary.totalTests++;
            if (results.fileValidation.isValid) {
                results.summary.passedTests++;
            } else {
                results.summary.failedTests++;
            }

            // 2. Validate DAG data integrity
            if (this.dagDataLoader.validationResults) {
                results.dagValidation = this.dagDataLoader.validationResults;
                results.summary.totalTests++;
                if (Object.values(results.dagValidation).every(v => v)) {
                    results.summary.passedTests++;
                } else {
                    results.summary.failedTests++;
                }
            }

            // 3. Run enhanced cross-system validation for sample lead times
            const sampleLeadTimes = [1, 6, 12, 24];
            
            for (const leadTime of sampleLeadTimes) {
                try {
                    const crossValidation = await this.validateCrossSystemCompatibilityEnhanced(leadTime);
                    results.crossSystemValidations.push({
                        leadTime,
                        result: crossValidation
                    });
                    
                    results.summary.totalTests++;
                    if (crossValidation.isCompatible) {
                        results.summary.passedTests++;
                    } else {
                        results.summary.failedTests++;
                    }
                } catch (error) {
                    Logger.warn(`Enhanced cross-system validation failed for lead time ${leadTime}:`, error);
                    results.crossSystemValidations.push({
                        leadTime,
                        error: error.message
                    });
                    results.summary.totalTests++;
                    results.summary.failedTests++;
                }
            }

            // Calculate success rate
            results.summary.successRate = results.summary.totalTests > 0 
                ? (results.summary.passedTests / results.summary.totalTests * 100).toFixed(1)
                : 0;

            Logger.info('Enhanced validation suite completed:', results.summary);
            return results;

        } catch (error) {
            Logger.error('Enhanced validation suite failed:', error);
            results.summary.error = error.message;
            return results;
        }
    }

    /**
     * Initialize only the Markov Chain section (for markov-chain.html page)
     */
    async initializeMarkovChainSection() {
        try {
            Logger.info('Initializing Markov Chain section only...');

            // Initialize Markov Chain section
            this.svgLoader.initialize(
                document.querySelector(SELECTORS.LOADING),
                document.querySelector(SELECTORS.ERROR),
                document.querySelector(SELECTORS.SVG_CONTAINER)
            );

            this.uiController.initialize();
            this.interactionManager.initialize();

            // Initialize date slider elements
            this.dateSlider = document.querySelector(SELECTORS.DATE_SLIDER);
            this.dateSliderLabel = document.querySelector(SELECTORS.DATE_SLIDER_LABEL);
            this.dateSliderPrev = document.querySelector(SELECTORS.DATE_SLIDER_PREV);
            this.dateSliderNext = document.querySelector(SELECTORS.DATE_SLIDER_NEXT);
            this.setupDateSlider();
            this.initializeMFPTControls();

            // Set up Markov Chain callbacks
            this.uiController.setOnSvgSelectedCallback((finalSelection) => {
                this.loadSVG(finalSelection.finalFilename);
            });

            this.isInitialized = true;
            Logger.info('Markov Chain section initialized successfully');

        } catch (error) {
            Logger.error('Failed to initialize Markov Chain section:', error);
            this.showError('Failed to initialise Markov Chain section: ' + error.message);
        }
    }

    /**
     * Initialize only the DAG section (for dag.html page)
     */
    async initializeDAGSection() {
        try {
            Logger.info('Initializing DAG section only...');
            
            // Initialize DAG section with different selectors
            this.dagSvgLoader.initialize(
                document.querySelector(SELECTORS.DAG_LOADING),
                document.querySelector(SELECTORS.DAG_ERROR),
                document.querySelector(SELECTORS.DAG_SVG_CONTAINER)
            );

            const dagSelectors = {
                seasonInput: SELECTORS.DAG_SEASON_INPUT,
                seasonDropdown: SELECTORS.DAG_SEASON_DROPDOWN,
                seasonDropdownContent: SELECTORS.DAG_SEASON_DROPDOWN_CONTENT,
                loadButton: SELECTORS.DAG_LOAD_BUTTON
            };
            
            this.dagUiController = new UIController(dagSelectors, true); // true for season-only mode
            this.dagUiController.initialize();
            this.dagInteractionManager.initialize();

            // Initialize DAG date slider elements
            this.dagDateSlider = document.querySelector(SELECTORS.DAG_DATE_SLIDER);
            this.dagDateSliderLabel = document.querySelector(SELECTORS.DAG_DATE_SLIDER_LABEL);
            this.dagDateSliderPrev = document.querySelector(SELECTORS.DAG_DATE_SLIDER_PREV);
            this.dagDateSliderNext = document.querySelector(SELECTORS.DAG_DATE_SLIDER_NEXT);
            this.setupDAGDateSlider();
            this.initializeDagProbabilityControls();
            this.initializeDagPathControls();

            // Set up DAG callbacks
            this.dagUiController.setOnSvgSelectedCallback((finalSelection) => {
                // Check if season other than "All" is selected
                if (finalSelection.seasonValue !== 'all') {
                    this.showDAGError(`Season-specific DAG visualisations are not yet available. Please select "All" to view the combined DAG visualisation.`);
                    return;
                }
                this.hideDAGError();
                this.loadDAGSVG(finalSelection.finalFilename);
            });

            this.isInitialized = true;
            Logger.info('DAG section initialized successfully');

        } catch (error) {
            Logger.error('Failed to initialize DAG section:', error);
            this.showDAGError('Failed to initialise DAG section: ' + error.message);
        }
    }

    /**
     * Initialize only the Case Study section (for case-studies.html page)
     */
    async initializeCaseStudySection() {
        try {
            Logger.info('Initializing Case Study section only...');
            
            // Initialize case study controller
            this.caseStudyController.initialize();
            
            // Initialize data loader with case study elements
            this.caseStudyDataLoader.initialize(
                document.querySelector(SELECTORS.CASE_STUDY_LOADING),
                document.querySelector(SELECTORS.CASE_STUDY_ERROR)
            );
            
            // Set up case study callback
            this.caseStudyController.setOnCaseStudySelectedCallback((caseStudyData) => {
                this.loadCaseStudy(caseStudyData);
            });

            this.isInitialized = true;
            Logger.info('Case Study section initialized successfully');

        } catch (error) {
            Logger.error('Failed to initialize Case Study section:', error);
            this.showCaseStudyError('Failed to initialize Case Study section: ' + error.message);
        }
    }

    /**
     * Load and display case study content
     * @param {Object} caseStudyData - Case study parameters and file paths
     */
    async loadCaseStudy(caseStudyData) {
        if (!this.isInitialized) {
            Logger.error('App not initialized');
            return;
        }

        try {
            Logger.debug('Loading case study:', caseStudyData);
            
            this.caseStudyController.showLoading();
            
            // Validate file existence first
            const caseStudyVideoExists = await this.caseStudyDataLoader.fileExists(caseStudyData.filePaths.caseStudyVideo);
            const groundTruthVideoExists = await this.caseStudyDataLoader.fileExists(caseStudyData.filePaths.groundTruthVideo);
            const groundTruthDetrendedExists = await this.caseStudyDataLoader.fileExists(caseStudyData.filePaths.groundTruthVideoDetrended);
            
            let errorMessages = [];
            if (!caseStudyVideoExists) {
                errorMessages.push(`Case study video not found: ${caseStudyData.filePaths.caseStudyVideo}`);
            }
            if (!groundTruthVideoExists) {
                errorMessages.push(`Ground truth video not found: ${caseStudyData.filePaths.groundTruthVideo}`);
            }
            if (!groundTruthDetrendedExists) {
                errorMessages.push(`Detrended ground truth video not found: ${caseStudyData.filePaths.groundTruthVideoDetrended}`);
            }
            
            if (errorMessages.length > 0) {
                throw new Error(errorMessages.join('\n'));
            }
            
            // Files exist, display the case study
            this.caseStudyController.displayCaseStudy(caseStudyData);
            
            Logger.info('Case study loaded successfully:', {
                target: caseStudyData.target.displayString
            });

        } catch (error) {
            Logger.error('Failed to load case study:', error);
            this.caseStudyController.showError('Failed to load case study: ' + error.message);
        }
    }

    /**
     * Show case study error message
     * @param {string} message - Error message
     */
    showCaseStudyError(message) {
        const errorElement = document.querySelector(SELECTORS.CASE_STUDY_ERROR);
        if (errorElement) {
            errorElement.innerHTML = message;
            errorElement.style.display = 'block';
        }
        Logger.error('Case Study App Error:', message);
    }

    reset() {
        // Reset Markov Chain section
        this.uiController.reset();
        this.hideError();
        
        const svgContainer = document.querySelector(SELECTORS.SVG_CONTAINER);
        if (svgContainer) {
            svgContainer.style.display = 'none';
            svgContainer.innerHTML = '';
        }
        
        // Reset DAG section
        this.dagUiController.reset();
        this.hideDAGError();
        
        const dagSvgContainer = document.querySelector(SELECTORS.DAG_SVG_CONTAINER);
        if (dagSvgContainer) {
            dagSvgContainer.style.display = 'none';
            dagSvgContainer.innerHTML = '';
        }
    }
}

// Global initialization removed - each page now handles its own initialization
// via page-specific initialization methods (initializeMarkovChainSection, initializeDAGSection, etc.)
