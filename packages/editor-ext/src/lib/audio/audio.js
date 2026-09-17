"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TiptapAudio = void 0;
var core_1 = require("@tiptap/core");
var react_1 = require("@tiptap/react");
var media_utils_1 = require("../media-utils");
var utils_1 = require("../utils");
exports.TiptapAudio = core_1.Node.create({
    name: "audio",
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
                    src: (0, utils_1.isInternalFileUrl)(attributes.src)
                        ? (0, utils_1.sanitizeUrl)(attributes.src)
                        : "",
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
            placeholder: {
                default: null,
                rendered: false,
            },
        };
    },
    parseHTML: function () {
        return [
            {
                tag: "audio",
            },
        ];
    },
    renderHTML: function (_a) {
        var HTMLAttributes = _a.HTMLAttributes;
        return [
            "audio",
            (0, core_1.mergeAttributes)({ controls: "true", preload: "metadata" }, this.options.HTMLAttributes, HTMLAttributes),
            ["source", { src: HTMLAttributes.src }],
        ];
    },
    addCommands: function () {
        return {
            setAudio: function (attrs) {
                return function (_a) {
                    var commands = _a.commands;
                    return commands.insertContent({
                        type: "audio",
                        attrs: attrs,
                    });
                };
            },
        };
    },
    addNodeView: function () {
        if (this.options.view) {
            this.editor.isInitialized = true;
            return (0, react_1.ReactNodeViewRenderer)(this.options.view);
        }
        return function (_a) {
            var node = _a.node, HTMLAttributes = _a.HTMLAttributes;
            var dom = document.createElement("div");
            var audio = document.createElement("audio");
            var src = node.attrs.src;
            if (src && (0, utils_1.isInternalFileUrl)(src)) {
                audio.src = (0, media_utils_1.normalizeFileUrl)(src);
            }
            audio.controls = true;
            audio.preload = "metadata";
            audio.style.width = "100%";
            dom.append(audio);
            return { dom: dom };
        };
    },
});
