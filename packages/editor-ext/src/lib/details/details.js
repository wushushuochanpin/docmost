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
exports.Details = void 0;
var core_1 = require("@tiptap/core");
var utils_1 = require("../utils");
exports.Details = core_1.Node.create({
    name: "details",
    group: "block",
    content: "detailsSummary detailsContent",
    defining: true,
    isolating: true,
    // @ts-ignore
    allowGapCursor: false,
    addOptions: function () {
        return {
            HTMLAttributes: {},
        };
    },
    addAttributes: function () {
        return {
            open: {
                default: false,
                parseHTML: function (e) { return e.getAttribute("open"); },
                renderHTML: function (a) { return (a.open ? { open: "" } : {}); },
            },
        };
    },
    parseHTML: function () {
        return [
            {
                tag: "details",
            },
        ];
    },
    renderHTML: function (_a) {
        var HTMLAttributes = _a.HTMLAttributes;
        return [
            "details",
            (0, core_1.mergeAttributes)(this.options.HTMLAttributes, HTMLAttributes),
            0,
        ];
    },
    addNodeView: function () {
        var _this = this;
        return function (_a) {
            var node = _a.node, editor = _a.editor, getPos = _a.getPos;
            var dom = document.createElement("div");
            var btn = document.createElement("button");
            var ico = document.createElement("div");
            var div = document.createElement("div");
            for (var _i = 0, _b = Object.entries((0, core_1.mergeAttributes)(_this.options.HTMLAttributes)); _i < _b.length; _i++) {
                var _c = _b[_i], key = _c[0], value = _c[1];
                if (value !== undefined && value !== null) {
                    dom.setAttribute(key, value);
                }
            }
            dom.setAttribute("data-type", _this.name);
            btn.setAttribute("data-type", "".concat(_this.name, "Button"));
            div.setAttribute("data-type", "".concat(_this.name, "Container"));
            if (editor.isEditable) {
                if (node.attrs.open) {
                    dom.setAttribute("open", "true");
                }
                else {
                    dom.removeAttribute("open");
                }
            }
            ico.innerHTML = (0, utils_1.icon)("right-line");
            btn.addEventListener("click", function () {
                var open = !dom.hasAttribute("open");
                if (!editor.isEditable) {
                    // In readonly mode,  toggle the 'open' attribute without updating the document state.
                    if (open) {
                        dom.setAttribute("open", "true");
                    }
                    else {
                        dom.removeAttribute("open");
                    }
                    return;
                }
                (0, utils_1.setAttributes)(editor, getPos, __assign(__assign({}, node.attrs), { open: open }));
            });
            btn.append(ico);
            dom.append(btn);
            dom.append(div);
            return {
                dom: dom,
                contentDOM: div,
                update: function (updatedNode) {
                    if (updatedNode.type !== _this.type) {
                        return false;
                    }
                    if (!editor.isEditable)
                        return true;
                    if (updatedNode.attrs.open) {
                        dom.setAttribute("open", "true");
                    }
                    else {
                        dom.removeAttribute("open");
                    }
                    return true;
                },
            };
        };
    },
    addCommands: function () {
        var _this = this;
        return {
            setDetails: function () {
                return function (_a) {
                    var _b, _c;
                    var state = _a.state, chain = _a.chain;
                    var range = state.selection.$from.blockRange(state.selection.$to);
                    if (!range) {
                        return false;
                    }
                    var slice = state.doc.slice(range.start, range.end);
                    if (slice.content.firstChild.type.name === "detailsSummary")
                        return false;
                    if (!state.schema.nodes.detailsContent.contentMatch.matchFragment(slice.content)) {
                        return false;
                    }
                    return chain()
                        .insertContentAt({
                        from: range.start,
                        to: range.end,
                    }, {
                        type: _this.name,
                        attrs: {
                            open: true,
                        },
                        content: [
                            {
                                type: "detailsSummary",
                            },
                            {
                                type: "detailsContent",
                                content: (_c = (_b = slice.toJSON()) === null || _b === void 0 ? void 0 : _b.content) !== null && _c !== void 0 ? _c : [],
                            },
                        ],
                    })
                        .setTextSelection(range.start + 2)
                        .run();
                };
            },
            unsetDetails: function () {
                return function (_a) {
                    var _b;
                    var state = _a.state, chain = _a.chain;
                    var parent = (0, core_1.findParentNode)(function (node) { return node.type === _this.type; })(state.selection);
                    if (!parent) {
                        return false;
                    }
                    var summary = (0, core_1.findChildren)(parent.node, function (node) { return node.type.name === "detailsSummary"; });
                    var content = (0, core_1.findChildren)(parent.node, function (node) { return node.type.name === "detailsContent"; });
                    if (!summary.length || !content.length) {
                        return false;
                    }
                    var range = {
                        from: parent.pos,
                        to: parent.pos + parent.node.nodeSize,
                    };
                    var defaultType = state.doc.resolve(range.from).parent.type
                        .contentMatch.defaultType;
                    return chain()
                        .insertContentAt(range, __spreadArray([
                        defaultType === null || defaultType === void 0 ? void 0 : defaultType.create(null, summary[0].node.content).toJSON()
                    ], ((_b = content[0].node.content.toJSON()) !== null && _b !== void 0 ? _b : []), true))
                        .setTextSelection(range.from + 1)
                        .run();
                };
            },
            toggleDetails: function () {
                return function (_a) {
                    var state = _a.state, chain = _a.chain;
                    var node = (0, core_1.findParentNode)(function (node) { return node.type === _this.type; })(state.selection);
                    if (node) {
                        return chain().unsetDetails().run();
                    }
                    else {
                        return chain().setDetails().run();
                    }
                };
            },
        };
    },
    addInputRules: function () {
        return [
            (0, core_1.wrappingInputRule)({
                find: /^:::details\s$/,
                type: this.type,
            }),
        ];
    },
    addKeyboardShortcuts: function () {
        var _this = this;
        return {
            "Mod-Alt-d": function () { return _this.editor.commands.toggleDetails(); },
        };
    },
});
