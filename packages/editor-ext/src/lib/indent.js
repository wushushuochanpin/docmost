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
exports.Indent = void 0;
var core_1 = require("@tiptap/core");
var state_1 = require("@tiptap/pm/state");
// Containers whose descendants must never carry an `indent` attribute. These
// nodes own their own Tab semantics (list nesting, cell navigation, literal
// tab) and visually conflict with our indent padding, so paragraphs and
// headings inside them stay flat
var NON_INDENTABLE_ANCESTORS = new Set([
    'listItem',
    'taskItem',
    'tableCell',
    'tableHeader',
    'codeBlock',
]);
var clampIndent = function (value, min, max) {
    if (!Number.isFinite(value))
        return min;
    return Math.max(min, Math.min(max, Math.trunc(value)));
};
var hasNonIndentableAncestor = function (doc, pos) {
    var $pos = doc.resolve(pos);
    for (var depth = $pos.depth; depth >= 0; depth--) {
        if (NON_INDENTABLE_ANCESTORS.has($pos.node(depth).type.name)) {
            return true;
        }
    }
    return false;
};
exports.Indent = core_1.Extension.create({
    name: 'indent',
    priority: 1000,
    addOptions: function () {
        return {
            types: ['paragraph', 'heading'],
            min: 0,
            max: 8,
        };
    },
    addGlobalAttributes: function () {
        var _this = this;
        return [
            {
                types: this.options.types,
                attributes: {
                    indent: {
                        default: this.options.min,
                        keepOnSplit: true,
                        parseHTML: function (element) {
                            var raw = element.getAttribute('data-indent');
                            if (raw === null)
                                return _this.options.min;
                            return clampIndent(parseInt(raw, 10), _this.options.min, _this.options.max);
                        },
                        renderHTML: function (attributes) {
                            var value = attributes.indent;
                            if (value <= _this.options.min)
                                return {};
                            return { 'data-indent': String(value) };
                        },
                    },
                },
            },
        ];
    },
    addCommands: function () {
        var _this = this;
        return {
            indent: function () {
                return function (_a) {
                    var state = _a.state, tr = _a.tr, dispatch = _a.dispatch;
                    return updateIndent(state, tr, dispatch, _this.options, +1);
                };
            },
            outdent: function () {
                return function (_a) {
                    var state = _a.state, tr = _a.tr, dispatch = _a.dispatch;
                    return updateIndent(state, tr, dispatch, _this.options, -1);
                };
            },
        };
    },
    addKeyboardShortcuts: function () {
        var _this = this;
        var isInIndentableBlock = function () {
            var $from = _this.editor.state.selection.$from;
            if (!_this.options.types.includes($from.parent.type.name))
                return false;
            for (var depth = $from.depth - 1; depth >= 0; depth--) {
                if (NON_INDENTABLE_ANCESTORS.has($from.node(depth).type.name)) {
                    return false;
                }
            }
            return true;
        };
        return {
            // Return the command's result so Tab falls through to the browser
            // (moving focus out of the editor) once the user has reached max
            // indent. Without this Tab stays trapped at max depth, failing
            // WCAG 2.1.2.
            Tab: function () {
                if (!isInIndentableBlock())
                    return false;
                return _this.editor.commands.indent();
            },
            'Shift-Tab': function () {
                if (!isInIndentableBlock())
                    return false;
                return _this.editor.commands.outdent();
            },
            Backspace: function () {
                var _a = _this.editor.state.selection, $from = _a.$from, empty = _a.empty;
                if (!empty)
                    return false;
                if ($from.parentOffset !== 0)
                    return false;
                if (!isInIndentableBlock())
                    return false;
                if ($from.parent.attrs.indent <= _this.options.min)
                    return false;
                _this.editor.commands.outdent();
                return true;
            },
        };
    },
    addProseMirrorPlugins: function () {
        var types = new Set(this.options.types);
        var min = this.options.min;
        return [
            new state_1.Plugin({
                key: new state_1.PluginKey('indentNormalizer'),
                appendTransaction: function (transactions, _oldState, newState) {
                    if (!transactions.some(function (tr) { return tr.docChanged; }))
                        return null;
                    var tr = newState.tr;
                    var modified = false;
                    newState.doc.descendants(function (node, pos) {
                        // Containers: descend so we can find paragraph/heading children.
                        if (!types.has(node.type.name))
                            return true;
                        if (node.attrs.indent <= min)
                            return false;
                        if (hasNonIndentableAncestor(newState.doc, pos)) {
                            tr.setNodeMarkup(pos, undefined, __assign(__assign({}, node.attrs), { indent: min }), node.marks);
                            modified = true;
                        }
                        // paragraph/heading don't contain other paragraphs/headings —
                        // never descend into their inline content.
                        return false;
                    });
                    if (!modified)
                        return null;
                    // Normalisation must not show up as a separate undo step;
                    // otherwise undo would re-introduce the illegal indent.
                    return tr.setMeta('addToHistory', false);
                },
            }),
        ];
    },
});
function updateIndent(state, tr, dispatch, options, delta) {
    var selection = state.selection;
    var from = selection.from, to = selection.to;
    var types = new Set(options.types);
    var updated = false;
    state.doc.nodesBetween(from, to, function (node, pos) {
        // Skip non-block nodes (text, inline atoms) up front.
        if (!node.type.isBlock)
            return false;
        // Don't descend into containers whose children must stay flat — handles
        // multi-block selections that span across e.g. a list-item or table-cell.
        if (NON_INDENTABLE_ANCESTORS.has(node.type.name))
            return false;
        if (!types.has(node.type.name))
            return true;
        var current = node.attrs.indent;
        var next = clampIndent(current + delta, options.min, options.max);
        if (next === current)
            return false;
        tr.setNodeMarkup(pos, undefined, __assign(__assign({}, node.attrs), { indent: next }));
        updated = true;
        return false;
    });
    if (!updated)
        return false;
    if (dispatch)
        dispatch(tr);
    return true;
}
