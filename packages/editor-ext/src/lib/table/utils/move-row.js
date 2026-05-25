"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.moveRow = moveRow;
var tables_1 = require("@tiptap/pm/tables");
var convert_array_of_rows_to_table_node_1 = require("./convert-array-of-rows-to-table-node");
var convert_table_node_to_array_of_rows_1 = require("./convert-table-node-to-array-of-rows");
var get_selection_range_in_row_1 = require("./get-selection-range-in-row");
var move_row_in_array_of_rows_1 = require("./move-row-in-array-of-rows");
var query_1 = require("./query");
/**
 * Move a row from index `origin` to index `target`.
 *
 * @internal
 */
function moveRow(moveRowParams) {
    var _a, _b;
    var tr = moveRowParams.tr, originIndex = moveRowParams.originIndex, targetIndex = moveRowParams.targetIndex, select = moveRowParams.select, pos = moveRowParams.pos;
    var $pos = tr.doc.resolve(pos);
    var table = (0, query_1.findTable)($pos);
    if (!table)
        return false;
    var indexesOriginRow = (_a = (0, get_selection_range_in_row_1.getSelectionRangeInRow)(tr, originIndex)) === null || _a === void 0 ? void 0 : _a.indexes;
    var indexesTargetRow = (_b = (0, get_selection_range_in_row_1.getSelectionRangeInRow)(tr, targetIndex)) === null || _b === void 0 ? void 0 : _b.indexes;
    if (!indexesOriginRow || !indexesTargetRow)
        return false;
    if (indexesOriginRow.includes(targetIndex))
        return false;
    var newTable = moveTableRow(table.node, indexesOriginRow, indexesTargetRow, 0);
    tr.replaceWith(table.pos, table.pos + table.node.nodeSize, newTable);
    if (!select)
        return true;
    var map = tables_1.TableMap.get(newTable);
    var start = table.start;
    var index = targetIndex;
    var lastCell = map.positionAt(index, map.width - 1, newTable);
    var $lastCell = tr.doc.resolve(start + lastCell);
    var firstCell = map.positionAt(index, 0, newTable);
    var $firstCell = tr.doc.resolve(start + firstCell);
    tr.setSelection(tables_1.CellSelection.rowSelection($lastCell, $firstCell));
    return true;
}
function moveTableRow(table, indexesOrigin, indexesTarget, direction) {
    var rows = (0, convert_table_node_to_array_of_rows_1.convertTableNodeToArrayOfRows)(table);
    rows = (0, move_row_in_array_of_rows_1.moveRowInArrayOfRows)(rows, indexesOrigin, indexesTarget, direction);
    return (0, convert_array_of_rows_to_table_node_1.convertArrayOfRowsToTableNode)(table, rows);
}
