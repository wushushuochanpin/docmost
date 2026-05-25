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
exports.Highlight = void 0;
var extension_highlight_1 = require("@tiptap/extension-highlight");
exports.Highlight = extension_highlight_1.Highlight.extend({
    addAttributes: function () {
        var _a;
        return __assign(__assign({}, (_a = this.parent) === null || _a === void 0 ? void 0 : _a.call(this)), { color: {
                default: null,
                parseHTML: function (element) {
                    return element.getAttribute("data-color") || element.style.backgroundColor;
                },
                renderHTML: function (attributes) {
                    if (!attributes.color) {
                        return {};
                    }
                    return {
                        "data-color": attributes.color,
                        style: "background-color: ".concat(attributes.color, "; color: inherit"),
                    };
                },
            }, colorName: {
                default: null,
                parseHTML: function (element) {
                    return element.getAttribute("data-highlight-color-name") || null;
                },
                renderHTML: function (attributes) {
                    if (!attributes.colorName) {
                        return {};
                    }
                    return {
                        "data-highlight-color-name": attributes.colorName.toLowerCase(),
                    };
                },
            } });
    },
});
