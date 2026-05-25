"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Heading = void 0;
var extension_heading_1 = require("@tiptap/extension-heading");
var react_1 = require("@tiptap/react");
var view_1 = require("@tiptap/pm/view");
var state_1 = require("@tiptap/pm/state");
var utils_1 = require("../utils");
var copyIcon = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"18\" height=\"18\" viewBox=\"0 0 24 24\"><!-- Icon from Material Symbols Light by Google - https://github.com/google/material-design-icons/blob/master/LICENSE --><path fill=\"currentColor\" d=\"M10.616 16.077H7.077q-1.692 0-2.884-1.192T3 12t1.193-2.885t2.884-1.193h3.539v1H7.077q-1.27 0-2.173.904Q4 10.731 4 12t.904 2.173t2.173.904h3.539zM8.5 12.5v-1h7v1zm4.885 3.577v-1h3.538q1.27 0 2.173-.904Q20 13.269 20 12t-.904-2.173t-2.173-.904h-3.538v-1h3.538q1.692 0 2.885 1.192T21 12t-1.193 2.885t-2.884 1.193z\"/></svg>";
var successIcon = "<svg xmlns=\"http://www.w3.org/2000/svg\" style=\"color: forestgreen;\" width=\"18\" height=\"18\" viewBox=\"0 0 24 24\"><!-- Icon from Material Symbols by Google - https://github.com/google/material-design-icons/blob/master/LICENSE --><path fill=\"currentColor\" d=\"m10.6 16.6l7.05-7.05l-1.4-1.4l-5.65 5.65l-2.85-2.85l-1.4 1.4zM12 22q-2.075 0-3.9-.788t-3.175-2.137T2.788 15.9T2 12t.788-3.9t2.137-3.175T8.1 2.788T12 2t3.9.788t3.175 2.137T21.213 8.1T22 12t-.788 3.9t-2.137 3.175t-3.175 2.138T12 22\"/></svg>";
exports.Heading = extension_heading_1.default.extend({
    // @ts-ignore
    addProseMirrorPlugins: function () {
        return [
            new state_1.Plugin({
                props: {
                    decorations: function (state) {
                        var decorations = [];
                        var doc = state.doc;
                        doc.descendants(function (node, pos) {
                            if (node.type.name === "heading" && node.content.size > 1) {
                                var deco = view_1.Decoration.widget(pos + node.nodeSize - 1, function () {
                                    var icon = document.createElement("span");
                                    icon.classList.add("link-btn");
                                    icon.innerHTML = "&nbsp;";
                                    icon.contentEditable = "false";
                                    var linkBtnContent = document.createElement("span");
                                    linkBtnContent.classList.add("link-btn-content");
                                    linkBtnContent.innerHTML = copyIcon;
                                    icon.appendChild(linkBtnContent);
                                    icon.addEventListener("mousedown", function (e) {
                                        return e.preventDefault();
                                    });
                                    icon.addEventListener("click", function (e) {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        var id = node.attrs.id;
                                        var baseUrl = window.location.href.split('#')[0];
                                        var url = "".concat(baseUrl, "#").concat(id);
                                        (0, utils_1.copyToClipboard)(url);
                                        linkBtnContent.innerHTML = successIcon;
                                        setTimeout(function () { return (linkBtnContent.innerHTML = copyIcon); }, 2000);
                                    });
                                    return icon;
                                }, { side: 1 });
                                decorations.push(deco);
                            }
                        });
                        return view_1.DecorationSet.create(doc, decorations);
                    },
                },
            }),
        ];
    },
    renderHTML: function (_a) {
        var node = _a.node, HTMLAttributes = _a.HTMLAttributes;
        var hasLevel = this.options.levels.includes(node.attrs.level);
        var level = hasLevel ? node.attrs.level : this.options.levels[0];
        return [
            "h".concat(level),
            (0, react_1.mergeAttributes)(this.options.HTMLAttributes, HTMLAttributes, {
                id: node.attrs.id,
            }),
            0,
        ];
    },
});
