"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHoveringCell = getHoveringCell;
exports.cellInfoFromResolvedCell = cellInfoFromResolvedCell;
exports.getDndRelatedDOMs = getDndRelatedDOMs;
var tables_1 = require("@tiptap/pm/tables");
function getHoveringCell(view, event) {
    var domCell = domCellAround(event.target);
    if (!domCell)
        return;
    // Resolve directly from the cell DOM rather than via coords. The previous
    // center-coords approach broke on tall merged cells — their visual center
    // can land in empty space whose closest PM position resolves to an
    // adjacent cell. `posAtDOM(td, 0)` is always inside this cell, regardless
    // of rowspan/colspan.
    var pos;
    try {
        pos = view.posAtDOM(domCell, 0);
    }
    catch (_a) {
        return;
    }
    var $cellPos = (0, tables_1.cellAround)(view.state.doc.resolve(pos));
    if (!$cellPos)
        return;
    return cellInfoFromResolvedCell($cellPos);
}
/**
 * Build HoveringCellInfo from a resolved position whose parent is a
 * table cell (i.e. the result of `cellAround` on some inner position).
 */
function cellInfoFromResolvedCell($cellPos) {
    var map = tables_1.TableMap.get($cellPos.node(-1));
    var tableStart = $cellPos.start(-1);
    var cellRect = map.findCell($cellPos.pos - tableStart);
    var rowIndex = cellRect.top;
    var colIndex = cellRect.left;
    return {
        rowIndex: rowIndex,
        colIndex: colIndex,
        cellPos: $cellPos.pos,
        rowFirstCellPos: getCellPos(map, tableStart, rowIndex, 0),
        colFirstCellPos: getCellPos(map, tableStart, 0, colIndex),
    };
}
function domCellAround(target) {
    var _a;
    while (target && target.nodeName != 'TD' && target.nodeName != 'TH') {
        target = ((_a = target.classList) === null || _a === void 0 ? void 0 : _a.contains('ProseMirror'))
            ? null
            : target.parentNode;
    }
    return target;
}
function getCellPos(map, tableStart, rowIndex, colIndex) {
    var cellIndex = getCellIndex(map, rowIndex, colIndex);
    var posInTable = map.map[cellIndex];
    return tableStart + posInTable;
}
function getCellIndex(map, rowIndex, colIndex) {
    return map.width * rowIndex + colIndex;
}
function getTableDOMByPos(view, pos) {
    var dom = view.domAtPos(pos).node;
    if (!dom)
        return;
    var element = dom instanceof HTMLElement ? dom : dom.parentElement;
    var table = element === null || element === void 0 ? void 0 : element.closest('table');
    return table !== null && table !== void 0 ? table : undefined;
}
function getTargetFirstCellDOM(table, index, direction) {
    if (direction === 'row') {
        var row = table.querySelectorAll('tr')[index];
        var cell = row === null || row === void 0 ? void 0 : row.querySelector('th,td');
        return cell !== null && cell !== void 0 ? cell : undefined;
    }
    else {
        var row = table.querySelector('tr');
        var cell = row === null || row === void 0 ? void 0 : row.querySelectorAll('th,td')[index];
        return cell !== null && cell !== void 0 ? cell : undefined;
    }
}
function getDndRelatedDOMs(view, cellPos, draggingIndex, direction) {
    if (cellPos == null)
        return;
    var table = getTableDOMByPos(view, cellPos);
    if (!table)
        return;
    var cell = getTargetFirstCellDOM(table, draggingIndex, direction);
    if (!cell)
        return;
    return { table: table, cell: cell };
}
