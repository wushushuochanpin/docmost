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
exports.Mention = exports.MentionPluginKey = void 0;
var core_1 = require("@tiptap/core");
var state_1 = require("@tiptap/pm/state");
var suggestion_1 = require("@tiptap/suggestion");
/**
 * The plugin key for the mention plugin.
 * @default 'mention'
 */
exports.MentionPluginKey = new state_1.PluginKey("mention");
/**
 * This extension allows you to insert mentions into the editor.
 * @see https://www.tiptap.dev/api/extensions/mention
 */
exports.Mention = core_1.Node.create({
    name: "mention",
    priority: 101,
    addOptions: function () {
        var _this = this;
        return {
            HTMLAttributes: {},
            renderText: function (_a) {
                var _b;
                var options = _a.options, node = _a.node;
                return "".concat(options.suggestion.char).concat((_b = node.attrs.label) !== null && _b !== void 0 ? _b : node.attrs.id);
            },
            deleteTriggerWithBackspace: false,
            renderHTML: function (_a) {
                var _b;
                var options = _a.options, node = _a.node;
                var isUserMention = node.attrs.entityType === "user";
                return [
                    "span",
                    (0, core_1.mergeAttributes)(this.HTMLAttributes, options.HTMLAttributes),
                    "".concat(isUserMention ? options.suggestion.char : "").concat((_b = node.attrs.label) !== null && _b !== void 0 ? _b : node.attrs.entityId),
                ];
            },
            suggestion: {
                char: "@",
                pluginKey: exports.MentionPluginKey,
                command: function (_a) {
                    var _b, _c, _d;
                    var editor = _a.editor, range = _a.range, props = _a.props;
                    // increase range.to by one when the next node is of type "text"
                    // and starts with a space character
                    var nodeAfter = editor.view.state.selection.$to.nodeAfter;
                    var overrideSpace = (_b = nodeAfter === null || nodeAfter === void 0 ? void 0 : nodeAfter.text) === null || _b === void 0 ? void 0 : _b.startsWith(" ");
                    if (overrideSpace) {
                        range.to += 1;
                    }
                    editor
                        .chain()
                        .focus()
                        .insertContentAt(range, [
                        {
                            type: _this.name,
                            attrs: props,
                        },
                        {
                            type: "text",
                            text: " ",
                        },
                    ])
                        .run();
                    // get reference to `window` object from editor element, to support cross-frame JS usage
                    (_d = (_c = editor.view.dom.ownerDocument.defaultView) === null || _c === void 0 ? void 0 : _c.getSelection()) === null || _d === void 0 ? void 0 : _d.collapseToEnd();
                },
                allow: function (_a) {
                    var state = _a.state, range = _a.range;
                    var $from = state.doc.resolve(range.from);
                    var type = state.schema.nodes[_this.name];
                    var allow = !!$from.parent.type.contentMatch.matchType(type);
                    return allow;
                },
            },
        };
    },
    group: "inline",
    inline: true,
    selectable: true,
    atom: true,
    draggable: true,
    addAttributes: function () {
        return {
            id: {
                default: null,
                parseHTML: function (element) { return element.getAttribute("data-id"); },
                renderHTML: function (attributes) {
                    if (!attributes.id) {
                        return {};
                    }
                    return {
                        "data-id": attributes.id,
                    };
                },
            },
            label: {
                default: null,
                parseHTML: function (element) { return element.getAttribute("data-label"); },
                renderHTML: function (attributes) {
                    if (!attributes.label) {
                        return {};
                    }
                    return {
                        "data-label": attributes.label,
                    };
                },
            },
            entityType: {
                default: null,
                parseHTML: function (element) { return element.getAttribute("data-entity-type"); },
                renderHTML: function (attributes) {
                    if (!attributes.entityType) {
                        return {};
                    }
                    return {
                        "data-entity-type": attributes.entityType,
                    };
                },
            },
            entityId: {
                default: null,
                parseHTML: function (element) { return element.getAttribute("data-entity-id"); },
                renderHTML: function (attributes) {
                    if (!attributes.entityId) {
                        return {};
                    }
                    return {
                        "data-entity-id": attributes.entityId,
                    };
                },
            },
            slugId: {
                default: null,
                parseHTML: function (element) { return element.getAttribute("data-slug-id"); },
                renderHTML: function (attributes) {
                    if (!attributes.slugId) {
                        return {};
                    }
                    return {
                        "data-slug-id": attributes.slugId,
                    };
                },
            },
            nodeType: {
                default: null,
                parseHTML: function (element) { return element.getAttribute("data-node-type"); },
                renderHTML: function (attributes) {
                    if (!attributes.nodeType) {
                        return {};
                    }
                    return {
                        "data-node-type": attributes.nodeType,
                    };
                },
            },
            creatorId: {
                default: null,
                parseHTML: function (element) { return element.getAttribute("data-creator-id"); },
                renderHTML: function (attributes) {
                    if (!attributes.creatorId) {
                        return {};
                    }
                    return {
                        "data-creator-id": attributes.creatorId,
                    };
                },
            },
            anchorId: {
                default: null,
                parseHTML: function (element) { return element.getAttribute("data-anchor-id"); },
                renderHTML: function (attributes) {
                    if (!attributes.anchorId) {
                        return {};
                    }
                    return {
                        "data-anchor-id": attributes.anchorId,
                    };
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
        var node = _a.node, HTMLAttributes = _a.HTMLAttributes;
        var mergedOptions = __assign({}, this.options);
        mergedOptions.HTMLAttributes = (0, core_1.mergeAttributes)({ "data-type": this.name }, this.options.HTMLAttributes, HTMLAttributes);
        var html = this.options.renderHTML({
            options: mergedOptions,
            node: node,
        });
        if (typeof html === "string") {
            return [
                "span",
                (0, core_1.mergeAttributes)({ "data-type": this.name }, this.options.HTMLAttributes, HTMLAttributes),
                html,
            ];
        }
        return html;
    },
    renderText: function (_a) {
        var node = _a.node;
        return this.options.renderText({
            options: this.options,
            node: node,
        });
    },
    addKeyboardShortcuts: function () {
        var _this = this;
        return {
            Backspace: function () {
                return _this.editor.commands.command(function (_a) {
                    var tr = _a.tr, state = _a.state;
                    var isMention = false;
                    var selection = state.selection;
                    var empty = selection.empty, anchor = selection.anchor;
                    if (!empty) {
                        return false;
                    }
                    state.doc.nodesBetween(anchor - 1, anchor, function (node, pos) {
                        if (node.type.name === _this.name) {
                            isMention = true;
                            tr.insertText(_this.options.deleteTriggerWithBackspace
                                ? ""
                                : _this.options.suggestion.char || "", pos, pos + node.nodeSize);
                            return false;
                        }
                    });
                    return isMention;
                });
            },
        };
    },
    addProseMirrorPlugins: function () {
        return [
            (0, suggestion_1.default)(__assign({ editor: this.editor }, this.options.suggestion)),
        ];
    },
});
