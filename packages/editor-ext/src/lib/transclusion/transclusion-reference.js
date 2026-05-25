"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransclusionReference = void 0;
var core_1 = require("@tiptap/core");
var react_1 = require("@tiptap/react");
exports.TransclusionReference = core_1.Node.create({
    name: "transclusionReference",
    addOptions: function () {
        return {
            HTMLAttributes: {},
            view: null,
        };
    },
    group: "block",
    atom: true,
    selectable: true,
    draggable: false,
    addAttributes: function () {
        return {
            sourcePageId: {
                default: null,
                parseHTML: function (el) { return el.getAttribute("data-source-page-id"); },
                renderHTML: function (attrs) {
                    return attrs.sourcePageId
                        ? { "data-source-page-id": attrs.sourcePageId }
                        : {};
                },
            },
            transclusionId: {
                default: null,
                parseHTML: function (el) { return el.getAttribute("data-transclusion-id"); },
                renderHTML: function (attrs) {
                    return attrs.transclusionId
                        ? { "data-transclusion-id": attrs.transclusionId }
                        : {};
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
        ];
    },
    addCommands: function () {
        var _this = this;
        return {
            insertTransclusionReference: function (attributes) {
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
        if (!this.options.view)
            return null;
        this.editor.isInitialized = true;
        return (0, react_1.ReactNodeViewRenderer)(this.options.view);
    },
});
