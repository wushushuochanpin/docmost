"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCellsInRow = getCellsInRow;
var tables_1 = require("@tiptap/pm/tables");
var query_1 = require("./query");
/**
 * Returns an array of cells in a row(s), where `rowIndex` could be a row index or an array of row indexes.
 *
 * @internal
 */
function getCellsInRow(rowIndex, selection) {
    var table = (0, query_1.findTable)(selection.$from);
    if (!table) {
        return;
    }
    var map = tables_1.TableMap.get(table.node);
    var indexes = Array.isArray(rowIndex) ? rowIndex : [rowIndex];
    return indexes
        .filter(function (index) { return index >= 0 && index <= map.height - 1; })
        .flatMap(function (index) {
        var cells = map.cellsInRect({
            left: 0,
            right: map.width,
            top: index,
            bottom: index + 1,
        });
        return cells.map(function (nodePos) {
            var node = table.node.nodeAt(nodePos);
            var pos = nodePos + table.start;
            return { pos: pos, start: pos + 1, node: node, depth: table.depth + 2 };
        });
    });
}
