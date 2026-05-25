"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSelectionRangeInRow = getSelectionRangeInRow;
var get_cells_in_column_1 = require("./get-cells-in-column");
var get_cells_in_row_1 = require("./get-cells-in-row");
/**
 * Returns a range of rectangular selection spanning all merged cells around a
 * row at index `rowIndex`.
 *
 * Original implementation from Atlassian (Apache License 2.0)
 *
 * https://bitbucket.org/atlassian/atlassian-frontend-mirror/src/5f91cb871e8248bc3bae5ddc30bb9fd9200fadbb/editor/editor-tables/src/utils/get-selection-range-in-row.ts#editor/editor-tables/src/utils/get-selection-range-in-row.ts
 *
 * @internal
 */
function getSelectionRangeInRow(tr, startRowIndex, endRowIndex) {
    if (endRowIndex === void 0) { endRowIndex = startRowIndex; }
    var startIndex = startRowIndex;
    var endIndex = endRowIndex;
    var _loop_1 = function (i) {
        var cells = (0, get_cells_in_row_1.getCellsInRow)(i, tr.selection);
        if (cells) {
            cells.forEach(function (cell) {
                var maybeEndIndex = cell.node.attrs.rowspan + i - 1;
                if (maybeEndIndex >= startIndex) {
                    startIndex = i;
                }
                if (maybeEndIndex > endIndex) {
                    endIndex = maybeEndIndex;
                }
            });
        }
    };
    // looking for selection start row (startIndex)
    for (var i = startRowIndex; i >= 0; i--) {
        _loop_1(i);
    }
    var _loop_2 = function (i) {
        var cells = (0, get_cells_in_row_1.getCellsInRow)(i, tr.selection);
        if (cells) {
            cells.forEach(function (cell) {
                var maybeEndIndex = cell.node.attrs.rowspan + i - 1;
                if (cell.node.attrs.rowspan > 1 && maybeEndIndex > endIndex) {
                    endIndex = maybeEndIndex;
                }
            });
        }
    };
    // looking for selection end row (endIndex)
    for (var i = startRowIndex; i <= endIndex; i++) {
        _loop_2(i);
    }
    // filter out rows without cells (where all columns have rowspan > 1 in the same row)
    var indexes = [];
    for (var i = startIndex; i <= endIndex; i++) {
        var maybeCells = (0, get_cells_in_row_1.getCellsInRow)(i, tr.selection);
        if (maybeCells && maybeCells.length > 0) {
            indexes.push(i);
        }
    }
    startIndex = indexes[0];
    endIndex = indexes[indexes.length - 1];
    var firstSelectedRowCells = (0, get_cells_in_row_1.getCellsInRow)(startIndex, tr.selection);
    var firstColumnCells = (0, get_cells_in_column_1.getCellsInColumn)(0, tr.selection);
    if (!firstSelectedRowCells || !firstColumnCells) {
        return;
    }
    var $anchor = tr.doc.resolve(firstSelectedRowCells[firstSelectedRowCells.length - 1].pos);
    var headCell;
    for (var i = endIndex; i >= startIndex; i--) {
        var rowCells = (0, get_cells_in_row_1.getCellsInRow)(i, tr.selection);
        if (rowCells && rowCells.length > 0) {
            for (var j = firstColumnCells.length - 1; j >= 0; j--) {
                if (firstColumnCells[j].pos === rowCells[0].pos) {
                    headCell = rowCells[0];
                    break;
                }
            }
            if (headCell) {
                break;
            }
        }
    }
    if (!headCell) {
        return;
    }
    var $head = tr.doc.resolve(headCell.pos);
    return { $anchor: $anchor, $head: $head, indexes: indexes };
}
