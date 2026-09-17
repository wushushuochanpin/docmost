"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.markdownToHtml = markdownToHtml;
var marked_1 = require("marked");
var callout_marked_1 = require("./callout.marked");
var math_block_marked_1 = require("./math-block.marked");
var math_inline_marked_1 = require("./math-inline.marked");
marked_1.marked.use({
    renderer: {
        list: function (_a) {
            var ordered = _a.ordered, start = _a.start, items = _a.items;
            var body = "";
            for (var _i = 0, items_1 = items; _i < items_1.length; _i++) {
                var item = items_1[_i];
                body += this.listitem(item);
            }
            if (ordered) {
                var startAttr = start !== 1 ? " start=\"".concat(start, "\"") : "";
                return "<ol".concat(startAttr, ">\n").concat(body, "</ol>\n");
            }
            var isTaskList = items.some(function (item) { return item.task; });
            var dataType = isTaskList ? ' data-type="taskList"' : "";
            return "<ul".concat(dataType, ">\n").concat(body, "</ul>\n");
        },
        listitem: function (_a) {
            var tokens = _a.tokens, isTask = _a.task, isChecked = _a.checked;
            var text = this.parser.parse(tokens);
            if (!isTask) {
                return "<li>".concat(text, "</li>\n");
            }
            var checkedAttr = isChecked
                ? 'data-checked="true"'
                : 'data-checked="false"';
            return "<li data-type=\"taskItem\" ".concat(checkedAttr, ">").concat(text, "</li>\n");
        },
    },
});
marked_1.marked.use({
    extensions: [callout_marked_1.calloutExtension, math_block_marked_1.mathBlockExtension, math_inline_marked_1.mathInlineExtension],
});
marked_1.marked.setOptions({ breaks: true });
function markdownToHtml(markdownInput) {
    var YAML_FONT_MATTER_REGEX = /^\s*---[\s\S]*?---\s*/;
    var markdown = markdownInput
        .replace(YAML_FONT_MATTER_REGEX, "")
        .trimStart();
    return marked_1.marked.parse(markdown).toString();
}
