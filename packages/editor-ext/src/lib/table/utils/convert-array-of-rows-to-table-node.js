"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertArrayOfRowsToTableNode = convertArrayOfRowsToTableNode;
var tables_1 = require("@tiptap/pm/tables");
/**
 * Convert an array of rows to a table node.
 *
 * @internal
 */
function convertArrayOfRowsToTableNode(tableNode, arrayOfNodes) {
    var rowsPM = [];
    var map = tables_1.TableMap.get(tableNode);
    for (var rowIndex = 0; rowIndex < map.height; rowIndex++) {
        var row = tableNode.child(rowIndex);
        var rowCells = [];
        for (var colIndex = 0; colIndex < map.width; colIndex++) {
            if (!arrayOfNodes[rowIndex][colIndex])
                continue;
            var cellPos = map.map[rowIndex * map.width + colIndex];
            var cell = arrayOfNodes[rowIndex][colIndex];
            var oldCell = tableNode.nodeAt(cellPos);
            var newCell = oldCell.type.createChecked(Object.assign({}, cell.attrs), cell.content, cell.marks);
            rowCells.push(newCell);
        }
        rowsPM.push(row.type.createChecked(row.attrs, rowCells, row.marks));
    }
    var newTable = tableNode.type.createChecked(tableNode.attrs, rowsPM, tableNode.marks);
    return newTable;
}
