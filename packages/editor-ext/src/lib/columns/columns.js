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
exports.Columns = void 0;
var core_1 = require("@tiptap/core");
var model_1 = require("@tiptap/pm/model");
var state_1 = require("@tiptap/pm/state");
var view_1 = require("@tiptap/pm/view");
function columnCountFromLayout(layout) {
    if (layout.startsWith("five"))
        return 5;
    if (layout.startsWith("four"))
        return 4;
    if (layout.startsWith("three"))
        return 3;
    return 2;
}
function defaultLayoutForCount(count) {
    if (count === 3)
        return "three_equal";
    if (count === 4)
        return "four_equal";
    if (count === 5)
        return "five_equal";
    return "two_equal";
}
exports.Columns = core_1.Node.create({
    name: "columns",
    group: "block",
    content: "column+",
    defining: true,
    isolating: true,
    addOptions: function () {
        return {
            HTMLAttributes: {},
        };
    },
    addAttributes: function () {
        return {
            layout: {
                default: "two_equal",
                parseHTML: function (element) { return element.getAttribute("data-layout"); },
                renderHTML: function (attributes) { return ({
                    "data-layout": attributes.layout,
                }); },
            },
            widthMode: {
                default: "normal",
                parseHTML: function (element) {
                    return element.getAttribute("data-width-mode") || "normal";
                },
                renderHTML: function (attributes) {
                    if (!attributes.widthMode || attributes.widthMode === "normal")
                        return {};
                    return { "data-width-mode": attributes.widthMode };
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
    addCommands: function () {
        var _this = this;
        return {
            insertColumns: function (attributes) {
                return function (_a) {
                    var tr = _a.tr, state = _a.state, dispatch = _a.dispatch;
                    var layout = (attributes === null || attributes === void 0 ? void 0 : attributes.layout) || "two_equal";
                    var count = columnCountFromLayout(layout);
                    var columnType = state.schema.nodes.column;
                    var paraType = state.schema.nodes.paragraph;
                    var children = Array.from({ length: count }, function () {
                        return columnType.create(null, paraType.create());
                    });
                    var columnsNode = _this.type.create(attributes, model_1.Fragment.from(children));
                    var stepsBefore = tr.steps.length;
                    tr.replaceSelectionWith(columnsNode);
                    if (tr.steps.length > stepsBefore) {
                        var stepMap = tr.steps[tr.steps.length - 1].getMap();
                        var insertStart_1 = 0;
                        stepMap.forEach(function (_from, _to, newFrom) {
                            insertStart_1 = newFrom;
                        });
                        tr.setSelection(state_1.TextSelection.near(tr.doc.resolve(insertStart_1 + 1), 1));
                    }
                    if (dispatch)
                        dispatch(tr);
                    return true;
                };
            },
            setColumnsWidthMode: function (widthMode) {
                return function (_a) {
                    var commands = _a.commands;
                    return commands.updateAttributes("columns", { widthMode: widthMode });
                };
            },
            setColumnCount: function (count) {
                return function (_a) {
                    var tr = _a.tr, state = _a.state;
                    var predicate = function (node) { return node.type.name === "columns"; };
                    var parent = (0, core_1.findParentNode)(predicate)(state.selection);
                    if (!parent)
                        return false;
                    var columnsNode = parent.node, parentPos = parent.pos;
                    var currentCount = columnsNode.childCount;
                    if (count === currentCount || count < 2 || count > 5)
                        return false;
                    var columnType = state.schema.nodes.column;
                    var paraType = state.schema.nodes.paragraph;
                    var newChildren = [];
                    if (count > currentCount) {
                        for (var i = 0; i < currentCount; i++) {
                            newChildren.push(columnsNode.child(i));
                        }
                        for (var i = currentCount; i < count; i++) {
                            newChildren.push(columnType.create(null, paraType.create()));
                        }
                    }
                    else {
                        for (var i = 0; i < count - 1; i++) {
                            newChildren.push(columnsNode.child(i));
                        }
                        var mergedContent = columnsNode.child(count - 1).content;
                        var _loop_1 = function (j) {
                            var col = columnsNode.child(j);
                            var nonEmpty = [];
                            col.content.forEach(function (child) {
                                if (child.type.name !== "paragraph" ||
                                    child.content.size > 0) {
                                    nonEmpty.push(child);
                                }
                            });
                            if (nonEmpty.length > 0) {
                                mergedContent = mergedContent.append(model_1.Fragment.from(nonEmpty));
                            }
                        };
                        for (var j = count; j < currentCount; j++) {
                            _loop_1(j);
                        }
                        newChildren.push(columnType.create(null, mergedContent));
                    }
                    var newLayout = defaultLayoutForCount(count);
                    var newNode = columnsNode.type.create(__assign(__assign({}, columnsNode.attrs), { layout: newLayout }), model_1.Fragment.from(newChildren));
                    tr.replaceWith(parentPos, parentPos + columnsNode.nodeSize, newNode);
                    tr.setSelection(state_1.TextSelection.near(tr.doc.resolve(parentPos + 1), 1));
                    return true;
                };
            },
            setColumnsLayout: function (layout) {
                return function (_a) {
                    var commands = _a.commands;
                    return commands.updateAttributes("columns", { layout: layout });
                };
            },
        };
    },
    addProseMirrorPlugins: function () {
        return [
            new state_1.Plugin({
                key: new state_1.PluginKey("columnsFocus"),
                props: {
                    decorations: function (state) {
                        var parent = (0, core_1.findParentNode)(function (node) { return node.type.name === "columns"; })(state.selection);
                        if (!parent)
                            return view_1.DecorationSet.empty;
                        return view_1.DecorationSet.create(state.doc, [
                            view_1.Decoration.node(parent.pos, parent.pos + parent.node.nodeSize, { class: "has-focus" }),
                        ]);
                    },
                },
            }),
        ];
    },
});
