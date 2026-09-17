"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleImageUpload = void 0;
var utils_1 = require("../utils");
var readUint16BE = function (data, offset) {
    return (data[offset] << 8) | data[offset + 1];
};
var readUint16LE = function (data, offset) {
    return data[offset] | (data[offset + 1] << 8);
};
var readUint24LE = function (data, offset) {
    return data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16);
};
var readImageDimensions = function (data) {
    if (data.length >= 24 &&
        data[0] === 0x89 &&
        data[1] === 0x50 &&
        data[2] === 0x4e &&
        data[3] === 0x47) {
        return {
            width: readUint16BE(data, 18) + (readUint16BE(data, 16) << 16),
            height: readUint16BE(data, 22) + (readUint16BE(data, 20) << 16),
        };
    }
    if (data.length >= 10 &&
        data[0] === 0x47 &&
        data[1] === 0x49 &&
        data[2] === 0x46) {
        return {
            width: readUint16LE(data, 6),
            height: readUint16LE(data, 8),
        };
    }
    if (data.length >= 30 &&
        data[0] === 0x52 &&
        data[1] === 0x49 &&
        data[2] === 0x46 &&
        data[3] === 0x46 &&
        data[8] === 0x57 &&
        data[9] === 0x45 &&
        data[10] === 0x42 &&
        data[11] === 0x50) {
        var chunkType = String.fromCharCode(data[12], data[13], data[14], data[15]);
        if (chunkType === 'VP8X') {
            return {
                width: readUint24LE(data, 24) + 1,
                height: readUint24LE(data, 27) + 1,
            };
        }
        if (chunkType === 'VP8L' && data.length >= 25) {
            var bits = data[21] | (data[22] << 8) | (data[23] << 16) | (data[24] << 24);
            return {
                width: (bits & 0x3fff) + 1,
                height: ((bits >> 14) & 0x3fff) + 1,
            };
        }
        if (chunkType === 'VP8 ' && data.length >= 27) {
            return {
                width: readUint16LE(data, 23) & 0x3fff,
                height: readUint16LE(data, 25) & 0x3fff,
            };
        }
    }
    if (data.length >= 4 && data[0] === 0xff && data[1] === 0xd8) {
        var offset = 2;
        while (offset + 9 < data.length) {
            if (data[offset] !== 0xff) {
                offset++;
                continue;
            }
            var marker = data[offset + 1];
            var segmentLength = readUint16BE(data, offset + 2);
            if (marker >= 0xc0 &&
                marker <= 0xcf &&
                ![0xc4, 0xc8, 0xcc].includes(marker)) {
                return {
                    height: readUint16BE(data, offset + 5),
                    width: readUint16BE(data, offset + 7),
                };
            }
            offset += 2 + segmentLength;
        }
    }
    return undefined;
};
var findImageNodeByPlaceholderId = function (doc, placeholderId) {
    var result = null;
    doc.descendants(function (node, pos) {
        var _a;
        if (result)
            return false;
        if (node.type.name === 'image' &&
            ((_a = node.attrs.placeholder) === null || _a === void 0 ? void 0 : _a.id) === placeholderId) {
            result = { node: node, pos: pos };
            return false;
        }
        return true;
    });
    return result;
};
var handleImageUpload = function (_a) {
    var validateFn = _a.validateFn, onUpload = _a.onUpload;
    return function (file, editor, pos, pageId) { return __awaiter(void 0, void 0, void 0, function () {
        var validated, objectUrl, imageDimensions, _a, _b, _c, placeholderId, width, height, aspectRatio, placeholderInserted, insertPlaceholder, replacePlaceholderWithImage, removePlaceholder, insertPlaceholderTimeout, disposePreviewFile, attachment_1, error_1;
        var _d, _e;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0:
                    validated = validateFn === null || validateFn === void 0 ? void 0 : validateFn(file);
                    // @ts-ignore
                    if (!validated)
                        return [2 /*return*/];
                    objectUrl = URL.createObjectURL(file);
                    _f.label = 1;
                case 1:
                    _f.trys.push([1, 3, , 4]);
                    _a = readImageDimensions;
                    _b = Uint8Array.bind;
                    return [4 /*yield*/, file.arrayBuffer()];
                case 2:
                    imageDimensions = _a.apply(void 0, [new (_b.apply(Uint8Array, [void 0, _f.sent()]))()]);
                    return [3 /*break*/, 4];
                case 3:
                    _c = _f.sent();
                    imageDimensions = undefined;
                    return [3 /*break*/, 4];
                case 4:
                    placeholderId = (0, utils_1.generateNodeId)();
                    width = (_d = imageDimensions === null || imageDimensions === void 0 ? void 0 : imageDimensions.width) !== null && _d !== void 0 ? _d : undefined;
                    height = (_e = imageDimensions === null || imageDimensions === void 0 ? void 0 : imageDimensions.height) !== null && _e !== void 0 ? _e : undefined;
                    aspectRatio = imageDimensions
                        ? imageDimensions.width / imageDimensions.height
                        : undefined;
                    placeholderInserted = false;
                    editor.storage.shared.imagePreviews =
                        editor.storage.shared.imagePreviews || {};
                    editor.storage.shared.imagePreviews[placeholderId] = objectUrl;
                    insertPlaceholder = function () {
                        return function (_a) {
                            var _b;
                            var tr = _a.tr, state = _a.state;
                            var initialPlaceholderNode = (_b = state.schema.nodes.image) === null || _b === void 0 ? void 0 : _b.create({
                                placeholder: {
                                    id: placeholderId,
                                    name: file.name,
                                },
                                width: width,
                                height: height,
                                aspectRatio: aspectRatio,
                            });
                            if (!initialPlaceholderNode)
                                return false;
                            var parent = tr.doc.resolve(pos).parent;
                            var isEmptyTextBlock = parent.isTextblock && !parent.childCount;
                            if (isEmptyTextBlock) {
                                // Replace e.g. empty paragraph with the image
                                tr.replaceRangeWith(pos - 1, pos + 1, initialPlaceholderNode);
                            }
                            else {
                                tr.insert(pos, initialPlaceholderNode);
                            }
                            return true;
                        };
                    };
                    replacePlaceholderWithImage = function (attachment) {
                        return function (_a) {
                            var tr = _a.tr;
                            var _b = (findImageNodeByPlaceholderId(tr.doc, placeholderId) || {}).pos, currentPos = _b === void 0 ? null : _b;
                            //  If the placeholder is not found or attachment is missing, abort the process
                            if (currentPos === null || !attachment)
                                return false;
                            // Update the placeholder node with the actual image data
                            tr.setNodeMarkup(currentPos, undefined, {
                                src: "/api/files/".concat(attachment.id, "/").concat(attachment.fileName),
                                attachmentId: attachment.id,
                                size: attachment.fileSize,
                                width: width,
                                height: height,
                                aspectRatio: aspectRatio,
                            });
                            return true;
                        };
                    };
                    removePlaceholder = function () {
                        return function (_a) {
                            var tr = _a.tr;
                            var _b = (findImageNodeByPlaceholderId(tr.doc, placeholderId) || {}).pos, currentPos = _b === void 0 ? null : _b;
                            if (currentPos === null)
                                return false;
                            // Remove the placeholder node
                            tr.delete(currentPos, currentPos + 2);
                            return true;
                        };
                    };
                    insertPlaceholderTimeout = setTimeout(function () {
                        editor.commands.command(insertPlaceholder());
                        placeholderInserted = true;
                    }, 250);
                    disposePreviewFile = function () {
                        URL.revokeObjectURL(objectUrl);
                        if (editor.storage.shared.imagePreviews) {
                            delete editor.storage.shared.imagePreviews[placeholderId];
                        }
                    };
                    _f.label = 5;
                case 5:
                    _f.trys.push([5, 7, , 8]);
                    return [4 /*yield*/, onUpload(file, pageId)];
                case 6:
                    attachment_1 = _f.sent();
                    clearTimeout(insertPlaceholderTimeout);
                    if (placeholderInserted) {
                        setTimeout(function () {
                            editor.commands.command(replacePlaceholderWithImage(attachment_1));
                            disposePreviewFile();
                        }, 100);
                    }
                    else {
                        editor
                            .chain()
                            .command(insertPlaceholder())
                            .command(replacePlaceholderWithImage(attachment_1))
                            .run();
                        disposePreviewFile();
                    }
                    return [3 /*break*/, 8];
                case 7:
                    error_1 = _f.sent();
                    clearTimeout(insertPlaceholderTimeout);
                    editor.commands.command(removePlaceholder());
                    disposePreviewFile();
                    return [3 /*break*/, 8];
                case 8: return [2 /*return*/];
            }
        });
    }); };
};
exports.handleImageUpload = handleImageUpload;
