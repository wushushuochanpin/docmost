"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getReplaceStep = getReplaceStep;
var transform_1 = require("@tiptap/pm/transform");
function getReplaceStep(fromDoc, toDoc) {
    var start = toDoc.content.findDiffStart(fromDoc.content);
    if (start === null) {
        return false;
    }
    // @ts-ignore property access to content
    var _a = toDoc.content.findDiffEnd(fromDoc.content), endA = _a.a, endB = _a.b;
    var overlap = start - Math.min(endA, endB);
    if (overlap > 0) {
        // If there is an overlap, there is some freedom of choice in how to calculate the
        // start/end boundary. for an inserted/removed slice. We choose the extreme with
        // the lowest depth value.
        if (fromDoc.resolve(start - overlap).depth <
            toDoc.resolve(endA + overlap).depth) {
            start -= overlap;
        }
        else {
            endA += overlap;
            endB += overlap;
        }
    }
    return new transform_1.ReplaceStep(start, endB, toDoc.slice(start, endA));
}
