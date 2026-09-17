"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.moveColumn = moveColumn;
var tables_1 = require("@tiptap/pm/tables");
var convert_array_of_rows_to_table_node_1 = require("./convert-array-of-rows-to-table-node");
var convert_table_node_to_array_of_rows_1 = require("./convert-table-node-to-array-of-rows");
var get_selection_range_in_column_1 = require("./get-selection-range-in-column");
var move_row_in_array_of_rows_1 = require("./move-row-in-array-of-rows");
var query_1 = require("./query");
var transpose_1 = require("./transpose");
/**
 * Move a column from index `origin` to index `target`.
 *
 * @internal
 */
function moveColumn(moveColParams) {
    var _a, _b;
    var tr = moveColParams.tr, originIndex = moveColParams.originIndex, targetIndex = moveColParams.targetIndex, select = moveColParams.select, pos = moveColParams.pos;
    var $pos = tr.doc.resolve(pos);
    var table = (0, query_1.findTable)($pos);
    if (!table)
        return false;
    var indexesOriginColumn = (_a = (0, get_selection_range_in_column_1.getSelectionRangeInColumn)(tr, originIndex)) === null || _a === void 0 ? void 0 : _a.indexes;
    var indexesTargetColumn = (_b = (0, get_selection_range_in_column_1.getSelectionRangeInColumn)(tr, targetIndex)) === null || _b === void 0 ? void 0 : _b.indexes;
    if (!indexesOriginColumn || !indexesTargetColumn)
        return false;
    if (indexesOriginColumn.includes(targetIndex))
        return false;
    var newTable = moveTableColumn(table.node, indexesOriginColumn, indexesTargetColumn, 0);
    tr.replaceWith(table.pos, table.pos + table.node.nodeSize, newTable);
    if (!select)
        return true;
    var map = tables_1.TableMap.get(newTable);
    var start = table.start;
    var index = targetIndex;
    var lastCell = map.positionAt(map.height - 1, index, newTable);
    var $lastCell = tr.doc.resolve(start + lastCell);
    var firstCell = map.positionAt(0, index, newTable);
    var $firstCell = tr.doc.resolve(start + firstCell);
    tr.setSelection(tables_1.CellSelection.colSelection($lastCell, $firstCell));
    return true;
}
function moveTableColumn(table, indexesOrigin, indexesTarget, direction) {
    var rows = (0, transpose_1.transpose)((0, convert_table_node_to_array_of_rows_1.convertTableNodeToArrayOfRows)(table));
    rows = (0, move_row_in_array_of_rows_1.moveRowInArrayOfRows)(rows, indexesOrigin, indexesTarget, direction);
    rows = (0, transpose_1.transpose)(rows);
    return (0, convert_array_of_rows_to_table_node_1.convertArrayOfRowsToTableNode)(table, rows);
}
