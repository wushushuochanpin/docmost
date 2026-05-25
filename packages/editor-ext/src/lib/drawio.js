"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Drawio = void 0;
var core_1 = require("@tiptap/core");
var resizable_nodeview_1 = require("./resizable-nodeview");
var react_1 = require("@tiptap/react");
var media_utils_1 = require("./media-utils");
exports.Drawio = core_1.Node.create({
    name: "drawio",
    inline: false,
    group: "block",
    isolating: true,
    atom: true,
    defining: true,
    draggable: true,
    addOptions: function () {
        return {
            HTMLAttributes: {},
            view: null,
            resize: false,
        };
    },
    addAttributes: function () {
        return {
            src: {
                default: "",
                parseHTML: function (element) { return element.getAttribute("data-src"); },
                renderHTML: function (attributes) { return ({
                    "data-src": attributes.src,
                }); },
            },
            title: {
                default: undefined,
                parseHTML: function (element) { return element.getAttribute("data-title"); },
                renderHTML: function (attributes) { return ({
                    "data-title": attributes.title,
                }); },
            },
            alt: {
                default: undefined,
                parseHTML: function (element) { return element.getAttribute("data-alt"); },
                renderHTML: function (attributes) { return ({
                    "data-alt": attributes.alt,
                }); },
            },
            width: {
                default: null,
                parseHTML: function (element) {
                    var raw = element.getAttribute("data-width");
                    if (!raw)
                        return null;
                    if (raw.endsWith("%"))
                        return raw;
                    var num = parseFloat(raw);
                    return isNaN(num) ? null : num;
                },
                renderHTML: function (attributes) { return ({
                    "data-width": attributes.width,
                }); },
            },
            height: {
                default: null,
                parseHTML: function (element) {
                    var raw = element.getAttribute("data-height");
                    if (!raw)
                        return null;
                    var num = parseFloat(raw);
                    return isNaN(num) ? null : num;
                },
                renderHTML: function (attributes) { return ({
                    "data-height": attributes.height,
                }); },
            },
            size: {
                default: null,
                parseHTML: function (element) { return element.getAttribute("data-size"); },
                renderHTML: function (attributes) { return ({
                    "data-size": attributes.size,
                }); },
            },
            aspectRatio: {
                default: null,
                parseHTML: function (element) { return element.getAttribute("data-aspect-ratio"); },
                renderHTML: function (attributes) { return ({
                    "data-aspect-ratio": attributes.aspectRatio,
                }); },
            },
            align: {
                default: "center",
                parseHTML: function (element) { return element.getAttribute("data-align"); },
                renderHTML: function (attributes) { return ({
                    "data-align": attributes.align,
                }); },
            },
            attachmentId: {
                default: undefined,
                parseHTML: function (element) { return element.getAttribute("data-attachment-id"); },
                renderHTML: function (attributes) { return ({
                    "data-attachment-id": attributes.attachmentId,
                }); },
            },
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
            (0, core_1.mergeAttributes)({ "data-type": this.name }, this.options.HTMLAttributes, HTMLAttributes),
            [
                "img",
                {
                    src: HTMLAttributes["data-src"],
                    alt: HTMLAttributes["data-alt"] || HTMLAttributes["data-title"],
                    width: HTMLAttributes["data-width"],
                },
            ],
        ];
    },
    addCommands: function () {
        return {
            setDrawio: function (attrs) {
                return function (_a) {
                    var commands = _a.commands;
                    return commands.insertContent({
                        type: "drawio",
                        attrs: attrs,
                    });
                };
            },
            setDrawioAlign: function (align) {
                return function (_a) {
                    var commands = _a.commands;
                    return commands.updateAttributes("drawio", { align: align });
                };
            },
            setDrawioSize: function (width, height) {
                return function (_a) {
                    var commands = _a.commands;
                    return commands.updateAttributes("drawio", { width: width, height: height });
                };
            },
        };
    },
    addNodeView: function () {
        var _this = this;
        var resize = this.options.resize;
        if (!resize || !resize.enabled) {
            this.editor.isInitialized = true;
            return (0, react_1.ReactNodeViewRenderer)(this.options.view);
        }
        var directions = resize.directions, minWidth = resize.minWidth, minHeight = resize.minHeight, alwaysPreserveAspectRatio = resize.alwaysPreserveAspectRatio, createCustomHandle = resize.createCustomHandle, className = resize.className;
        return function (props) {
            var _a;
            var node = props.node, getPos = props.getPos, HTMLAttributes = props.HTMLAttributes, editor = props.editor;
            if (!node.attrs.src) {
                editor.isInitialized = true;
                var reactView = (0, react_1.ReactNodeViewRenderer)(_this.options.view);
                var view = reactView(props);
                var originalUpdate_1 = (_a = view.update) === null || _a === void 0 ? void 0 : _a.bind(view);
                view.update = function (updatedNode, decorations, innerDecorations) {
                    if (updatedNode.attrs.src && !node.attrs.src) {
                        return false;
                    }
                    if (originalUpdate_1) {
                        return originalUpdate_1(updatedNode, decorations, innerDecorations);
                    }
                    return true;
                };
                return view;
            }
            var el = document.createElement("img");
            el.src = (0, media_utils_1.normalizeFileUrl)(node.attrs.src);
            el.alt = node.attrs.alt || node.attrs.title || "";
            el.style.display = "block";
            el.style.maxWidth = "100%";
            el.style.borderRadius = "8px";
            var currentNode = node;
            var nodeView = new resizable_nodeview_1.ResizableNodeView({
                element: el,
                editor: editor,
                node: node,
                getPos: getPos,
                onResize: function (w, h) {
                    el.style.width = "".concat(w, "px");
                    el.style.height = "".concat(h, "px");
                },
                onCommit: function () {
                    var pos = getPos();
                    if (pos === undefined)
                        return;
                    _this.editor
                        .chain()
                        .setNodeSelection(pos)
                        .updateAttributes(_this.name, {
                        width: Math.round(el.offsetWidth),
                        height: Math.round(el.offsetHeight),
                    })
                        .run();
                },
                onUpdate: function (updatedNode, _decorations, _innerDecorations) {
                    if (updatedNode.type !== currentNode.type) {
                        return false;
                    }
                    if (updatedNode.attrs.src !== currentNode.attrs.src) {
                        el.src = (0, media_utils_1.normalizeFileUrl)(updatedNode.attrs.src);
                    }
                    if (updatedNode.attrs.alt !== currentNode.attrs.alt ||
                        updatedNode.attrs.title !== currentNode.attrs.title) {
                        el.alt =
                            updatedNode.attrs.alt || updatedNode.attrs.title || "";
                    }
                    var w = updatedNode.attrs.width;
                    var h = updatedNode.attrs.height;
                    if (w != null) {
                        el.style.width = "".concat(w, "px");
                    }
                    if (h != null) {
                        el.style.height = "".concat(h, "px");
                    }
                    var align = updatedNode.attrs.align || "center";
                    var container = nodeView.dom;
                    applyAlignment(container, align);
                    currentNode = updatedNode;
                    return true;
                },
                options: {
                    directions: directions,
                    min: {
                        width: minWidth,
                        height: minHeight,
                    },
                    preserveAspectRatio: alwaysPreserveAspectRatio === true,
                    createCustomHandle: createCustomHandle,
                    className: className,
                },
            });
            var dom = nodeView.dom;
            applyAlignment(dom, node.attrs.align || "center");
            // Handle percentage width backward compat
            var widthAttr = node.attrs.width;
            if (typeof widthAttr === "string" && widthAttr.endsWith("%")) {
                requestAnimationFrame(function () {
                    var parentEl = dom.parentElement;
                    if (parentEl) {
                        var containerWidth = parentEl.clientWidth;
                        var pctValue = parseInt(widthAttr, 10);
                        if (!isNaN(pctValue) && containerWidth > 0) {
                            var pxWidth = Math.round(containerWidth * (pctValue / 100));
                            el.style.width = "".concat(pxWidth, "px");
                            if (node.attrs.aspectRatio) {
                                el.style.height = "".concat(Math.round(pxWidth / node.attrs.aspectRatio), "px");
                            }
                        }
                    }
                    dom.style.visibility = "";
                    dom.style.pointerEvents = "";
                });
            }
            // Show skeleton background while image loads from server
            dom.style.pointerEvents = "none";
            el.classList.add("media-pulse");
            el.onload = function () {
                dom.style.pointerEvents = "";
                el.classList.remove("media-pulse");
            };
            return nodeView;
        };
    },
});
function applyAlignment(container, align) {
    if (align === "left") {
        container.style.justifyContent = "flex-start";
    }
    else if (align === "right") {
        container.style.justifyContent = "flex-end";
    }
    else {
        container.style.justifyContent = "center";
    }
}
