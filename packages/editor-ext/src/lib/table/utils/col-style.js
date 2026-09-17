"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getColStyleDeclaration = getColStyleDeclaration;
function getColStyleDeclaration(minWidth, width) {
    if (width) {
        return ['width', "".concat(Math.max(width, minWidth), "px")];
    }
    return ['min-width', "".concat(minWidth, "px")];
}
