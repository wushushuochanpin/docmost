"use strict";
/***
 MIT License
 Copyright (c) 2023 - 2024 Jeet Mandaliya (Github Username: sereneinserenade)
 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all
 copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 SOFTWARE.
 ***/
Object.defineProperty(exports, "__esModule", { value: true });
exports.SearchAndReplace = exports.searchAndReplacePluginKey = void 0;
var core_1 = require("@tiptap/core");
var view_1 = require("@tiptap/pm/view");
var state_1 = require("@tiptap/pm/state");
var getRegex = function (s, disableRegex, caseSensitive) {
    return RegExp(disableRegex ? s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : s, caseSensitive ? "gu" : "gui");
};
function processSearches(doc, searchTerm, searchResultClass, resultIndex) {
    var decorations = [];
    var results = [];
    var textNodesWithPosition = [];
    var index = 0;
    if (!searchTerm) {
        return {
            decorationsToReturn: view_1.DecorationSet.empty,
            results: [],
        };
    }
    doc === null || doc === void 0 ? void 0 : doc.descendants(function (node, pos) {
        if (node.isText) {
            if (textNodesWithPosition[index]) {
                textNodesWithPosition[index] = {
                    text: textNodesWithPosition[index].text + node.text,
                    pos: textNodesWithPosition[index].pos,
                };
            }
            else {
                textNodesWithPosition[index] = {
                    text: "".concat(node.text),
                    pos: pos,
                };
            }
        }
        else {
            index += 1;
        }
    });
    textNodesWithPosition = textNodesWithPosition.filter(Boolean);
    for (var _i = 0, textNodesWithPosition_1 = textNodesWithPosition; _i < textNodesWithPosition_1.length; _i++) {
        var element = textNodesWithPosition_1[_i];
        var text = element.text, pos = element.pos;
        var matches = Array.from(text.matchAll(searchTerm)).filter(function (_a) {
            var matchText = _a[0];
            return matchText.trim();
        });
        for (var _a = 0, matches_1 = matches; _a < matches_1.length; _a++) {
            var m = matches_1[_a];
            if (m[0] === "")
                break;
            if (m.index !== undefined) {
                results.push({
                    from: pos + m.index,
                    to: pos + m.index + m[0].length,
                });
            }
        }
    }
    for (var i = 0; i < results.length; i += 1) {
        var r = results[i];
        var className = i === resultIndex
            ? "".concat(searchResultClass, " ").concat(searchResultClass, "-current")
            : searchResultClass;
        var decoration = view_1.Decoration.inline(r.from, r.to, {
            class: className,
        });
        decorations.push(decoration);
    }
    return {
        decorationsToReturn: view_1.DecorationSet.create(doc, decorations),
        results: results,
    };
}
var replace = function (replaceTerm, results, resultIndex, _a) {
    var state = _a.state, dispatch = _a.dispatch;
    var firstResult = results[resultIndex];
    if (!firstResult)
        return;
    var _b = results[resultIndex], from = _b.from, to = _b.to;
    if (dispatch) {
        var tr = state.tr;
        // Get all marks that span the text being replaced
        var marksSet_1 = new Set();
        state.doc.nodesBetween(from, to, function (node) {
            if (node.isText && node.marks) {
                node.marks.forEach(function (mark) { return marksSet_1.add(mark); });
            }
        });
        var marks = Array.from(marksSet_1);
        // Delete the old text
        tr.delete(from, to);
        // Only insert new text if replaceTerm is not empty (allows for deletion when replaceTerm is empty)
        if (replaceTerm) {
            tr.insert(from, state.schema.text(replaceTerm, marks));
        }
        dispatch(tr);
    }
};
var replaceAll = function (replaceTerm, results, _a) {
    var tr = _a.tr, dispatch = _a.dispatch;
    var resultsCopy = results.slice();
    if (!resultsCopy.length)
        return;
    var _loop_1 = function (i) {
        var _b = resultsCopy[i], from = _b.from, to = _b.to;
        // Get all marks that span the text being replaced
        var marksSet = new Set();
        tr.doc.nodesBetween(from, to, function (node) {
            if (node.isText && node.marks) {
                node.marks.forEach(function (mark) { return marksSet.add(mark); });
            }
        });
        var marks = Array.from(marksSet);
        // Delete the old text
        tr.delete(from, to);
        // Only insert new text if replaceTerm is not empty (allows for deletion when replaceTerm is empty)
        if (replaceTerm) {
            tr.insert(from, tr.doc.type.schema.text(replaceTerm, marks));
        }
    };
    // Process replacements in reverse order to avoid position shifting issues
    for (var i = resultsCopy.length - 1; i >= 0; i -= 1) {
        _loop_1(i);
    }
    dispatch(tr);
};
exports.searchAndReplacePluginKey = new state_1.PluginKey("searchAndReplacePlugin");
exports.SearchAndReplace = core_1.Extension.create({
    name: "searchAndReplace",
    addOptions: function () {
        return {
            searchResultClass: "search-result",
            disableRegex: true,
        };
    },
    addStorage: function () {
        return {
            searchTerm: "",
            replaceTerm: "",
            results: [],
            lastSearchTerm: "",
            caseSensitive: false,
            lastCaseSensitive: false,
            resultIndex: 0,
            lastResultIndex: 0,
        };
    },
    addCommands: function () {
        return {
            setSearchTerm: function (searchTerm) {
                return function (_a) {
                    var editor = _a.editor;
                    editor.storage.searchAndReplace.searchTerm = searchTerm;
                    return false;
                };
            },
            setReplaceTerm: function (replaceTerm) {
                return function (_a) {
                    var editor = _a.editor;
                    editor.storage.searchAndReplace.replaceTerm = replaceTerm;
                    return false;
                };
            },
            setCaseSensitive: function (caseSensitive) {
                return function (_a) {
                    var editor = _a.editor;
                    editor.storage.searchAndReplace.caseSensitive = caseSensitive;
                    return false;
                };
            },
            resetIndex: function () {
                return function (_a) {
                    var editor = _a.editor;
                    editor.storage.searchAndReplace.resultIndex = 0;
                    return false;
                };
            },
            nextSearchResult: function () {
                return function (_a) {
                    var editor = _a.editor;
                    var _b = editor.storage.searchAndReplace, results = _b.results, resultIndex = _b.resultIndex;
                    var nextIndex = resultIndex + 1;
                    if (results[nextIndex]) {
                        editor.storage.searchAndReplace.resultIndex = nextIndex;
                    }
                    else {
                        editor.storage.searchAndReplace.resultIndex = 0;
                    }
                    return false;
                };
            },
            previousSearchResult: function () {
                return function (_a) {
                    var editor = _a.editor;
                    var _b = editor.storage.searchAndReplace, results = _b.results, resultIndex = _b.resultIndex;
                    var prevIndex = resultIndex - 1;
                    if (results[prevIndex]) {
                        editor.storage.searchAndReplace.resultIndex = prevIndex;
                    }
                    else {
                        editor.storage.searchAndReplace.resultIndex = results.length - 1;
                    }
                    return false;
                };
            },
            replace: function () {
                return function (_a) {
                    var editor = _a.editor, state = _a.state, dispatch = _a.dispatch;
                    var _b = editor.storage.searchAndReplace, replaceTerm = _b.replaceTerm, results = _b.results, resultIndex = _b.resultIndex;
                    replace(replaceTerm, results, resultIndex, { state: state, dispatch: dispatch });
                    // After replace, adjust index if needed
                    // The results will be recalculated by the plugin, but we need to ensure
                    // the index doesn't exceed the new bounds
                    setTimeout(function () {
                        var newResultsLength = editor.storage.searchAndReplace.results.length;
                        if (newResultsLength > 0 &&
                            editor.storage.searchAndReplace.resultIndex >= newResultsLength) {
                            // Keep the same position if possible, otherwise go to the last result
                            editor.storage.searchAndReplace.resultIndex = Math.min(resultIndex, newResultsLength - 1);
                        }
                    }, 0);
                    return false;
                };
            },
            replaceAll: function () {
                return function (_a) {
                    var editor = _a.editor, tr = _a.tr, dispatch = _a.dispatch;
                    var _b = editor.storage.searchAndReplace, replaceTerm = _b.replaceTerm, results = _b.results;
                    replaceAll(replaceTerm, results, { tr: tr, dispatch: dispatch });
                    return false;
                };
            },
            selectCurrentItem: function () {
                return function (_a) {
                    var editor = _a.editor;
                    var results = editor.storage.searchAndReplace.results;
                    for (var i = 0; i < results.length; i++) {
                        if (results[i].from == editor.state.selection.from &&
                            results[i].to == editor.state.selection.to) {
                            editor.storage.searchAndReplace.resultIndex = i;
                        }
                    }
                    return false;
                };
            },
        };
    },
    addProseMirrorPlugins: function () {
        var editor = this.editor;
        var _a = this.options, searchResultClass = _a.searchResultClass, disableRegex = _a.disableRegex;
        var setLastSearchTerm = function (t) {
            return (editor.storage.searchAndReplace.lastSearchTerm = t);
        };
        var setLastCaseSensitive = function (t) {
            return (editor.storage.searchAndReplace.lastCaseSensitive = t);
        };
        var setLastResultIndex = function (t) {
            return (editor.storage.searchAndReplace.lastResultIndex = t);
        };
        return [
            new state_1.Plugin({
                key: exports.searchAndReplacePluginKey,
                state: {
                    init: function () { return view_1.DecorationSet.empty; },
                    apply: function (_a, oldState) {
                        var doc = _a.doc, docChanged = _a.docChanged;
                        var _b = editor.storage.searchAndReplace, searchTerm = _b.searchTerm, lastSearchTerm = _b.lastSearchTerm, caseSensitive = _b.caseSensitive, lastCaseSensitive = _b.lastCaseSensitive, resultIndex = _b.resultIndex, lastResultIndex = _b.lastResultIndex;
                        if (!docChanged &&
                            lastSearchTerm === searchTerm &&
                            lastCaseSensitive === caseSensitive &&
                            lastResultIndex === resultIndex)
                            return oldState;
                        setLastSearchTerm(searchTerm);
                        setLastCaseSensitive(caseSensitive);
                        setLastResultIndex(resultIndex);
                        if (!searchTerm) {
                            editor.storage.searchAndReplace.results = [];
                            return view_1.DecorationSet.empty;
                        }
                        var _c = processSearches(doc, getRegex(searchTerm, disableRegex, caseSensitive), searchResultClass, resultIndex), decorationsToReturn = _c.decorationsToReturn, results = _c.results;
                        editor.storage.searchAndReplace.results = results;
                        return decorationsToReturn;
                    },
                },
                props: {
                    decorations: function (state) {
                        return this.getState(state);
                    },
                },
            }),
        ];
    },
});
exports.default = exports.SearchAndReplace;
