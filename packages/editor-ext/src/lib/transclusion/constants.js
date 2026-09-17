"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TRANSCLUSION_SOURCE_CONTENT_EXPRESSION = exports.TRANSCLUSION_SOURCE_ALLOWED_NODE_TYPES = void 0;
/**
 * Top-level block node types allowed inside a `transclusionSource`.
 * Notably excludes:
 * - `transclusionSource` — sync blocks cannot wrap other sync blocks (sources are leaves).
 * - `transclusionReference` — sync blocks cannot transclude other sync blocks,
 *   which keeps the transclusion graph acyclic and lets the renderer skip
 *   cycle-aware traversal entirely.
 *
 * Also excludes child-only nodes (`listItem`, `tableRow`, `column`, etc.)
 * — they're already constrained by their parent containers.
 */
exports.TRANSCLUSION_SOURCE_ALLOWED_NODE_TYPES = [
    'paragraph',
    'heading',
    'blockquote',
    'codeBlock',
    'horizontalRule',
    'bulletList',
    'orderedList',
    'taskList',
    'image',
    'video',
    'audio',
    'attachment',
    'callout',
    'details',
    'embed',
    'mathBlock',
    'table',
    'drawio',
    'excalidraw',
    'pdf',
    'subpages',
    'columns',
    'youtube',
];
exports.TRANSCLUSION_SOURCE_CONTENT_EXPRESSION = "(".concat(exports.TRANSCLUSION_SOURCE_ALLOWED_NODE_TYPES.join(' | '), ")+");
