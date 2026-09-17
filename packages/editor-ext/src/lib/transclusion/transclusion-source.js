"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransclusionSource = void 0;
var core_1 = require("@tiptap/core");
var react_1 = require("@tiptap/react");
var constants_1 = require("./constants");
exports.TransclusionSource = core_1.Node.create({
    name: "transclusionSource",
    addOptions: function () {
        return {
            HTMLAttributes: {},
            view: null,
        };
    },
    group: "block",
    // Schema-enforced allow-list. Excludes `transclusionSource` (no nesting)
    content: constants_1.TRANSCLUSION_SOURCE_CONTENT_EXPRESSION,
    defining: true,
    isolating: true,
    addAttributes: function () {
        return {
            id: {
                default: null,
                parseHTML: function (el) { return el.getAttribute("data-id"); },
                renderHTML: function (attrs) {
                    return attrs.id ? { "data-id": attrs.id } : {};
                },
            },
        };
    },
    parseHTML: function () {
        return [{ tag: "div[data-type=\"".concat(this.name, "\"]") }];
    },
    renderHTML: function (_a) {
        var HTMLAttributes = _a.HTMLAttributes;
        return [
            "div",
            (0, core_1.mergeAttributes)({ "data-type": this.name }, this.options.HTMLAttributes, HTMLAttributes),
            0,
        ];
    },
    addCommands: function () {
        var _this = this;
        return {
            insertTransclusionSource: function (attributes) {
                return function (_a) {
                    var commands = _a.commands, state = _a.state, chain = _a.chain;
                    var $from = state.selection.$from;
                    for (var depth = $from.depth; depth > 0; depth -= 1) {
                        if ($from.node(depth).type.name === _this.name)
                            return false;
                    }
                    var node = {
                        type: _this.name,
                        attrs: attributes !== null && attributes !== void 0 ? attributes : {},
                        content: [{ type: "paragraph" }],
                    };
                    var parent = $from.parent;
                    var isEmptyParagraph = parent.type.name === "paragraph" && parent.content.size === 0;
                    if (isEmptyParagraph) {
                        return chain()
                            .insertContentAt({ from: $from.before(), to: $from.after() }, node)
                            .run();
                    }
                    return commands.insertContent(node);
                };
            },
            toggleTransclusionSource: function () {
                return function (_a) {
                    var commands = _a.commands;
                    return commands.toggleWrap(_this.name);
                };
            },
            unsyncTransclusionSource: function () {
                return function (_a) {
                    var state = _a.state, tr = _a.tr, dispatch = _a.dispatch;
                    var $from = state.selection.$from;
                    // Walk up to the nearest source wrapper.
                    var depth = $from.depth;
                    while (depth > 0 && $from.node(depth).type.name !== _this.name) {
                        depth -= 1;
                    }
                    if (depth === 0)
                        return false;
                    var node = $from.node(depth);
                    var start = $from.before(depth);
                    var end = start + node.nodeSize;
                    if (dispatch) {
                        tr.replaceWith(start, end, node.content);
                        dispatch(tr);
                    }
                    return true;
                };
            },
        };
    },
    addNodeView: function () {
        if (!this.options.view)
            return null;
        // Force the react node view to render immediately using flush sync
        this.editor.isInitialized = true;
        return (0, react_1.ReactNodeViewRenderer)(this.options.view);
    },
});
