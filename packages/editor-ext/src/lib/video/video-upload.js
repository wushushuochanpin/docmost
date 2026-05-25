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
exports.handleVideoUpload = void 0;
var utils_1 = require("../utils");
var findVideoNodeByPlaceholderId = function (doc, placeholderId) {
    var result = null;
    doc.descendants(function (node, pos) {
        var _a;
        if (result)
            return false;
        if (node.type.name === "video" &&
            ((_a = node.attrs.placeholder) === null || _a === void 0 ? void 0 : _a.id) === placeholderId) {
            result = { node: node, pos: pos };
            return false;
        }
        return true;
    });
    return result;
};
var getVideoDimensions = function (url) {
    return new Promise(function (resolve) {
        var video = document.createElement("video");
        video.preload = "metadata";
        video.onloadedmetadata = function () {
            var width = video.videoWidth;
            var height = video.videoHeight;
            var aspectRatio = height > 0 ? width / height : 1;
            resolve({ width: width, height: height, aspectRatio: aspectRatio });
        };
        video.onerror = function () {
            resolve(undefined);
        };
        video.src = url;
    });
};
var handleVideoUpload = function (_a) {
    var validateFn = _a.validateFn, onUpload = _a.onUpload;
    return function (file, editor, pos, pageId) { return __awaiter(void 0, void 0, void 0, function () {
        var validated, objectUrl, videoDimensions, placeholderId, width, height, aspectRatio, placeholderInserted, insertPlaceholder, replacePlaceholderWithVideo, removePlaceholder, insertPlaceholderTimeout, disposePreviewFile, attachment_1, error_1;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    validated = validateFn === null || validateFn === void 0 ? void 0 : validateFn(file);
                    // @ts-ignore
                    if (!validated)
                        return [2 /*return*/];
                    objectUrl = URL.createObjectURL(file);
                    return [4 /*yield*/, getVideoDimensions(objectUrl)];
                case 1:
                    videoDimensions = _c.sent();
                    placeholderId = (0, utils_1.generateNodeId)();
                    width = (_a = videoDimensions === null || videoDimensions === void 0 ? void 0 : videoDimensions.width) !== null && _a !== void 0 ? _a : undefined;
                    height = (_b = videoDimensions === null || videoDimensions === void 0 ? void 0 : videoDimensions.height) !== null && _b !== void 0 ? _b : undefined;
                    aspectRatio = videoDimensions === null || videoDimensions === void 0 ? void 0 : videoDimensions.aspectRatio;
                    placeholderInserted = false;
                    editor.storage.shared.videoPreviews =
                        editor.storage.shared.videoPreviews || {};
                    editor.storage.shared.videoPreviews[placeholderId] = objectUrl;
                    insertPlaceholder = function () {
                        return function (_a) {
                            var _b;
                            var tr = _a.tr, state = _a.state;
                            var initialPlaceholderNode = (_b = state.schema.nodes.video) === null || _b === void 0 ? void 0 : _b.create({
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
                                // Replace e.g. empty paragraph with the video
                                tr.replaceRangeWith(pos - 1, pos + 1, initialPlaceholderNode);
                            }
                            else {
                                tr.insert(pos, initialPlaceholderNode);
                            }
                            return true;
                        };
                    };
                    replacePlaceholderWithVideo = function (attachment) {
                        return function (_a) {
                            var tr = _a.tr;
                            var _b = (findVideoNodeByPlaceholderId(tr.doc, placeholderId) || {}).pos, currentPos = _b === void 0 ? null : _b;
                            //  If the placeholder is not found or attachment is missing, abort the process
                            if (currentPos === null || !attachment)
                                return;
                            // Update the placeholder node with the actual video data
                            tr.setNodeMarkup(currentPos, undefined, {
                                src: "/api/files/".concat(attachment.id, "/").concat(attachment.fileName),
                                attachmentId: attachment.id,
                                title: attachment.fileName,
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
                            var _b = (findVideoNodeByPlaceholderId(tr.doc, placeholderId) || {}).pos, currentPos = _b === void 0 ? null : _b;
                            if (currentPos === null)
                                return false;
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
                        if (editor.storage.shared.videoPreviews) {
                            delete editor.storage.shared.videoPreviews[placeholderId];
                        }
                    };
                    _c.label = 2;
                case 2:
                    _c.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, onUpload(file, pageId)];
                case 3:
                    attachment_1 = _c.sent();
                    clearTimeout(insertPlaceholderTimeout);
                    if (placeholderInserted) {
                        setTimeout(function () {
                            editor.commands.command(replacePlaceholderWithVideo(attachment_1));
                            disposePreviewFile();
                        }, 100);
                    }
                    else {
                        editor
                            .chain()
                            .command(insertPlaceholder())
                            .command(replacePlaceholderWithVideo(attachment_1))
                            .run();
                        disposePreviewFile();
                    }
                    return [3 /*break*/, 5];
                case 4:
                    error_1 = _c.sent();
                    clearTimeout(insertPlaceholderTimeout);
                    editor.commands.command(removePlaceholder());
                    disposePreviewFile();
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
            }
        });
    }); };
};
exports.handleVideoUpload = handleVideoUpload;
