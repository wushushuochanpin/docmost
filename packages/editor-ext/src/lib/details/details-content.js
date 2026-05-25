"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DetailsContent = void 0;
var core_1 = require("@tiptap/core");
var state_1 = require("@tiptap/pm/state");
exports.DetailsContent = core_1.Node.create({
    name: "detailsContent",
    group: "block",
    content: "block*",
    defining: true,
    selectable: false,
    addOptions: function () {
        return {
            HTMLAttributes: {},
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
    addKeyboardShortcuts: function () {
        var _this = this;
        return {
            Enter: function (_a) {
                var _b;
                var editor = _a.editor;
                var view = editor.view;
                var state = editor.state;
                var selection = state.selection;
                var findNode = (0, core_1.findParentNode)(function (node) { return node.type.name === _this.name; })(selection);
                if (!selection.empty || !findNode || !findNode.node.childCount) {
                    return false;
                }
                var childCount = findNode.node.childCount;
                if (!(childCount === selection.$from.index(findNode.depth) + 1)) {
                    return false;
                }
                var fillNode = (_b = findNode.node.type.contentMatch.defaultType) === null || _b === void 0 ? void 0 : _b.createAndFill();
                if (!fillNode) {
                    return false;
                }
                var lastNode = findNode.node.child(childCount - 1);
                if (!lastNode.eq(fillNode)) {
                    return false;
                }
                var rootNode = selection.$from.node(-3);
                if (!rootNode) {
                    return false;
                }
                var indexAfter = selection.$from.indexAfter(-3);
                var nodeType = (0, core_1.defaultBlockAt)(rootNode.contentMatchAt(indexAfter));
                if (!nodeType ||
                    !rootNode.canReplaceWith(indexAfter, indexAfter, nodeType)) {
                    return false;
                }
                var defaultNode = nodeType.createAndFill();
                if (!defaultNode) {
                    return false;
                }
                var tr = state.tr;
                var after = selection.$from.after(-2);
                tr.replaceWith(after, after, defaultNode);
                tr.setSelection(state_1.Selection.near(tr.doc.resolve(after), 1));
                var from = state.doc
                    .resolve(findNode.pos + 1)
                    .posAtIndex(childCount - 1, findNode.depth);
                var to = from + lastNode.nodeSize;
                tr.delete(from, to);
                tr.scrollIntoView();
                view.dispatch(tr);
                return true;
            },
        };
    },
});
