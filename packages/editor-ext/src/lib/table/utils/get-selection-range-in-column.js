"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSelectionRangeInColumn = getSelectionRangeInColumn;
var get_cells_in_column_1 = require("./get-cells-in-column");
var get_cells_in_row_1 = require("./get-cells-in-row");
/**
 * Returns a range of rectangular selection spanning all merged cells around a
 * column at index `columnIndex`.
 *
 * Original implementation from Atlassian (Apache License 2.0)
 *
 * https://bitbucket.org/atlassian/atlassian-frontend-mirror/src/5f91cb871e8248bc3bae5ddc30bb9fd9200fadbb/editor/editor-tables/src/utils/get-selection-range-in-column.ts#editor/editor-tables/src/utils/get-selection-range-in-column.ts
 *
 * @internal
 */
function getSelectionRangeInColumn(tr, startColIndex, endColIndex) {
    if (endColIndex === void 0) { endColIndex = startColIndex; }
    var startIndex = startColIndex;
    var endIndex = endColIndex;
    var _loop_1 = function (i) {
        var cells = (0, get_cells_in_column_1.getCellsInColumn)(i, tr.selection);
        if (cells) {
            cells.forEach(function (cell) {
                var maybeEndIndex = cell.node.attrs.colspan + i - 1;
                if (maybeEndIndex >= startIndex) {
                    startIndex = i;
                }
                if (maybeEndIndex > endIndex) {
                    endIndex = maybeEndIndex;
                }
            });
        }
    };
    // looking for selection start column (startIndex)
    for (var i = startColIndex; i >= 0; i--) {
        _loop_1(i);
    }
    var _loop_2 = function (i) {
        var cells = (0, get_cells_in_column_1.getCellsInColumn)(i, tr.selection);
        if (cells) {
            cells.forEach(function (cell) {
                var maybeEndIndex = cell.node.attrs.colspan + i - 1;
                if (cell.node.attrs.colspan > 1 && maybeEndIndex > endIndex) {
                    endIndex = maybeEndIndex;
                }
            });
        }
    };
    // looking for selection end column (endIndex)
    for (var i = startColIndex; i <= endIndex; i++) {
        _loop_2(i);
    }
    // filter out columns without cells (where all rows have colspan > 1 in the same column)
    var indexes = [];
    for (var i = startIndex; i <= endIndex; i++) {
        var maybeCells = (0, get_cells_in_column_1.getCellsInColumn)(i, tr.selection);
        if (maybeCells && maybeCells.length > 0) {
            indexes.push(i);
        }
    }
    startIndex = indexes[0];
    endIndex = indexes[indexes.length - 1];
    var firstSelectedColumnCells = (0, get_cells_in_column_1.getCellsInColumn)(startIndex, tr.selection);
    var firstRowCells = (0, get_cells_in_row_1.getCellsInRow)(0, tr.selection);
    if (!firstSelectedColumnCells || !firstRowCells) {
        return;
    }
    var $anchor = tr.doc.resolve(firstSelectedColumnCells[firstSelectedColumnCells.length - 1].pos);
    var headCell;
    for (var i = endIndex; i >= startIndex; i--) {
        var columnCells = (0, get_cells_in_column_1.getCellsInColumn)(i, tr.selection);
        if (columnCells && columnCells.length > 0) {
            for (var j = firstRowCells.length - 1; j >= 0; j--) {
                if (firstRowCells[j].pos === columnCells[0].pos) {
                    headCell = columnCells[0];
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
