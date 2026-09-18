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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomCodeBlock = void 0;
var extension_code_block_1 = require("@tiptap/extension-code-block");
var state_1 = require("@tiptap/pm/state");
var gapcursor_1 = require("@tiptap/pm/gapcursor");
var lowlight_plugin_js_1 = require("./lowlight-plugin.js");
var react_1 = require("@tiptap/react");
var TAB_CHAR = '\u00A0\u00A0';
/**
 * This extension allows you to highlight code blocks with lowlight.
 * @see https://tiptap.dev/api/nodes/code-block-lowlight
 */
exports.CustomCodeBlock = extension_code_block_1.default.extend({
    // Run ahead of Gapcursor (100) so the mermaid arrow-into-source plugin
    // can intercept before gapcursor takes over.
    priority: 101,
    selectable: true,
    isolating: true,
    addOptions: function () {
        var _a;
        return __assign(__assign({}, (_a = this.parent) === null || _a === void 0 ? void 0 : _a.call(this)), { lowlight: {}, languageClassPrefix: 'language-', exitOnTripleEnter: true, exitOnArrowDown: true, defaultLanguage: null, HTMLAttributes: {}, view: null });
    },
    addKeyboardShortcuts: function () {
        var _this = this;
        var _a;
        var isMermaid = function (node) {
            return (node === null || node === void 0 ? void 0 : node.type) === _this.type && node.attrs.language === 'mermaid';
        };
        return __assign(__assign({}, (_a = this.parent) === null || _a === void 0 ? void 0 : _a.call(this)), { 
            // Stop at the gap (or enter mermaid source) instead of jumping
            // straight into the next block, so the user can place a cursor
            // between two adjacent isolating blocks.
            ArrowDown: function (_a) {
                var editor = _a.editor;
                var state = editor.state;
                var selection = state.selection, doc = state.doc;
                var $from = selection.$from, empty = selection.empty;
                if (!empty || $from.parent.type !== _this.type)
                    return false;
                if ($from.parentOffset !== $from.parent.nodeSize - 2)
                    return false;
                var after = $from.after();
                if (after >= doc.content.size) {
                    return editor.commands.exitCode();
                }
                var $after = doc.resolve(after);
                var nodeAfter = $after.nodeAfter;
                if (isMermaid(nodeAfter)) {
                    return editor.commands.command(function (_a) {
                        var tr = _a.tr;
                        tr.setSelection(state_1.TextSelection.create(tr.doc, after + 1));
                        return true;
                    });
                }
                if ((nodeAfter === null || nodeAfter === void 0 ? void 0 : nodeAfter.type.spec.isolating) &&
                    !nodeAfter.type.spec.atom) {
                    return editor.commands.command(function (_a) {
                        var tr = _a.tr;
                        tr.setSelection(new gapcursor_1.GapCursor(tr.doc.resolve(after)));
                        return true;
                    });
                }
                return editor.commands.command(function (_a) {
                    var tr = _a.tr;
                    tr.setSelection(state_1.Selection.near(tr.doc.resolve(after)));
                    return true;
                });
            }, 
            // Mirror of ArrowDown; upstream has no ArrowUp handler.
            ArrowUp: function (_a) {
                var editor = _a.editor;
                var state = editor.state;
                var selection = state.selection, doc = state.doc;
                var $from = selection.$from, empty = selection.empty;
                if (!empty || $from.parent.type !== _this.type)
                    return false;
                if ($from.parentOffset !== 0)
                    return false;
                var before = $from.before();
                if (before <= 0)
                    return false;
                var $before = doc.resolve(before);
                var nodeBefore = $before.nodeBefore;
                if (isMermaid(nodeBefore)) {
                    return editor.commands.command(function (_a) {
                        var tr = _a.tr;
                        tr.setSelection(state_1.TextSelection.create(tr.doc, before - 1));
                        return true;
                    });
                }
                if ((nodeBefore === null || nodeBefore === void 0 ? void 0 : nodeBefore.type.spec.isolating) &&
                    !nodeBefore.type.spec.atom) {
                    return editor.commands.command(function (_a) {
                        var tr = _a.tr;
                        tr.setSelection(new gapcursor_1.GapCursor(tr.doc.resolve(before)));
                        return true;
                    });
                }
                return false;
            }, 'Mod-a': function () {
                if (_this.editor.isActive('codeBlock')) {
                    var state = _this.editor.state;
                    var $from = state.selection.$from;
                    var codeBlockNode = null;
                    var codeBlockPos = null;
                    var depth = 0;
                    for (depth = $from.depth; depth > 0; depth--) {
                        var node = $from.node(depth);
                        if (node.type.name === 'codeBlock') {
                            codeBlockNode = node;
                            codeBlockPos = $from.start(depth) - 1;
                            break;
                        }
                    }
                    if (codeBlockNode && codeBlockPos !== null) {
                        var codeBlockStart = codeBlockPos;
                        var codeBlockEnd = codeBlockPos + codeBlockNode.nodeSize;
                        var contentStart = codeBlockStart + 1;
                        var contentEnd = codeBlockEnd - 1;
                        _this.editor.commands.setTextSelection({
                            from: contentStart,
                            to: contentEnd,
                        });
                        return true;
                    }
                }
                return false;
            } });
    },
    addNodeView: function () {
        // Force the react node view to render immediately using flush sync (https://github.com/ueberdosis/tiptap/blob/b4db352f839e1d82f9add6ee7fb45561336286d8/packages/react/src/ReactRenderer.tsx#L183-L191)
        this.editor.isInitialized = true;
        return (0, react_1.ReactNodeViewRenderer)(this.options.view, {
            contentDOMElementTag: 'code',
        });
    },
    addProseMirrorPlugins: function () {
        var _a;
        var codeBlockType = this.type;
        return __spreadArray(__spreadArray([], (((_a = this.parent) === null || _a === void 0 ? void 0 : _a.call(this)) || []), true), [
            (0, lowlight_plugin_js_1.LowlightPlugin)({
                name: this.name,
                lowlight: this.options.lowlight,
                defaultLanguage: this.options.defaultLanguage,
            }),
            // Mermaid hides its <pre> when unselected, so the browser's native
            // vertical caret movement skips past it. Land the cursor inside the
            // source explicitly.
            new state_1.Plugin({
                props: {
                    handleKeyDown: function (view, event) {
                        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
                            return false;
                        }
                        var state = view.state;
                        var selection = state.selection;
                        if (!selection.empty ||
                            !(selection instanceof state_1.TextSelection)) {
                            return false;
                        }
                        var $from = selection.$from;
                        if ($from.depth === 0 || $from.parent.type === codeBlockType) {
                            return false;
                        }
                        var dir = event.key === 'ArrowUp' ? 'up' : 'down';
                        if (!view.endOfTextblock(dir))
                            return false;
                        var isMermaid = function (node) {
                            return (node === null || node === void 0 ? void 0 : node.type) === codeBlockType && node.attrs.language === 'mermaid';
                        };
                        if (event.key === 'ArrowUp') {
                            if ($from.parentOffset !== 0)
                                return false;
                            var beforePos = $from.before();
                            var prev = state.doc.resolve(beforePos).nodeBefore;
                            if (!isMermaid(prev))
                                return false;
                            var endPos = beforePos - 1;
                            view.dispatch(state.tr.setSelection(state_1.TextSelection.create(state.doc, endPos)));
                            return true;
                        }
                        if ($from.parentOffset !== $from.parent.nodeSize - 2)
                            return false;
                        var afterPos = $from.after();
                        var next = state.doc.resolve(afterPos).nodeAfter;
                        if (!isMermaid(next))
                            return false;
                        var startPos = afterPos + 1;
                        view.dispatch(state.tr.setSelection(state_1.TextSelection.create(state.doc, startPos)));
                        return true;
                    },
                },
            }),
        ], false);
    },
});
