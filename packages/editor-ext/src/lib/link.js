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
exports.LinkExtension = void 0;
var extension_link_1 = require("@tiptap/extension-link");
var state_1 = require("@tiptap/pm/state");
exports.LinkExtension = extension_link_1.default.extend({
    inclusive: false,
    addAttributes: function () {
        var _a;
        return __assign(__assign({}, (_a = this.parent) === null || _a === void 0 ? void 0 : _a.call(this)), { internal: {
                default: false,
                parseHTML: function (element) {
                    return element.getAttribute('data-internal') === 'true';
                },
                renderHTML: function (attributes) {
                    return attributes.internal ? { 'data-internal': 'true' } : {};
                },
            } });
    },
    addProseMirrorPlugins: function () {
        var _a;
        var editor = this.editor;
        return __spreadArray(__spreadArray([], (((_a = this.parent) === null || _a === void 0 ? void 0 : _a.call(this)) || []), true), [
            new state_1.Plugin({
                props: {
                    handleKeyDown: function (view, event) {
                        var selection = editor.state.selection;
                        if (event.key === 'Escape' && selection.empty !== true) {
                            editor.commands.focus(selection.to, { scrollIntoView: false });
                        }
                        return false;
                    },
                },
            }),
            // Fix for Firefox: when the cursor is at a boundary of a link,
            // Firefox's contenteditable inserts new text *inside* the <a> element.
            // ProseMirror then rejects the mutation because inclusive is false,
            // causing keystrokes to be silently swallowed. Firefox also does not
            // fire handleTextInput in this state, so we intercept at handleKeyDown.
            // This handles both:
            //   - right boundary: cursor just after a link (typing appends to link)
            //   - left boundary: cursor just before a link, e.g. at the start of a
            //     line (#1748), where Firefox places new text inside the link node
            new state_1.Plugin({
                key: new state_1.PluginKey('linkBoundaryInput'),
                props: {
                    handleKeyDown: function (view, event) {
                        // Only handle single printable characters
                        if (event.key.length !== 1)
                            return false;
                        // Don't handle modified keys (shortcuts) or composing (IME)
                        if (event.ctrlKey ||
                            event.metaKey ||
                            event.altKey ||
                            event.isComposing)
                            return false;
                        var state = view.state;
                        var linkType = state.schema.marks.link;
                        if (!linkType)
                            return false;
                        // Don't interfere if the user has explicitly set storedMarks
                        if (state.storedMarks !== null)
                            return false;
                        var _a = state.selection, from = _a.from, to = _a.to;
                        var $from = state.doc.resolve(from);
                        var nodeBefore = $from.nodeBefore;
                        var nodeAfter = $from.nodeAfter;
                        var linkBefore = nodeBefore && linkType.isInSet(nodeBefore.marks);
                        var linkAfter = nodeAfter && linkType.isInSet(nodeAfter.marks);
                        // If both sides have link marks we're in the middle — don't interfere
                        if (linkBefore && linkAfter)
                            return false;
                        // Not at any link boundary — nothing to do
                        if (!linkBefore && !linkAfter)
                            return false;
                        // We're at a link boundary (left or right).
                        // Prevent native input and insert text without the link mark.
                        event.preventDefault();
                        var tr = state.tr.insertText(event.key, from, to);
                        tr.removeMark(from, from + event.key.length, linkType);
                        view.dispatch(tr.scrollIntoView());
                        return true;
                    },
                },
            }),
        ], false);
    },
});
