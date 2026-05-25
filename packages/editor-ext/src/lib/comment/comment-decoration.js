"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.commentDecoration = commentDecoration;
var state_1 = require("@tiptap/pm/state");
var view_1 = require("@tiptap/pm/view");
var comment_1 = require("./comment");
function commentDecoration() {
    var commentDecorationPlugin = new state_1.PluginKey('commentDecoration');
    return new state_1.Plugin({
        key: commentDecorationPlugin,
        state: {
            init: function () {
                return view_1.DecorationSet.empty;
            },
            apply: function (tr, oldSet) {
                var decorationMeta = tr.getMeta(comment_1.commentDecorationMetaKey);
                if (decorationMeta) {
                    var _a = tr.selection, from = _a.from, to = _a.to;
                    var decoration = view_1.Decoration.inline(from, to, { class: comment_1.commentMarkClass });
                    return view_1.DecorationSet.create(tr.doc, [decoration]);
                }
                else if (decorationMeta === false) {
                    return view_1.DecorationSet.empty;
                }
                return oldSet.map(tr.mapping, tr.doc);
            },
        },
        props: {
            decorations: function (state) {
                return commentDecorationPlugin.getState(state);
            },
        },
    });
}
