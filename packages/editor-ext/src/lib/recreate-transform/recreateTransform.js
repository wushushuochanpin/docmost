"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecreateTransform = void 0;
exports.recreateTransform = recreateTransform;
var transform_1 = require("@tiptap/pm/transform");
var rfc6902_1 = require("rfc6902");
var diff_1 = require("diff");
var getReplaceStep_1 = require("./getReplaceStep");
var simplifyTransform_1 = require("./simplifyTransform");
var removeMarks_1 = require("./removeMarks");
var getFromPath_1 = require("./getFromPath");
var copy_1 = require("./copy");
var RecreateTransform = /** @class */ (function () {
    function RecreateTransform(fromDoc, toDoc, options) {
        if (options === void 0) { options = {}; }
        var o = __assign({ complexSteps: true, wordDiffs: false, simplifyDiff: true }, options);
        this.fromDoc = fromDoc;
        this.toDoc = toDoc;
        this.complexSteps = o.complexSteps; // Whether to return steps other than ReplaceSteps
        this.wordDiffs = o.wordDiffs; // Whether to make text diffs cover entire words
        this.simplifyDiff = o.simplifyDiff;
        this.schema = fromDoc.type.schema;
        this.tr = new transform_1.Transform(fromDoc);
    }
    RecreateTransform.prototype.init = function () {
        if (this.complexSteps) {
            // For First steps: we create versions of the documents without marks as
            // these will only confuse the diffing mechanism and marks won't cause
            // any mapping changes anyway.
            this.currentJSON = (0, removeMarks_1.removeMarks)(this.fromDoc).toJSON();
            this.finalJSON = (0, removeMarks_1.removeMarks)(this.toDoc).toJSON();
            this.ops = (0, rfc6902_1.createPatch)(this.currentJSON, this.finalJSON);
            this.recreateChangeContentSteps();
            this.recreateChangeMarkSteps();
        }
        else {
            // We don't differentiate between mark changes and other changes.
            this.currentJSON = this.fromDoc.toJSON();
            this.finalJSON = this.toDoc.toJSON();
            this.ops = (0, rfc6902_1.createPatch)(this.currentJSON, this.finalJSON);
            this.recreateChangeContentSteps();
        }
        if (this.simplifyDiff) {
            this.tr = (0, simplifyTransform_1.simplifyTransform)(this.tr) || this.tr;
        }
        return this.tr;
    };
    /** convert json-diff to prosemirror steps */
    RecreateTransform.prototype.recreateChangeContentSteps = function () {
        // First step: find content changing steps.
        var ops = [];
        while (this.ops.length) {
            // get next
            var op = this.ops.shift();
            ops.push(op);
            var toDoc = void 0;
            var afterStepJSON = (0, copy_1.copy)(this.currentJSON); // working document receiving patches
            var pathParts = op.path.split('/');
            // collect operations until we receive a valid document:
            // apply ops-patches until a valid prosemirror document is retrieved,
            // then try to create a transformation step or retry with next operation
            while (toDoc == null) {
                (0, rfc6902_1.applyPatch)(afterStepJSON, [op]);
                try {
                    toDoc = this.schema.nodeFromJSON(afterStepJSON);
                    toDoc.check();
                }
                catch (error) {
                    toDoc = null;
                    if (this.ops.length > 0) {
                        op = this.ops.shift();
                        ops.push(op);
                    }
                    else {
                        throw new Error("No valid diff possible applying ".concat(op.path));
                    }
                }
            }
            // apply operation (ignoring afterStepJSON)
            if (this.complexSteps &&
                ops.length === 1 &&
                (pathParts.includes('attrs') || pathParts.includes('type'))) {
                // Node markup is changing
                this.addSetNodeMarkup(); // a lost update is ignored
                ops = [];
                // console.log("%cop", logStyle, "- update node", ops);
            }
            else if (ops.length === 1 &&
                op.op === 'replace' &&
                pathParts[pathParts.length - 1] === 'text') {
                // Text is being replaced, we apply text diffing to find the smallest possible diffs.
                this.addReplaceTextSteps(op, afterStepJSON);
                ops = [];
                // console.log("%cop", logStyle, "- replace", ops);
            }
            else if (this.addReplaceStep(toDoc, afterStepJSON)) {
                // operations have been applied
                ops = [];
                // console.log("%cop", logStyle, "- other", ops);
            }
        }
    };
    /** update node with attrs and marks, may also change type */
    RecreateTransform.prototype.addSetNodeMarkup = function () {
        // first diff in document is supposed to be a node-change (in type and/or attributes)
        // thus simply find the first change and apply a node change step, then recalculate the diff
        // after updating the document
        var fromDoc = this.schema.nodeFromJSON(this.currentJSON);
        var toDoc = this.schema.nodeFromJSON(this.finalJSON);
        var start = toDoc.content.findDiffStart(fromDoc.content);
        // @note start is the same (first) position for current and target document
        var fromNode = fromDoc.nodeAt(start);
        var toNode = toDoc.nodeAt(start);
        if (start != null) {
            // @note this completly updates all attributes in one step, by completely replacing node
            var nodeType = fromNode.type === toNode.type ? null : toNode.type;
            try {
                this.tr.setNodeMarkup(start, nodeType, toNode.attrs, toNode.marks);
            }
            catch (e) {
                // if nodetypes differ, the updated node-type and contents might not be compatible
                // with schema and requires a replace
                var message = e instanceof Error ? e.message : '';
                if (nodeType && message.includes('Invalid content')) {
                    // @todo add test-case for this scenario
                    this.tr.replaceWith(start, start + fromNode.nodeSize, toNode);
                }
                else {
                    throw e;
                }
            }
            this.currentJSON = (0, removeMarks_1.removeMarks)(this.tr.doc).toJSON();
            // setting the node markup may have invalidated the following ops, so we calculate them again.
            this.ops = (0, rfc6902_1.createPatch)(this.currentJSON, this.finalJSON);
            return true;
        }
        return false;
    };
    RecreateTransform.prototype.recreateChangeMarkSteps = function () {
        var _this = this;
        // Now the documents should be the same, except their marks, so everything should map 1:1.
        // Second step: Iterate through the toDoc and make sure all marks are the same in tr.doc
        this.toDoc.descendants(function (tNode, tPos) {
            if (!tNode.isInline) {
                return true;
            }
            _this.tr.doc.nodesBetween(tPos, tPos + tNode.nodeSize, function (fNode, fPos) {
                if (!fNode.isInline) {
                    return true;
                }
                var from = Math.max(tPos, fPos);
                var to = Math.min(tPos + tNode.nodeSize, fPos + fNode.nodeSize);
                fNode.marks.forEach(function (nodeMark) {
                    if (!nodeMark.isInSet(tNode.marks)) {
                        _this.tr.removeMark(from, to, nodeMark);
                    }
                });
                tNode.marks.forEach(function (nodeMark) {
                    if (!nodeMark.isInSet(fNode.marks)) {
                        _this.tr.addMark(from, to, nodeMark);
                    }
                });
            });
        });
    };
    /**
     * retrieve and possibly apply replace-step based from doc changes
     * From http://prosemirror.net/examples/footnote/
     */
    RecreateTransform.prototype.addReplaceStep = function (toDoc, afterStepJSON) {
        var fromDoc = this.schema.nodeFromJSON(this.currentJSON);
        var step = (0, getReplaceStep_1.getReplaceStep)(fromDoc, toDoc);
        if (!step) {
            return false;
        }
        else if (!this.tr.maybeStep(step).failed) {
            this.currentJSON = afterStepJSON;
            return true; // @change previously null
        }
        throw new Error('No valid step found.');
    };
    /** retrieve and possibly apply text replace-steps based from doc changes */
    RecreateTransform.prototype.addReplaceTextSteps = function (op, afterStepJSON) {
        // We find the position number of the first character in the string
        var op1 = __assign(__assign({}, op), { value: 'xx' });
        var op2 = __assign(__assign({}, op), { value: 'yy' });
        var afterOP1JSON = (0, copy_1.copy)(this.currentJSON);
        var afterOP2JSON = (0, copy_1.copy)(this.currentJSON);
        (0, rfc6902_1.applyPatch)(afterOP1JSON, [op1]);
        (0, rfc6902_1.applyPatch)(afterOP2JSON, [op2]);
        var op1Doc = this.schema.nodeFromJSON(afterOP1JSON);
        var op2Doc = this.schema.nodeFromJSON(afterOP2JSON);
        // get text diffs
        var finalText = op.value;
        var currentText = (0, getFromPath_1.getFromPath)(this.currentJSON, op.path);
        var textDiffs = this.wordDiffs
            ? (0, diff_1.diffWordsWithSpace)(currentText, finalText)
            : (0, diff_1.diffChars)(currentText, finalText);
        var offset = op1Doc.content.findDiffStart(op2Doc.content);
        var marks = op1Doc.resolve(offset + 1).marks();
        while (textDiffs.length) {
            var diff = textDiffs.shift();
            if (diff.added) {
                var textNode = this.schema
                    .nodeFromJSON({ type: 'text', text: diff.value })
                    .mark(marks);
                if (textDiffs.length && textDiffs[0].removed) {
                    var nextDiff = textDiffs.shift();
                    this.tr.replaceWith(offset, offset + nextDiff.value.length, textNode);
                }
                else {
                    this.tr.insert(offset, textNode);
                }
                offset += diff.value.length;
            }
            else if (diff.removed) {
                if (textDiffs.length && textDiffs[0].added) {
                    var nextDiff = textDiffs.shift();
                    var textNode = this.schema
                        .nodeFromJSON({ type: 'text', text: nextDiff.value })
                        .mark(marks);
                    this.tr.replaceWith(offset, offset + diff.value.length, textNode);
                    offset += nextDiff.value.length;
                }
                else {
                    this.tr.delete(offset, offset + diff.value.length);
                }
            }
            else {
                offset += diff.value.length;
            }
        }
        this.currentJSON = afterStepJSON;
    };
    return RecreateTransform;
}());
exports.RecreateTransform = RecreateTransform;
function recreateTransform(fromDoc, toDoc, options) {
    if (options === void 0) { options = {}; }
    var recreator = new RecreateTransform(fromDoc, toDoc, options);
    return recreator.init();
}
