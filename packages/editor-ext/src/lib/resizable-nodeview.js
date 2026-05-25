"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResizableNodeView = void 0;
var isTouchEvent = function (e) {
    return 'touches' in e;
};
/**
 * A NodeView implementation that adds resize handles to any DOM element.
 *
 * This class creates a resizable node view for Tiptap/ProseMirror editors.
 * It wraps your element with resize handles and manages the resize interaction,
 * including aspect ratio preservation, min/max constraints, and keyboard modifiers.
 *
 * @example
 * ```ts
 * // Basic usage in a Tiptap extension
 * addNodeView() {
 *   return ({ node, getPos }) => {
 *     const img = document.createElement('img')
 *     img.src = node.attrs.src
 *
 *     return new ResizableNodeView({
 *       element: img,
 *       node,
 *       getPos,
 *       onResize: (width, height) => {
 *         img.style.width = `${width}px`
 *         img.style.height = `${height}px`
 *       },
 *       onCommit: (width, height) => {
 *         this.editor.commands.updateAttributes('image', { width, height })
 *       },
 *       onUpdate: () => true,
 *       options: {
 *         min: { width: 100, height: 100 },
 *         preserveAspectRatio: true
 *       }
 *     })
 *   }
 * }
 * ```
 */
var ResizableNodeView = /** @class */ (function () {
    /**
     * Creates a new ResizableNodeView instance.
     *
     * The constructor sets up the resize handles, applies initial sizing from
     * node attributes, and configures all resize behavior options.
     *
     * @param options - Configuration options for the resizable node view
     */
    function ResizableNodeView(options) {
        var _this = this;
        var _a, _b, _c, _d, _e, _f;
        /** Active resize handle directions */
        this.directions = [
            'bottom-left',
            'bottom-right',
            'top-left',
            'top-right',
        ];
        /** Minimum allowed dimensions */
        this.minSize = {
            height: 8,
            width: 8,
        };
        /** Whether to always preserve aspect ratio */
        this.preserveAspectRatio = false;
        /** CSS class names for elements */
        this.classNames = {
            container: '',
            wrapper: '',
            handle: '',
            resizing: '',
        };
        /** Initial width of the element (for aspect ratio calculation) */
        this.initialWidth = 0;
        /** Initial height of the element (for aspect ratio calculation) */
        this.initialHeight = 0;
        /** Calculated aspect ratio (width / height) */
        this.aspectRatio = 1;
        /** Whether a resize operation is currently active */
        this.isResizing = false;
        /** The handle currently being dragged */
        this.activeHandle = null;
        /** Starting mouse X position when resize began */
        this.startX = 0;
        /** Starting mouse Y position when resize began */
        this.startY = 0;
        /** Element width when resize began */
        this.startWidth = 0;
        /** Element height when resize began */
        this.startHeight = 0;
        /** Whether Shift key is currently pressed (for temporary aspect ratio lock) */
        this.isShiftKeyPressed = false;
        /** Last known editable state of the editor */
        this.lastEditableState = undefined;
        /** Map of handle elements by direction */
        this.handleMap = new Map();
        /**
         * Handles mouse movement during an active resize.
         *
         * Calculates the delta from the starting position, computes new dimensions
         * based on the active handle direction, applies constraints and aspect ratio,
         * then updates the element's style and calls the onResize callback.
         *
         * @param event - The mouse move event
         */
        this.handleMouseMove = function (event) {
            if (!_this.isResizing || !_this.activeHandle) {
                return;
            }
            var deltaX = event.clientX - _this.startX;
            var deltaY = event.clientY - _this.startY;
            _this.handleResize(deltaX, deltaY);
        };
        this.handleTouchMove = function (event) {
            if (!_this.isResizing || !_this.activeHandle) {
                return;
            }
            var touch = event.touches[0];
            if (!touch) {
                return;
            }
            var deltaX = touch.clientX - _this.startX;
            var deltaY = touch.clientY - _this.startY;
            _this.handleResize(deltaX, deltaY);
        };
        /**
         * Completes the resize operation when the mouse button is released.
         *
         * Captures final dimensions, calls the onCommit callback to persist changes,
         * removes the resizing state and class, and cleans up document-level listeners.
         */
        this.handleMouseUp = function () {
            if (!_this.isResizing) {
                return;
            }
            var finalWidth = _this.element.offsetWidth;
            var finalHeight = _this.element.offsetHeight;
            _this.onCommit(finalWidth, finalHeight);
            _this.isResizing = false;
            _this.activeHandle = null;
            // Remove UI state
            _this.container.dataset.resizeState = 'false';
            if (_this.classNames.resizing) {
                _this.container.classList.remove(_this.classNames.resizing);
            }
            // Clean up document-level listeners
            document.removeEventListener('mousemove', _this.handleMouseMove);
            document.removeEventListener('touchmove', _this.handleTouchMove);
            document.removeEventListener('mouseup', _this.handleMouseUp);
            document.removeEventListener('touchend', _this.handleMouseUp);
            window.removeEventListener('blur', _this.handleMouseUp);
            document.removeEventListener('keydown', _this.handleKeyDown);
            document.removeEventListener('keyup', _this.handleKeyUp);
        };
        /**
         * Tracks Shift key state to enable temporary aspect ratio locking.
         *
         * When Shift is pressed during resize, aspect ratio is preserved even if
         * preserveAspectRatio is false.
         *
         * @param event - The keyboard event
         */
        this.handleKeyDown = function (event) {
            if (event.key === 'Shift') {
                _this.isShiftKeyPressed = true;
            }
        };
        /**
         * Tracks Shift key release to disable temporary aspect ratio locking.
         *
         * @param event - The keyboard event
         */
        this.handleKeyUp = function (event) {
            if (event.key === 'Shift') {
                _this.isShiftKeyPressed = false;
            }
        };
        this.node = options.node;
        this.editor = options.editor;
        this.element = options.element;
        this.contentElement = options.contentElement;
        this.getPos = options.getPos;
        this.onResize = options.onResize;
        this.onCommit = options.onCommit;
        this.onUpdate = options.onUpdate;
        if ((_a = options.options) === null || _a === void 0 ? void 0 : _a.min) {
            this.minSize = __assign(__assign({}, this.minSize), options.options.min);
        }
        if ((_b = options.options) === null || _b === void 0 ? void 0 : _b.max) {
            this.maxSize = options.options.max;
        }
        if ((_c = options === null || options === void 0 ? void 0 : options.options) === null || _c === void 0 ? void 0 : _c.directions) {
            this.directions = options.options.directions;
        }
        if ((_d = options.options) === null || _d === void 0 ? void 0 : _d.preserveAspectRatio) {
            this.preserveAspectRatio = options.options.preserveAspectRatio;
        }
        if ((_e = options.options) === null || _e === void 0 ? void 0 : _e.className) {
            this.classNames = {
                container: options.options.className.container || '',
                wrapper: options.options.className.wrapper || '',
                handle: options.options.className.handle || '',
                resizing: options.options.className.resizing || '',
            };
        }
        if ((_f = options.options) === null || _f === void 0 ? void 0 : _f.createCustomHandle) {
            this.createCustomHandle = options.options.createCustomHandle;
        }
        this.wrapper = this.createWrapper();
        this.container = this.createContainer();
        this.applyInitialSize();
        if (this.editor.isEditable) {
            this.attachHandles();
        }
        this.editor.on('update', this.handleEditorUpdate.bind(this));
    }
    Object.defineProperty(ResizableNodeView.prototype, "dom", {
        /**
         * Returns the top-level DOM node that should be placed in the editor.
         *
         * This is required by the ProseMirror NodeView interface. The container
         * includes the wrapper, handles, and the actual content element.
         *
         * @returns The container element to be inserted into the editor
         */
        get: function () {
            return this.container;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(ResizableNodeView.prototype, "contentDOM", {
        get: function () {
            var _a;
            return (_a = this.contentElement) !== null && _a !== void 0 ? _a : null;
        },
        enumerable: false,
        configurable: true
    });
    ResizableNodeView.prototype.handleEditorUpdate = function () {
        var isEditable = this.editor.isEditable;
        // Only if state actually changed
        if (isEditable === this.lastEditableState) {
            return;
        }
        this.lastEditableState = isEditable;
        if (!isEditable) {
            this.removeHandles();
        }
        else if (isEditable && this.handleMap.size === 0) {
            this.attachHandles();
        }
    };
    /**
     * Called when the node's content or attributes change.
     *
     * Updates the internal node reference. If a custom `onUpdate` callback
     * was provided, it will be called to handle additional update logic.
     *
     * @param node - The new/updated node
     * @param decorations - Node decorations
     * @param innerDecorations - Inner decorations
     * @returns `false` if the node type has changed (requires full rebuild), otherwise the result of `onUpdate` or `true`
     */
    ResizableNodeView.prototype.update = function (node, decorations, innerDecorations) {
        if (node.type !== this.node.type) {
            return false;
        }
        this.node = node;
        if (this.onUpdate) {
            return this.onUpdate(node, decorations, innerDecorations);
        }
        return true;
    };
    /**
     * Cleanup method called when the node view is being removed.
     *
     * Removes all event listeners to prevent memory leaks. This is required
     * by the ProseMirror NodeView interface. If a resize is active when
     * destroy is called, it will be properly cancelled.
     */
    ResizableNodeView.prototype.destroy = function () {
        if (this.isResizing) {
            this.container.dataset.resizeState = 'false';
            if (this.classNames.resizing) {
                this.container.classList.remove(this.classNames.resizing);
            }
            document.removeEventListener('mousemove', this.handleMouseMove);
            document.removeEventListener('touchmove', this.handleTouchMove);
            document.removeEventListener('mouseup', this.handleMouseUp);
            document.removeEventListener('touchend', this.handleMouseUp);
            window.removeEventListener('blur', this.handleMouseUp);
            document.removeEventListener('keydown', this.handleKeyDown);
            document.removeEventListener('keyup', this.handleKeyUp);
            this.isResizing = false;
            this.activeHandle = null;
        }
        this.editor.off('update', this.handleEditorUpdate.bind(this));
        this.container.remove();
    };
    /**
     * Creates the outer container element.
     *
     * The container is the top-level element returned by the NodeView and
     * wraps the entire resizable node. It's set up with flexbox to handle
     * alignment and includes data attributes for styling and identification.
     *
     * @returns The container element
     */
    ResizableNodeView.prototype.createContainer = function () {
        var element = document.createElement('div');
        element.dataset.resizeContainer = '';
        element.dataset.node = this.node.type.name;
        element.style.display = 'flex';
        if (this.classNames.container) {
            element.className = this.classNames.container;
        }
        element.appendChild(this.wrapper);
        return element;
    };
    /**
     * Creates the wrapper element that contains the content and handles.
     *
     * The wrapper uses relative positioning so that resize handles can be
     * positioned absolutely within it. This is the direct parent of the
     * content element being made resizable.
     *
     * @returns The wrapper element
     */
    ResizableNodeView.prototype.createWrapper = function () {
        var element = document.createElement('div');
        element.style.position = 'relative';
        element.style.display = 'block';
        element.dataset.resizeWrapper = '';
        if (this.classNames.wrapper) {
            element.className = this.classNames.wrapper;
        }
        element.appendChild(this.element);
        return element;
    };
    /**
     * Creates a resize handle element for a specific direction.
     *
     * Each handle is absolutely positioned and includes a data attribute
     * identifying its direction for styling purposes.
     *
     * @param direction - The resize direction for this handle
     * @returns The handle element
     */
    ResizableNodeView.prototype.createHandle = function (direction) {
        var handle = document.createElement('div');
        handle.dataset.resizeHandle = direction;
        handle.style.position = 'absolute';
        if (this.classNames.handle) {
            handle.className = this.classNames.handle;
        }
        return handle;
    };
    /**
     * Positions a handle element according to its direction.
     *
     * Corner handles (e.g., 'top-left') are positioned at the intersection
     * of two edges. Edge handles (e.g., 'top') span the full width or height.
     *
     * @param handle - The handle element to position
     * @param direction - The direction determining the position
     */
    ResizableNodeView.prototype.positionHandle = function (handle, direction) {
        var isTop = direction.includes('top');
        var isBottom = direction.includes('bottom');
        var isLeft = direction.includes('left');
        var isRight = direction.includes('right');
        if (isTop) {
            handle.style.top = '0';
        }
        if (isBottom) {
            handle.style.bottom = '0';
        }
        if (isLeft) {
            handle.style.left = '0';
        }
        if (isRight) {
            handle.style.right = '0';
        }
        // Edge handles span the full width or height
        if (direction === 'top' || direction === 'bottom') {
            handle.style.left = '0';
            handle.style.right = '0';
        }
        if (direction === 'left' || direction === 'right') {
            handle.style.top = '0';
            handle.style.bottom = '0';
        }
    };
    /**
     * Creates and attaches all resize handles to the wrapper.
     *
     * Iterates through the configured directions, creates a handle for each,
     * positions it, attaches the mousedown listener, and appends it to the DOM.
     */
    ResizableNodeView.prototype.attachHandles = function () {
        var _this = this;
        this.directions.forEach(function (direction) {
            var handle;
            if (_this.createCustomHandle) {
                handle = _this.createCustomHandle(direction);
            }
            else {
                handle = _this.createHandle(direction);
            }
            if (!(handle instanceof HTMLElement)) {
                console.warn("[ResizableNodeView] createCustomHandle(\"".concat(direction, "\") did not return an HTMLElement. Falling back to default handle."));
                handle = _this.createHandle(direction);
            }
            if (!_this.createCustomHandle) {
                _this.positionHandle(handle, direction);
            }
            handle.addEventListener('mousedown', function (event) {
                return _this.handleResizeStart(event, direction);
            });
            handle.addEventListener('touchstart', function (event) {
                return _this.handleResizeStart(event, direction);
            });
            _this.handleMap.set(direction, handle);
            _this.wrapper.appendChild(handle);
        });
    };
    /**
     * Removes all resize handles from the wrapper.
     *
     * Cleans up the handle map and removes each handle element from the DOM.
     */
    ResizableNodeView.prototype.removeHandles = function () {
        this.handleMap.forEach(function (el) { return el.remove(); });
        this.handleMap.clear();
    };
    /**
     * Applies initial sizing from node attributes to the element.
     *
     * If width/height attributes exist on the node, they're applied to the element.
     * Otherwise, the element's natural/current dimensions are measured. The aspect
     * ratio is calculated for later use in aspect-ratio-preserving resizes.
     */
    ResizableNodeView.prototype.applyInitialSize = function () {
        var width = this.node.attrs.width;
        var height = this.node.attrs.height;
        if (width) {
            this.element.style.width = "".concat(width, "px");
            this.initialWidth = width;
        }
        else {
            this.initialWidth = this.element.offsetWidth;
        }
        if (height) {
            this.element.style.height = "".concat(height, "px");
            this.initialHeight = height;
        }
        else {
            this.initialHeight = this.element.offsetHeight;
        }
        // Calculate aspect ratio for use during resizing
        if (this.initialWidth > 0 && this.initialHeight > 0) {
            this.aspectRatio = this.initialWidth / this.initialHeight;
        }
    };
    /**
     * Initiates a resize operation when a handle is clicked.
     *
     * Captures the starting mouse position and element dimensions, sets up
     * the resize state, adds the resizing class and state attribute, and
     * attaches document-level listeners for mouse movement and keyboard input.
     *
     * @param event - The mouse down event
     * @param direction - The direction of the handle being dragged
     */
    ResizableNodeView.prototype.handleResizeStart = function (event, direction) {
        event.preventDefault();
        event.stopPropagation();
        // Capture initial state
        this.isResizing = true;
        this.activeHandle = direction;
        if (isTouchEvent(event)) {
            this.startX = event.touches[0].clientX;
            this.startY = event.touches[0].clientY;
        }
        else {
            this.startX = event.clientX;
            this.startY = event.clientY;
        }
        this.startWidth = this.element.offsetWidth;
        this.startHeight = this.element.offsetHeight;
        // Recalculate aspect ratio at resize start for accuracy
        if (this.startWidth > 0 && this.startHeight > 0) {
            this.aspectRatio = this.startWidth / this.startHeight;
        }
        var pos = this.getPos();
        if (pos !== undefined) {
            // TODO: Select the node in the editor
        }
        // Update UI state
        this.container.dataset.resizeState = 'true';
        if (this.classNames.resizing) {
            this.container.classList.add(this.classNames.resizing);
        }
        // Attach document-level listeners for resize
        document.addEventListener('mousemove', this.handleMouseMove);
        document.addEventListener('touchmove', this.handleTouchMove);
        document.addEventListener('mouseup', this.handleMouseUp);
        document.addEventListener('touchend', this.handleMouseUp);
        window.addEventListener('blur', this.handleMouseUp);
        document.addEventListener('keydown', this.handleKeyDown);
        document.addEventListener('keyup', this.handleKeyUp);
    };
    ResizableNodeView.prototype.handleResize = function (deltaX, deltaY) {
        if (!this.activeHandle) {
            return;
        }
        var shouldPreserveAspectRatio = this.preserveAspectRatio || this.isShiftKeyPressed;
        var _a = this.calculateNewDimensions(this.activeHandle, deltaX, deltaY), width = _a.width, height = _a.height;
        var constrained = this.applyConstraints(width, height, shouldPreserveAspectRatio);
        this.element.style.width = "".concat(constrained.width, "px");
        this.element.style.height = "".concat(constrained.height, "px");
        if (this.onResize) {
            this.onResize(constrained.width, constrained.height);
        }
    };
    /**
     * Calculates new dimensions based on mouse delta and resize direction.
     *
     * Takes the starting dimensions and applies the mouse movement delta
     * according to the handle direction. For corner handles, both dimensions
     * are affected. For edge handles, only one dimension changes. If aspect
     * ratio should be preserved, delegates to applyAspectRatio.
     *
     * @param direction - The active resize handle direction
     * @param deltaX - Horizontal mouse movement since resize start
     * @param deltaY - Vertical mouse movement since resize start
     * @returns The calculated width and height
     */
    ResizableNodeView.prototype.calculateNewDimensions = function (direction, deltaX, deltaY) {
        var newWidth = this.startWidth;
        var newHeight = this.startHeight;
        var isRight = direction.includes('right');
        var isLeft = direction.includes('left');
        var isBottom = direction.includes('bottom');
        var isTop = direction.includes('top');
        // Apply horizontal delta
        if (isRight) {
            newWidth = this.startWidth + deltaX;
        }
        else if (isLeft) {
            newWidth = this.startWidth - deltaX;
        }
        // Apply vertical delta
        if (isBottom) {
            newHeight = this.startHeight + deltaY;
        }
        else if (isTop) {
            newHeight = this.startHeight - deltaY;
        }
        // For pure horizontal/vertical handles, only one dimension changes
        if (direction === 'right' || direction === 'left') {
            newWidth = this.startWidth + (isRight ? deltaX : -deltaX);
        }
        if (direction === 'top' || direction === 'bottom') {
            newHeight = this.startHeight + (isBottom ? deltaY : -deltaY);
        }
        var shouldPreserveAspectRatio = this.preserveAspectRatio || this.isShiftKeyPressed;
        if (shouldPreserveAspectRatio) {
            return this.applyAspectRatio(newWidth, newHeight, direction);
        }
        return { width: newWidth, height: newHeight };
    };
    /**
     * Applies min/max constraints to dimensions.
     *
     * When aspect ratio is NOT preserved, constraints are applied independently
     * to width and height. When aspect ratio IS preserved, constraints are
     * applied while maintaining the aspect ratio—if one dimension hits a limit,
     * the other is recalculated proportionally.
     *
     * This ensures that aspect ratio is never broken when constrained.
     *
     * @param width - The unconstrained width
     * @param height - The unconstrained height
     * @param preserveAspectRatio - Whether to maintain aspect ratio while constraining
     * @returns The constrained dimensions
     */
    ResizableNodeView.prototype.applyConstraints = function (width, height, preserveAspectRatio) {
        var _a, _b, _c, _d;
        if (!preserveAspectRatio) {
            // Independent constraints for each dimension
            var constrainedWidth_1 = Math.max(this.minSize.width, width);
            var constrainedHeight_1 = Math.max(this.minSize.height, height);
            if ((_a = this.maxSize) === null || _a === void 0 ? void 0 : _a.width) {
                constrainedWidth_1 = Math.min(this.maxSize.width, constrainedWidth_1);
            }
            if ((_b = this.maxSize) === null || _b === void 0 ? void 0 : _b.height) {
                constrainedHeight_1 = Math.min(this.maxSize.height, constrainedHeight_1);
            }
            return { width: constrainedWidth_1, height: constrainedHeight_1 };
        }
        // Aspect-ratio-aware constraints: adjust both dimensions proportionally
        var constrainedWidth = width;
        var constrainedHeight = height;
        // Check minimum constraints
        if (constrainedWidth < this.minSize.width) {
            constrainedWidth = this.minSize.width;
            constrainedHeight = constrainedWidth / this.aspectRatio;
        }
        if (constrainedHeight < this.minSize.height) {
            constrainedHeight = this.minSize.height;
            constrainedWidth = constrainedHeight * this.aspectRatio;
        }
        // Check maximum constraints
        if (((_c = this.maxSize) === null || _c === void 0 ? void 0 : _c.width) && constrainedWidth > this.maxSize.width) {
            constrainedWidth = this.maxSize.width;
            constrainedHeight = constrainedWidth / this.aspectRatio;
        }
        if (((_d = this.maxSize) === null || _d === void 0 ? void 0 : _d.height) && constrainedHeight > this.maxSize.height) {
            constrainedHeight = this.maxSize.height;
            constrainedWidth = constrainedHeight * this.aspectRatio;
        }
        return { width: constrainedWidth, height: constrainedHeight };
    };
    /**
     * Adjusts dimensions to maintain the original aspect ratio.
     *
     * For horizontal handles (left/right), uses width as the primary dimension
     * and calculates height from it. For vertical handles (top/bottom), uses
     * height as primary and calculates width. For corner handles, uses width
     * as the primary dimension.
     *
     * @param width - The new width
     * @param height - The new height
     * @param direction - The active resize direction
     * @returns Dimensions adjusted to preserve aspect ratio
     */
    ResizableNodeView.prototype.applyAspectRatio = function (width, height, direction) {
        var isHorizontal = direction === 'left' || direction === 'right';
        var isVertical = direction === 'top' || direction === 'bottom';
        if (isHorizontal) {
            // For horizontal resize, width is primary
            return {
                width: width,
                height: width / this.aspectRatio,
            };
        }
        if (isVertical) {
            // For vertical resize, height is primary
            return {
                width: height * this.aspectRatio,
                height: height,
            };
        }
        // For corner resize, width is primary
        return {
            width: width,
            height: width / this.aspectRatio,
        };
    };
    return ResizableNodeView;
}());
exports.ResizableNodeView = ResizableNodeView;
