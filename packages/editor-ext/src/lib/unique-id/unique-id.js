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
exports.UniqueID = void 0;
var utils_1 = require("../utils");
var extension_unique_id_1 = require("@tiptap/extension-unique-id");
exports.UniqueID = extension_unique_id_1.UniqueID.extend({
    addOptions: function () {
        var _a;
        return __assign(__assign({}, (_a = this.parent) === null || _a === void 0 ? void 0 : _a.call(this)), { generateID: function () { return (0, utils_1.generateNodeId)(); } });
    },
});
