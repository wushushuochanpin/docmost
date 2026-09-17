"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MathBlock = exports.inputRegex = void 0;
var core_1 = require("@tiptap/core");
var react_1 = require("@tiptap/react");
exports.inputRegex = /(?:^|\s)((?:\$\$\$)((?:[^$]+))(?:\$\$\$))$/;
exports.MathBlock = core_1.Node.create({
    name: "mathBlock",
    group: "block",
    atom: true,
    isolating: true,
    addOptions: function () {
        return {
            HTMLAttributes: {},
            view: null,
        };
    },
    addAttributes: function () {
        return {
            text: {
                default: "",
                parseHTML: function (element) {
                    return element.innerHTML;
                },
            },
        };
    },
    parseHTML: function () {
        return [
            {
                tag: "div[data-type=\"".concat(this.name, "\"]"),
                getAttrs: function (node) {
                    return node.hasAttribute("data-katex") ? {} : false;
                },
            },
        ];
    },
    renderHTML: function (_a) {
        var HTMLAttributes = _a.HTMLAttributes;
        return [
            "div",
            { "data-type": this.name, "data-katex": true },
            "".concat(HTMLAttributes.text),
        ];
    },
    addNodeView: function () {
        // Force the react node view to render immediately using flush sync (https://github.com/ueberdosis/tiptap/blob/b4db352f839e1d82f9add6ee7fb45561336286d8/packages/react/src/ReactRenderer.tsx#L183-L191)
        this.editor.isInitialized = true;
        return (0, react_1.ReactNodeViewRenderer)(this.options.view);
    },
    addCommands: function () {
        var _this = this;
        return {
            setMathBlock: function (attributes) {
                return function (_a) {
                    var commands = _a.commands;
                    return commands.insertContent({
                        type: _this.name,
                        attrs: attributes,
                    });
                };
            },
        };
    },
    addInputRules: function () {
        return [
            (0, core_1.nodeInputRule)({
                find: exports.inputRegex,
                type: this.type,
                getAttributes: function (match) { return ({
                    text: match[1].replace(/\$/g, ""),
                }); },
            }),
        ];
    },
});
