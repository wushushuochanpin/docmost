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
exports.TableHeader = void 0;
var extension_table_1 = require("@tiptap/extension-table");
exports.TableHeader = extension_table_1.TableHeader.extend({
    name: "tableHeader",
    content: "(paragraph | heading | bulletList | orderedList | taskList | blockquote | callout | image | video | audio | subpages | attachment | mathBlock | details | codeBlock)+",
    addAttributes: function () {
        var _a;
        return __assign(__assign({}, (_a = this.parent) === null || _a === void 0 ? void 0 : _a.call(this)), { backgroundColor: {
                default: null,
                parseHTML: function (element) {
                    return element.style.backgroundColor ||
                        element.getAttribute("data-background-color") ||
                        null;
                },
                renderHTML: function (attributes) {
                    if (!attributes.backgroundColor) {
                        return {};
                    }
                    return {
                        style: "background-color: ".concat(attributes.backgroundColor),
                        "data-background-color": attributes.backgroundColor,
                    };
                },
            }, backgroundColorName: {
                default: null,
                parseHTML: function (element) {
                    return element.getAttribute("data-background-color-name") || null;
                },
                renderHTML: function (attributes) {
                    if (!attributes.backgroundColorName) {
                        return {};
                    }
                    return {
                        "data-background-color-name": attributes.backgroundColorName.toLowerCase(),
                    };
                },
            } });
    },
});
