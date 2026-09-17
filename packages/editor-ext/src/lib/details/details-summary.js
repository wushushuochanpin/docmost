"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DetailsSummary = void 0;
var core_1 = require("@tiptap/core");
var state_1 = require("@tiptap/pm/state");
exports.DetailsSummary = core_1.Node.create({
    name: "detailsSummary",
    group: "block",
    content: "inline*",
    defining: true,
    isolating: true,
    selectable: false,
    addOptions: function () {
        return {
            HTMLAttributes: {},
        };
    },
    parseHTML: function () {
        return [
            {
                tag: "summary",
            },
        ];
    },
    renderHTML: function (_a) {
        var HTMLAttributes = _a.HTMLAttributes;
        return [
            "summary",
            (0, core_1.mergeAttributes)({ "data-type": this.name }, this.options.HTMLAttributes, HTMLAttributes),
            0,
        ];
    },
    addKeyboardShortcuts: function () {
        var _this = this;
        return {
            Backspace: function (_a) {
                var editor = _a.editor;
                var state = editor.state;
                var selection = state.selection;
                if (selection.$anchor.parent.type.name !== _this.name) {
                    return false;
                }
                if (selection.$anchor.parentOffset !== 0) {
                    return false;
                }
                return editor.chain().unsetDetails().focus().run();
            },
            Enter: function (_a) {
                var editor = _a.editor;
                var view = editor.view;
                var state = editor.state;
                var head = state.selection.$head;
                if (head.parent.type.name !== _this.name) {
                    return false;
                }
                var hasOffset = 
                // @ts-ignore
                view.domAtPos(head.after() + 1).node.offsetParent !== null;
                var findNode = hasOffset
                    ? state.doc.nodeAt(head.after())
                    : head.node(-2);
                if (!findNode) {
                    return false;
                }
                var indexAfter = hasOffset ? 0 : head.indexAfter(-1);
                var nodeType = (0, core_1.defaultBlockAt)(findNode.contentMatchAt(indexAfter));
                if (!nodeType ||
                    !findNode.canReplaceWith(indexAfter, indexAfter, nodeType)) {
                    return false;
                }
                var defaultNode = nodeType.createAndFill();
                if (!defaultNode) {
                    return false;
                }
                var tr = state.tr;
                var after = hasOffset ? head.after() + 1 : head.after(-1);
                tr.replaceWith(after, after, defaultNode);
                tr.setSelection(state_1.Selection.near(tr.doc.resolve(after), 1));
                tr.scrollIntoView();
                view.dispatch(tr);
                return true;
            },
        };
    },
});
