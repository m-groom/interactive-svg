import { CONFIG, ERROR_MESSAGES } from './constants.js';
import { JSONParser } from './JSONParser.js';
import { Logger } from './Logger.js';
import { Utils } from './Utils.js';
import { ErrorHandler, DataLoadError } from './ErrorHandler.js';
import { BaseDataLoader } from './BaseDataLoader.js';

export class SVGLoader extends BaseDataLoader {
    constructor() {
        super();
        this.jsonParser = new JSONParser();
        this.currentSvgFile = '';
        this.svgContainer = null;
    }

    initialize(loadingElement, errorElement, svgContainer) {
        super.initialize(loadingElement, errorElement);
        this.svgContainer = svgContainer;
    }

    async loadSVGWithData(filename) {
        if (!filename) {
            throw new Error(ERROR_MESSAGES.NO_SVG_FILE);
        }

        this.currentSvgFile = filename;
        this.showLoading();
        this.hideError();

        return await this.loadWithErrorHandling(async () => {
            // Load both SVG and JSON in parallel
            const [svgData, jsonData] = await Promise.all([
                this.loadSVG(filename),
                this.loadJSON(filename)
            ]);

            // Validate JSON structure if JSON data exists
            if (jsonData) {
                this.jsonParser.parseAndValidate(jsonData);
            }

            // Return both data sets
            return {
                svgElement: svgData,
                jsonData: jsonData,
                jsonParser: this.jsonParser
            };
        }, `load SVG with data from ${filename}`);
    }

    async loadSVG(filename) {
        const svgText = await this.loadFile(filename, 'text', { useCache: true });
        
        // Use DOMParser for safer SVG handling
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(svgText, "image/svg+xml");
        const svgElement = svgDoc.documentElement;

        // Check for parsing errors
        if (svgElement && typeof svgElement.getElementsByTagName === 'function' && 
            svgElement.getElementsByTagName('parsererror').length > 0) {
            throw new Error(ERROR_MESSAGES.SVG_PARSE_ERROR);
        }

        if (!svgElement || svgElement.tagName.toLowerCase() !== 'svg') {
            throw new Error(ERROR_MESSAGES.INVALID_SVG);
        }

        // Clear previous SVG and add new one
        if (this.svgContainer) {
            this.svgContainer.innerHTML = '';
            this.svgContainer.appendChild(svgElement);
        }

        return svgElement;
    }

    async loadJSON(svgFilename) {
        const jsonFilename = this.getJsonFilename(svgFilename);
        if (!jsonFilename) {
            Logger.warn(`No corresponding JSON file pattern found for ${svgFilename}`);
            return null;
        }

        try {
            const jsonData = await this.loadFile(jsonFilename, 'json', { useCache: true });
            Logger.debug(`Successfully loaded JSON data from ${jsonFilename}`);
            return jsonData;
        } catch (error) {
            Logger.warn(`Could not load JSON file ${jsonFilename}:`, error.message);
            return null;
        }
    }

    getJsonFilename(svgFilename) {
        // Convert SVG filename to corresponding JSON filename
        // e.g., svg_files/transition_graph_12months.svg -> json_files/transition_graph_data_12months.json
        const match = svgFilename.match(CONFIG.SVG_FILENAME_PATTERN);
        if (match) {
            const leadTime = match[1];
            return Utils.generateJSONFilename(leadTime);
        }
        return null;
    }

    extractLeadTime(svgFilename) {
        // Extract lead time from SVG filename
        // e.g., transition_graph_12months.svg -> 12
        if (svgFilename && svgFilename.includes('transition_graph_')) {
            const match = svgFilename.match(CONFIG.SVG_FILENAME_PATTERN);
            if (match) {
                return parseInt(match[1]);
            }
        }
        return null;
    }

    getCurrentSvgFile() {
        return this.currentSvgFile;
    }

    getCurrentLeadTime() {
        return this.extractLeadTime(this.currentSvgFile);
    }

    showLoading() {
        super.showLoading();
        if (this.svgContainer) {
            this.svgContainer.style.display = 'none';
        }
    }

    hideLoading() {
        super.hideLoading();
        if (this.svgContainer) {
            this.svgContainer.style.display = 'block';
        }
    }

    showError(message, error = null) {
        const errorMessage = ERROR_MESSAGES.SVG_LOAD_FAILED.replace('{filename}', this.currentSvgFile);
        super.showError(errorMessage, error);
    }

    generateVideoFilename(nodeNumber, leadTime) {
        return Utils.generateVideoFilename(nodeNumber, leadTime);
    }
}