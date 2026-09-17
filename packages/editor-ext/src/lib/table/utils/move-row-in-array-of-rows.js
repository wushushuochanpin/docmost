"use strict";
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.moveRowInArrayOfRows = moveRowInArrayOfRows;
/**
 * Move a row in an array of rows.
 *
 * @internal
 */
function moveRowInArrayOfRows(rows, indexesOrigin, indexesTarget, directionOverride) {
    var direction = indexesOrigin[0] > indexesTarget[0] ? -1 : 1;
    var rowsExtracted = rows.splice(indexesOrigin[0], indexesOrigin.length);
    var positionOffset = rowsExtracted.length % 2 === 0 ? 1 : 0;
    var target;
    if (directionOverride === -1 && direction === 1) {
        target = indexesTarget[0] - 1;
    }
    else if (directionOverride === 1 && direction === -1) {
        target = indexesTarget[indexesTarget.length - 1] - positionOffset + 1;
    }
    else {
        target = direction === -1
            ? indexesTarget[0]
            : indexesTarget[indexesTarget.length - 1] - positionOffset;
    }
    rows.splice.apply(rows, __spreadArray([target, 0], rowsExtracted, false));
    return rows;
}
