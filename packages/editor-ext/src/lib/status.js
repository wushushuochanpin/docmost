"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Status = void 0;
var core_1 = require("@tiptap/core");
var react_1 = require("@tiptap/react");
exports.Status = core_1.Node.create({
    name: 'status',
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    draggable: true,
    addOptions: function () {
        return {
            HTMLAttributes: {},
            view: null,
        };
    },
    addStorage: function () {
        return {
            autoOpen: false,
        };
    },
    addAttributes: function () {
        return {
            text: {
                default: '',
                parseHTML: function (element) { return element.textContent || ''; },
            },
            color: {
                default: 'gray',
                parseHTML: function (element) {
                    return element.getAttribute('data-color') || 'gray';
                },
            },
        };
    },
    parseHTML: function () {
        return [
            {
                tag: "span[data-type=\"".concat(this.name, "\"]"),
            },
        ];
    },
    renderHTML: function (_a) {
        var HTMLAttributes = _a.HTMLAttributes;
        return [
            'span',
            {
                'data-type': this.name,
                'data-color': HTMLAttributes.color,
            },
            HTMLAttributes.text,
        ];
    },
    addNodeView: function () {
        this.editor.isInitialized = true;
        return (0, react_1.ReactNodeViewRenderer)(this.options.view);
    },
    addCommands: function () {
        var _this = this;
        return {
            setStatus: function (attributes) {
                return function (_a) {
                    var _b;
                    var commands = _a.commands;
                    _this.storage.autoOpen = true;
                    return commands.insertContent({
                        type: _this.name,
                        attrs: {
                            text: (_b = attributes === null || attributes === void 0 ? void 0 : attributes.text) !== null && _b !== void 0 ? _b : '',
                            color: (attributes === null || attributes === void 0 ? void 0 : attributes.color) || 'gray',
                        },
                    });
                };
            },
        };
    },
});
