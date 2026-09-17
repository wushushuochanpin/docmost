"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Attachment = void 0;
var core_1 = require("@tiptap/core");
var react_1 = require("@tiptap/react");
var utils_1 = require("../utils");
exports.Attachment = core_1.Node.create({
    name: "attachment",
    inline: false,
    group: "block",
    isolating: true,
    atom: true,
    defining: true,
    draggable: true,
    addOptions: function () {
        return {
            HTMLAttributes: {},
            view: null,
        };
    },
    addAttributes: function () {
        return {
            url: {
                default: "",
                parseHTML: function (element) {
                    var url = element.getAttribute("data-attachment-url");
                    return (0, utils_1.sanitizeUrl)(url);
                },
                renderHTML: function (attributes) { return ({
                    "data-attachment-url": (0, utils_1.sanitizeUrl)(attributes.url),
                }); },
            },
            name: {
                default: undefined,
                parseHTML: function (element) { return element.getAttribute("data-attachment-name"); },
                renderHTML: function (attributes) { return ({
                    "data-attachment-name": attributes.name,
                }); },
            },
            mime: {
                default: undefined,
                parseHTML: function (element) { return element.getAttribute("data-attachment-mime"); },
                renderHTML: function (attributes) { return ({
                    "data-attachment-mime": attributes.mime,
                }); },
            },
            size: {
                default: null,
                parseHTML: function (element) { return element.getAttribute("data-attachment-size"); },
                renderHTML: function (attributes) { return ({
                    "data-attachment-size": attributes.size,
                }); },
            },
            attachmentId: {
                default: undefined,
                parseHTML: function (element) { return element.getAttribute("data-attachment-id"); },
                renderHTML: function (attributes) { return ({
                    "data-attachment-id": attributes.attachmentId,
                }); },
            },
            placeholder: {
                default: null,
                rendered: false,
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
            [
                "a",
                {
                    href: (0, utils_1.sanitizeUrl)(HTMLAttributes["data-attachment-url"]),
                    class: "attachment",
                    target: "blank",
                },
                "".concat(HTMLAttributes["data-attachment-name"]),
            ],
        ];
    },
    addCommands: function () {
        return {
            setAttachment: function (attrs) {
                return function (_a) {
                    var commands = _a.commands;
                    return commands.insertContent({
                        type: "attachment",
                        attrs: attrs,
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
