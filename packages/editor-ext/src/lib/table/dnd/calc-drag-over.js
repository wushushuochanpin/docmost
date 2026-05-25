"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDragOverColumn = getDragOverColumn;
exports.getDragOverRow = getDragOverRow;
function findDragOverElement(elements, pointer, axis) {
    var startProp = axis === 'x' ? 'left' : 'top';
    var endProp = axis === 'x' ? 'right' : 'bottom';
    var lastIndex = elements.length - 1;
    var index = elements.findIndex(function (el, index) {
        var rect = el.getBoundingClientRect();
        var boundaryStart = rect[startProp];
        var boundaryEnd = rect[endProp];
        // The pointer is within the boundary of the current element.
        if (boundaryStart <= pointer && pointer <= boundaryEnd)
            return true;
        // The pointer is beyond the last element.
        if (index === lastIndex && pointer > boundaryEnd)
            return true;
        // The pointer is before the first element.
        if (index === 0 && pointer < boundaryStart)
            return true;
        return false;
    });
    return index >= 0 ? [elements[index], index] : undefined;
}
function getDragOverColumn(table, pointerX) {
    var firstRow = table.querySelector('tr');
    if (!firstRow)
        return;
    var cells = Array.from(firstRow.children);
    return findDragOverElement(cells, pointerX, 'x');
}
function getDragOverRow(table, pointerY) {
    var rows = Array.from(table.querySelectorAll('tr'));
    return findDragOverElement(rows, pointerY, 'y');
}
