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
exports.Embed = void 0;
var core_1 = require("@tiptap/core");
var react_1 = require("@tiptap/react");
var utils_1 = require("./utils");
exports.Embed = core_1.Node.create({
    name: "embed",
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
            src: {
                default: "",
                parseHTML: function (element) {
                    var src = element.getAttribute("data-src");
                    return (0, utils_1.sanitizeUrl)(src);
                },
                renderHTML: function (attributes) { return ({
                    "data-src": (0, utils_1.sanitizeUrl)(attributes.src),
                }); },
            },
            provider: {
                default: "",
                parseHTML: function (element) { return element.getAttribute("data-provider"); },
                renderHTML: function (attributes) { return ({
                    "data-provider": attributes.provider,
                }); },
            },
            align: {
                default: "center",
                parseHTML: function (element) { return element.getAttribute("data-align"); },
                renderHTML: function (attributes) { return ({
                    "data-align": attributes.align,
                }); },
            },
            width: {
                default: 800,
                parseHTML: function (element) { return element.getAttribute("data-width"); },
                renderHTML: function (attributes) { return ({
                    "data-width": attributes.width,
                }); },
            },
            height: {
                default: 600,
                parseHTML: function (element) { return element.getAttribute("data-height"); },
                renderHTML: function (attributes) { return ({
                    "data-height": attributes.height,
                }); },
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
        var src = HTMLAttributes["data-src"];
        var safeHref = (0, utils_1.sanitizeUrl)(src);
        return [
            "div",
            (0, core_1.mergeAttributes)({ "data-type": this.name }, this.options.HTMLAttributes, HTMLAttributes),
            [
                "a",
                {
                    href: safeHref,
                    target: "blank",
                },
                safeHref,
            ],
        ];
    },
    addCommands: function () {
        return {
            setEmbed: function (attrs) {
                return function (_a) {
                    var commands = _a.commands;
                    // Validate the URL before inserting
                    var validatedAttrs = __assign(__assign({}, attrs), { src: (0, utils_1.sanitizeUrl)(attrs.src) });
                    return commands.insertContent({
                        type: "embed",
                        attrs: validatedAttrs,
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
