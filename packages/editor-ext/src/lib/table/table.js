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
exports.CustomTable = void 0;
var extension_table_1 = require("@tiptap/extension-table");
var state_1 = require("@tiptap/pm/state");
var tables_1 = require("@tiptap/pm/tables");
var LIST_TYPES = ["bulletList", "orderedList", "taskList"];
function isInList(editor) {
    var $from = editor.state.selection.$from;
    for (var depth = $from.depth; depth > 0; depth--) {
        var node = $from.node(depth);
        if (LIST_TYPES.includes(node.type.name)) {
            return true;
        }
    }
    return false;
}
function handleListIndent(editor) {
    return (editor.commands.sinkListItem("listItem") ||
        editor.commands.sinkListItem("taskItem"));
}
function handleListOutdent(editor) {
    return (editor.commands.liftListItem("listItem") ||
        editor.commands.liftListItem("taskItem"));
}
exports.CustomTable = extension_table_1.Table.extend({
    addKeyboardShortcuts: function () {
        var _this = this;
        var _a;
        return __assign(__assign({}, (_a = this.parent) === null || _a === void 0 ? void 0 : _a.call(this)), { "Mod-a": function () {
                var _a = _this.editor, state = _a.state, view = _a.view;
                var selection = state.selection, doc = state.doc;
                var $cellPos = (0, tables_1.cellAround)(selection.$anchor);
                if (!$cellPos)
                    return false;
                var cellNode = doc.nodeAt($cellPos.pos);
                // Empty cells have nothing useful to scope to — let the default
                // Mod-a fall through and select the whole doc.
                if (!cellNode || !cellNode.textContent)
                    return false;
                var from = $cellPos.pos + 1;
                var to = $cellPos.pos + cellNode.nodeSize - 1;
                if (from >= to)
                    return true;
                var nextSel = state_1.TextSelection.between(doc.resolve(from), doc.resolve(to), 1);
                if (!nextSel || selection.eq(nextSel))
                    return true;
                view.dispatch(state.tr.setSelection(nextSel));
                return true;
            }, Tab: function () {
                // If we're in a list within a table, handle list indentation
                if (isInList(_this.editor) && _this.editor.isActive("table")) {
                    if (handleListIndent(_this.editor)) {
                        return true;
                    }
                }
                // Otherwise, use default table navigation
                if (_this.editor.commands.goToNextCell()) {
                    return true;
                }
                if (!_this.editor.can().addRowAfter()) {
                    return false;
                }
                return _this.editor.chain().addRowAfter().goToNextCell().run();
            }, "Shift-Tab": function () {
                // If we're in a list within a table, handle list outdentation
                if (isInList(_this.editor) && _this.editor.isActive("table")) {
                    if (handleListOutdent(_this.editor)) {
                        return true;
                    }
                }
                // Otherwise, use default table navigation
                return _this.editor.commands.goToPreviousCell();
            } });
    },
    renderHTML: function (_a) {
        var _b;
        var node = _a.node, HTMLAttributes = _a.HTMLAttributes;
        // https://github.com/ueberdosis/tiptap/issues/4872#issuecomment-2717554498
        var originalRender = (_b = this.parent) === null || _b === void 0 ? void 0 : _b.call(this, { node: node, HTMLAttributes: HTMLAttributes });
        var wrapper = [
            "div",
            { class: "tableWrapper" },
            originalRender,
        ];
        return wrapper;
    },
});
