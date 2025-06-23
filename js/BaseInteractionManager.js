// Base Interaction Manager - Common functionality for all interaction management
// Provides standard patterns for tooltips, modals, highlighting, and event handling

import { Logger } from './Logger.js';
import { Utils } from './Utils.js';
import { ErrorHandler } from './ErrorHandler.js';
import { CONFIG, SELECTORS, CSS_CLASSES, EVENTS, KEYS } from './constants.js';

export class BaseInteractionManager {
    constructor() {
        // UI elements
        this.tooltip = null;
        this.modal = null;
        this.modalBody = null;
        this.modalContent = null;
        this.closeButton = null;
        
        // Touch interaction properties
        this.isTouchDevice = this.detectTouchDevice();
        this.longPressTimer = null;
        this.longPressDelay = CONFIG.LONG_PRESS_DELAY || 500;
        this.touchStarted = false;
        
        // Tooltip management
        this.tooltipTimer = null;
        this.tooltipDelay = CONFIG.TOOLTIP_DELAY || 3000;
        
        // Modal management
        this.modalResizeObserver = null;
        this.windowResizeListener = null;
        
        // State tracking
        this.currentHighlightedElement = null;
        this.activeInteractions = new Set();
        
        Logger.debug(`BaseInteractionManager initialized (Touch device: ${this.isTouchDevice})`);
    }

    /**
     * Initialize interaction manager with DOM elements
     * @param {Object} elements - Object containing DOM element selectors or elements
     */
    initialize(elements = {}) {
        // Find elements by selector or use provided elements
        this.tooltip = this.findElement(elements.tooltip, SELECTORS.TOOLTIP);
        this.modal = this.findElement(elements.modal, SELECTORS.MODAL);
        this.modalBody = this.findElement(elements.modalBody, SELECTORS.MODAL_BODY);
        this.modalContent = this.modal?.querySelector(SELECTORS.MODAL_CONTENT);
        this.closeButton = this.modal?.querySelector(SELECTORS.MODAL_CLOSE);
        
        this.setupBaseEventListeners();
        Logger.debug('BaseInteractionManager DOM elements initialized');
    }

    /**
     * Find DOM element by selector or return provided element
     * @param {HTMLElement|string} elementOrSelector - Element or selector
     * @param {string} fallbackSelector - Fallback selector
     * @returns {HTMLElement|null} - Found element or null
     */
    findElement(elementOrSelector, fallbackSelector = null) {
        if (elementOrSelector instanceof HTMLElement) {
            return elementOrSelector;
        }
        
        if (typeof elementOrSelector === 'string') {
            return document.querySelector(elementOrSelector);
        }
        
        if (fallbackSelector) {
            return document.querySelector(fallbackSelector);
        }
        
        return null;
    }

    /**
     * Detect if device supports touch
     * @returns {boolean} - True if touch device
     */
    detectTouchDevice() {
        return (('ontouchstart' in window) ||
                (navigator.maxTouchPoints > 0) ||
                (navigator.msMaxTouchPoints > 0));
    }

    /**
     * Setup base event listeners
     */
    setupBaseEventListeners() {
        // Modal close events
        if (this.closeButton) {
            this.closeButton.addEventListener(EVENTS.CLICK, () => this.closeModal());
        }

        if (this.modal) {
            this.modal.addEventListener(EVENTS.CLICK, (event) => {
                if (event.target === this.modal) {
                    this.closeModal();
                }
            });
        }

        // Keyboard events
        document.addEventListener(EVENTS.KEYDOWN, (event) => {
            if (event.key === KEYS.ESCAPE && this.isModalOpen()) {
                this.closeModal();
            }
        });

        // Global click to hide tooltips
        document.addEventListener(EVENTS.CLICK, (event) => {
            if (!this.isTooltipEvent(event)) {
                this.hideTooltip();
            }
        });
    }

    /**
     * Check if modal is currently open
     * @returns {boolean} - True if modal is open
     */
    isModalOpen() {
        return this.modal?.style.display === 'block' || this.modal?.classList.contains(CSS_CLASSES.SHOW);
    }

    /**
     * Check if event is related to tooltip
     * @param {Event} event - DOM event
     * @returns {boolean} - True if tooltip-related
     */
    isTooltipEvent(event) {
        return event.target?.closest(`.${CSS_CLASSES.TOOLTIP}`) !== null;
    }

    // =============================================================================
    // TOUCH INTERACTION METHODS
    // =============================================================================

    /**
     * Start long press detection
     * @param {Function} callback - Function to call on long press
     */
    startLongPress(callback) {
        this.touchStarted = true;
        this.longPressTimer = setTimeout(() => {
            if (this.touchStarted) {
                callback();
                this.touchStarted = false; // Prevent normal tap action
            }
        }, this.longPressDelay);
    }

    /**
     * Cancel long press detection
     */
    cancelLongPress() {
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }
    }

    /**
     * End long press and execute tap callback if it was a normal tap
     * @param {Function} tapCallback - Function to call on normal tap
     */
    endLongPress(tapCallback) {
        this.cancelLongPress();
        if (this.touchStarted) {
            // This was a normal tap, not a long press
            tapCallback();
        }
        this.touchStarted = false;
    }

    // =============================================================================
    // TOOLTIP METHODS
    // =============================================================================

    /**
     * Show tooltip with content at event position
     * @param {Event} event - Mouse event for positioning
     * @param {string} content - HTML content for tooltip
     * @param {Object} options - Tooltip options
     */
    showTooltip(event, content, options = {}) {
        if (!this.tooltip) return;

        const {
            minWidth = '',
            maxWidth = '',
            position = 'auto',
            offset = { x: 10, y: -10 },
            className = ''
        } = options;

        // Set content
        this.tooltip.innerHTML = content;
        
        // Apply styling
        if (minWidth) this.tooltip.style.minWidth = minWidth;
        if (maxWidth) this.tooltip.style.maxWidth = maxWidth;
        if (className) this.tooltip.className = `${CSS_CLASSES.TOOLTIP} ${className}`;

        // Position tooltip
        this.positionTooltip(event, offset, position);
        
        // Show tooltip
        this.tooltip.classList.add(CSS_CLASSES.SHOW);
        
        Logger.debug('Tooltip shown');
    }

    /**
     * Position tooltip relative to event
     * @param {Event} event - Mouse event
     * @param {Object} offset - X/Y offset
     * @param {string} position - Positioning strategy
     */
    positionTooltip(event, offset = { x: 10, y: -10 }, position = 'auto') {
        if (!this.tooltip) return;

        let x = event.pageX + offset.x;
        let y = event.pageY + offset.y;

        // Get tooltip dimensions
        this.tooltip.style.visibility = 'hidden';
        this.tooltip.style.display = 'block';
        const rect = this.tooltip.getBoundingClientRect();
        this.tooltip.style.visibility = 'visible';

        // Adjust for viewport boundaries
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const scrollX = window.pageXOffset;
        const scrollY = window.pageYOffset;

        // Horizontal adjustment
        if (x + rect.width > scrollX + viewportWidth) {
            x = event.pageX - rect.width - Math.abs(offset.x);
        }

        // Vertical adjustment  
        if (y + rect.height > scrollY + viewportHeight) {
            y = event.pageY - rect.height - Math.abs(offset.y);
        }

        // Ensure tooltip stays within viewport
        x = Math.max(scrollX + 5, Math.min(x, scrollX + viewportWidth - rect.width - 5));
        y = Math.max(scrollY + 5, Math.min(y, scrollY + viewportHeight - rect.height - 5));

        this.tooltip.style.left = x + 'px';
        this.tooltip.style.top = y + 'px';
    }

    /**
     * Show tooltip with automatic dismissal on touch devices
     * @param {Event} event - Touch event
     * @param {string} content - HTML content
     * @param {number} delay - Auto-dismiss delay in ms
     */
    showTooltipWithAutoDismiss(event, content, delay = null) {
        // Clear any existing auto-dismiss timer
        if (this.tooltipTimer) {
            clearTimeout(this.tooltipTimer);
        }
        
        // Show the tooltip
        this.showTooltip(event, content);
        
        // Set auto-dismiss timer
        const dismissDelay = delay || this.tooltipDelay;
        this.tooltipTimer = setTimeout(() => {
            this.hideTooltip();
            this.tooltipTimer = null;
        }, dismissDelay);
    }

    /**
     * Hide tooltip
     */
    hideTooltip() {
        if (this.tooltip) {
            this.tooltip.classList.remove(CSS_CLASSES.SHOW);
        }
        
        // Clear auto-dismiss timer
        if (this.tooltipTimer) {
            clearTimeout(this.tooltipTimer);
            this.tooltipTimer = null;
        }
    }

    // =============================================================================
    // MODAL METHODS
    // =============================================================================

    /**
     * Show modal with content
     * @param {string} content - HTML content for modal
     * @param {Object} options - Modal options
     */
    showModal(content, options = {}) {
        if (!this.modal || !this.modalBody) return;

        const {
            title = '',
            showCloseButton = true,
            width = 'auto',
            height = 'auto',
            className = ''
        } = options;

        // Set content
        if (title) {
            this.modalBody.innerHTML = `<h2>${Utils.escapeHTML(title)}</h2>${content}`;
        } else {
            this.modalBody.innerHTML = content;
        }

        // Apply custom styling
        if (className) {
            this.modal.className = `${this.modal.className} ${className}`;
        }

        // Show modal
        this.modal.style.display = 'block';
        setTimeout(() => {
            this.modal.classList.add(CSS_CLASSES.SHOW);
        }, CONFIG.MODAL_SHOW_DELAY_MS || 10);

        Logger.debug('Modal shown');
    }

    /**
     * Close modal and cleanup
     */
    closeModal() {
        if (!this.modal) return;

        this.modal.classList.remove(CSS_CLASSES.SHOW);
        
        setTimeout(() => {
            this.modal.style.display = 'none';
            this.cleanupModalResources();
        }, CONFIG.MODAL_TRANSITION_MS || 300);

        Logger.debug('Modal closed');
    }

    /**
     * Cleanup modal resources (observers, listeners, etc.)
     */
    cleanupModalResources() {
        // Clean up resize observer
        if (this.modalResizeObserver) {
            this.modalResizeObserver.disconnect();
            this.modalResizeObserver = null;
        }

        // Clean up window resize listener
        if (this.windowResizeListener) {
            window.removeEventListener('resize', this.windowResizeListener);
            this.windowResizeListener = null;
        }
    }

    // =============================================================================
    // HIGHLIGHTING METHODS
    // =============================================================================

    /**
     * Highlight element
     * @param {HTMLElement} element - Element to highlight
     * @param {string} highlightClass - CSS class for highlighting
     */
    highlightElement(element, highlightClass = CSS_CLASSES.HIGHLIGHT) {
        if (!element) return;

        // Remove previous highlight
        this.unhighlightCurrentElement();

        // Add new highlight
        element.classList.add(highlightClass);
        this.currentHighlightedElement = { element, className: highlightClass };
        
        Logger.debug('Element highlighted');
    }

    /**
     * Remove highlight from element
     * @param {HTMLElement} element - Element to unhighlight
     * @param {string} highlightClass - CSS class to remove
     */
    unhighlightElement(element, highlightClass = CSS_CLASSES.HIGHLIGHT) {
        if (element) {
            element.classList.remove(highlightClass);
        }
    }

    /**
     * Remove highlight from currently highlighted element
     */
    unhighlightCurrentElement() {
        if (this.currentHighlightedElement) {
            this.unhighlightElement(
                this.currentHighlightedElement.element,
                this.currentHighlightedElement.className
            );
            this.currentHighlightedElement = null;
        }
    }

    /**
     * Highlight edge with special styling
     * @param {HTMLElement} element - Edge element
     */
    highlightEdge(element) {
        if (!element) return;

        // Store original stroke width before highlighting
        const originalStrokeWidth = element.getAttribute('stroke-width') || '1';
        element.style.setProperty('--original-stroke-width', originalStrokeWidth + 'px');
        element.classList.add(CSS_CLASSES.HIGHLIGHT_EDGE);
    }

    /**
     * Remove edge highlighting
     * @param {HTMLElement} element - Edge element
     */
    unhighlightEdge(element) {
        if (!element) return;

        element.classList.remove(CSS_CLASSES.HIGHLIGHT_EDGE);
        element.style.removeProperty('--original-stroke-width');
    }

    // =============================================================================
    // EVENT HANDLING UTILITIES
    // =============================================================================

    /**
     * Setup interactions for multiple elements
     * @param {NodeList|Array} elements - Elements to setup
     * @param {Object} handlers - Event handlers
     * @param {string} dataAttribute - Data attribute for element identification
     */
    setupElementInteractions(elements, handlers = {}, dataAttribute = 'data-id') {
        elements.forEach((element, index) => {
            const elementId = element.getAttribute(dataAttribute) || `element-${index}`;
            
            if (this.isTouchDevice) {
                this.setupTouchInteractions(element, elementId, handlers);
            } else {
                this.setupMouseInteractions(element, elementId, handlers);
            }
        });
    }

    /**
     * Setup touch interactions for element
     * @param {HTMLElement} element - Element to setup
     * @param {string} elementId - Element identifier
     * @param {Object} handlers - Event handlers
     */
    setupTouchInteractions(element, elementId, handlers) {
        const { onTap, onLongPress, onTooltip } = handlers;

        if (onLongPress || onTap) {
            element.addEventListener('touchstart', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                this.startLongPress(() => {
                    if (onTooltip) this.hideTooltip();
                    if (onLongPress) onLongPress(elementId, element, e);
                });
            });

            element.addEventListener('touchend', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                this.endLongPress(() => {
                    if (onTap) onTap(elementId, element, e);
                });
            });

            element.addEventListener('touchmove', () => this.cancelLongPress());
            element.addEventListener('touchcancel', () => this.cancelLongPress());
        }
    }

    /**
     * Setup mouse interactions for element
     * @param {HTMLElement} element - Element to setup
     * @param {string} elementId - Element identifier
     * @param {Object} handlers - Event handlers
     */
    setupMouseInteractions(element, elementId, handlers) {
        const { onClick, onMouseEnter, onMouseLeave } = handlers;

        if (onMouseEnter) {
            element.addEventListener(EVENTS.MOUSEENTER, (e) => {
                e.stopPropagation();
                onMouseEnter(elementId, element, e);
            });
        }

        if (onMouseLeave) {
            element.addEventListener(EVENTS.MOUSELEAVE, (e) => {
                e.stopPropagation();
                onMouseLeave(elementId, element, e);
            });
        }

        if (onClick) {
            element.addEventListener(EVENTS.CLICK, (e) => {
                e.stopPropagation();
                onClick(elementId, element, e);
            });
        }
    }

    /**
     * Add interaction tracking
     * @param {string} interactionId - Unique interaction identifier
     */
    addActiveInteraction(interactionId) {
        this.activeInteractions.add(interactionId);
    }

    /**
     * Remove interaction tracking
     * @param {string} interactionId - Unique interaction identifier
     */
    removeActiveInteraction(interactionId) {
        this.activeInteractions.delete(interactionId);
    }

    /**
     * Check if interaction is active
     * @param {string} interactionId - Interaction identifier
     * @returns {boolean} - True if active
     */
    isInteractionActive(interactionId) {
        return this.activeInteractions.has(interactionId);
    }

    // =============================================================================
    // UTILITY METHODS
    // =============================================================================

    /**
     * Make text elements non-interactive
     * @param {HTMLElement} container - Container to search within
     */
    makeTextElementsNonInteractive(container) {
        const textElements = container.querySelectorAll(SELECTORS.SVG_TEXT);
        textElements.forEach(el => {
            el.style.pointerEvents = 'none';
        });
    }

    /**
     * Get interaction statistics
     * @returns {Object} - Stats object
     */
    getInteractionStats() {
        return {
            isTouchDevice: this.isTouchDevice,
            activeInteractions: this.activeInteractions.size,
            modalOpen: this.isModalOpen(),
            tooltipVisible: this.tooltip?.classList.contains(CSS_CLASSES.SHOW) || false,
            highlightedElement: !!this.currentHighlightedElement
        };
    }

    /**
     * Reset all interactions and cleanup
     */
    reset() {
        this.hideTooltip();
        this.closeModal();
        this.unhighlightCurrentElement();
        this.activeInteractions.clear();
        this.cancelLongPress();
        
        Logger.debug('BaseInteractionManager reset');
    }

    /**
     * Cleanup resources when manager is destroyed
     */
    destroy() {
        this.reset();
        this.cleanupModalResources();
        Logger.debug('BaseInteractionManager destroyed');
    }
}