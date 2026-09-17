"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isCellSelection = isCellSelection;
exports.findTable = findTable;
exports.findCellRange = findCellRange;
exports.findCellPos = findCellPos;
exports.findParentNode = findParentNode;
var tables_1 = require("@tiptap/pm/tables");
/**
 * Checks if the given object is a `CellSelection` instance.
 *
 * @public
 */
function isCellSelection(value) {
    return value instanceof tables_1.CellSelection;
}
/**
 * Find the closest table node.
 *
 * @internal
 */
function findTable($pos) {
    return findParentNode(function (node) { return node.type.spec.tableRole === 'table'; }, $pos);
}
/**
 * Try to find the anchor and head cell in the same table by using the given
 * anchor and head as hit points, or fallback to the selection's anchor and
 * head.
 *
 * @internal
 */
function findCellRange(selection, anchorHit, headHit) {
    var _a, _b;
    if (anchorHit == null && headHit == null && isCellSelection(selection)) {
        return [selection.$anchorCell, selection.$headCell];
    }
    var anchor = (_a = anchorHit !== null && anchorHit !== void 0 ? anchorHit : headHit) !== null && _a !== void 0 ? _a : selection.anchor;
    var head = (_b = headHit !== null && headHit !== void 0 ? headHit : anchorHit) !== null && _b !== void 0 ? _b : selection.head;
    var doc = selection.$head.doc;
    var $anchorCell = findCellPos(doc, anchor);
    var $headCell = findCellPos(doc, head);
    if ($anchorCell && $headCell && (0, tables_1.inSameTable)($anchorCell, $headCell)) {
        return [$anchorCell, $headCell];
    }
}
/**
 * Try to find a resolved pos of a cell by using the given pos as a hit point.
 *
 * @internal
 */
function findCellPos(doc, pos) {
    var $pos = doc.resolve(pos);
    return (0, tables_1.cellAround)($pos) || (0, tables_1.cellNear)($pos);
}
/**
 * Find the closest parent node that satisfies the predicate.
 *
 * @internal
 */
function findParentNode(
/**
 * The predicate to test the parent node.
 */
predicate, 
/**
 * The position to start searching from.
 */
$pos) {
    for (var depth = $pos.depth; depth >= 0; depth -= 1) {
        var node = $pos.node(depth);
        if (predicate(node)) {
            var pos = depth === 0 ? 0 : $pos.before(depth);
            var start = $pos.start(depth);
            return { node: node, pos: pos, start: start, depth: depth };
        }
    }
}
