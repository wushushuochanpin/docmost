"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mathInlineExtension = void 0;
var marked_1 = require("marked");
var inlineMathRegex = /^\$(?!\s)(.+?)(?<!\s)\$(?!\d)/;
exports.mathInlineExtension = {
    name: 'mathInline',
    level: 'inline',
    start: function (src) {
        var index;
        var indexSrc = src;
        while (indexSrc) {
            index = indexSrc.indexOf('$');
            if (index === -1) {
                return;
            }
            var f = index === 0 || indexSrc.charAt(index - 1) === ' ';
            if (f) {
                var possibleKatex = indexSrc.substring(index);
                if (possibleKatex.match(inlineMathRegex)) {
                    return index;
                }
            }
            indexSrc = indexSrc.substring(index + 1).replace(/^\$+/, '');
        }
    },
    tokenizer: function (src) {
        var _a;
        var match = inlineMathRegex.exec(src);
        if (match) {
            return {
                type: 'mathInline',
                raw: match[0],
                text: (_a = match[1]) === null || _a === void 0 ? void 0 : _a.trim(),
            };
        }
    },
    renderer: function (token) {
        var mathInlineToken = token;
        // parse to prevent escaping slashes
        var latex = marked_1.marked
            .parse(mathInlineToken.text)
            .toString()
            .replace(/<(\/)?p>/g, '');
        return "<span data-type=\"".concat(mathInlineToken.type, "\" data-katex=\"true\">").concat(latex, "</span>");
    },
};
