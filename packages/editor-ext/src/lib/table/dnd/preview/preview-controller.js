"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PreviewController = void 0;
var dom_1 = require("@floating-ui/dom");
var render_preview_1 = require("./render-preview");
var PreviewController = /** @class */ (function () {
    function PreviewController() {
        var _this = this;
        this.onDragStart = function (relatedDoms, index, type) {
            _this._initPreviewStyle(relatedDoms.table, relatedDoms.cell, type);
            (0, render_preview_1.createPreviewDOM)(relatedDoms.table, _this._preview, index, type);
            _this._initPreviewPosition(relatedDoms.table, relatedDoms.cell, type);
        };
        this.onDragEnd = function () {
            (0, render_preview_1.clearPreviewDOM)(_this._preview);
            Object.assign(_this._preview.style, { display: 'none' });
        };
        this.onDragging = function (relatedDoms, x, y, type) {
            _this._updatePreviewPosition(x, y, relatedDoms.table, relatedDoms.cell, type);
        };
        this.destroy = function () {
            _this._preview.remove();
        };
        this._preview = document.createElement('div');
        this._preview.classList.add('table-dnd-preview');
        this._preview.classList.add('ProseMirror');
        Object.assign(this._preview.style, {
            position: 'absolute',
            pointerEvents: 'none',
            display: 'none',
        });
    }
    Object.defineProperty(PreviewController.prototype, "previewRoot", {
        get: function () {
            return this._preview;
        },
        enumerable: false,
        configurable: true
    });
    PreviewController.prototype._initPreviewStyle = function (table, cell, type) {
        var tableRect = table.getBoundingClientRect();
        var cellRect = cell.getBoundingClientRect();
        if (type === 'col') {
            Object.assign(this._preview.style, {
                display: 'block',
                width: "".concat(cellRect.width, "px"),
                height: "".concat(tableRect.height, "px"),
            });
        }
        if (type === 'row') {
            Object.assign(this._preview.style, {
                display: 'block',
                width: "".concat(tableRect.width, "px"),
                height: "".concat(cellRect.height, "px"),
            });
        }
    };
    PreviewController.prototype._initPreviewPosition = function (table, cell, type) {
        var _this = this;
        void (0, dom_1.computePosition)(cell, this._preview, {
            placement: type === 'row' ? 'right' : 'bottom',
            middleware: [
                (0, dom_1.offset)(function (_a) {
                    var rects = _a.rects;
                    if (type === 'col') {
                        return -rects.reference.height;
                    }
                    return -rects.reference.width;
                }),
                (0, dom_1.shift)({ boundary: table, padding: 0 }),
            ],
        }).then(function (_a) {
            var x = _a.x, y = _a.y;
            Object.assign(_this._preview.style, {
                left: "".concat(x, "px"),
                top: "".concat(y, "px"),
            });
        });
    };
    // Clamp the preview to within the table's bounds via `shift({ boundary })`
    // so it can't track the cursor past the table edge. Without the clamp,
    // dragging near the viewport edge pushes the preview's `left` (or `top`)
    // beyond the document's natural width/height, the browser extends the
    // page to contain it, and the auto-scroll plugin then has a wider area
    // to keep scrolling into — a feedback loop that grows the page forever.
    PreviewController.prototype._updatePreviewPosition = function (x, y, table, cell, type) {
        var _this = this;
        (0, dom_1.computePosition)(getVirtualElement(cell, x, y), this._preview, {
            placement: type === 'row' ? 'right' : 'bottom',
            middleware: [(0, dom_1.shift)({ boundary: table, padding: 0 })],
        }).then(function (_a) {
            var x = _a.x, y = _a.y;
            if (type === 'row') {
                Object.assign(_this._preview.style, {
                    top: "".concat(y, "px"),
                });
                return;
            }
            if (type === 'col') {
                Object.assign(_this._preview.style, {
                    left: "".concat(x, "px"),
                });
                return;
            }
        });
    };
    return PreviewController;
}());
exports.PreviewController = PreviewController;
function getVirtualElement(cell, x, y) {
    return {
        contextElement: cell,
        getBoundingClientRect: function () {
            var rect = cell.getBoundingClientRect();
            return {
                width: rect.width,
                height: rect.height,
                right: x + rect.width / 2,
                bottom: y + rect.height / 2,
                top: y - rect.height / 2,
                left: x - rect.width / 2,
                x: x - rect.width / 2,
                y: y - rect.height / 2,
            };
        },
    };
}
