"use strict";
// Pin-offset measurement and watcher used by the table header-pin controller.
Object.defineProperty(exports, "__esModule", { value: true });
exports.pinOffsetWatcher = exports.EDITOR_PIN_OFFSET_VAR = void 0;
exports.computePinTop = computePinTop;
// Fallback app-bar height (px) when no fixed surface is mounted; matches global-app-shell.tsx.
var APP_BAR_FALLBACK_HEIGHT = 45;
exports.EDITOR_PIN_OFFSET_VAR = '--editor-pin-offset';
// Selectors for fixed surfaces between viewport top and editor content. Use data attributes —
// CSS module classes are build-time hashed and won't match.
var PIN_ANCHOR_SELECTORS = [
    '[data-page-header]',
    '[data-fixed-toolbar]',
];
function computePinTop() {
    var bottom = APP_BAR_FALLBACK_HEIGHT;
    for (var _i = 0, PIN_ANCHOR_SELECTORS_1 = PIN_ANCHOR_SELECTORS; _i < PIN_ANCHOR_SELECTORS_1.length; _i++) {
        var sel = PIN_ANCHOR_SELECTORS_1[_i];
        var el = document.querySelector(sel);
        if (!el)
            continue;
        var rect = el.getBoundingClientRect();
        if (rect.height > 0 && rect.bottom > bottom)
            bottom = rect.bottom;
    }
    return bottom;
}
// Reference-counted watcher that publishes the editor's top offset to a CSS custom property.
exports.pinOffsetWatcher = {
    refs: 0,
    resizeObserver: null,
    rafPending: false,
    lastValue: -1,
    acquire: function () {
        var _this = this;
        if (this.refs++ > 0)
            return;
        this.publish();
        var schedule = function () {
            if (_this.rafPending)
                return;
            _this.rafPending = true;
            requestAnimationFrame(function () {
                _this.rafPending = false;
                _this.publish();
            });
        };
        this.resizeObserver = new ResizeObserver(schedule);
        this.resizeObserver.observe(document.body);
    },
    release: function () {
        var _a;
        if (--this.refs > 0)
            return;
        (_a = this.resizeObserver) === null || _a === void 0 ? void 0 : _a.disconnect();
        this.resizeObserver = null;
        document.documentElement.style.removeProperty(exports.EDITOR_PIN_OFFSET_VAR);
        this.lastValue = -1;
    },
    publish: function () {
        var top = computePinTop();
        if (top === this.lastValue)
            return;
        this.lastValue = top;
        document.documentElement.style.setProperty(exports.EDITOR_PIN_OFFSET_VAR, "".concat(top, "px"));
    },
};
