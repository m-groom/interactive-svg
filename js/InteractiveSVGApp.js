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

        // DAG affiliation matrix state (DAG date slider)
        this.dagAffiliationData = {}; // Map: level -> {dates, affiliations}
        this.dagDateSlider = null;
        this.dagDateSliderLabel = null;
        this.dagDateSliderPrev = null;
        this.dagDateSliderNext = null;
        this.currentDagSvgElement = null;
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
            this.showError('Failed to initialize application: ' + error.message);
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
            }

        } catch (error) {
            Logger.error('Failed to load SVG:', error);
            this.showError('Failed to load visualization: ' + error.message);
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
            this.showDAGError('Failed to load DAG visualization: ' + error.message);
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

            // Set up Markov Chain callbacks
            this.uiController.setOnSvgSelectedCallback((finalSelection) => {
                this.loadSVG(finalSelection.finalFilename);
            });

            this.isInitialized = true;
            Logger.info('Markov Chain section initialized successfully');

        } catch (error) {
            Logger.error('Failed to initialize Markov Chain section:', error);
            this.showError('Failed to initialize Markov Chain section: ' + error.message);
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

            // Set up DAG callbacks
            this.dagUiController.setOnSvgSelectedCallback((finalSelection) => {
                this.loadDAGSVG(finalSelection.finalFilename);
            });

            this.isInitialized = true;
            Logger.info('DAG section initialized successfully');

        } catch (error) {
            Logger.error('Failed to initialize DAG section:', error);
            this.showDAGError('Failed to initialize DAG section: ' + error.message);
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
            const videoExists = await this.caseStudyDataLoader.fileExists(caseStudyData.filePaths.video);
            const imageExists = await this.caseStudyDataLoader.fileExists(caseStudyData.filePaths.image);
            
            let errorMessages = [];
            if (!videoExists) {
                errorMessages.push(`Video file not found: ${caseStudyData.filePaths.video}`);
            }
            if (!imageExists) {
                errorMessages.push(`Image file not found: ${caseStudyData.filePaths.image}`);
            }
            
            if (errorMessages.length > 0) {
                throw new Error(errorMessages.join('\n'));
            }
            
            // Files exist, display the case study
            this.caseStudyController.displayCaseStudy(
                caseStudyData,
                caseStudyData.filePaths.video,
                caseStudyData.filePaths.image
            );
            
            Logger.info('Case study loaded successfully:', {
                target: caseStudyData.target.displayString,
                leadTime: caseStudyData.leadTime,
                initial: caseStudyData.initial.displayString
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