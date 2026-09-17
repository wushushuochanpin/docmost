"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Callout = exports.inputRegex = void 0;
var core_1 = require("@tiptap/core");
var state_1 = require("@tiptap/pm/state");
var react_1 = require("@tiptap/react");
var utils_1 = require("./utils");
/**
 * Matches a callout to a `:::` as input.
 */
exports.inputRegex = /^:::([a-z]+)?[\s\n]$/;
exports.Callout = core_1.Node.create({
    name: "callout",
    addOptions: function () {
        return {
            HTMLAttributes: {},
            view: null,
        };
    },
    content: "block+",
    group: "block",
    defining: true,
    isolating: true,
    addAttributes: function () {
        return {
            type: {
                default: "info",
                parseHTML: function (element) { return element.getAttribute("data-callout-type"); },
                renderHTML: function (attributes) { return ({
                    "data-callout-type": attributes.type,
                }); },
            },
            icon: {
                default: null,
                parseHTML: function (element) { return element.getAttribute("data-callout-icon"); },
                renderHTML: function (attributes) { return ({
                    "data-callout-icon": attributes.icon,
                }); },
            },
        };
    },
    parseHTML: function () {
        return [
            {
                tag: "div[data-type=\"".concat(this.name, "\"]"),
            },
        ];
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
            setCallout: function (attributes) {
                return function (_a) {
                    var commands = _a.commands;
                    return commands.setNode(_this.name, attributes);
                };
            },
            unsetCallout: function () {
                return function (_a) {
                    var commands = _a.commands;
                    return commands.lift(_this.name);
                };
            },
            toggleCallout: function (attributes) {
                return function (_a) {
                    var commands = _a.commands;
                    return commands.toggleWrap(_this.name, attributes);
                };
            },
            updateCalloutType: function (type) {
                return function (_a) {
                    var commands = _a.commands;
                    return commands.updateAttributes("callout", {
                        type: (0, utils_1.getValidCalloutType)(type),
                    });
                };
            },
            updateCalloutIcon: function (icon) {
                return function (_a) {
                    var commands = _a.commands;
                    return commands.updateAttributes("callout", {
                        icon: icon || null,
                    });
                };
            },
        };
    },
    addNodeView: function () {
        // Force the react node view to render immediately using flush sync (https://github.com/ueberdosis/tiptap/blob/b4db352f839e1d82f9add6ee7fb45561336286d8/packages/react/src/ReactRenderer.tsx#L183-L191)
        this.editor.isInitialized = true;
        return (0, react_1.ReactNodeViewRenderer)(this.options.view);
    },
    addKeyboardShortcuts: function () {
        var _this = this;
        return {
            //"Mod-Shift-c": () => this.editor.commands.toggleCallout(),
            /**
             * Handle the backspace key when deleting content.
             * Aims to stop merging callouts when deleting content in between.
             */
            Backspace: function (_a) {
                var _b;
                var editor = _a.editor;
                var state = editor.state, view = editor.view;
                var selection = state.selection;
                // If the selection is not empty, return false
                // and let other extension handle the deletion.
                if (!selection.empty) {
                    return false;
                }
                var $from = selection.$from;
                // If not at the start of current node, no joining will happen
                if ($from.parentOffset !== 0) {
                    return false;
                }
                // Empty callout: delete the whole node so Backspace inside it isn't
                // a no-op (isolating: true blocks the default join with the block
                // above).
                var calloutDepth = $from.depth - 1;
                if (calloutDepth >= 0) {
                    var calloutNode = $from.node(calloutDepth);
                    if (calloutNode.type === _this.type &&
                        calloutNode.childCount === 1 &&
                        ((_b = calloutNode.firstChild) === null || _b === void 0 ? void 0 : _b.content.size) === 0) {
                        var calloutPos = $from.before(calloutDepth);
                        var tr = state.tr;
                        tr.delete(calloutPos, calloutPos + calloutNode.nodeSize);
                        tr.setSelection(state_1.TextSelection.near(tr.doc.resolve(calloutPos), -1));
                        view.dispatch(tr);
                        return true;
                    }
                }
                var previousPosition = $from.before($from.depth) - 1;
                // If nothing above to join with
                if (previousPosition < 1) {
                    return false;
                }
                var previousPos = state.doc.resolve(previousPosition);
                // If resolving previous position fails, bail out
                if (!(previousPos === null || previousPos === void 0 ? void 0 : previousPos.parent)) {
                    return false;
                }
                var previousNode = previousPos.parent;
                var parentNode = (0, core_1.findParentNode)(function () { return true; })(selection);
                if (!parentNode) {
                    return false;
                }
                var node = parentNode.node, pos = parentNode.pos, depth = parentNode.depth;
                // If current node is nested
                if (depth !== 1) {
                    return false;
                }
                // If previous node is a callout, cut current node's content into it
                if (node.type !== _this.type && previousNode.type === _this.type) {
                    var content = node.content, nodeSize = node.nodeSize;
                    var tr = state.tr;
                    tr.delete(pos, pos + nodeSize);
                    tr.setSelection(state_1.TextSelection.near(tr.doc.resolve(previousPosition - 1)));
                    tr.insert(previousPosition - 1, content);
                    view.dispatch(tr);
                    return true;
                }
                return false;
            },
            // Exit the callout into a fresh paragraph below when the cursor sits
            // in an empty trailing child. An empty callout (single empty
            // paragraph) exits on the first Enter and keeps the empty callout
            // intact; a callout with content needs the double-Enter pattern
            // (first Enter splits, second Enter on the new trailing empty exits
            // and removes that trailing paragraph).
            Enter: function (_a) {
                var editor = _a.editor;
                var state = editor.state, view = editor.view;
                var selection = state.selection;
                if (!selection.empty)
                    return false;
                var $from = selection.$from;
                var calloutDepth = $from.depth - 1;
                if (calloutDepth < 0)
                    return false;
                var calloutNode = $from.node(calloutDepth);
                if (calloutNode.type !== _this.type)
                    return false;
                if ($from.parent.content.size !== 0)
                    return false;
                if ($from.index(calloutDepth) !== calloutNode.childCount - 1) {
                    return false;
                }
                var paragraphType = state.schema.nodes.paragraph;
                var containerDepth = calloutDepth - 1;
                var container = $from.node(containerDepth);
                var indexAfter = $from.indexAfter(containerDepth);
                if (!container.canReplaceWith(indexAfter, indexAfter, paragraphType)) {
                    return false;
                }
                var calloutEnd = $from.after(calloutDepth);
                var paragraph = paragraphType.create();
                var tr = state.tr;
                if (calloutNode.childCount === 1) {
                    tr.insert(calloutEnd, paragraph);
                    tr.setSelection(state_1.TextSelection.create(tr.doc, calloutEnd + 1));
                }
                else {
                    tr.delete($from.before(), $from.after());
                    var insertPos = tr.mapping.map(calloutEnd);
                    tr.insert(insertPos, paragraph);
                    tr.setSelection(state_1.TextSelection.create(tr.doc, insertPos + 1));
                }
                view.dispatch(tr);
                return true;
            },
        };
    },
    addInputRules: function () {
        return [
            (0, core_1.wrappingInputRule)({
                find: exports.inputRegex,
                type: this.type,
                getAttributes: function (match) { return ({
                    type: (0, utils_1.getValidCalloutType)(match[1]),
                }); },
            }),
        ];
    },
});
