"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SharedStorage = void 0;
var core_1 = require("@tiptap/core");
var SharedStorage = core_1.Extension.create({
    name: "shared",
    addStorage: function () {
        return {};
    },
});
exports.SharedStorage = SharedStorage;
