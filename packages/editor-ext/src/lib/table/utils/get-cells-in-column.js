"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCellsInColumn = getCellsInColumn;
var tables_1 = require("@tiptap/pm/tables");
var query_1 = require("./query");
/**
 * Returns an array of cells in a column(s), where `columnIndex` could be a column index or an array of column indexes.
 *
 * @internal
 */
function getCellsInColumn(columnIndexes, selection) {
    var table = (0, query_1.findTable)(selection.$from);
    if (!table) {
        return;
    }
    var map = tables_1.TableMap.get(table.node);
    var indexes = Array.isArray(columnIndexes) ? columnIndexes : [columnIndexes];
    return indexes
        .filter(function (index) { return index >= 0 && index <= map.width - 1; })
        .flatMap(function (index) {
        var cells = map.cellsInRect({
            left: index,
            right: index + 1,
            top: 0,
            bottom: map.height,
        });
        return cells.map(function (nodePos) {
            var node = table.node.nodeAt(nodePos);
            var pos = nodePos + table.start;
            return { pos: pos, start: pos + 1, node: node, depth: table.depth + 2 };
        });
    });
}
