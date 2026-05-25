"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrailingNode = void 0;
var core_1 = require("@tiptap/core");
var state_1 = require("@tiptap/pm/state");
function nodeEqualsType(_a) {
    var types = _a.types, node = _a.node;
    return (Array.isArray(types) && types.includes(node.type)) || node.type === types;
}
// @ts-ignore
/**
 * Extension based on:
 * - https://github.com/ueberdosis/tiptap/blob/v1/packages/tiptap-extensions/src/extensions/TrailingNode.js
 * - https://github.com/remirror/remirror/blob/e0f1bec4a1e8073ce8f5500d62193e52321155b9/packages/prosemirror-trailing-node/src/trailing-node-plugin.ts
 */
exports.TrailingNode = core_1.Extension.create({
    name: 'trailingNode',
    addOptions: function () {
        return {
            node: 'paragraph',
            notAfter: [
                'paragraph',
            ],
        };
    },
    addProseMirrorPlugins: function () {
        var _this = this;
        var plugin = new state_1.PluginKey(this.name);
        var disabledNodes = Object.entries(this.editor.schema.nodes)
            .map(function (_a) {
            var value = _a[1];
            return value;
        })
            .filter(function (node) { return _this.options.notAfter.includes(node.name); });
        return [
            new state_1.Plugin({
                key: plugin,
                appendTransaction: function (_, __, state) {
                    var doc = state.doc, tr = state.tr, schema = state.schema;
                    var shouldInsertNodeAtEnd = plugin.getState(state);
                    var endPosition = doc.content.size;
                    var type = schema.nodes[_this.options.node];
                    if (!shouldInsertNodeAtEnd) {
                        return;
                    }
                    return tr.insert(endPosition, type.create());
                },
                state: {
                    init: function (_, state) {
                        try {
                            var lastNode = state.tr.doc.lastChild;
                            return !nodeEqualsType({ node: lastNode, types: disabledNodes });
                        }
                        catch (err) {
                            console.log(err);
                        }
                        return true;
                    },
                    apply: function (tr, value) {
                        if (!tr.docChanged) {
                            return value;
                        }
                        // Ignore transactions from UniqueID extension to prevent infinite loops
                        // when UniqueID adds IDs to newly inserted trailing nodes
                        if (tr.getMeta('__uniqueIDTransaction')) {
                            return value;
                        }
                        var lastNode = tr.doc.lastChild;
                        return !nodeEqualsType({ node: lastNode, types: disabledNodes });
                    },
                },
            }),
        ];
    }
});
