"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Column = void 0;
var core_1 = require("@tiptap/core");
var state_1 = require("@tiptap/pm/state");
exports.Column = core_1.Node.create({
    name: "column",
    group: "block",
    content: "block+",
    defining: true,
    isolating: true,
    selectable: false,
    addOptions: function () {
        return {
            HTMLAttributes: {},
        };
    },
    addAttributes: function () {
        return {
            width: {
                default: null,
                parseHTML: function (element) {
                    var value = element.getAttribute("data-width");
                    return value ? parseFloat(value) : null;
                },
                renderHTML: function (attributes) {
                    if (!attributes.width)
                        return {};
                    return {
                        "data-width": attributes.width,
                        style: "flex: ".concat(attributes.width),
                    };
                },
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
    addKeyboardShortcuts: function () {
        var _this = this;
        var jumpToColumn = function (direction) { return function () {
            var _a = _this.editor.view, state = _a.state, dispatch = _a.dispatch;
            var columns = (0, core_1.findParentNode)(function (node) { return node.type.name === "columns"; })(state.selection);
            if (!columns)
                return false;
            var column = (0, core_1.findParentNode)(function (node) { return node.type.name === "column"; })(state.selection);
            if (!column)
                return false;
            var currentIndex = -1;
            columns.node.forEach(function (_child, offset, index) {
                if (columns.pos + 1 + offset === column.pos) {
                    currentIndex = index;
                }
            });
            var targetIndex = currentIndex + direction;
            if (targetIndex < 0 || targetIndex >= columns.node.childCount) {
                return true;
            }
            var offset = 0;
            for (var j = 0; j < targetIndex; j++) {
                offset += columns.node.child(j).nodeSize;
            }
            var targetPos = columns.pos + 1 + offset + 1 + 1;
            if (dispatch) {
                dispatch(state.tr.setSelection(state_1.TextSelection.create(state.doc, targetPos)));
            }
            return true;
        }; };
        return {
            Tab: jumpToColumn(1),
            "Shift-Tab": jumpToColumn(-1),
        };
    },
    addCommands: function () {
        return {
            setColumnWidth: function (width) {
                return function (_a) {
                    var commands = _a.commands;
                    return commands.updateAttributes("column", { width: width });
                };
            },
        };
    },
});
