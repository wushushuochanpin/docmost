"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mathBlockExtension = void 0;
var marked_1 = require("marked");
exports.mathBlockExtension = {
    name: 'mathBlock',
    level: 'block',
    start: function (src) {
        var _a, _b;
        return (_b = (_a = src.match(/\$\$/)) === null || _a === void 0 ? void 0 : _a.index) !== null && _b !== void 0 ? _b : -1;
    },
    tokenizer: function (src) {
        var _a;
        var rule = /^\$\$(?!(\$))([\s\S]+?)\$\$/;
        var match = rule.exec(src);
        if (match) {
            return {
                type: 'mathBlock',
                raw: match[0],
                text: (_a = match[2]) === null || _a === void 0 ? void 0 : _a.trim(),
            };
        }
    },
    renderer: function (token) {
        var mathBlockToken = token;
        // parse to prevent escaping slashes
        var latex = marked_1.marked
            .parse(mathBlockToken.text)
            .toString()
            .replace(/<(\/)?p>/g, '');
        return "<div data-type=\"".concat(mathBlockToken.type, "\" data-katex=\"true\">").concat(latex, "</div>");
    },
};
