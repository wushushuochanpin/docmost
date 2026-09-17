"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PageBreak = void 0;
var core_1 = require("@tiptap/core");
exports.PageBreak = core_1.Node.create({
    name: "pageBreak",
    group: "block",
    atom: true,
    selectable: true,
    addOptions: function () {
        return {
            HTMLAttributes: {},
        };
    },
    parseHTML: function () {
        return [
            {
                tag: "div[data-type=\"".concat(this.name, "\"]"),
            },
        ];
    },
    renderHTML: function (_a) {
        var HTMLAttributes = _a.HTMLAttributes;
        return [
            "div",
            (0, core_1.mergeAttributes)({ "data-type": this.name, class: "page-break" }, this.options.HTMLAttributes, HTMLAttributes),
        ];
    },
    addCommands: function () {
        var _this = this;
        return {
            setPageBreak: function () {
                return function (_a) {
                    var chain = _a.chain;
                    return chain()
                        .insertContent({ type: _this.name })
                        .focus()
                        .run();
                };
            },
        };
    },
});
