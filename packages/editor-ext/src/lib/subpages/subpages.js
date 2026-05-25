"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Subpages = void 0;
var core_1 = require("@tiptap/core");
var react_1 = require("@tiptap/react");
exports.Subpages = core_1.Node.create({
    name: "subpages",
    addOptions: function () {
        return {
            HTMLAttributes: {},
            view: null,
        };
    },
    group: "block",
    atom: true,
    draggable: true,
    isolating: true,
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
        ];
    },
    addCommands: function () {
        var _this = this;
        return {
            insertSubpages: function (attributes) {
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
    addNodeView: function () {
        // Force the react node view to render immediately using flush sync (https://github.com/ueberdosis/tiptap/blob/b4db352f839e1d82f9add6ee7fb45561336286d8/packages/react/src/ReactRenderer.tsx#L183-L191)
        this.editor.isInitialized = true;
        return (0, react_1.ReactNodeViewRenderer)(this.options.view);
    },
});
