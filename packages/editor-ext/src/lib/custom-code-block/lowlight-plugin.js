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
exports.LowlightPlugin = LowlightPlugin;
var core_1 = require("@tiptap/core");
var state_1 = require("@tiptap/pm/state");
var view_1 = require("@tiptap/pm/view");
// @ts-ignore
var core_2 = require("highlight.js/lib/core");
function parseNodes(nodes, className) {
    if (className === void 0) { className = []; }
    return nodes
        .map(function (node) {
        var classes = __spreadArray(__spreadArray([], className, true), (node.properties ? node.properties.className : []), true);
        if (node.children) {
            return parseNodes(node.children, classes);
        }
        return {
            text: node.value,
            classes: classes,
        };
    })
        .flat();
}
function getHighlightNodes(result) {
    // `.value` for lowlight v1, `.children` for lowlight v2
    return result.value || result.children || [];
}
function registered(aliasOrLanguage) {
    return Boolean(core_2.default.getLanguage(aliasOrLanguage));
}
// Max characters to sample for auto-detection to avoid performance issues with large code blocks
var AUTO_DETECT_SAMPLE_SIZE = 3000;
function getDecorations(_a) {
    var doc = _a.doc, name = _a.name, lowlight = _a.lowlight, defaultLanguage = _a.defaultLanguage;
    var decorations = [];
    (0, core_1.findChildren)(doc, function (node) { return node.type.name === name; }).forEach(function (block) {
        var _a, _b;
        var from = block.pos + 1;
        var language = block.node.attrs.language || defaultLanguage;
        var languages = lowlight.listLanguages();
        var textContent = block.node.textContent;
        var nodes;
        if (language &&
            (languages.includes(language) ||
                registered(language) ||
                ((_a = lowlight.registered) === null || _a === void 0 ? void 0 : _a.call(lowlight, language)))) {
            nodes = getHighlightNodes(lowlight.highlight(language, textContent));
        }
        else {
            // For auto-detection, sample a limited portion to detect the language,
            // then highlight the full content with the detected language
            var sample = textContent.length > AUTO_DETECT_SAMPLE_SIZE
                ? textContent.slice(0, AUTO_DETECT_SAMPLE_SIZE)
                : textContent;
            var autoResult = lowlight.highlightAuto(sample);
            var detectedLanguage = (_b = autoResult.data) === null || _b === void 0 ? void 0 : _b.language;
            if (detectedLanguage && textContent.length > AUTO_DETECT_SAMPLE_SIZE) {
                nodes = getHighlightNodes(lowlight.highlight(detectedLanguage, textContent));
            }
            else {
                nodes = getHighlightNodes(autoResult);
            }
        }
        parseNodes(nodes).forEach(function (node) {
            var to = from + node.text.length;
            if (node.classes.length) {
                var decoration = view_1.Decoration.inline(from, to, {
                    class: node.classes.join(' '),
                });
                decorations.push(decoration);
            }
            from = to;
        });
    });
    return view_1.DecorationSet.create(doc, decorations);
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
function isFunction(param) {
    return typeof param === 'function';
}
function LowlightPlugin(_a) {
    var name = _a.name, lowlight = _a.lowlight, defaultLanguage = _a.defaultLanguage;
    if (!['highlight', 'highlightAuto', 'listLanguages'].every(function (api) {
        return isFunction(lowlight[api]);
    })) {
        throw Error('You should provide an instance of lowlight to use the code-block-lowlight extension');
    }
    var lowlightPlugin = new state_1.Plugin({
        key: new state_1.PluginKey('lowlight'),
        state: {
            init: function (_, _a) {
                var doc = _a.doc;
                return getDecorations({
                    doc: doc,
                    name: name,
                    lowlight: lowlight,
                    defaultLanguage: defaultLanguage,
                });
            },
            apply: function (transaction, decorationSet, oldState, newState) {
                var oldNodeName = oldState.selection.$head.parent.type.name;
                var newNodeName = newState.selection.$head.parent.type.name;
                var oldNodes = (0, core_1.findChildren)(oldState.doc, function (node) { return node.type.name === name; });
                var newNodes = (0, core_1.findChildren)(newState.doc, function (node) { return node.type.name === name; });
                if (transaction.docChanged &&
                    // Apply decorations if:
                    // selection includes named node,
                    ([oldNodeName, newNodeName].includes(name) ||
                        // OR transaction adds/removes named node,
                        newNodes.length !== oldNodes.length ||
                        // OR transaction has changes that completely encapsulte a node
                        // (for example, a transaction that affects the entire document).
                        // Such transactions can happen during collab syncing via y-prosemirror, for example.
                        transaction.steps.some(function (step) {
                            // @ts-ignore
                            return (
                            // @ts-ignore
                            step.from !== undefined &&
                                // @ts-ignore
                                step.to !== undefined &&
                                oldNodes.some(function (node) {
                                    // @ts-ignore
                                    return (
                                    // @ts-ignore
                                    node.pos >= step.from &&
                                        // @ts-ignore
                                        node.pos + node.node.nodeSize <= step.to);
                                }));
                        }))) {
                    return getDecorations({
                        doc: transaction.doc,
                        name: name,
                        lowlight: lowlight,
                        defaultLanguage: defaultLanguage,
                    });
                }
                return decorationSet.map(transaction.mapping, transaction.doc);
            },
        },
        props: {
            decorations: function (state) {
                return lowlightPlugin.getState(state);
            },
        },
    });
    return lowlightPlugin;
}
