"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateNodeId = exports.isRowGripSelected = exports.isColumnGripSelected = exports.selectTable = exports.selectRow = exports.selectColumn = exports.findCellClosestToPos = exports.findParentNodeClosestToPos = exports.getCellsInTable = exports.getCellsInRow = exports.getCellsInColumn = exports.isTableSelected = exports.isRowSelected = exports.isColumnSelected = exports.isCellSelection = exports.findTable = exports.isRectSelected = void 0;
exports.isEditorReady = isEditorReady;
exports.isTextSelected = isTextSelected;
exports.setAttributes = setAttributes;
exports.icon = icon;
exports.sanitizeUrl = sanitizeUrl;
exports.isInternalFileUrl = isInternalFileUrl;
exports.copyToClipboard = copyToClipboard;
exports.execCommandCopy = execCommandCopy;
var core_1 = require("@tiptap/core");
var tables_1 = require("@tiptap/pm/tables");
var sanitize_url_1 = require("@braintree/sanitize-url");
function customAlphabet(alphabet, defaultSize) {
    return function (size) {
        if (size === void 0) { size = defaultSize; }
        var bytes = new Uint8Array(size);
        var crypto = globalThis.crypto;
        if (crypto === null || crypto === void 0 ? void 0 : crypto.getRandomValues) {
            crypto.getRandomValues(bytes);
        }
        else {
            for (var index = 0; index < size; index++) {
                bytes[index] = Math.floor(Math.random() * 256);
            }
        }
        var id = "";
        for (var index = 0; index < size; index++) {
            id += alphabet[bytes[index] % alphabet.length];
        }
        return id;
    };
}
var isRectSelected = function (rect) { return function (selection) {
    var map = tables_1.TableMap.get(selection.$anchorCell.node(-1));
    var start = selection.$anchorCell.start(-1);
    var cells = map.cellsInRect(rect);
    var selectedCells = map.cellsInRect(map.rectBetween(selection.$anchorCell.pos - start, selection.$headCell.pos - start));
    for (var i = 0, count = cells.length; i < count; i += 1) {
        if (selectedCells.indexOf(cells[i]) === -1) {
            return false;
        }
    }
    return true;
}; };
exports.isRectSelected = isRectSelected;
var findTable = function (selection) {
    return (0, core_1.findParentNode)(function (node) { return node.type.spec.tableRole && node.type.spec.tableRole === "table"; })(selection);
};
exports.findTable = findTable;
var isCellSelection = function (selection) {
    return selection instanceof tables_1.CellSelection;
};
exports.isCellSelection = isCellSelection;
var isColumnSelected = function (columnIndex) { return function (selection) {
    if ((0, exports.isCellSelection)(selection)) {
        var map = tables_1.TableMap.get(selection.$anchorCell.node(-1));
        return (0, exports.isRectSelected)({
            left: columnIndex,
            right: columnIndex + 1,
            top: 0,
            bottom: map.height,
        })(selection);
    }
    return false;
}; };
exports.isColumnSelected = isColumnSelected;
var isRowSelected = function (rowIndex) { return function (selection) {
    if ((0, exports.isCellSelection)(selection)) {
        var map = tables_1.TableMap.get(selection.$anchorCell.node(-1));
        return (0, exports.isRectSelected)({
            left: 0,
            right: map.width,
            top: rowIndex,
            bottom: rowIndex + 1,
        })(selection);
    }
    return false;
}; };
exports.isRowSelected = isRowSelected;
var isTableSelected = function (selection) {
    if ((0, exports.isCellSelection)(selection)) {
        var map = tables_1.TableMap.get(selection.$anchorCell.node(-1));
        return (0, exports.isRectSelected)({
            left: 0,
            right: map.width,
            top: 0,
            bottom: map.height,
        })(selection);
    }
    return false;
};
exports.isTableSelected = isTableSelected;
var getCellsInColumn = function (columnIndex) { return function (selection) {
    var table = (0, exports.findTable)(selection);
    if (table) {
        var map_1 = tables_1.TableMap.get(table.node);
        var indexes = Array.isArray(columnIndex)
            ? columnIndex
            : Array.from([columnIndex]);
        return indexes.reduce(function (acc, index) {
            if (index >= 0 && index <= map_1.width - 1) {
                var cells = map_1.cellsInRect({
                    left: index,
                    right: index + 1,
                    top: 0,
                    bottom: map_1.height,
                });
                return acc.concat(cells.map(function (nodePos) {
                    var node = table.node.nodeAt(nodePos);
                    var pos = nodePos + table.start;
                    return { pos: pos, start: pos + 1, node: node };
                }));
            }
            return acc;
        }, []);
    }
    return null;
}; };
exports.getCellsInColumn = getCellsInColumn;
var getCellsInRow = function (rowIndex) { return function (selection) {
    var table = (0, exports.findTable)(selection);
    if (table) {
        var map_2 = tables_1.TableMap.get(table.node);
        var indexes = Array.isArray(rowIndex)
            ? rowIndex
            : Array.from([rowIndex]);
        return indexes.reduce(function (acc, index) {
            if (index >= 0 && index <= map_2.height - 1) {
                var cells = map_2.cellsInRect({
                    left: 0,
                    right: map_2.width,
                    top: index,
                    bottom: index + 1,
                });
                return acc.concat(cells.map(function (nodePos) {
                    var node = table.node.nodeAt(nodePos);
                    var pos = nodePos + table.start;
                    return { pos: pos, start: pos + 1, node: node };
                }));
            }
            return acc;
        }, []);
    }
    return null;
}; };
exports.getCellsInRow = getCellsInRow;
var getCellsInTable = function (selection) {
    var table = (0, exports.findTable)(selection);
    if (table) {
        var map = tables_1.TableMap.get(table.node);
        var cells = map.cellsInRect({
            left: 0,
            right: map.width,
            top: 0,
            bottom: map.height,
        });
        return cells.map(function (nodePos) {
            var node = table.node.nodeAt(nodePos);
            var pos = nodePos + table.start;
            return { pos: pos, start: pos + 1, node: node };
        });
    }
    return null;
};
exports.getCellsInTable = getCellsInTable;
var findParentNodeClosestToPos = function ($pos, predicate) {
    for (var i = $pos.depth; i > 0; i -= 1) {
        var node = $pos.node(i);
        if (predicate(node)) {
            return {
                pos: i > 0 ? $pos.before(i) : 0,
                start: $pos.start(i),
                depth: i,
                node: node,
            };
        }
    }
    return null;
};
exports.findParentNodeClosestToPos = findParentNodeClosestToPos;
var findCellClosestToPos = function ($pos) {
    var predicate = function (node) {
        return node.type.spec.tableRole && /cell/i.test(node.type.spec.tableRole);
    };
    return (0, exports.findParentNodeClosestToPos)($pos, predicate);
};
exports.findCellClosestToPos = findCellClosestToPos;
var select = function (type) { return function (index) { return function (tr) {
    var table = (0, exports.findTable)(tr.selection);
    var isRowSelection = type === "row";
    if (table) {
        var map = tables_1.TableMap.get(table.node);
        // Check if the index is valid
        if (index >= 0 && index < (isRowSelection ? map.height : map.width)) {
            var left = isRowSelection ? 0 : index;
            var top_1 = isRowSelection ? index : 0;
            var right = isRowSelection ? map.width : index + 1;
            var bottom = isRowSelection ? index + 1 : map.height;
            var cellsInFirstRow = map.cellsInRect({
                left: left,
                top: top_1,
                right: isRowSelection ? right : left + 1,
                bottom: isRowSelection ? top_1 + 1 : bottom,
            });
            var cellsInLastRow = bottom - top_1 === 1
                ? cellsInFirstRow
                : map.cellsInRect({
                    left: isRowSelection ? left : right - 1,
                    top: isRowSelection ? bottom - 1 : top_1,
                    right: right,
                    bottom: bottom,
                });
            var head = table.start + cellsInFirstRow[0];
            var anchor = table.start + cellsInLastRow[cellsInLastRow.length - 1];
            var $head = tr.doc.resolve(head);
            var $anchor = tr.doc.resolve(anchor);
            // @ts-ignore
            return tr.setSelection(new tables_1.CellSelection($anchor, $head));
        }
    }
    return tr;
}; }; };
exports.selectColumn = select("column");
exports.selectRow = select("row");
var selectTable = function (tr) {
    var table = (0, exports.findTable)(tr.selection);
    if (table) {
        var map = tables_1.TableMap.get(table.node).map;
        if (map && map.length) {
            var head = table.start + map[0];
            var anchor = table.start + map[map.length - 1];
            var $head = tr.doc.resolve(head);
            var $anchor = tr.doc.resolve(anchor);
            // @ts-ignore
            return tr.setSelection(new tables_1.CellSelection($anchor, $head));
        }
    }
    return tr;
};
exports.selectTable = selectTable;
var isColumnGripSelected = function (_a) {
    var editor = _a.editor, view = _a.view, state = _a.state, from = _a.from;
    var domAtPos = view.domAtPos(from).node;
    var nodeDOM = view.nodeDOM(from);
    var node = nodeDOM || domAtPos;
    if (!editor.isActive("table") || !node || (0, exports.isTableSelected)(state.selection)) {
        return false;
    }
    var container = node;
    while (container && !["TD", "TH"].includes(container.tagName)) {
        container = container.parentElement;
    }
    var gripColumn = container &&
        container.querySelector &&
        container.querySelector("a.grip-column.selected");
    return !!gripColumn;
};
exports.isColumnGripSelected = isColumnGripSelected;
var isRowGripSelected = function (_a) {
    var editor = _a.editor, view = _a.view, state = _a.state, from = _a.from;
    var domAtPos = view.domAtPos(from).node;
    var nodeDOM = view.nodeDOM(from);
    var node = nodeDOM || domAtPos;
    if (!editor.isActive("table") || !node || (0, exports.isTableSelected)(state.selection)) {
        return false;
    }
    var container = node;
    while (container && !["TD", "TH"].includes(container.tagName)) {
        container = container.parentElement;
    }
    var gripRow = container &&
        container.querySelector &&
        container.querySelector("a.grip-row.selected");
    return !!gripRow;
};
exports.isRowGripSelected = isRowGripSelected;
// TipTap's `editor.view` proxy throws if accessed before mount or after destroy.
// Guard floating-menu callbacks (getReferencedVirtualElement, shouldShow) with
// this before touching `editor.view.nodeDOM(...)`.
function isEditorReady(editor) {
    return !!editor && editor.isInitialized;
}
function isTextSelected(editor) {
    var _a = editor.state, doc = _a.doc, selection = _a.selection, _b = _a.selection, empty = _b.empty, from = _b.from, to = _b.to;
    var isEmptyTextBlock = !doc.textBetween(from, to).length && (0, core_1.isTextSelection)(selection);
    if (empty || isEmptyTextBlock || !editor.isEditable) {
        return false;
    }
    return true;
}
function setAttributes(editor, getPos, attrs) {
    if (editor.isEditable && typeof getPos === "function") {
        editor.view.dispatch(editor.view.state.tr.setNodeMarkup(getPos(), undefined, attrs));
    }
}
function icon(name) {
    return "<span class=\"ProseMirror-icon ProseMirror-icon-".concat(name, "\"></span>");
}
function sanitizeUrl(url) {
    if (!url)
        return "";
    var sanitized = (0, sanitize_url_1.sanitizeUrl)(url);
    // Return empty string instead of "about:blank"
    return sanitized === "about:blank" ? "" : sanitized;
}
function isInternalFileUrl(url) {
    if (!url)
        return false;
    var normalized = url.trim();
    return normalized.startsWith("/api/files/") || normalized.startsWith("/files/");
}
var alphabet = "abcdefghijklmnopqrstuvwxyz";
exports.generateNodeId = customAlphabet(alphabet, 12);
function copyToClipboard(text) {
    if ("clipboard" in navigator) {
        navigator.clipboard.writeText(text).catch(function () {
            execCommandCopy(text);
        });
    }
    else {
        execCommandCopy(text);
    }
}
function execCommandCopy(text) {
    var textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
}
