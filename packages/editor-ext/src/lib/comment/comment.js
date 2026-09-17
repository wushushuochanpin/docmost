"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Comment = exports.commentDecorationMetaKey = exports.commentMarkClass = void 0;
var core_1 = require("@tiptap/core");
var comment_decoration_1 = require("./comment-decoration");
exports.commentMarkClass = "comment-mark";
exports.commentDecorationMetaKey = "decorateComment";
exports.Comment = core_1.Mark.create({
    name: "comment",
    exitable: true,
    inclusive: false,
    addOptions: function () {
        return {
            HTMLAttributes: {},
        };
    },
    addStorage: function () {
        return {
            activeCommentId: null,
        };
    },
    addAttributes: function () {
        return {
            commentId: {
                default: null,
                parseHTML: function (element) { return element.getAttribute("data-comment-id"); },
                renderHTML: function (attributes) {
                    if (!attributes.commentId)
                        return;
                    return {
                        "data-comment-id": attributes.commentId,
                    };
                },
            },
            resolved: {
                default: false,
                parseHTML: function (element) { return element.hasAttribute("data-resolved"); },
                renderHTML: function (attributes) {
                    if (!attributes.resolved)
                        return {};
                    return {
                        "data-resolved": "true",
                    };
                },
            },
        };
    },
    parseHTML: function () {
        return [
            {
                tag: "span[data-comment-id]",
                getAttrs: function (el) {
                    var _a;
                    var element = el;
                    var commentId = (_a = element.getAttribute("data-comment-id")) === null || _a === void 0 ? void 0 : _a.trim();
                    var resolved = element.hasAttribute("data-resolved");
                    if (!commentId)
                        return false;
                    return {
                        commentId: commentId,
                        resolved: resolved,
                    };
                },
            },
        ];
    },
    addCommands: function () {
        var _this = this;
        return {
            setCommentDecoration: function () {
                return function (_a) {
                    var tr = _a.tr, dispatch = _a.dispatch;
                    tr.setMeta(exports.commentDecorationMetaKey, true);
                    if (dispatch)
                        dispatch(tr);
                    return true;
                };
            },
            unsetCommentDecoration: function () {
                return function (_a) {
                    var tr = _a.tr, dispatch = _a.dispatch;
                    tr.setMeta(exports.commentDecorationMetaKey, false);
                    if (dispatch)
                        dispatch(tr);
                    return true;
                };
            },
            setComment: function (commentId) {
                return function (_a) {
                    var commands = _a.commands;
                    if (!commentId)
                        return false;
                    // Just add the new mark, do not remove existing ones
                    return commands.setMark(_this.name, { commentId: commentId, resolved: false });
                };
            },
            unsetComment: function (commentId) {
                return function (_a) {
                    var tr = _a.tr, dispatch = _a.dispatch;
                    if (!commentId)
                        return false;
                    tr.doc.descendants(function (node, pos) {
                        var from = pos;
                        var to = pos + node.nodeSize;
                        var commentMark = node.marks.find(function (mark) {
                            return mark.type.name === _this.name &&
                                mark.attrs.commentId === commentId;
                        });
                        if (commentMark) {
                            tr = tr.removeMark(from, to, commentMark);
                        }
                    });
                    return dispatch === null || dispatch === void 0 ? void 0 : dispatch(tr);
                };
            },
            setCommentResolved: function (commentId, resolved) {
                return function (_a) {
                    var tr = _a.tr, dispatch = _a.dispatch;
                    if (!commentId)
                        return false;
                    tr.doc.descendants(function (node, pos) {
                        var from = pos;
                        var to = pos + node.nodeSize;
                        var commentMark = node.marks.find(function (mark) {
                            return mark.type.name === _this.name &&
                                mark.attrs.commentId === commentId;
                        });
                        if (commentMark) {
                            // Remove the existing mark and add a new one with updated resolved state
                            tr = tr.removeMark(from, to, commentMark);
                            tr = tr.addMark(from, to, _this.type.create({
                                commentId: commentMark.attrs.commentId,
                                resolved: resolved,
                            }));
                        }
                    });
                    return dispatch === null || dispatch === void 0 ? void 0 : dispatch(tr);
                };
            },
        };
    },
    renderHTML: function (_a) {
        var _this = this;
        var HTMLAttributes = _a.HTMLAttributes;
        var commentId = (HTMLAttributes === null || HTMLAttributes === void 0 ? void 0 : HTMLAttributes["data-comment-id"]) || null;
        var resolved = (HTMLAttributes === null || HTMLAttributes === void 0 ? void 0 : HTMLAttributes["data-resolved"]) || false;
        if (typeof window === "undefined" || typeof document === "undefined") {
            return [
                "span",
                (0, core_1.mergeAttributes)(this.options.HTMLAttributes, HTMLAttributes, __assign({ class: resolved ? "comment-mark resolved" : "comment-mark", "data-comment-id": commentId }, (resolved && { "data-resolved": "true" }))),
                0,
            ];
        }
        var elem = document.createElement("span");
        Object.entries((0, core_1.mergeAttributes)(this.options.HTMLAttributes, HTMLAttributes)).forEach(function (_a) {
            var attr = _a[0], val = _a[1];
            return elem.setAttribute(attr, val);
        });
        // Add resolved class if the comment is resolved
        if (resolved) {
            elem.classList.add("resolved");
        }
        elem.addEventListener("click", function (e) {
            var selection = document.getSelection();
            if (selection.type === "Range")
                return;
            _this.storage.activeCommentId = commentId;
            var commentEventClick = new CustomEvent("ACTIVE_COMMENT_EVENT", {
                bubbles: true,
                detail: { commentId: commentId, resolved: resolved },
            });
            elem.dispatchEvent(commentEventClick);
        });
        return elem;
    },
    addProseMirrorPlugins: function () {
        return [(0, comment_decoration_1.commentDecoration)()];
    },
});
