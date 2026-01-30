// Constants for the Interactive SVG application

// Debug configuration - set to true to enable debug logging
export const DEBUG = false;

export const CONFIG = {
    // UI Constants
    MOBILE_BREAKPOINT: 768,
    MIN_COLUMN_WIDTH_REM: 20,
    MAX_COLUMN_WIDTH_REM: 40,
    GAP_REM: 2,
    MODAL_PADDING_REM: 4,
    MAX_VIDEO_HEIGHT_VH: 60,
    
    // Video aspect ratios
    VIDEO_ASPECT_RATIO: 3634 / 4457,           // Composite/case study videos
    IMPORTANCE_VIDEO_ASPECT_RATIO: 3634 / 4534, // Importance/correlation videos
    
    // Search and interaction
    MAX_TOOLTIP_WIDTH_VW: 90,
    DROPDOWN_MAX_HEIGHT: 200,
    NODE_PROXIMITY_THRESHOLD: 50,
    SELF_LOOP_DISTANCE_THRESHOLD: 50,
    
    // Animation timings
    TOOLTIP_TRANSITION_MS: 300,
    MODAL_TRANSITION_MS: 300,
    MODAL_SHOW_DELAY_MS: 10,
    
    // Loading defaults
    DEFAULT_TIMEOUT: 30000,
    DEFAULT_RETRIES: 1,
    LONG_PRESS_DELAY: 500,
    TOOLTIP_DELAY: 3000,
    
    // File patterns and templates
    SVG_FILENAME_PATTERN: /transition_graph_(\d+)months\.svg/,
    JSON_FILENAME_TEMPLATE: 'json_files/transition_graph_data_{leadTime}months.json',
    VIDEO_FILENAME_TEMPLATE: 'mp4_files/combined-cluster{nodeNumber}-{leadTime}months.mp4',
    PNG_FILENAME_TEMPLATE: 'png_files/{dateString}.png',
    
    // Validation settings
    LAMBDA_SUM_TOLERANCE: 0.001,
    VALIDATION_RETRY_COUNT: 3,
    VALIDATION_RETRY_DELAY: 1000,
    
    // File checking settings
    FILE_CHECK_TIMEOUT: 5000,
    BATCH_FILE_CHECK_SIZE: 10,
    
    // Lead time range
    MIN_LEAD_TIME: 1,
    MAX_LEAD_TIME: 24,

    // Affiliation matrix settings
    AFFILIATION_FILENAME_TEMPLATE: 'json_files/affiliation_matrix_{leadTime}months.json',
    BRIGHTNESS_SCALE: 1.5 // Scales probability to brightness increase (brightness = 1.0 + scale * p)
};

export const SELECTORS = {
    // Main containers
    SVG_CONTAINER: '#svg-container',
    MODAL: '#modal',
    MODAL_BODY: '#modal-body',
    TOOLTIP: '#tooltip',
    LOADING: '#loading',
    ERROR: '#error',
    
    // Search interface - Markov Chain section
    SEARCH_INPUT: '#svg-search',
    SEARCH_DROPDOWN: '#search-dropdown',
    DROPDOWN_CONTENT: '#dropdown-content',
    SEASON_INPUT: '#season-search',
    SEASON_DROPDOWN: '#season-dropdown',
    SEASON_DROPDOWN_CONTENT: '#season-dropdown-content',
    LOAD_BUTTON: '#load-svg-btn',
    DATE_SLIDER: '#date-slider',
    DATE_SLIDER_LABEL: '#slider-date-label',
    DATE_SLIDER_PREV: '#slider-prev-btn',
    DATE_SLIDER_NEXT: '#slider-next-btn',
    MFPT_ROW: '#mfpt-row',
    MFPT_NODE_I: '#mfpt-node-i',
    MFPT_NODE_J: '#mfpt-node-j',
    MFPT_VALUE: '#mfpt-value',
    
    // Search interface - DAG section
    DAG_SVG_CONTAINER: '#dag-svg-container',
    DAG_LOADING: '#dag-loading',
    DAG_ERROR: '#dag-error',
    DAG_SEASON_INPUT: '#dag-season-search',
    DAG_SEASON_DROPDOWN: '#dag-season-dropdown',
    DAG_SEASON_DROPDOWN_CONTENT: '#dag-season-dropdown-content',
    DAG_LOAD_BUTTON: '#dag-load-svg-btn',
    DAG_DATE_SLIDER: '#dag-date-slider',
    DAG_DATE_SLIDER_LABEL: '#dag-slider-date-label',
    DAG_DATE_SLIDER_PREV: '#dag-slider-prev-btn',
    DAG_DATE_SLIDER_NEXT: '#dag-slider-next-btn',
    DAG_PROB_ROW: '#dag-prob-row',
    DAG_PROB_NODE_I: '#dag-prob-node-i',
    DAG_PROB_LEVEL_N: '#dag-prob-level-n',
    DAG_PROB_NODE_J: '#dag-prob-node-j',
    DAG_PROB_LEVEL_M: '#dag-prob-level-m',
    DAG_PROB_VALUE: '#dag-prob-value',
    DAG_PATH_ROW: '#dag-path-row',
    DAG_PATH_NODE_I: '#dag-path-node-i',
    DAG_PATH_LEVEL_N: '#dag-path-level-n',
    DAG_PATH_NODE_J: '#dag-path-node-j',
    DAG_PATH_LEVEL_M: '#dag-path-level-m',
    DAG_PATH_VALUE: '#dag-path-value',
    
    // Search interface - Case Study section
    CASE_STUDY_YEAR_INPUT: '#target-year',
    CASE_STUDY_YEAR_DROPDOWN: '#target-year-dropdown',
    CASE_STUDY_YEAR_DROPDOWN_CONTENT: '#target-year-dropdown-content',
    CASE_STUDY_MONTH_INPUT: '#target-month',
    CASE_STUDY_MONTH_DROPDOWN: '#target-month-dropdown',
    CASE_STUDY_MONTH_DROPDOWN_CONTENT: '#target-month-dropdown-content',
    CASE_STUDY_LOAD_BUTTON: '#case-study-load-btn',
    CASE_STUDY_SYNC_BUTTON: '#case-study-sync-btn',
    CASE_STUDY_DETREND_TOGGLE: '#case-study-detrend-toggle',
    CASE_STUDY_CONTROLS: '#case-study-controls',
    CASE_STUDY_LOADING: '#case-study-loading',
    CASE_STUDY_ERROR: '#case-study-error',
    CASE_STUDY_CONTENT: '#case-study-content',
    CASE_STUDY_MEDIA_CONTAINER: '#case-study-media-container',

    // Search interface - Precursor Plots section
    PRECURSOR_SEASON_INPUT: '#precursor-season',
    PRECURSOR_SEASON_DROPDOWN: '#precursor-season-dropdown',
    PRECURSOR_SEASON_DROPDOWN_CONTENT: '#precursor-season-dropdown-content',
    PRECURSOR_CLASS_INPUT: '#precursor-class',
    PRECURSOR_CLASS_DROPDOWN: '#precursor-class-dropdown',
    PRECURSOR_CLASS_DROPDOWN_CONTENT: '#precursor-class-dropdown-content',
    PRECURSOR_TYPE_TOGGLE: '#precursor-type-toggle',
    PRECURSOR_LOAD_BUTTON: '#precursor-load-btn',
    PRECURSOR_SYNC_BUTTON: '#precursor-sync-btn',
    PRECURSOR_CONTROLS: '#precursor-controls',
    PRECURSOR_LOADING: '#precursor-loading',
    PRECURSOR_ERROR: '#precursor-error',
    PRECURSOR_CONTENT: '#precursor-content',
    PRECURSOR_MEDIA_CONTAINER: '#precursor-media-container',
    
    // SVG elements
    SVG_NODES: 'path[fill-rule="nonzero"][stroke-width="1"]',
    SVG_EDGES: 'path[fill="none"]',
    SVG_ARROWS: 'path[fill-rule="nonzero"][fill]:not([fill="none"])',
    SVG_TEXT: 'text, use[xlink\\:href]',
    
    // Modal elements
    MODAL_CLOSE: '.close',
    MODAL_CONTENT: '.modal-content',
    
    // Interactive elements
    NODE_INTERACTIVE: '.node-interactive',
    EDGE_INTERACTIVE: '.edge-interactive',
    DROPDOWN_ITEM: '.dropdown-item',
    DROPDOWN_ITEM_SELECTED: '.dropdown-item.selected'
};

export const CSS_CLASSES = {
    // State classes
    SHOW: 'show',
    SELECTED: 'selected',
    OPEN: 'open',
    HIGHLIGHT: 'highlight-node', // Default highlight for nodes
    HIGHLIGHT_NODE: 'highlight-node',
    HIGHLIGHT_EDGE: 'highlight-edge',
    
    // Interactive classes
    NODE_INTERACTIVE: 'node-interactive',
    EDGE_INTERACTIVE: 'edge-interactive',
    
    // Layout classes
    MODAL_CONTENT_MOBILE: 'modal-content-mobile',
    DROPDOWN_ITEM: 'dropdown-item',
    ITEM_TITLE: 'item-title',
    SEARCH_CONTAINER: 'search-container'
};

export const EVENTS = {
    // Mouse events
    CLICK: 'click',
    MOUSEENTER: 'mouseenter',
    MOUSELEAVE: 'mouseleave',
    HOVER: 'hover',
    
    // Keyboard events
    KEYDOWN: 'keydown',
    
    // Input events
    INPUT: 'input',
    CHANGE: 'change',
    
    // DOM events
    DOM_CONTENT_LOADED: 'DOMContentLoaded'
};

export const KEYS = {
    ARROW_DOWN: 'ArrowDown',
    ARROW_UP: 'ArrowUp',
    ENTER: 'Enter',
    ESCAPE: 'Escape'
};

export const DAG_CONFIG = {
    LEVELS: 25, // 0-24
    LEVEL_0_PLACEHOLDER_VIDEO: 'mp4_files/combined-cluster1-1months.mp4',
    SPECIAL_CLASSES: ['La Niña', 'Neutral', 'El Niño'],
    K_MAX_FILE: 'json_files/K_max.json',
    DAG_DATA_FILE: 'json_files/vertical_transition_graph.json',
    DAG_SVG_FILE: 'svg_files/vertical_transition_graph.svg',
    
    // Validation thresholds
    MP4_VALIDATION_SAMPLES: 3, // How many files to check per level
    INDEX_VALIDATION_TOLERANCE: 0.01 // Tolerance for floating point comparisons
};

export const ERROR_MESSAGES = {
    NO_SVG_FILE: 'Please select an SVG file to load.',
    SVG_LOAD_FAILED: 'Failed to load or parse SVG "{filename}". Please check the file format and availability.',
    SVG_NOT_FOUND: 'SVG not found in loaded content',
    SVG_PARSE_ERROR: 'SVG file contains parsing errors.',
    INVALID_SVG: 'Loaded content is not a valid SVG.',
    JSON_VALIDATION_FAILED: 'JSON data validation failed: {reason}',
    JSON_SVG_MISMATCH: 'JSON data does not match SVG structure: {reason}',
    
    // DAG-specific error messages
    DAG_LOAD_FAILED: 'Failed to load DAG data: {reason}',
    K_MAX_LOAD_FAILED: 'Failed to load K_max data: {reason}',
    DAG_VALIDATION_FAILED: 'DAG data validation failed: {reason}',
    INDEX_CONVERSION_FAILED: 'Index conversion failed: {reason}',
    NODE_NOT_FOUND: 'Node with ID {id} not found in DAG data',
    EDGE_NOT_FOUND: 'Edge from {source} to {target} not found in DAG data'
};
