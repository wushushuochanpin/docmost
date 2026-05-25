"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.simplifyTransform = simplifyTransform;
var transform_1 = require("@tiptap/pm/transform");
var getReplaceStep_1 = require("./getReplaceStep");
// join adjacent ReplaceSteps
function simplifyTransform(tr) {
    if (!tr.steps.length) {
        return undefined;
    }
    var newTr = new transform_1.Transform(tr.docs[0]);
    var oldSteps = tr.steps.slice();
    while (oldSteps.length) {
        var step = oldSteps.shift();
        while (oldSteps.length && step.merge(oldSteps[0])) {
            var addedStep = oldSteps.shift();
            if (step instanceof transform_1.ReplaceStep && addedStep instanceof transform_1.ReplaceStep) {
                step = (0, getReplaceStep_1.getReplaceStep)(newTr.doc, addedStep.apply(step.apply(newTr.doc).doc).doc);
            }
            else {
                step = step.merge(addedStep);
            }
        }
        newTr.step(step);
    }
    return newTr;
}
