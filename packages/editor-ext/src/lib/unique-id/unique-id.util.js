"use strict";
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
exports.addUniqueIdsToDoc = addUniqueIdsToDoc;
var core_1 = require("@tiptap/core");
var model_1 = require("@tiptap/pm/model");
var state_1 = require("@tiptap/pm/state");
/**
 * Creates a new document with unique IDs added to the nodes. Does the same
 * thing as the UniqueID extension, but without the need to create an `Editor`
 * instance. This lets you add unique IDs to the document in the server.
 *
 * When you call it, include the `UniqueID` extension in the `extensions` array.
 * The configuration from the `UniqueID` extension will be picked up
 * automatically, including its configuration options like `types` and
 * `attributeName`.
 *
 * @see `UniqueID` extension for more information.
 *
 * @throws {Error} If the `UniqueID` extension is not found in the extensions array.
 *
 * @example
 * const doc = {
 *   type: 'doc',
 *   content: [
 *     { type: 'paragraph', content: [{ type: 'text', text: 'Hello, world!' }] }
 *   ]
 * }
 * const newDoc = addUniqueIds(doc, [StarterKit, UniqueID.configure({ types: ['paragraph', 'heading'] })])
 * console.log(newDoc)
 * // Result:
 * // {
 * //   type: 'doc',
 * //   content: [
 * //     { type: 'paragraph', content: [{ type: 'text', text: 'Hello, world!' }], id: '123' }
 * //   ]
 * // }
 *
 * @param doc - A Tiptap JSON document to add unique IDs to.
 * @param extensions - The extensions to use. Must include the `UniqueID` extension.
 * @returns The updated Tiptap JSON document, with the unique IDs added to the nodes.
 */
function addUniqueIdsToDoc(doc, extensions) {
    // Find the UniqueID extension in the extensions array. If it's not found, throw an error.
    var uniqueIDExtension = extensions.find(function (ext) { return ext.name === "uniqueID"; });
    if (!uniqueIDExtension) {
        throw new Error("UniqueID extension not found in the extensions array");
    }
    var _a = uniqueIDExtension.options, types = _a.types, attributeName = _a.attributeName, generateID = _a.generateID;
    // Convert the JSON content to a ProseMirror node
    var schema = (0, core_1.getSchema)(__spreadArray(__spreadArray([], extensions.filter(function (ext) { return ext.name !== "uniqueID"; }), true), [
        uniqueIDExtension,
    ], false));
    var contentNode = model_1.Node.fromJSON(schema, doc);
    // Find nodes that don't have a unique ID
    var nodesWithoutId = (0, core_1.findChildren)(contentNode, function (node) {
        return !node.attrs[attributeName] && types.includes(node.type.name);
    });
    // Edit the document to add unique IDs to the nodes that don't have a unique ID
    var tr = state_1.EditorState.create({
        doc: contentNode,
    }).tr;
    // eslint-disable-next-line no-restricted-syntax
    for (var _i = 0, nodesWithoutId_1 = nodesWithoutId; _i < nodesWithoutId_1.length; _i++) {
        var _b = nodesWithoutId_1[_i], node = _b.node, pos = _b.pos;
        tr = tr.setNodeAttribute(pos, attributeName, generateID({ node: node, pos: pos }));
    }
    // Return the updated document
    return tr.doc.toJSON();
}
