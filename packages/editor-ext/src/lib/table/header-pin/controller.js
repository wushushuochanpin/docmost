"use strict";
// Per-table header-pin controller: native sticky when table fits its wrapper, transform fallback when it doesn't.
Object.defineProperty(exports, "__esModule", { value: true });
exports.TablePinController = void 0;
exports.attach = attach;
exports.detach = detach;
exports.getController = getController;
var offset_1 = require("./offset");
var WRAPPER_NO_OVERFLOW = 'tableWrapperNoOverflow';
var HEADER_PINNED = 'tableHeaderPinned';
var PIN_OFFSET_VAR = '--table-pin-offset';
function firstRowIsAllHeaders(row) {
    if (!row)
        return false;
    var cells = Array.from(row.cells);
    return cells.length > 0 && cells.every(function (c) { return c.tagName === 'TH'; });
}
function isNestedTable(wrapper) {
    return wrapper.closest('table .tableWrapper') !== null;
}
function isLayoutInert(rect) {
    return rect.width === 0 && rect.height === 0;
}
var fallbackControllers = new Set();
var fallbackScrollListener = null;
var fallbackRafPending = false;
function ensureFallbackListener() {
    if (fallbackScrollListener)
        return;
    fallbackScrollListener = function () {
        if (fallbackRafPending)
            return;
        fallbackRafPending = true;
        requestAnimationFrame(function () {
            fallbackRafPending = false;
            for (var _i = 0, fallbackControllers_1 = fallbackControllers; _i < fallbackControllers_1.length; _i++) {
                var ctrl = fallbackControllers_1[_i];
                ctrl.updateFallbackOffset();
            }
        });
    };
    document.addEventListener('scroll', fallbackScrollListener, {
        passive: true,
        capture: true,
    });
}
function maybeTeardownFallbackListener() {
    if (!fallbackScrollListener || fallbackControllers.size > 0)
        return;
    document.removeEventListener('scroll', fallbackScrollListener, {
        capture: true,
    });
    fallbackScrollListener = null;
    fallbackRafPending = false;
}
var TablePinController = /** @class */ (function () {
    function TablePinController(wrapper, table) {
        var _this = this;
        this.mode = 'off';
        this.cachedHeaderRow = null;
        this.wrapper = wrapper;
        this.table = table;
        offset_1.pinOffsetWatcher.acquire();
        this.fitsObserver = new IntersectionObserver(function (entries) {
            for (var _i = 0, entries_1 = entries; _i < entries_1.length; _i++) {
                var entry = entries_1[_i];
                _this.evaluateFit(entry);
            }
        }, { root: this.wrapper, threshold: 1 });
        this.fitsObserver.observe(this.table);
    }
    TablePinController.prototype.getHeaderRow = function () {
        if (this.cachedHeaderRow && this.table.contains(this.cachedHeaderRow)) {
            return this.cachedHeaderRow;
        }
        this.cachedHeaderRow = this.table.querySelector('tr');
        return this.cachedHeaderRow;
    };
    TablePinController.prototype.evaluateFit = function (entry) {
        if (!this.isEligible()) {
            this.apply('off');
            return;
        }
        if (isLayoutInert(entry.boundingClientRect))
            return;
        this.apply(entry.isIntersecting ? 'native' : 'fallback');
    };
    TablePinController.prototype.isEligible = function () {
        return (!isNestedTable(this.wrapper) && firstRowIsAllHeaders(this.getHeaderRow()));
    };
    TablePinController.prototype.apply = function (next) {
        if (next === this.mode)
            return;
        if (this.mode === 'fallback' && next !== 'fallback') {
            fallbackControllers.delete(this);
            maybeTeardownFallbackListener();
        }
        this.mode = next;
        var cls = this.wrapper.classList;
        if (next === 'off') {
            cls.remove(HEADER_PINNED);
            cls.remove(WRAPPER_NO_OVERFLOW);
            this.wrapper.style.removeProperty(PIN_OFFSET_VAR);
        }
        else if (next === 'native') {
            cls.add(HEADER_PINNED);
            cls.add(WRAPPER_NO_OVERFLOW);
            // Native mode reads --editor-pin-offset from :root; clear stale per-wrapper var from fallback.
            this.wrapper.style.removeProperty(PIN_OFFSET_VAR);
        }
        else if (next === 'fallback') {
            cls.add(HEADER_PINNED);
            cls.remove(WRAPPER_NO_OVERFLOW);
            fallbackControllers.add(this);
            ensureFallbackListener();
            // Avoid one stale-frame paint under translateY.
            this.updateFallbackOffset();
        }
    };
    TablePinController.prototype.updateFallbackOffset = function () {
        var pinTop = (0, offset_1.computePinTop)();
        var tableRect = this.table.getBoundingClientRect();
        var headerRow = this.getHeaderRow();
        if (!headerRow)
            return;
        var rowHeight = headerRow.getBoundingClientRect().height;
        var active = tableRect.top < pinTop && tableRect.bottom > pinTop + rowHeight;
        if (active) {
            var offset = Math.min(pinTop - tableRect.top, tableRect.height - rowHeight);
            this.wrapper.style.setProperty(PIN_OFFSET_VAR, "".concat(offset, "px"));
        }
        else {
            this.wrapper.style.removeProperty(PIN_OFFSET_VAR);
        }
    };
    TablePinController.prototype.refresh = function () {
        var _a, _b;
        // The header <tr> may have been replaced by a PM transaction; drop
        // the cached reference before checking eligibility.
        this.cachedHeaderRow = null;
        if (!this.isEligible()) {
            this.apply('off');
            return;
        }
        if (this.mode === 'off') {
            // Eligibility just flipped back on; re-trigger the observer so it
            // emits the current intersection state.
            (_a = this.fitsObserver) === null || _a === void 0 ? void 0 : _a.unobserve(this.table);
            (_b = this.fitsObserver) === null || _b === void 0 ? void 0 : _b.observe(this.table);
        }
    };
    TablePinController.prototype.destroy = function () {
        var _a;
        (_a = this.fitsObserver) === null || _a === void 0 ? void 0 : _a.disconnect();
        this.fitsObserver = undefined;
        this.apply('off');
        offset_1.pinOffsetWatcher.release();
    };
    return TablePinController;
}());
exports.TablePinController = TablePinController;
var controllers = new WeakMap();
function attach(wrapper) {
    if (controllers.has(wrapper))
        return;
    var table = wrapper.querySelector(':scope > table');
    if (!table)
        return;
    controllers.set(wrapper, new TablePinController(wrapper, table));
}
function detach(wrapper) {
    var ctrl = controllers.get(wrapper);
    if (!ctrl)
        return;
    ctrl.destroy();
    controllers.delete(wrapper);
}
function getController(wrapper) {
    return controllers.get(wrapper);
}
