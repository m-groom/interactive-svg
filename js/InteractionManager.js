import { CONFIG, SELECTORS, CSS_CLASSES, EVENTS } from './constants.js';
import { Logger } from './Logger.js';
import { Utils } from './Utils.js';
import { BaseInteractionManager } from './BaseInteractionManager.js';

export class InteractionManager extends BaseInteractionManager {
    constructor(svgLoader, svgParser, appInstance = null) {
        super();
        this.svgLoader = svgLoader;
        this.svgParser = svgParser;
        this.app = appInstance; // Reference to InteractiveSVGApp for accessing affiliation data
        
        // Specific properties for this interaction manager
        this.edgeTooltipTimer = null;
        this.edgeTooltipDelay = 3000; // 3 seconds auto-dismiss for edge tooltips on mobile
    }

    initialize() {
        super.initialize();
        Logger.debug(`InteractionManager initialized - Touch device: ${this.isTouchDevice}`);
    }




    setupSVGInteractions(svgElement) {
        if (!svgElement) return;

        // Remove any existing event listeners by cloning the SVG
        // This ensures clean setup on each load
        
        // Setup node interactions
        const nodes = svgElement.querySelectorAll(SELECTORS.SVG_NODES);
        nodes.forEach((node, index) => {
            const nodeKey = `node-${index}`;
            
            if (this.isTouchDevice) {
                // Touch device: tap shows tooltip, long press shows modal
                node.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.startLongPress(async () => {
                        this.hideTooltip(); // Hide tooltip before opening modal
                        await this.showNodeModal(nodeKey);
                    });
                });
                
                node.addEventListener('touchend', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.endLongPress(() => {
                        this.showNodeTooltip(e, nodeKey, node);
                    });
                });
                
                node.addEventListener('touchmove', () => {
                    this.cancelLongPress();
                });
                
                node.addEventListener('touchcancel', () => {
                    this.cancelLongPress();
                });
            } else {
                // Desktop: hover shows tooltip, click shows modal
                node.addEventListener(EVENTS.MOUSEENTER, (e) => {
                    e.stopPropagation();
                    this.showNodeTooltip(e, nodeKey, node);
                });
                
                node.addEventListener(EVENTS.MOUSELEAVE, (e) => {
                    e.stopPropagation();
                    this.hideTooltip();
                    this.unhighlightElement(node);
                });
                
                node.addEventListener(EVENTS.CLICK, async (e) => {
                    e.stopPropagation();
                    await this.showNodeModal(nodeKey);
                });
            }
        });

        // Setup edge interactions (for both arrows and edge paths)
        const edgeElements = svgElement.querySelectorAll('[data-edge-id]');
        edgeElements.forEach((edgeElement) => {
            const edgeId = edgeElement.getAttribute('data-edge-id');
            if (edgeId) {
                if (this.isTouchDevice) {
                    // Touch device: tap shows tooltip with auto-dismiss
                    edgeElement.addEventListener('touchend', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        this.showEdgeTooltipWithAutoDismiss(e, edgeId);
                        this.highlightEdge(edgeElement);
                        // Auto-unhighlight after tooltip dismisses
                        setTimeout(() => {
                            this.unhighlightEdge(edgeElement);
                        }, this.edgeTooltipDelay);
                    });
                } else {
                    // Desktop: hover shows tooltip
                    edgeElement.addEventListener(EVENTS.MOUSEENTER, (e) => {
                        e.stopPropagation();
                        this.showEdgeTooltip(e, edgeId);
                        this.highlightEdge(edgeElement);
                    });
                    
                    edgeElement.addEventListener(EVENTS.MOUSELEAVE, () => {
                        this.hideTooltip();
                        this.unhighlightEdge(edgeElement);
                    });
                }
            }
        });

        // Make text elements pass through mouse events
        const textElements = svgElement.querySelectorAll(SELECTORS.SVG_TEXT);
        textElements.forEach(el => {
            el.style.pointerEvents = 'none';
        });

        Logger.debug(`Setup interactions for ${nodes.length} nodes and ${edgeElements.length} edge elements`);
    }

    showNodeTooltip(event, nodeKey, nodeElement) {
        const nodeData = this.svgParser.getNodeData(nodeKey);
        if (!nodeData) return;

        let classProbContent = '';
        if (nodeData.lambda) {
            classProbContent = `
                <p style="text-align: left;"><strong>Class Probabilities:</strong></p>
                <ul style="margin: 5px 0; padding-left: 20px;">
                    <li>La Niña: ${nodeData.lambda.laNina.toFixed(2)}</li>
                    <li>Neutral: ${nodeData.lambda.neutral.toFixed(2)}</li>
                    <li>El Niño: ${nodeData.lambda.elNino.toFixed(2)}</li>
                </ul>
            `;
        }

        // Affiliation probability for selected date
        let affiliationProbContent = '';
        if (this.app?.affiliationData && this.app?.dateSlider && !this.app.dateSlider.disabled) {
            const dateIndex = parseInt(this.app.dateSlider.value, 10);
            const nodeIndex = nodeData.id - 1; // Convert 1-based node ID to 0-based index
            const probVector = this.app.affiliationData.affiliations[dateIndex];
            const currentDate = this.app.affiliationData.dates[dateIndex];
            const formattedDate = this.formatDateToMonthYear(currentDate);
            
            let probDisplay = 'not defined';
            if (probVector && nodeIndex >= 0 && nodeIndex < probVector.length) {
                const affiliationProb = probVector[nodeIndex];
                if (typeof affiliationProb === 'number' && !isNaN(affiliationProb)) {
                    probDisplay = affiliationProb.toFixed(3);
                }
            }
            
            affiliationProbContent = `
                <p style="text-align: left;"><strong>Affiliation Probability (${formattedDate}):</strong><br>${probDisplay}</p>
            `;
        }

        let transitionProbContent = '';
        if (nodeData.id && this.svgParser.jsonParser) {
            const transitionProbs = this.getTransitionProbabilities(nodeData.id);
            if (transitionProbs.length > 0) {
                const transitionList = transitionProbs
                    .map(t => {
                        let line = `Cluster ${t.target}: ${t.probability.toFixed(2)}`;
                        if (t.confidenceInterval && Array.isArray(t.confidenceInterval) && t.confidenceInterval.length >= 2) {
                            const ci1 = t.confidenceInterval[0].toFixed(2);
                            const ci2 = t.confidenceInterval[1].toFixed(2);
                            line += ` [${ci1}, ${ci2}]`;
                        }
                        return `<li>${line}</li>`;
                    })
                    .join('');
                transitionProbContent = `
                    <p style="text-align: left;"><strong>Transition Probabilities:</strong></p>
                    <ul style="margin: 5px 0; padding-left: 20px;">
                        ${transitionList}
                    </ul>
                `;
            }
        }

        const displayName = nodeData.displayName || `Cluster ${nodeData.id}`;
        const content = `
            <h4 style="margin-bottom: 1rem;">${Utils.escapeHTML(displayName)}</h4>
            ${classProbContent}
            ${affiliationProbContent}
            ${transitionProbContent}
        `;
        
        this.showTooltip(event, content);
        this.highlightElement(nodeElement);
    }

    getTransitionProbabilities(sourceNodeId) {
        if (!this.svgParser.jsonParser) return [];
        
        const allLinks = this.svgParser.jsonParser.getAllLinks();
        const transitionProbs = allLinks
            .filter(link => link.source === sourceNodeId)
            .map(link => ({
                target: link.target,
                probability: link.probability,
                confidenceInterval: link.ci
            }))
            .sort((a, b) => b.probability - a.probability);
        
        return transitionProbs;
    }

    showEdgeTooltip(event, edgeKey) {
        const edgeData = this.svgParser.getEdgeData(edgeKey);
        if (!edgeData) return;

        const probabilityText = edgeData.probability ? 
            edgeData.probability.toFixed(2) : 'unknown';

        let probabilityLine = `<strong>Transition Probability:</strong> ${probabilityText}`;
        
        // Add confidence interval to the same line if available
        if (edgeData.confidenceInterval && Array.isArray(edgeData.confidenceInterval) && 
            edgeData.confidenceInterval.length >= 2) {
            const ci1 = edgeData.confidenceInterval[0].toFixed(2);
            const ci2 = edgeData.confidenceInterval[1].toFixed(2);
            probabilityLine += ` [${ci1}, ${ci2}]`;
        }

        const content = `
            <h4>${Utils.escapeHTML(edgeData.source)} → ${Utils.escapeHTML(edgeData.target)}</h4>
            <p>${probabilityLine}</p>
        `;
        
        this.showTooltip(event, content);
    }

    showEdgeTooltipWithAutoDismiss(event, edgeKey) {
        // Clear any existing auto-dismiss timer
        if (this.edgeTooltipTimer) {
            clearTimeout(this.edgeTooltipTimer);
        }
        
        // Show the tooltip
        this.showEdgeTooltip(event, edgeKey);
        
        // Set auto-dismiss timer for mobile
        this.edgeTooltipTimer = setTimeout(() => {
            this.hideTooltip();
            this.edgeTooltipTimer = null;
        }, this.edgeTooltipDelay);
    }

    showTooltip(event, content) {
        if (!this.tooltip) return;

        this.tooltip.innerHTML = content;
        
        // Set minimum width based on tooltip content type
        if (content.includes('Transition Probabilities:')) {
            this.tooltip.style.minWidth = '290px';
        } else if (content.includes('Transition Probability:')) {
            this.tooltip.style.minWidth = '330px';
        } else {
            this.tooltip.style.minWidth = '';
        }
        
        this.tooltip.style.left = (event.pageX + 10) + "px";
        this.tooltip.style.top = (event.pageY - 10) + "px";
        this.tooltip.classList.add(CSS_CLASSES.SHOW);
    }

    hideTooltip() {
        if (this.tooltip) {
            this.tooltip.classList.remove(CSS_CLASSES.SHOW);
        }
        
        // Clear any edge tooltip auto-dismiss timer
        if (this.edgeTooltipTimer) {
            clearTimeout(this.edgeTooltipTimer);
            this.edgeTooltipTimer = null;
        }
    }

    async showNodeModal(nodeKey) {
        const nodeData = this.svgParser.getNodeData(nodeKey);
        if (!nodeData) return;

        const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
        const displayName = nodeData.displayName || `Cluster ${nodeData.id}`;

        let activeDatesContent = '';
        if (nodeData.dates && Array.isArray(nodeData.dates) && nodeData.dates.length > 0) {
            // Validate PNG availability
            const pngValidation = await this.validatePngAvailability(nodeData.dates);
            
            const formattedDates = nodeData.dates
                .map(date => ({
                    original: date,
                    formatted: this.formatDateToMonthYear(date),
                    hasImage: !pngValidation.missingDates.includes(date)
                }))
                .filter(dateObj => dateObj.formatted !== '')
                .sort((a, b) => a.original.localeCompare(b.original));
            
            if (formattedDates.length > 0) {
                const dateLinks = formattedDates.map(dateObj => {
                    if (dateObj.hasImage) {
                        return `<span class="active-date-link" data-date="${dateObj.original}" style="color: #0066cc; cursor: pointer; text-decoration: underline;">${dateObj.formatted}</span>`;
                    } else {
                        return `<span style="color: #666;">${dateObj.formatted}</span>`;
                    }
                }).join(', ');
                
                activeDatesContent = `
                    <div style="text-align: center;">
                        <strong>Active Dates:</strong>
                    </div>
                    <div style="text-align: left; word-wrap: break-word; line-height: 1.4; margin-top: 0.5rem;">
                        ${dateLinks}
                    </div>
                `;
            }
        }

        let videoContent = '';
        let actualVideoColumnWidthPx = 0;
        
        const leadTime = this.svgLoader.getCurrentLeadTime();
        const nodeNumber = String(nodeData.id);

        // Calculate video layout
        const minColWidthPx = CONFIG.MIN_COLUMN_WIDTH_REM * rootFontSize;
        const maxColWidthPx = CONFIG.MAX_COLUMN_WIDTH_REM * rootFontSize;
        const gapPx = CONFIG.GAP_REM * rootFontSize;
        
        Logger.debug(`[Modal Sizing] Window dimensions: ${window.innerWidth}x${window.innerHeight}, Root font: ${rootFontSize}px`);

        if (leadTime && nodeNumber) {
            const videoFilename = this.svgLoader.generateVideoFilename(nodeNumber, leadTime);
            if (videoFilename) {
                const maxVideoHeightVh = CONFIG.MAX_VIDEO_HEIGHT_VH;
                const vhInPx = window.innerHeight * (maxVideoHeightVh / 100);
                let calculatedVideoWidth = vhInPx * CONFIG.VIDEO_ASPECT_RATIO;
                actualVideoColumnWidthPx = Math.max(minColWidthPx, Math.min(calculatedVideoWidth, maxColWidthPx));
                
                Logger.debug(`[Video Sizing] Max height: ${maxVideoHeightVh}vh (${vhInPx}px), Calculated width: ${calculatedVideoWidth}px, Final width: ${actualVideoColumnWidthPx}px (constrained: ${minColWidthPx}-${maxColWidthPx})`);

                const videoColumnStyle = `flex: 0 0 ${actualVideoColumnWidthPx}px; max-width: ${actualVideoColumnWidthPx}px;`;

                videoContent = `
                    <div class="video-container" style="${videoColumnStyle}">
                        <video controls autoplay loop muted playsinline preload="metadata" 
                               style="width: 100%; height: auto; aspect-ratio: ${CONFIG.VIDEO_ASPECT_RATIO}; border-radius: 0.5rem; max-height: ${maxVideoHeightVh}vh; object-fit: contain;">
                            <source src="${videoFilename}" type="video/mp4">
                            <p>Your browser does not support the video tag. Video file: ${videoFilename}</p>
                        </video>
                    </div>
                `;
            }
        }

        // Image container for date images - match video container styling exactly
        Logger.debug(`[Image Container] Creating container to match video styling exactly`);
        
        const imageContainer = `
            <div id="modal-image-container" class="image-container" style="display: none; position: relative; flex: 0 0 auto; margin: 0; padding: 0;">
                <img id="modal-date-image" style="border-radius: 0.5rem; object-fit: contain; display: block; margin: 0; padding: 0; border: none;" />
                <button id="close-image-btn" style="position: absolute; top: 0.5rem; right: 0.5rem; background: rgba(0,0,0,0.7); color: white; border: none; border-radius: 50%; width: 2rem; height: 2rem; cursor: pointer; font-size: 1.2rem; line-height: 1; display: flex; align-items: center; justify-content: center;">&times;</button>
            </div>
        `;

        // Layout logic - Support both centered and side-by-side layouts
        let contentLayout = '';

        if (videoContent && activeDatesContent) {
            // Restructured layout: Media container (video + image) separate from Active Dates
            
            // Use 900px breakpoint for better desktop narrow window handling
            const isNarrowLayout = window.innerWidth < 900;
            const mediaFlexDirection = isNarrowLayout ? 'column' : 'row';
            
            // Use smaller gap for mobile/narrow layouts
            const mediaGap = isNarrowLayout ? gapPx * 0.5 : gapPx;
            
            Logger.debug(`[Layout] Window: ${window.innerWidth}px, Layout: ${mediaFlexDirection}, Gap: ${mediaGap}px`);
            
            contentLayout = `
                <div id="modal-main-container" style="display: flex; flex-direction: column; gap: ${gapPx}px; width: 100%; align-items: center;">
                    <div id="modal-media-container" style="display: flex; flex-direction: ${mediaFlexDirection}; gap: ${mediaGap}px; align-items: flex-start;">
                        ${videoContent}
                        ${imageContainer}
                    </div>
                    <div id="modal-dates-container" style="width: 100%; max-width: ${maxColWidthPx}px; text-align: center;">
                        ${activeDatesContent}
                    </div>
                </div>
            `;
        } else if (videoContent) {
            const isNarrowLayout = window.innerWidth < 900;
            const mediaGap = isNarrowLayout ? gapPx * 0.5 : gapPx;
            
            contentLayout = `
                <div id="modal-main-container" style="display: flex; flex-direction: column; gap: ${gapPx}px; width: 100%; align-items: center;">
                    <div id="modal-media-container" style="display: flex; gap: ${mediaGap}px; justify-content: center;">
                        ${videoContent}
                        ${imageContainer}
                    </div>
                </div>
            `;
        } else if (activeDatesContent) {
            contentLayout = `
                <div style="display: flex; justify-content: center;">
                    <div style="width: 100%; max-width: ${maxColWidthPx}px; text-align: center;">
                        ${activeDatesContent}
                    </div>
                </div>
            `;
        } else {
            contentLayout = '<div style="width:100%; text-align:center;">(No content)</div>';
        }

        const modalContentHtml = `
            <h2 style="margin-bottom: 1rem; text-align: center;">${Utils.escapeHTML(displayName)}</h2>
            ${contentLayout}
        `;

        this.modalBody.innerHTML = modalContentHtml;

        // Set initial modal width using dynamic calculation
        if (this.modalContent) {
            // Use dynamic width calculation instead of fixed desiredInnerContentWidthPx
            setTimeout(() => {
                this.updateModalWidth();
            }, 10); // Small delay to ensure video has rendered
        }

        this.modal.style.display = "block";
        setTimeout(() => this.modal.classList.add(CSS_CLASSES.SHOW), CONFIG.MODAL_SHOW_DELAY_MS);

        // Setup event handlers for date links and image management
        this.setupDateImageEventHandlers();
        
        // Setup video size observer to track responsive behavior
        this.setupVideoSizeObserver();
        
        // Setup window resize listener for responsive layout updates
        this.setupWindowResizeListener();
    }

    setupDateImageEventHandlers() {
        // Setup click handlers for date links
        const dateLinks = this.modalBody.querySelectorAll('.active-date-link');
        dateLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const dateString = link.getAttribute('data-date');
                this.loadDateImage(dateString);
            });
        });

        // Setup close button for image
        const closeImageBtn = this.modalBody.querySelector('#close-image-btn');
        if (closeImageBtn) {
            closeImageBtn.addEventListener('click', () => {
                this.closeActiveImage();
            });
        }
    }

    syncImageToVideoSize() {
        const video = this.modalBody.querySelector('video');
        const image = this.modalBody.querySelector('#modal-date-image');
        
        if (!video || !image) return;

        const videoRect = video.getBoundingClientRect();
        const mediaContainer = this.modalBody.querySelector('#modal-media-container');
        const isRowLayout = mediaContainer && mediaContainer.style.flexDirection === 'row';
        
        let finalVideoWidth = videoRect.width;
        let finalVideoHeight = videoRect.height;
        
        // Check for overflow in side-by-side layout
        if (isRowLayout && this.modalContent) {
            // Calculate available content width
            const modalContentRect = this.modalContent.getBoundingClientRect();
            const modalPadding = 32; // 2rem * 16px (approximate)
            const availableWidth = modalContentRect.width - modalPadding;
            
            // Calculate required total width (video + image + gap)
            const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
            const gapPx = CONFIG.GAP_REM * rootFontSize;
            const requiredWidth = (videoRect.width * 2) + gapPx;
            
            // Apply scaling if content would overflow
            if (requiredWidth > availableWidth) {
                const scalingFactor = availableWidth / requiredWidth;
                finalVideoWidth = videoRect.width * scalingFactor;
                finalVideoHeight = videoRect.height * scalingFactor;
                
                Logger.debug(`[Overflow Protection] Scaling content by ${scalingFactor.toFixed(3)} (${requiredWidth}px → ${availableWidth}px)`);
                
                // Apply scaling to video as well
                video.style.width = `${finalVideoWidth}px`;
                video.style.height = `${finalVideoHeight}px`;
            }
        }
        
        Logger.debug(`[Sync Size] Setting image to match video: ${finalVideoWidth.toFixed(1)}px × ${finalVideoHeight.toFixed(1)}px`);
        
        // Apply exact video dimensions to image
        image.style.width = `${finalVideoWidth}px`;
        image.style.height = `${finalVideoHeight}px`;
        image.style.maxWidth = 'none';
        image.style.maxHeight = 'none';
        
        // Verify the sizes match
        setTimeout(() => {
            const finalVideoRect = video.getBoundingClientRect();
            const imageRect = image.getBoundingClientRect();
            Logger.debug(`[Size Verification] Video: ${finalVideoRect.width.toFixed(1)}x${finalVideoRect.height.toFixed(1)}, Image: ${imageRect.width.toFixed(1)}x${imageRect.height.toFixed(1)}`);
            
            if (Math.abs(finalVideoRect.width - imageRect.width) > 1 || Math.abs(finalVideoRect.height - imageRect.height) > 1) {
                Logger.warn(`[Size Mismatch] Video and image sizes don't match after sync!`);
            } else {
                Logger.debug(`[Size Match] ✓ Video and image sizes match perfectly`);
            }
        }, 10);
    }

    loadDateImage(dateString) {
        const imageContainer = this.modalBody.querySelector('#modal-image-container');
        const image = this.modalBody.querySelector('#modal-date-image');
        const video = this.modalBody.querySelector('video');
        
        if (!imageContainer || !image) return;

        const imagePath = `png_files/${dateString}.png`;
        
        // Preserve video state
        const videoWasPaused = video ? video.paused : true;
        const videoCurrentTime = video ? video.currentTime : 0;
        
        Logger.debug(`[Image Load] Loading image: ${imagePath}, Video paused: ${videoWasPaused}, Video time: ${videoCurrentTime}s`);
        
        // Show loading state
        image.style.opacity = '0.5';
        
        image.onload = () => {
            image.style.opacity = '1';
            imageContainer.style.display = 'block';
            
            // Sync image size to match video exactly
            this.syncImageToVideoSize();
            
            // Update modal width to accommodate the new image
            setTimeout(() => {
                this.updateModalWidth();
            }, 20);
            
            Logger.debug(`[Image Load] Successfully loaded image: ${imagePath}`);
        };
        
        image.onerror = () => {
            Logger.warn(`[Image Load] Failed to load image: ${imagePath}`);
            image.style.opacity = '1';
            // Don't show container if image fails to load
        };
        
        image.src = imagePath;
    }

    calculateModalWidth() {
        const video = this.modalBody.querySelector('video');
        const imageContainer = this.modalBody.querySelector('#modal-image-container');
        
        if (!video) {
            Logger.debug(`[Width Calc] No video found, using default width`);
            return 600;
        }
        
        const videoRect = video.getBoundingClientRect();
        const hasImage = imageContainer && imageContainer.style.display !== 'none';
        const isNarrowLayout = window.innerWidth < 900;
        
        // Calculate gaps and padding
        const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
        const gapPx = CONFIG.GAP_REM * rootFontSize;
        const modalPaddingPx = CONFIG.MODAL_PADDING_REM * rootFontSize;
        const mediaGap = isNarrowLayout ? gapPx * 0.5 : gapPx;
        
        let contentWidth;
        
        if (!hasImage) {
            // Video only
            contentWidth = videoRect.width;
            Logger.debug(`[Width Calc] Video only: ${contentWidth}px`);
        } else if (isNarrowLayout) {
            // Column layout: use the wider of video or image
            contentWidth = videoRect.width; // Image matches video size exactly
            Logger.debug(`[Width Calc] Column layout: ${contentWidth}px`);
        } else {
            // Row layout: video + image + gap
            contentWidth = (videoRect.width * 2) + mediaGap;
            Logger.debug(`[Width Calc] Row layout: ${videoRect.width} + ${videoRect.width} + ${mediaGap} = ${contentWidth}px`);
        }
        
        // Add modal padding and ensure minimum width
        const totalWidth = contentWidth + modalPaddingPx;
        const minWidth = 400;
        const maxWidth = window.innerWidth * 0.95;
        
        const finalWidth = Math.max(minWidth, Math.min(totalWidth, maxWidth));
        
        Logger.debug(`[Width Calc] Content: ${contentWidth}px, Total: ${totalWidth}px, Final: ${finalWidth}px (min: ${minWidth}, max: ${maxWidth})`);
        
        return finalWidth;
    }

    updateModalWidth() {
        if (!this.modalContent) return;
        
        const isMobile = window.innerWidth < CONFIG.MOBILE_BREAKPOINT;
        
        if (isMobile) {
            this.modalContent.style.width = '95%';
            this.modalContent.style.maxWidth = '95vw';
            Logger.debug(`[Width Update] Mobile: 95% width`);
        } else {
            // Use CSS-defined responsive width instead of rigid pixel calculation
            this.modalContent.style.width = '90%';
            this.modalContent.style.maxWidth = '90vw';
            Logger.debug(`[Width Update] Desktop: 90% width, max 90vw (CSS responsive)`);
        }
    }

    updateModalLayout() {
        const mediaContainer = this.modalBody.querySelector('#modal-media-container');
        if (!mediaContainer) return;
        
        const isNarrowLayout = window.innerWidth < 900;
        const newFlexDirection = isNarrowLayout ? 'column' : 'row';
        
        // Calculate gap values
        const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
        const gapPx = CONFIG.GAP_REM * rootFontSize;
        const mediaGap = isNarrowLayout ? gapPx * 0.5 : gapPx;
        
        Logger.debug(`[Layout Update] Window: ${window.innerWidth}px, Switching to: ${newFlexDirection}, Gap: ${mediaGap}px`);
        
        // Update media container layout
        mediaContainer.style.flexDirection = newFlexDirection;
        mediaContainer.style.gap = `${mediaGap}px`;
        
        // Update modal width for new layout
        this.updateModalWidth();
        
        // Re-sync image size after layout change
        setTimeout(() => {
            this.syncImageToVideoSize();
        }, 50);
    }

    setupVideoSizeObserver() {
        // Clean up any existing observer
        if (this.videoResizeObserver) {
            this.videoResizeObserver.disconnect();
        }
        
        const video = this.modalBody.querySelector('video');
        if (!video) return;
        
        // Create ResizeObserver to monitor video size changes
        this.videoResizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                Logger.debug(`[Video Resize] Video size changed to: ${width}px × ${height}px`);
                
                // Sync image size to match new video size
                const image = this.modalBody.querySelector('#modal-date-image');
                const imageContainer = this.modalBody.querySelector('#modal-image-container');
                
                if (image && imageContainer && imageContainer.style.display !== 'none') {
                    Logger.debug(`[Video Resize] Syncing image to new video size`);
                    this.syncImageToVideoSize();
                }
            }
        });
        
        // Start observing the video element
        this.videoResizeObserver.observe(video);
        Logger.debug(`[Video Observer] Started monitoring video element for size changes`);
    }

    setupWindowResizeListener() {
        // Clean up any existing resize listener
        if (this.windowResizeListener) {
            window.removeEventListener('resize', this.windowResizeListener);
        }
        
        // Debounce resize events to avoid excessive updates
        let resizeTimeout;
        this.windowResizeListener = () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                Logger.debug(`[Window Resize] New window size: ${window.innerWidth}x${window.innerHeight}`);
                this.updateModalLayout(); // This now calls updateModalWidth() internally
            }, 100);
        };
        
        window.addEventListener('resize', this.windowResizeListener);
        Logger.debug(`[Window Resize] Started monitoring window resize for layout updates`);
    }

    closeActiveImage() {
        const imageContainer = this.modalBody.querySelector('#modal-image-container');
        const video = this.modalBody.querySelector('video');
        
        if (imageContainer) {
            imageContainer.style.display = 'none';
            
            // Update modal width after closing image
            setTimeout(() => {
                this.updateModalWidth();
            }, 20);
            
            // Log video state after closing image to ensure it's preserved
            if (video) {
                Logger.debug(`[Image Close] Video state after closing image - Paused: ${video.paused}, Time: ${video.currentTime}s`);
            }
            
            Logger.debug(`[Image Close] Image container hidden`);
        }
    }

    closeModal() {
        super.closeModal();
        
        // Additional cleanup specific to this interaction manager
        this.closeActiveImage();
        
        // Clean up video size observer
        if (this.videoResizeObserver) {
            this.videoResizeObserver.disconnect();
            this.videoResizeObserver = null;
        }
        
        // Clean up window resize listener
        if (this.windowResizeListener) {
            window.removeEventListener('resize', this.windowResizeListener);
            this.windowResizeListener = null;
        }
    }

    formatDateToMonthYear(dateString) {
        if (!dateString) return '';
        try {
            const date = new Date(dateString + 'T00:00:00');
            return date.toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'short' 
            });
        } catch (error) {
            Logger.warn(`Failed to format date: ${dateString}`, error);
            return dateString;
        }
    }

    async validatePngAvailability(dates) {
        if (!Array.isArray(dates) || dates.length === 0) {
            return { isValid: true, availableCount: 0, missingDates: [] };
        }

        const missingDates = [];
        let availableCount = 0;

        // Check each date's PNG file availability
        for (const dateString of dates) {
            const pngPath = `png_files/${dateString}.png`;
            try {
                const response = await fetch(pngPath, { method: 'HEAD' });
                if (response.ok) {
                    availableCount++;
                } else {
                    missingDates.push(dateString);
                }
            } catch (error) {
                missingDates.push(dateString);
            }
        }

        const result = {
            isValid: missingDates.length === 0,
            totalDates: dates.length,
            availableCount: availableCount,
            missingDates: missingDates
        };

        if (!result.isValid) {
            Logger.warn(`PNG validation: ${missingDates.length}/${dates.length} PNG files missing for dates:`, missingDates);
        } else {
            Logger.debug(`PNG validation: All ${dates.length} PNG files available`);
        }

        return result;
    }


}