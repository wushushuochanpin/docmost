"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertTableNodeToArrayOfRows = convertTableNodeToArrayOfRows;
var tables_1 = require("@tiptap/pm/tables");
/**
 * This function will transform the table node into a matrix of rows and columns
 * respecting merged cells, for example this table:
 *
 * ```
 * ┌──────┬──────┬─────────────┐
 * │  A1  │  B1  │     C1      │
 * ├──────┼──────┴──────┬──────┤
 * │  A2  │     B2      │      │
 * ├──────┼─────────────┤  D1  │
 * │  A3  │  B3  │  C3  │      │
 * └──────┴──────┴──────┴──────┘
 * ```
 *
 * will be converted to the below:
 *
 * ```javascript
 * [
 *   [A1, B1, C1, null],
 *   [A2, B2, null, D1],
 *   [A3, B3, C3, null],
 * ]
 * ```
 * @internal
 */
function convertTableNodeToArrayOfRows(tableNode) {
    var map = tables_1.TableMap.get(tableNode);
    var rows = [];
    var rowCount = map.height;
    var colCount = map.width;
    for (var rowIndex = 0; rowIndex < rowCount; rowIndex++) {
        var row = [];
        for (var colIndex = 0; colIndex < colCount; colIndex++) {
            var cellIndex = rowIndex * colCount + colIndex;
            var cellPos = map.map[cellIndex];
            if (rowIndex > 0) {
                var topCellIndex = cellIndex - colCount;
                var topCellPos = map.map[topCellIndex];
                if (cellPos === topCellPos) {
                    row.push(null);
                    continue;
                }
            }
            if (colIndex > 0) {
                var leftCellIndex = cellIndex - 1;
                var leftCellPos = map.map[leftCellIndex];
                if (cellPos === leftCellPos) {
                    row.push(null);
                    continue;
                }
            }
            row.push(tableNode.nodeAt(cellPos));
        }
        rows.push(row);
    }
    return rows;
}
