"use strict";
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TableReadonlySort = void 0;
var core_1 = require("@tiptap/core");
var state_1 = require("@tiptap/pm/state");
var CHEVRON_CLASS = 'tableReadonlySortChevron';
var tableReadonlySortKey = new state_1.PluginKey('tableReadonlySort');
var sortStates = new WeakMap();
var originalOrders = new WeakMap();
var collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
function getColumnIndex(th) {
    var _a;
    var row = th.parentElement;
    if (!row)
        return -1;
    var col = 0;
    for (var i = 0; i < row.cells.length; i++) {
        if (row.cells[i] === th)
            return col;
        col += (_a = row.cells[i].colSpan) !== null && _a !== void 0 ? _a : 1;
    }
    return -1;
}
function getHeaderTh(target) {
    if (!(target instanceof Element))
        return null;
    var th = target.closest('th');
    if (!th)
        return null;
    var row = th.parentElement;
    if (!row)
        return null;
    var tbody = row.parentElement;
    if (!tbody)
        return null;
    var table = tbody.closest('table');
    if (!table)
        return null;
    // th must be in the first row of the table (could be in thead or tbody)
    var firstRow = table.querySelector('tr');
    if (firstRow !== row)
        return null;
    return th;
}
function getCellText(row, colIndex) {
    var _a, _b, _c;
    var col = 0;
    for (var i = 0; i < row.cells.length; i++) {
        if (col === colIndex)
            return (_b = (_a = row.cells[i].textContent) === null || _a === void 0 ? void 0 : _a.trim()) !== null && _b !== void 0 ? _b : '';
        col += (_c = row.cells[i].colSpan) !== null && _c !== void 0 ? _c : 1;
    }
    return '';
}
function getOrSaveOriginalOrder(table, dataRows) {
    if (!originalOrders.has(table)) {
        originalOrders.set(table, __spreadArray([], dataRows, true));
    }
    return originalOrders.get(table);
}
function sortDataRows(dataRows, colIndex, direction) {
    return __spreadArray([], dataRows, true).sort(function (a, b) {
        var textA = getCellText(a, colIndex);
        var textB = getCellText(b, colIndex);
        var emptyA = textA === '';
        var emptyB = textB === '';
        if (emptyA && emptyB)
            return 0;
        if (emptyA)
            return 1;
        if (emptyB)
            return -1;
        var cmp = collator.compare(textA, textB);
        return direction === 'asc' ? cmp : -cmp;
    });
}
function applySort(table, colIndex) {
    var _a;
    var tbody = table.querySelector('tbody');
    if (!tbody)
        return;
    var allRows = Array.from(tbody.querySelectorAll(':scope > tr'));
    if (allRows.length === 0)
        return;
    var headerRow = allRows[0];
    var dataRows = allRows.slice(1);
    if (dataRows.length === 0)
        return;
    var current = (_a = sortStates.get(table)) !== null && _a !== void 0 ? _a : null;
    var saved = getOrSaveOriginalOrder(table, dataRows);
    var next;
    if (!current || current.col !== colIndex) {
        next = { col: colIndex, direction: 'asc' };
    }
    else if (current.direction === 'asc') {
        next = { col: colIndex, direction: 'desc' };
    }
    else {
        next = null;
    }
    if (next === null) {
        sortStates.delete(table);
        tbody.append.apply(tbody, __spreadArray([headerRow], saved, false));
    }
    else {
        sortStates.set(table, next);
        var sorted = sortDataRows(saved, next.col, next.direction);
        tbody.append.apply(tbody, __spreadArray([headerRow], sorted, false));
    }
    updateChevrons(table);
}
var CHEVRON_SVG = '<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">' +
    '<path d="M2.5 4.5 L6 8 L9.5 4.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />' +
    '</svg>';
function ensureChevron(th) {
    var chevron = th.querySelector(".".concat(CHEVRON_CLASS));
    if (!chevron) {
        chevron = document.createElement('span');
        chevron.className = CHEVRON_CLASS;
        chevron.setAttribute('aria-hidden', 'true');
        chevron.innerHTML = CHEVRON_SVG;
        th.appendChild(chevron);
    }
    return chevron;
}
function updateChevrons(table) {
    var _a, _b, _c;
    var firstRow = table.querySelector('tr');
    if (!firstRow)
        return;
    var state = (_a = sortStates.get(table)) !== null && _a !== void 0 ? _a : null;
    var col = 0;
    for (var i = 0; i < firstRow.cells.length; i++) {
        var cell = firstRow.cells[i];
        if (cell.tagName !== 'TH') {
            col += (_b = cell.colSpan) !== null && _b !== void 0 ? _b : 1;
            continue;
        }
        var chevron = ensureChevron(cell);
        var label = void 0;
        if (state && state.col === col) {
            chevron.setAttribute('data-sort', state.direction);
            label = state.direction === 'asc' ? 'Sort descending' : 'Clear sort';
        }
        else {
            chevron.removeAttribute('data-sort');
            label = 'Sort ascending';
        }
        chevron.setAttribute('data-tooltip', label);
        chevron.setAttribute('aria-label', label);
        chevron.title = label;
        col += (_c = cell.colSpan) !== null && _c !== void 0 ? _c : 1;
    }
}
function addChevronsToAllTables(editorRoot) {
    var tables = editorRoot.querySelectorAll('table');
    tables.forEach(function (table) { return updateChevrons(table); });
}
function removeAllChevrons(editorRoot) {
    editorRoot
        .querySelectorAll(".".concat(CHEVRON_CLASS))
        .forEach(function (el) { return el.remove(); });
}
exports.TableReadonlySort = core_1.Extension.create({
    name: 'tableReadonlySort',
    addProseMirrorPlugins: function () {
        var editor = this.editor;
        var editorRoot = null;
        var onClick = function (event) {
            if (editor.isEditable)
                return;
            // Only react to clicks on the chevron, not anywhere else in the header
            // cell. This lets the user click into a header to select text without
            // accidentally triggering a sort.
            if (!(event.target instanceof Element))
                return;
            var chevron = event.target.closest(".".concat(CHEVRON_CLASS));
            if (!chevron)
                return;
            var th = getHeaderTh(chevron);
            if (!th)
                return;
            var table = th.closest('table');
            if (!table)
                return;
            var colIndex = getColumnIndex(th);
            if (colIndex < 0)
                return;
            applySort(table, colIndex);
        };
        return [
            new state_1.Plugin({
                key: tableReadonlySortKey,
                view: function (editorView) {
                    editorRoot = editorView.dom;
                    editorRoot.addEventListener('click', onClick);
                    if (!editor.isEditable) {
                        addChevronsToAllTables(editorRoot);
                    }
                    return {
                        update: function (view) {
                            var root = view.dom;
                            if (!editor.isEditable) {
                                addChevronsToAllTables(root);
                            }
                            else {
                                removeAllChevrons(root);
                            }
                        },
                        destroy: function () {
                            if (editorRoot) {
                                editorRoot.removeEventListener('click', onClick);
                                removeAllChevrons(editorRoot);
                            }
                        },
                    };
                },
            }),
        ];
    },
});
