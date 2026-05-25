"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBasename = getBasename;
/**
 * Flexible `basename` implementation for node and the browser
 * @see https://stackoverflow.com/a/59907288/2228771
 */
function getBasename(path) {
    // make sure the basename is not empty, if string ends with separator
    var end = path.length - 1;
    while (path[end] === '/' || path[end] === '\\') {
        --end;
    }
    // support mixing of Win + Unix path separators
    var i1 = path.lastIndexOf('/', end);
    var i2 = path.lastIndexOf('\\', end);
    var start;
    if (i1 === -1) {
        if (i2 === -1) {
            // no separator in the whole thing
            return path;
        }
        start = i2;
    }
    else if (i2 === -1) {
        start = i1;
    }
    else {
        start = Math.max(i1, i2);
    }
    return path.substring(start + 1, end + 1);
}
