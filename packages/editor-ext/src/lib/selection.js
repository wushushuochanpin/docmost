"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Selection = void 0;
var core_1 = require("@tiptap/core");
var state_1 = require("@tiptap/pm/state");
var view_1 = require("@tiptap/pm/view");
exports.Selection = core_1.Extension.create({
    name: "selection",
    addProseMirrorPlugins: function () {
        var editor = this.editor;
        return [
            new state_1.Plugin({
                key: new state_1.PluginKey("selection"),
                props: {
                    decorations: function (state) {
                        if (state.selection.empty) {
                            return null;
                        }
                        if (editor.isFocused === true) {
                            return null;
                        }
                        return view_1.DecorationSet.create(state.doc, [
                            view_1.Decoration.inline(state.selection.from, state.selection.to, {
                                class: "selection",
                            }),
                        ]);
                    },
                },
            }),
        ];
    },
});
exports.default = exports.Selection;
