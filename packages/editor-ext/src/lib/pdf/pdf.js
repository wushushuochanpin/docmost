"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TiptapPdf = void 0;
var react_1 = require("@tiptap/react");
var core_1 = require("@tiptap/core");
var utils_1 = require("../utils");
exports.TiptapPdf = core_1.Node.create({
    name: "pdf",
    group: "block",
    isolating: true,
    atom: true,
    defining: true,
    draggable: true,
    addOptions: function () {
        return {
            view: null,
            HTMLAttributes: {},
        };
    },
    addAttributes: function () {
        return {
            src: {
                default: "",
                parseHTML: function (element) {
                    var src = element.getAttribute("src");
                    var sanitized = (0, utils_1.sanitizeUrl)(src);
                    return (0, utils_1.isInternalFileUrl)(sanitized) ? sanitized : "";
                },
                renderHTML: function (attributes) { return ({
                    src: (0, utils_1.isInternalFileUrl)(attributes.src) ? (0, utils_1.sanitizeUrl)(attributes.src) : "",
                }); },
            },
            name: {
                default: undefined,
                parseHTML: function (element) { return element.getAttribute("data-name"); },
                renderHTML: function (attributes) { return ({
                    "data-name": attributes.name,
                }); },
            },
            attachmentId: {
                default: undefined,
                parseHTML: function (element) { return element.getAttribute("data-attachment-id"); },
                renderHTML: function (attributes) { return ({
                    "data-attachment-id": attributes.attachmentId,
                }); },
            },
            size: {
                default: null,
                parseHTML: function (element) { return element.getAttribute("data-size"); },
                renderHTML: function (attributes) { return ({
                    "data-size": attributes.size,
                }); },
            },
            width: {
                default: 800,
                parseHTML: function (element) {
                    var raw = element.getAttribute("width");
                    if (!raw)
                        return null;
                    var num = parseFloat(raw);
                    return isNaN(num) ? null : num;
                },
                renderHTML: function (attributes) { return ({
                    width: attributes.width,
                }); },
            },
            height: {
                default: 600,
                parseHTML: function (element) {
                    var raw = element.getAttribute("height");
                    if (!raw)
                        return null;
                    var num = parseFloat(raw);
                    return isNaN(num) ? null : num;
                },
                renderHTML: function (attributes) { return ({
                    height: attributes.height,
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
                "iframe",
                {
                    src: (0, utils_1.isInternalFileUrl)(HTMLAttributes.src) ? (0, utils_1.sanitizeUrl)(HTMLAttributes.src) : "",
                    width: HTMLAttributes.width || 800,
                    height: HTMLAttributes.height || 600,
                },
            ],
        ];
    },
    addCommands: function () {
        return {
            setPdf: function (attrs) {
                return function (_a) {
                    var commands = _a.commands;
                    return commands.insertContent({
                        type: "pdf",
                        attrs: attrs,
                    });
                };
            },
        };
    },
    addNodeView: function () {
        this.editor.isInitialized = true;
        return (0, react_1.ReactNodeViewRenderer)(this.options.view);
    },
});
