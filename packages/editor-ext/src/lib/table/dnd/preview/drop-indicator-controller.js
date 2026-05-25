"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DropIndicatorController = void 0;
var dom_1 = require("@floating-ui/dom");
var DROP_INDICATOR_WIDTH = 2;
var DropIndicatorController = /** @class */ (function () {
    function DropIndicatorController() {
        var _this = this;
        this.onDragStart = function (relatedDoms, type) {
            _this._initDropIndicatorStyle(relatedDoms.table, type);
            _this._initDropIndicatorPosition(relatedDoms.cell, type);
            _this._dropIndicator.dataset.dragging = 'true';
        };
        this.onDragEnd = function () {
            Object.assign(_this._dropIndicator.style, { display: 'none' });
            _this._dropIndicator.dataset.dragging = 'false';
        };
        this.onDragging = function (target, direction, type) {
            if (type === 'col') {
                void (0, dom_1.computePosition)(target, _this._dropIndicator, {
                    placement: direction === 'left' ? 'left' : 'right',
                    middleware: [(0, dom_1.offset)((direction === 'left' ? -1 * DROP_INDICATOR_WIDTH : 0))],
                }).then(function (_a) {
                    var x = _a.x;
                    Object.assign(_this._dropIndicator.style, { left: "".concat(x, "px") });
                });
                return;
            }
            if (type === 'row') {
                void (0, dom_1.computePosition)(target, _this._dropIndicator, {
                    placement: direction === 'up' ? 'top' : 'bottom',
                    middleware: [(0, dom_1.offset)((direction === 'up' ? -1 * DROP_INDICATOR_WIDTH : 0))],
                }).then(function (_a) {
                    var y = _a.y;
                    Object.assign(_this._dropIndicator.style, { top: "".concat(y, "px") });
                });
                return;
            }
        };
        this.destroy = function () {
            _this._dropIndicator.remove();
        };
        this._initDropIndicatorStyle = function (table, type) {
            var tableRect = table.getBoundingClientRect();
            if (type === 'col') {
                Object.assign(_this._dropIndicator.style, {
                    display: 'block',
                    width: "".concat(DROP_INDICATOR_WIDTH, "px"),
                    height: "".concat(tableRect.height, "px"),
                });
                return;
            }
            if (type === 'row') {
                Object.assign(_this._dropIndicator.style, {
                    display: 'block',
                    width: "".concat(tableRect.width, "px"),
                    height: "".concat(DROP_INDICATOR_WIDTH, "px"),
                });
            }
        };
        this._initDropIndicatorPosition = function (cell, type) {
            void (0, dom_1.computePosition)(cell, _this._dropIndicator, {
                placement: type === 'row' ? 'right' : 'bottom',
                middleware: [
                    (0, dom_1.offset)(function (_a) {
                        var rects = _a.rects;
                        if (type === 'col') {
                            return -rects.reference.height;
                        }
                        return -rects.reference.width;
                    }),
                ],
            }).then(function (_a) {
                var x = _a.x, y = _a.y;
                Object.assign(_this._dropIndicator.style, {
                    left: "".concat(x, "px"),
                    top: "".concat(y, "px"),
                });
            });
        };
        this._dropIndicator = document.createElement('div');
        this._dropIndicator.classList.add('table-dnd-drop-indicator');
        Object.assign(this._dropIndicator.style, {
            position: 'absolute',
            pointerEvents: 'none'
        });
    }
    Object.defineProperty(DropIndicatorController.prototype, "dropIndicatorRoot", {
        get: function () {
            return this._dropIndicator;
        },
        enumerable: false,
        configurable: true
    });
    return DropIndicatorController;
}());
exports.DropIndicatorController = DropIndicatorController;
