"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.htmlToMarkdown = htmlToMarkdown;
var _TurndownService = require("@joplin/turndown");
var TurndownPluginGfm = require("@joplin/turndown-plugin-gfm");
var basename_1 = require("./basename");
// CJS/ESM interop: .default exists in Vite, not in NestJS
var TurndownService = _TurndownService.default || _TurndownService;
function sanitizeMdLinkText(value) {
    return value
        .replace(/\\/g, '\\\\')
        .replace(/([\[\]!])/g, '\\$1')
        .replace(/[\r\n]+/g, ' ');
}
function htmlToMarkdown(html) {
    var turndownService = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
        hr: '---',
        bulletListMarker: '-',
    });
    turndownService.use([
        TurndownPluginGfm.tables,
        TurndownPluginGfm.strikethrough,
        TurndownPluginGfm.highlightedCodeBlock,
        taskList,
        callout,
        preserveDetail,
        listParagraph,
        orderedListItem,
        mathInline,
        mathBlock,
        iframeEmbed,
        image,
        video,
    ]);
    return turndownService.turndown(html).replaceAll('<br>', ' ');
}
function listParagraph(turndownService) {
    turndownService.addRule('paragraph', {
        filter: ['p'],
        replacement: function (content, node) {
            var _a;
            if (((_a = node.parentElement) === null || _a === void 0 ? void 0 : _a.nodeName) === 'LI') {
                return content;
            }
            return "\n\n".concat(content, "\n\n");
        },
    });
}
function orderedListItem(turndownService) {
    turndownService.addRule('orderedListItem', {
        filter: function (node) {
            return node.nodeName === 'LI' && node.getAttribute('data-type') !== 'taskItem';
        },
        replacement: function (content, node, options) {
            var parent = node.parentNode;
            if (parent.nodeName !== 'OL' && parent.nodeName !== 'UL') {
                return content;
            }
            content = content
                .replace(/^\n+/, '')
                .replace(/\n+$/, '\n')
                .replace(/\n/gm, '\n  ');
            var prefix;
            if (parent.nodeName === 'OL') {
                var start = parseInt(parent.getAttribute('start') || '1', 10);
                var index = Array.prototype.indexOf.call(parent.children, node);
                prefix = "".concat(start + index, ". ");
            }
            else {
                prefix = "".concat(options.bulletListMarker, " ");
            }
            return (prefix +
                content +
                (node.nextSibling && !/\n$/.test(content) ? '\n' : ''));
        },
    });
}
function callout(turndownService) {
    turndownService.addRule('callout', {
        filter: function (node) {
            return (node.nodeName === 'DIV' && node.getAttribute('data-type') === 'callout');
        },
        replacement: function (content, node) {
            var calloutType = node.getAttribute('data-callout-type');
            return "\n\n:::".concat(calloutType, "\n").concat(content.trim(), "\n:::\n\n");
        },
    });
}
function taskList(turndownService) {
    turndownService.addRule('taskListItem', {
        filter: function (node) {
            return (node.getAttribute('data-type') === 'taskItem' &&
                node.parentNode.nodeName === 'UL');
        },
        replacement: function (_content, node) {
            var isChecked = node.getAttribute('data-checked') === 'true';
            var div = node.querySelector('div');
            var text = div ? div.textContent.trim() : node.textContent.trim();
            var prefix = "- ".concat(isChecked ? '[x]' : '[ ]', " ");
            return (prefix +
                text +
                (node.nextSibling && !/\n$/.test(text) ? '\n' : ''));
        },
    });
}
function preserveDetail(turndownService) {
    turndownService.addRule('preserveDetail', {
        filter: function (node) {
            return node.nodeName === 'DETAILS';
        },
        replacement: function (_content, node) {
            var summary = node.querySelector(':scope > summary');
            var detailSummary = '';
            if (summary) {
                detailSummary = "<summary>".concat(turndownService.turndown(summary.innerHTML), "</summary>");
            }
            var detailsContent = Array.from(node.childNodes)
                .filter(function (child) { return child.nodeName !== 'SUMMARY'; })
                .map(function (child) {
                return child.nodeType === 1
                    ? turndownService.turndown(child.outerHTML)
                    : child.textContent;
            })
                .join('');
            return "\n<details>\n".concat(detailSummary, "\n\n").concat(detailsContent, "\n\n</details>\n");
        },
    });
}
function mathInline(turndownService) {
    turndownService.addRule('mathInline', {
        filter: function (node) {
            return (node.nodeName === 'SPAN' &&
                node.getAttribute('data-type') === 'mathInline');
        },
        replacement: function (content) {
            return "$".concat(content, "$");
        },
    });
}
function mathBlock(turndownService) {
    turndownService.addRule('mathBlock', {
        filter: function (node) {
            return (node.nodeName === 'DIV' &&
                node.getAttribute('data-type') === 'mathBlock');
        },
        replacement: function (content) {
            return "\n$$\n".concat(content, "\n$$\n");
        },
    });
}
function iframeEmbed(turndownService) {
    turndownService.addRule('iframeEmbed', {
        filter: function (node) {
            return node.nodeName === 'IFRAME';
        },
        replacement: function (_content, node) {
            var src = node.getAttribute('src');
            return '[' + src + '](' + src + ')';
        },
    });
}
function image(turndownService) {
    turndownService.addRule('image', {
        filter: 'img',
        replacement: function (_content, node) {
            var src = node.getAttribute('src') || '';
            if (!src)
                return '';
            var alt = sanitizeMdLinkText(node.getAttribute('alt') || '');
            var title = node.getAttribute('title') || '';
            var titlePart = title ? ' "' + title.replace(/"/g, '\\"') + '"' : '';
            return '![' + alt + '](' + src + titlePart + ')';
        },
    });
}
function video(turndownService) {
    turndownService.addRule('video', {
        filter: function (node) {
            return node.tagName === 'VIDEO';
        },
        replacement: function (_content, node) {
            var src = node.getAttribute('src') || '';
            var ariaLabel = node.getAttribute('aria-label');
            var name = sanitizeMdLinkText(ariaLabel || (0, basename_1.getBasename)(src) || src);
            return '[' + name + '](' + src + ')';
        },
    });
}
