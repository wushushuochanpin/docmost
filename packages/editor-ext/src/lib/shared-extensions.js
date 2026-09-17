"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.htmlToMarkdown = exports.addUniqueIdsToDoc = void 0;
exports.getSharedTiptapExtensions = getSharedTiptapExtensions;
/**
 * Shared Tiptap extension configuration used by both server (collaboration
 * persistence, import/export) and client (editor).
 *
 * This is the single source of truth. Add new extensions here and both
 * sides get them automatically.
 */
var starter_kit_1 = require("@tiptap/starter-kit");
var extension_text_align_1 = require("@tiptap/extension-text-align");
var extension_superscript_1 = require("@tiptap/extension-superscript");
var extension_subscript_1 = require("@tiptap/extension-subscript");
var extension_typography_1 = require("@tiptap/extension-typography");
var extension_text_style_1 = require("@tiptap/extension-text-style");
var extension_color_1 = require("@tiptap/extension-color");
var extension_youtube_1 = require("@tiptap/extension-youtube");
var extension_list_1 = require("@tiptap/extension-list");
var heading_1 = require("./heading/heading");
var callout_1 = require("./callout/callout");
var comment_1 = require("./comment/comment");
var custom_code_block_1 = require("./custom-code-block/custom-code-block");
var details_1 = require("./details");
var link_1 = require("./link/link");
var math_1 = require("./math");
var table_1 = require("./table");
var image_1 = require("./image/image");
var video_1 = require("./video/video");
var audio_1 = require("./audio/audio");
var pdf_1 = require("./pdf/pdf");
var page_break_1 = require("./page-break/page-break");
var trailing_node_1 = require("./trailing-node/trailing-node");
var attachment_1 = require("./attachment/attachment");
var drawio_1 = require("./drawio");
var excalidraw_1 = require("./excalidraw");
var embed_1 = require("./embed/embed");
var mention_1 = require("./mention/mention");
var subpages_1 = require("./subpages/subpages");
var highlight_1 = require("./highlight");
var indent_1 = require("./indent");
var unique_id_1 = require("./unique-id/unique-id");
var columns_1 = require("./columns");
var status_1 = require("./status/status");
var transclusion_1 = require("./transclusion");
var unique_id_2 = require("./unique-id/unique-id");
Object.defineProperty(exports, "addUniqueIdsToDoc", { enumerable: true, get: function () { return unique_id_2.addUniqueIdsToDoc; } });
var markdown_1 = require("./markdown/markdown");
Object.defineProperty(exports, "htmlToMarkdown", { enumerable: true, get: function () { return markdown_1.htmlToMarkdown; } });
/**
 * Extensions shared by both server (collab persistence, import/export) and
 * client editor. Extensions that are client-only (SlashCommand, DragHandle,
 * Collaboration, MarkdownClipboard) are NOT included here.
 */
function getSharedTiptapExtensions() {
    return [
        starter_kit_1.StarterKit.configure({
            codeBlock: false,
            link: false,
            trailingNode: false,
            heading: false,
        }),
        heading_1.Heading,
        unique_id_1.UniqueID.configure({
            types: ['heading', 'paragraph', 'transclusionSource'],
        }),
        comment_1.Comment,
        extension_text_align_1.TextAlign.configure({ types: ['heading', 'paragraph'] }),
        indent_1.Indent,
        extension_list_1.TaskList,
        extension_list_1.TaskItem.configure({ nested: true }),
        link_1.LinkExtension,
        extension_superscript_1.Superscript,
        extension_subscript_1.default,
        highlight_1.Highlight,
        extension_typography_1.Typography,
        trailing_node_1.TrailingNode,
        extension_text_style_1.TextStyle,
        extension_color_1.Color,
        math_1.MathInline,
        math_1.MathBlock,
        details_1.Details,
        details_1.DetailsContent,
        details_1.DetailsSummary,
        table_1.CustomTable,
        table_1.TableCell,
        table_1.TableRow,
        table_1.TableHeader,
        extension_youtube_1.Youtube,
        image_1.TiptapImage,
        video_1.TiptapVideo,
        audio_1.TiptapAudio,
        pdf_1.TiptapPdf,
        page_break_1.PageBreak,
        callout_1.Callout,
        attachment_1.Attachment,
        custom_code_block_1.CustomCodeBlock,
        drawio_1.Drawio,
        excalidraw_1.Excalidraw,
        embed_1.Embed,
        mention_1.Mention,
        subpages_1.Subpages,
        columns_1.Columns,
        columns_1.Column,
        status_1.Status,
        transclusion_1.TransclusionSource,
        transclusion_1.TransclusionReference,
    ];
}
