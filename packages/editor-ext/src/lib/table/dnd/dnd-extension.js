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
exports.TableHandleCommandsExtension = exports.TableDndExtension = exports.TableDndKey = void 0;
exports.getTableHandlePluginSpec = getTableHandlePluginSpec;
var core_1 = require("@tiptap/core");
var state_1 = require("@tiptap/pm/state");
var tables_1 = require("@tiptap/pm/tables");
var tables_2 = require("@tiptap/pm/tables");
var utils_1 = require("./utils");
var calc_drag_over_1 = require("./calc-drag-over");
var query_1 = require("../utils/query");
var utils_2 = require("../utils");
var preview_controller_1 = require("./preview/preview-controller");
var drop_indicator_controller_1 = require("./preview/drop-indicator-controller");
var INITIAL_STATE = {
    hoveringCell: null,
    tableNode: null,
    tablePos: null,
    dragging: null,
    frozen: false,
};
exports.TableDndKey = new state_1.PluginKey("table-handles");
var TableHandlePluginSpec = /** @class */ (function () {
    function TableHandlePluginSpec(editor) {
        var _this = this;
        this.editor = editor;
        this.key = exports.TableDndKey;
        this._disposables = [];
        this._draggingDirection = "col";
        this._draggingIndex = -1;
        this._droppingIndex = -1;
        this._startCoords = { x: 0, y: 0 };
        this._dragging = false;
        this.state = {
            init: function () { return INITIAL_STATE; },
            apply: function (tr, prev) {
                var meta = tr.getMeta(exports.TableDndKey);
                if (!meta)
                    return prev;
                var changed = false;
                for (var key in meta) {
                    if (!Object.is(prev[key], meta[key])) {
                        changed = true;
                        break;
                    }
                }
                return changed ? __assign(__assign({}, prev), meta) : prev;
            },
        };
        this.view = function () {
            var wrapper = _this.editor.options.element;
            // @ts-ignore
            wrapper.appendChild(_this._previewController.previewRoot);
            // @ts-ignore
            wrapper.appendChild(_this._dropIndicatorController.dropIndicatorRoot);
            // Track the cursor cell so handles follow keyboard nav and clicks too.
            _this.editor.on("selectionUpdate", _this._onSelectionUpdate);
            _this._disposables.push(function () {
                return _this.editor.off("selectionUpdate", _this._onSelectionUpdate);
            });
            return {
                destroy: _this.destroy,
            };
        };
        this.destroy = function () {
            _this._previewController.destroy();
            _this._dropIndicatorController.destroy();
            _this._disposables.forEach(function (d) { return d(); });
        };
        this._pointerDown = function (view, _event) {
            var current = exports.TableDndKey.getState(view.state);
            if (current === null || current === void 0 ? void 0 : current.frozen)
                _this.editor.commands.unfreezeHandles();
            return false;
        };
        this._pointerMove = function (view, event) {
            var _a, _b, _c, _d, _e, _f;
            var current = exports.TableDndKey.getState(view.state);
            if ((current === null || current === void 0 ? void 0 : current.frozen) || (current === null || current === void 0 ? void 0 : current.dragging))
                return;
            var resizeState = tables_1.columnResizingPluginKey.getState(view.state);
            if (resizeState === null || resizeState === void 0 ? void 0 : resizeState.dragging)
                return;
            if (!_this.editor.isEditable) {
                if ((current === null || current === void 0 ? void 0 : current.hoveringCell) == null && (current === null || current === void 0 ? void 0 : current.tableNode) == null && (current === null || current === void 0 ? void 0 : current.tablePos) == null)
                    return;
                _this._dispatchMeta({ hoveringCell: null, tableNode: null, tablePos: null });
                return;
            }
            var hoveringCell = (0, utils_1.getHoveringCell)(view, event);
            if (hoveringCell) {
                if (((_a = current === null || current === void 0 ? void 0 : current.hoveringCell) === null || _a === void 0 ? void 0 : _a.cellPos) === hoveringCell.cellPos)
                    return;
                _this._hoveringCell = hoveringCell;
                var $cell = view.state.doc.resolve(hoveringCell.cellPos);
                var tableInfo = (0, query_1.findTable)($cell);
                _this._dispatchMeta({
                    hoveringCell: hoveringCell,
                    tableNode: (_b = tableInfo === null || tableInfo === void 0 ? void 0 : tableInfo.node) !== null && _b !== void 0 ? _b : null,
                    tablePos: (_c = tableInfo === null || tableInfo === void 0 ? void 0 : tableInfo.pos) !== null && _c !== void 0 ? _c : null,
                });
                return;
            }
            // Pointer isn't over a cell but may be transiting toward a handle that
            // floats outside the cell — fall back to the selection's cell so the
            // handles stay visible.
            var $cellPos = (0, tables_2.cellAround)(view.state.selection.$head);
            if ($cellPos) {
                var cellInfo = (0, utils_1.cellInfoFromResolvedCell)($cellPos);
                if (((_d = current === null || current === void 0 ? void 0 : current.hoveringCell) === null || _d === void 0 ? void 0 : _d.cellPos) === cellInfo.cellPos)
                    return;
                _this._hoveringCell = cellInfo;
                var tableInfo = (0, query_1.findTable)($cellPos);
                _this._dispatchMeta({
                    hoveringCell: cellInfo,
                    tableNode: (_e = tableInfo === null || tableInfo === void 0 ? void 0 : tableInfo.node) !== null && _e !== void 0 ? _e : null,
                    tablePos: (_f = tableInfo === null || tableInfo === void 0 ? void 0 : tableInfo.pos) !== null && _f !== void 0 ? _f : null,
                });
                return;
            }
            _this._hoveringCell = undefined;
            if ((current === null || current === void 0 ? void 0 : current.hoveringCell) == null && (current === null || current === void 0 ? void 0 : current.tableNode) == null && (current === null || current === void 0 ? void 0 : current.tablePos) == null)
                return;
            _this._dispatchMeta({ hoveringCell: null, tableNode: null, tablePos: null });
        };
        this._onSelectionUpdate = function () {
            var _a, _b, _c;
            if (!_this.editor.isEditable)
                return;
            var current = exports.TableDndKey.getState(_this.editor.state);
            if ((current === null || current === void 0 ? void 0 : current.frozen) || (current === null || current === void 0 ? void 0 : current.dragging))
                return;
            var $cellPos = (0, tables_2.cellAround)(_this.editor.state.selection.$head);
            if (!$cellPos)
                return;
            var cellInfo = (0, utils_1.cellInfoFromResolvedCell)($cellPos);
            if (((_a = current === null || current === void 0 ? void 0 : current.hoveringCell) === null || _a === void 0 ? void 0 : _a.cellPos) === cellInfo.cellPos)
                return;
            _this._hoveringCell = cellInfo;
            var tableInfo = (0, query_1.findTable)($cellPos);
            _this._dispatchMeta({
                hoveringCell: cellInfo,
                tableNode: (_b = tableInfo === null || tableInfo === void 0 ? void 0 : tableInfo.node) !== null && _b !== void 0 ? _b : null,
                tablePos: (_c = tableInfo === null || tableInfo === void 0 ? void 0 : tableInfo.pos) !== null && _c !== void 0 ? _c : null,
            });
        };
        this._dispatchMeta = function (patch) {
            var tr = _this.editor.state.tr.setMeta(exports.TableDndKey, patch);
            tr.setMeta("addToHistory", false);
            _this.editor.view.dispatch(tr);
        };
        // ---- Public API for the React handle layer ----
        // Returns true if the drag was set up successfully.
        this.startDragFromHandle = function (orientation, clientX, clientY) {
            var _a;
            if (!_this._hoveringCell)
                return false;
            _this._dragging = true;
            _this._draggingDirection = orientation;
            _this._startCoords = { x: clientX, y: clientY };
            var draggingIndex = (_a = (orientation === "col"
                ? _this._hoveringCell.colIndex
                : _this._hoveringCell.rowIndex)) !== null && _a !== void 0 ? _a : 0;
            _this._draggingIndex = draggingIndex;
            var relatedDoms = (0, utils_1.getDndRelatedDOMs)(_this.editor.view, _this._hoveringCell.cellPos, draggingIndex, orientation);
            if (!relatedDoms) {
                _this._dragging = false;
                return false;
            }
            _this._draggingDOMs = relatedDoms;
            _this._previewController.onDragStart(relatedDoms, draggingIndex, orientation);
            _this._dropIndicatorController.onDragStart(relatedDoms, orientation);
            // Park the selection inside the dragged cell unless it's already in the
            // same table. PM auto-maps `selection.from` through concurrent remote
            // transactions, so commitDrop can resolve the table even if the doc
            // shifted mid-drag — same trick the pre-pragmatic-dnd implementation
            // relied on.
            var state = _this.editor.state;
            var currentTable = (0, query_1.findTable)(state.selection.$from);
            var hoverTable = (function () {
                try {
                    return (0, query_1.findTable)(state.doc.resolve(_this._hoveringCell.cellPos));
                }
                catch (_a) {
                    return undefined;
                }
            })();
            var tr = state.tr;
            if (hoverTable &&
                (!currentTable || currentTable.pos !== hoverTable.pos)) {
                try {
                    var $inside = state.doc.resolve(_this._hoveringCell.cellPos + 1);
                    tr.setSelection(state_1.TextSelection.near($inside, 1));
                }
                catch (_b) { }
            }
            tr.setMeta(exports.TableDndKey, {
                dragging: { orientation: orientation, index: draggingIndex },
            });
            tr.setMeta("addToHistory", false);
            _this.editor.view.dispatch(tr);
            return true;
        };
        this.updateDragPosition = function (clientX, clientY) {
            var draggingDOMs = _this._draggingDOMs;
            if (!draggingDOMs || !_this._dragging)
                return;
            if (_this._draggingDirection === "col") {
                _this._previewController.onDragging(draggingDOMs, clientX, clientY, "col");
                var direction_1 = _this._startCoords.x > clientX ? "left" : "right";
                var dragOverColumn = (0, calc_drag_over_1.getDragOverColumn)(draggingDOMs.table, clientX);
                if (!dragOverColumn)
                    return;
                var col = dragOverColumn[0], index_1 = dragOverColumn[1];
                _this._droppingIndex = index_1;
                _this._dropIndicatorController.onDragging(col, direction_1, "col");
                return;
            }
            _this._previewController.onDragging(draggingDOMs, clientX, clientY, "row");
            var direction = _this._startCoords.y > clientY ? "up" : "down";
            var dragOverRow = (0, calc_drag_over_1.getDragOverRow)(draggingDOMs.table, clientY);
            if (!dragOverRow)
                return;
            var row = dragOverRow[0], index = dragOverRow[1];
            _this._droppingIndex = index;
            _this._dropIndicatorController.onDragging(row, direction, "row");
        };
        this.commitDrop = function () {
            if (!_this._dragging)
                return;
            var direction = _this._draggingDirection;
            var from = _this._draggingIndex;
            var to = _this._droppingIndex;
            if (from < 0 || to < 0 || from === to)
                return;
            // Use the live (auto-mapped) selection as the table anchor — PM has
            // already mapped it through any concurrent remote transactions, so
            // it's safe to resolve even if the doc shifted mid-drag.
            var tr = _this.editor.state.tr;
            var pos = _this.editor.state.selection.from;
            if (direction === "col") {
                if ((0, utils_2.moveColumn)({ tr: tr, originIndex: from, targetIndex: to, select: true, pos: pos })) {
                    _this.editor.view.dispatch(tr);
                }
                return;
            }
            if ((0, utils_2.moveRow)({ tr: tr, originIndex: from, targetIndex: to, select: true, pos: pos })) {
                _this.editor.view.dispatch(tr);
            }
        };
        this.endDrag = function () {
            _this._dragging = false;
            _this._draggingIndex = -1;
            _this._droppingIndex = -1;
            _this._startCoords = { x: 0, y: 0 };
            _this._draggingDOMs = undefined;
            _this._dropIndicatorController.onDragEnd();
            _this._previewController.onDragEnd();
            _this._dispatchMeta({ dragging: null });
        };
        this.props = {
            handleDOMEvents: {
                pointermove: this._pointerMove,
                // Force-unfreeze on any pointerdown that lands on the editor.
                // Mantine's `Menu.onClose` doesn't always fire on outside click
                // (the dropdown vanishes visually but the callback is skipped),
                // which would otherwise leave `frozen=true` permanently.
                pointerdown: this._pointerDown,
            },
        };
        this._previewController = new preview_controller_1.PreviewController();
        this._dropIndicatorController = new drop_indicator_controller_1.DropIndicatorController();
    }
    return TableHandlePluginSpec;
}());
// Resolve via plugin key, not a module singleton — survives StrictMode / HMR.
function getTableHandlePluginSpec(editor) {
    var plugin = exports.TableDndKey.get(editor.state);
    if (!plugin)
        return null;
    return plugin.spec;
}
exports.TableDndExtension = core_1.Extension.create({
    name: "table-drag-and-drop",
    addProseMirrorPlugins: function () {
        var editor = this.editor;
        var spec = new TableHandlePluginSpec(editor);
        return [new state_1.Plugin(spec)];
    },
});
exports.TableHandleCommandsExtension = core_1.Extension.create({
    name: "table-handle-commands",
    addCommands: function () {
        return {
            freezeHandles: function () {
                return function (_a) {
                    var tr = _a.tr, dispatch = _a.dispatch;
                    if (dispatch) {
                        tr.setMeta(exports.TableDndKey, { frozen: true });
                        tr.setMeta("addToHistory", false);
                    }
                    return true;
                };
            },
            unfreezeHandles: function () {
                return function (_a) {
                    var _b, _c;
                    var tr = _a.tr, state = _a.state, dispatch = _a.dispatch;
                    if (dispatch) {
                        // Re-sync `hoveringCell` to the cursor's cell as we unfreeze:
                        // `selectionUpdate` was gated while frozen, so the stored
                        // hoveringCell may be stale.
                        var patch = { frozen: false };
                        var $cellPos = (0, tables_2.cellAround)(state.selection.$head);
                        if ($cellPos) {
                            var cellInfo = (0, utils_1.cellInfoFromResolvedCell)($cellPos);
                            var tableInfo = (0, query_1.findTable)($cellPos);
                            patch.hoveringCell = cellInfo;
                            patch.tableNode = (_b = tableInfo === null || tableInfo === void 0 ? void 0 : tableInfo.node) !== null && _b !== void 0 ? _b : null;
                            patch.tablePos = (_c = tableInfo === null || tableInfo === void 0 ? void 0 : tableInfo.pos) !== null && _c !== void 0 ? _c : null;
                        }
                        else {
                            patch.hoveringCell = null;
                            patch.tableNode = null;
                            patch.tablePos = null;
                        }
                        tr.setMeta(exports.TableDndKey, patch);
                        tr.setMeta("addToHistory", false);
                    }
                    return true;
                };
            },
        };
    },
});
