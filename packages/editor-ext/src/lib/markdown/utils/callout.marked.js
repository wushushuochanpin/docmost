"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calloutExtension = void 0;
var marked_1 = require("marked");
exports.calloutExtension = {
    name: 'callout',
    level: 'block',
    start: function (src) {
        var _a, _b;
        return (_b = (_a = src.match(/:::/)) === null || _a === void 0 ? void 0 : _a.index) !== null && _b !== void 0 ? _b : -1;
    },
    tokenizer: function (src) {
        var rule = /^:::([a-zA-Z0-9]+)\s+([\s\S]+?):::/;
        var match = rule.exec(src);
        var validCalloutTypes = ['info', 'success', 'warning', 'danger'];
        if (match) {
            var type = match[1];
            if (!validCalloutTypes.includes(type)) {
                type = 'info';
            }
            return {
                type: 'callout',
                calloutType: type,
                raw: match[0],
                text: match[2].trim(),
            };
        }
    },
    renderer: function (token) {
        var calloutToken = token;
        var body = marked_1.marked.parse(calloutToken.text);
        return "<div data-type=\"callout\" data-callout-type=\"".concat(calloutToken.calloutType, "\">").concat(body, "</div>");
    },
};
