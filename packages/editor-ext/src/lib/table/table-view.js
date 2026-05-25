"use strict";
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TableView = void 0;
exports.updateColumns = updateColumns;
var col_style_1 = require("./utils/col-style");
function updateColumns(node, colgroup, table, cellMinWidth, overrideCol, overrideValue) {
    var _a;
    var totalWidth = 0;
    var fixedWidth = true;
    var nextDOM = colgroup.firstChild;
    var row = node.firstChild;
    if (row !== null) {
        for (var i = 0, col = 0; i < row.childCount; i += 1) {
            var _b = row.child(i).attrs, colspan = _b.colspan, colwidth = _b.colwidth;
            for (var j = 0; j < colspan; j += 1, col += 1) {
                var hasWidth = overrideCol === col
                    ? overrideValue
                    : (colwidth && colwidth[j]);
                var cssWidth = hasWidth ? "".concat(hasWidth, "px") : '';
                totalWidth += hasWidth || cellMinWidth;
                if (!hasWidth) {
                    fixedWidth = false;
                }
                if (!nextDOM) {
                    var colElement = document.createElement('col');
                    var _c = (0, col_style_1.getColStyleDeclaration)(cellMinWidth, hasWidth), propertyKey = _c[0], propertyValue = _c[1];
                    colElement.style.setProperty(propertyKey, propertyValue);
                    colgroup.appendChild(colElement);
                }
                else {
                    if (nextDOM.style.width !== cssWidth) {
                        var _d = (0, col_style_1.getColStyleDeclaration)(cellMinWidth, hasWidth), propertyKey = _d[0], propertyValue = _d[1];
                        nextDOM.style.setProperty(propertyKey, propertyValue);
                    }
                    nextDOM = nextDOM.nextSibling;
                }
            }
        }
    }
    while (nextDOM) {
        var after = nextDOM.nextSibling;
        (_a = nextDOM.parentNode) === null || _a === void 0 ? void 0 : _a.removeChild(nextDOM);
        nextDOM = after;
    }
    var hasUserWidth = node.attrs.style &&
        typeof node.attrs.style === 'string' &&
        /\bwidth\s*:/i.test(node.attrs.style);
    if (fixedWidth && !hasUserWidth) {
        table.style.width = "".concat(totalWidth, "px");
        table.style.minWidth = '';
    }
    else {
        table.style.width = '';
        table.style.minWidth = "".concat(totalWidth, "px");
    }
}
var TableView = /** @class */ (function () {
    function TableView(node, cellMinWidth) {
        this.node = node;
        this.cellMinWidth = cellMinWidth;
        this.dom = document.createElement('div');
        this.dom.className = 'tableWrapper';
        this.table = this.dom.appendChild(document.createElement('table'));
        if (node.attrs.style) {
            this.table.style.cssText = node.attrs.style;
        }
        this.colgroup = this.table.appendChild(document.createElement('colgroup'));
        updateColumns(node, this.colgroup, this.table, cellMinWidth);
        this.contentDOM = this.table.appendChild(document.createElement('tbody'));
    }
    TableView.prototype.update = function (node) {
        if (node.type !== this.node.type)
            return false;
        this.node = node;
        updateColumns(node, this.colgroup, this.table, this.cellMinWidth);
        return true;
    };
    TableView.prototype.ignoreMutation = function (mutation) {
        var target = mutation.target;
        var isInsideWrapper = this.dom.contains(target);
        var isInsideContent = this.contentDOM.contains(target);
        if (isInsideWrapper && !isInsideContent) {
            if (mutation.type === 'attributes' ||
                mutation.type === 'childList' ||
                mutation.type === 'characterData') {
                return true;
            }
        }
        // Chevron span (.tableReadonlySortChevron) added/removed by sort plugin.
        if (mutation.type === 'childList') {
            var nodes = __spreadArray(__spreadArray([], Array.from(mutation.addedNodes), true), Array.from(mutation.removedNodes), true);
            if (nodes.some(function (n) {
                return n instanceof Element &&
                    n.classList.contains('tableReadonlySortChevron');
            })) {
                return true;
            }
        }
        return false;
    };
    return TableView;
}());
exports.TableView = TableView;
