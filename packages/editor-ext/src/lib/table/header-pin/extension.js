"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TableHeaderPin = void 0;
var core_1 = require("@tiptap/core");
var state_1 = require("@tiptap/pm/state");
var controller_1 = require("./controller");
var tableHeaderPinKey = new state_1.PluginKey('tableHeaderPin');
exports.TableHeaderPin = core_1.Extension.create({
    name: 'tableHeaderPin',
    addProseMirrorPlugins: function () {
        var editorRoot = null;
        var domObserver = null;
        var tracked = new Set();
        var rafHandle = null;
        var reconcile = function () {
            rafHandle = null;
            if (!editorRoot)
                return;
            var current = new Set(editorRoot.querySelectorAll('.tableWrapper'));
            for (var _i = 0, tracked_1 = tracked; _i < tracked_1.length; _i++) {
                var w = tracked_1[_i];
                if (!current.has(w)) {
                    (0, controller_1.detach)(w);
                    tracked.delete(w);
                }
            }
            for (var _a = 0, current_1 = current; _a < current_1.length; _a++) {
                var w = current_1[_a];
                if (!tracked.has(w)) {
                    (0, controller_1.attach)(w);
                    tracked.add(w);
                }
            }
        };
        var schedule = function () {
            if (rafHandle !== null)
                return;
            rafHandle = requestAnimationFrame(reconcile);
        };
        return [
            new state_1.Plugin({
                key: tableHeaderPinKey,
                view: function (editorView) {
                    editorRoot = editorView.dom;
                    schedule();
                    domObserver = new MutationObserver(schedule);
                    domObserver.observe(editorRoot, { subtree: true, childList: true });
                    return {
                        update: function (view, prevState) {
                            if (!editorRoot)
                                return;
                            if (view.state.doc === prevState.doc)
                                return;
                            editorRoot
                                .querySelectorAll('.tableWrapper')
                                .forEach(function (w) { var _a; return (_a = (0, controller_1.getController)(w)) === null || _a === void 0 ? void 0 : _a.refresh(); });
                        },
                        destroy: function () {
                            if (rafHandle !== null) {
                                cancelAnimationFrame(rafHandle);
                                rafHandle = null;
                            }
                            domObserver === null || domObserver === void 0 ? void 0 : domObserver.disconnect();
                            domObserver = null;
                            for (var _i = 0, tracked_2 = tracked; _i < tracked_2.length; _i++) {
                                var w = tracked_2[_i];
                                (0, controller_1.detach)(w);
                            }
                            tracked.clear();
                            editorRoot = null;
                        },
                    };
                },
            }),
        ];
    },
});
