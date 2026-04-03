import { uploadImageAction } from "@/features/editor/components/image/upload-image-action.tsx";
import { uploadVideoAction } from "@/features/editor/components/video/upload-video-action.tsx";
import { uploadAttachmentAction } from "../attachment/upload-attachment-action";
import { createMentionAction } from "@/features/editor/components/link/internal-link-paste.ts";
import { INTERNAL_LINK_REGEX } from "@/lib/constants.ts";
import { Editor } from "@tiptap/core";
import {
  getAttachmentInfo,
  uploadFile,
} from "@/features/page/services/page-service.ts";

const ATTACHMENT_NODE_TYPES = [
  "image",
  "video",
  "attachment",
  "excalidraw",
  "drawio",
];

const ATTACHMENT_URL_RE = /\/api\/files\/([0-9a-f-]+)\//;

function getClipboardFiles(clipboardData?: DataTransfer | null): File[] {
  if (!clipboardData) return [];

  const fileItems = Array.from(clipboardData.items || []).filter(
    (item) => item.kind === "file",
  );

  if (clipboardData.files?.length) {
    return Array.from(clipboardData.files).map((file, index) => {
      if (file.type) return file;
      const item = fileItems[index];
      if (
        item?.type &&
        (item.type.startsWith("image/") || item.type.startsWith("video/"))
      ) {
        return new File([file], file.name || "pasted-image", {
          type: item.type,
        });
      }
      return file;
    });
  }

  return Array.from(clipboardData.items || [])
    .filter((item) => item.kind === "file")
    .map((item) => {
      const file = item.getAsFile();
      if (!file) return null;
      // On macOS Chrome, file.type may be empty while item.type is correct
      if (!file.type && item.type.startsWith("image/")) {
        return new File([file], file.name || "pasted-image", {
          type: item.type,
        });
      }
      return file;
    })
    .filter((file): file is File => Boolean(file));
}

function isMediaClipboardFile(file: File): boolean {
  if (file.type.startsWith("image/") || file.type.startsWith("video/")) {
    return true;
  }

  if (!file.type && file.name) {
    return /\.(png|jpe?g|webp|gif|bmp|svg|tiff?|heic|heif|mov|mp4|webm|m4v)$/i.test(
      file.name,
    );
  }

  return false;
}

function looksLikeSpreadsheetPaste(
  htmlData?: string,
  plainTextData?: string,
): boolean {
  if (!htmlData || !/<table[\s>]/i.test(htmlData)) {
    return false;
  }

  return /\t/.test(plainTextData || "");
}

function getEmbeddedHtmlImageSources(htmlData?: string): string[] {
  if (!htmlData || !/<img[\s>]/i.test(htmlData)) {
    return [];
  }

  const doc = new DOMParser().parseFromString(htmlData, "text/html");

  return Array.from(doc.images)
    .map((img) => img.getAttribute("src")?.trim() || "")
    .filter((src) => src.startsWith("data:image/") || src.startsWith("blob:"));
}

function fileExtensionFromMimeType(mimeType: string): string {
  switch (mimeType) {
    case "image/png":
      return ".png";
    case "image/jpeg":
      return ".jpg";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    case "image/svg+xml":
      return ".svg";
    case "image/bmp":
      return ".bmp";
    case "image/tiff":
      return ".tiff";
    case "image/heic":
      return ".heic";
    case "image/heif":
      return ".heif";
    case "video/quicktime":
      return ".mov";
    case "video/mp4":
      return ".mp4";
    case "video/webm":
      return ".webm";
    default:
      return "";
  }
}

function clipboardBlobToFile(blob: Blob, index: number): File {
  const extension = fileExtensionFromMimeType(blob.type);
  const baseName = blob.type.startsWith("video/")
    ? "pasted-video"
    : "pasted-image";

  return new File([blob], `${baseName}-${index + 1}${extension}`, {
    type: blob.type,
  });
}

function dataUrlToFile(dataUrl: string, index: number): File | null {
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!match) return null;

  const mimeType = match[1] || "application/octet-stream";
  const extension = fileExtensionFromMimeType(mimeType);
  const fileName = `pasted-image-${index + 1}${extension}`;

  try {
    if (match[2]) {
      const binary = atob(match[3]);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      return new File([bytes], fileName, { type: mimeType });
    }

    const decoded = decodeURIComponent(match[3]);
    return new File([decoded], fileName, { type: mimeType });
  } catch {
    return null;
  }
}

async function embeddedImageSourceToFile(
  src: string,
  index: number,
): Promise<File | null> {
  if (src.startsWith("data:image/")) {
    return dataUrlToFile(src, index);
  }

  if (!src.startsWith("blob:")) {
    return null;
  }

  try {
    const response = await fetch(src);
    if (!response.ok) return null;

    const blob = await response.blob();
    const extension = fileExtensionFromMimeType(blob.type);
    return new File([blob], `pasted-image-${index + 1}${extension}`, {
      type: blob.type,
    });
  } catch {
    return null;
  }
}

async function getEmbeddedHtmlImageFiles(htmlData?: string): Promise<File[]> {
  const imageSources = getEmbeddedHtmlImageSources(htmlData);
  if (imageSources.length === 0) {
    return [];
  }

  const files = await Promise.all(
    imageSources.map((src, index) => embeddedImageSourceToFile(src, index)),
  );

  return files.filter((file): file is File => Boolean(file));
}

async function getAsyncClipboardMediaFiles(): Promise<File[]> {
  if (
    typeof navigator === "undefined" ||
    !("clipboard" in navigator) ||
    typeof navigator.clipboard.read !== "function"
  ) {
    return [];
  }

  try {
    const clipboardItems = await navigator.clipboard.read();
    const files: File[] = [];

    for (const item of clipboardItems) {
      for (const type of item.types) {
        if (!type.startsWith("image/") && !type.startsWith("video/")) {
          continue;
        }

        const blob = await item.getType(type);
        files.push(clipboardBlobToFile(blob, files.length));
      }

      if (files.length > 0) {
        continue;
      }

      if (!item.types.includes("text/html")) {
        continue;
      }

      const htmlBlob = await item.getType("text/html");
      const htmlData = await htmlBlob.text();
      const embeddedFiles = await getEmbeddedHtmlImageFiles(htmlData);
      files.push(...embeddedFiles);
    }

    return files;
  } catch {
    return [];
  }
}

function uploadClipboardFiles(
  files: File[],
  editor: Editor,
  pageId: string,
) {
  for (const file of files) {
    const pos = editor.state.selection.from;
    uploadImageAction(file, editor, pos, pageId);
    uploadVideoAction(file, editor, pos, pageId);
    uploadAttachmentAction(file, editor, pos, pageId);
  }
}

export const handlePaste = (
  editor: Editor,
  event: ClipboardEvent,
  pageId: string,
  creatorId?: string,
) => {
  const plainTextData = event.clipboardData?.getData("text/plain") || "";

  if (INTERNAL_LINK_REGEX.test(plainTextData)) {
    // we have to do this validation here to allow the default link extension to takeover if needs be
    event.preventDefault();
    const url = plainTextData.trim();
    const { from: pos, empty } = editor.state.selection;
    const match = INTERNAL_LINK_REGEX.exec(url);

    // pasted link must be from the same workspace/domain and must not be on a selection
    if (!empty || match[2] !== window.location.host) {
      // allow the default link extension to handle this
      return false;
    }

    const anchorId = match[6] ? match[6].split("#")[0] : undefined;
    const urlWithoutAnchor = anchorId
      ? url.substring(0, url.indexOf("#"))
      : url;
    createMentionAction(
      urlWithoutAnchor,
      editor.view,
      pos,
      creatorId,
      anchorId,
    );
    return true;
  }

  const htmlData = event.clipboardData?.getData("text/html");
  const isSpreadsheetPaste = looksLikeSpreadsheetPaste(
    htmlData,
    plainTextData,
  );
  const clipboardFiles = getClipboardFiles(event.clipboardData);
  const mediaClipboardFiles = clipboardFiles.filter(isMediaClipboardFile);
  const embeddedHtmlImageSources = getEmbeddedHtmlImageSources(htmlData);

  if (mediaClipboardFiles.length) {
    event.preventDefault();
    uploadClipboardFiles(mediaClipboardFiles, editor, pageId);
    return true;
  }

  if (embeddedHtmlImageSources.length) {
    event.preventDefault();
    void getEmbeddedHtmlImageFiles(htmlData).then((files) => {
      if (files.length > 0) {
        uploadClipboardFiles(files, editor, pageId);
      }
    });
    return true;
  }

  if (clipboardFiles.length && !isSpreadsheetPaste) {
    event.preventDefault();
    uploadClipboardFiles(clipboardFiles, editor, pageId);
    return true;
  }

  if (htmlData && ATTACHMENT_URL_RE.test(htmlData)) {
    const pasteFrom = editor.state.selection.from;
    setTimeout(() => {
      reuploadPastedAttachments(editor, pageId, pasteFrom);
    }, 0);
  }

  if (!plainTextData.trim() && (!htmlData || /<img[\s>]/i.test(htmlData))) {
    event.preventDefault();
    void getAsyncClipboardMediaFiles().then((files) => {
      if (files.length > 0) {
        uploadClipboardFiles(files, editor, pageId);
      }
    });
    return true;
  }

  return false;
};

async function reuploadPastedAttachments(
  editor: Editor,
  pageId: string,
  pasteFrom: number,
) {
  const pasteEnd = editor.state.selection.from;
  if (pasteEnd <= pasteFrom) return;

  type PastedNode = {
    pos: number;
    attachmentId: string;
    nodeTypeName: string;
    src?: string;
    url?: string;
    fileName?: string;
  };

  const pastedNodes: PastedNode[] = [];
  const seenAttachmentIds = new Set<string>();

  editor.state.doc.nodesBetween(pasteFrom, pasteEnd, (node, pos) => {
    if (!ATTACHMENT_NODE_TYPES.includes(node.type.name)) return;
    const attachmentId = node.attrs.attachmentId;
    if (!attachmentId) return;

    const src = node.attrs.src || node.attrs.url || "";
    const match = ATTACHMENT_URL_RE.exec(src);
    if (!match) return;

    const fileName =
      node.attrs.name || src.split("/").pop() || "file";

    pastedNodes.push({
      pos,
      attachmentId,
      nodeTypeName: node.type.name,
      src: node.attrs.src,
      url: node.attrs.url,
      fileName,
    });
    seenAttachmentIds.add(attachmentId);
  });

  if (pastedNodes.length === 0) return;

  const attachmentPageMap = new Map<string, string | null>();
  await Promise.all(
    [...seenAttachmentIds].map(async (id) => {
      try {
        const info = await getAttachmentInfo(id);
        attachmentPageMap.set(id, info.pageId);
      } catch {
        attachmentPageMap.set(id, null);
      }
    }),
  );

  const nodesToReupload = pastedNodes.filter((n) => {
    const ownerPageId = attachmentPageMap.get(n.attachmentId);
    return ownerPageId !== null && ownerPageId !== pageId;
  });

  if (nodesToReupload.length === 0) return;

  const uniqueNodes = new Map<string, (typeof nodesToReupload)[0]>();
  for (const node of nodesToReupload) {
    if (!uniqueNodes.has(node.attachmentId)) {
      uniqueNodes.set(node.attachmentId, node);
    }
  }

  const reuploadResults = new Map<
    string,
    { id: string; fileName: string; fileSize: number; mimeType: string }
  >();

  await Promise.all(
    [...uniqueNodes.values()].map(async (node) => {
      const fileUrl = node.src || node.url;
      if (!fileUrl) return;

      try {
        const response = await fetch(fileUrl, { credentials: "include" });
        if (!response.ok) return;
        const blob = await response.blob();
        const file = new File([blob], node.fileName, { type: blob.type });
        const newAttachment = await uploadFile(file, pageId);
        reuploadResults.set(node.attachmentId, {
          id: newAttachment.id,
          fileName: newAttachment.fileName,
          fileSize: newAttachment.fileSize,
          mimeType: newAttachment.mimeType,
        });
      } catch {
        // keep original reference on failure
      }
    }),
  );

  if (reuploadResults.size === 0) return;

  editor.chain().command(({ tr }) => {
    const sorted = [...nodesToReupload].sort((a, b) => b.pos - a.pos);

    for (const pastedNode of sorted) {
      const result = reuploadResults.get(pastedNode.attachmentId);
      if (!result) continue;

      const node = tr.doc.nodeAt(pastedNode.pos);
      if (!node || node.attrs.attachmentId !== pastedNode.attachmentId)
        continue;

      const newAttrs = { ...node.attrs };
      newAttrs.attachmentId = result.id;

      if (newAttrs.src) {
        newAttrs.src = `/api/files/${result.id}/${result.fileName}`;
      }
      if (newAttrs.url) {
        newAttrs.url = `/api/files/${result.id}/${result.fileName}`;
      }
      if (pastedNode.nodeTypeName === "attachment") {
        newAttrs.name = result.fileName;
        newAttrs.mime = result.mimeType;
        newAttrs.size = result.fileSize;
      }

      tr.setNodeMarkup(pastedNode.pos, undefined, newAttrs);
    }

    return true;
  }).run();
}

export const handleFileDrop = (
  editor: Editor,
  event: DragEvent,
  moved: boolean,
  pageId: string,
) => {
  if (!moved && event.dataTransfer?.files.length) {
    event.preventDefault();

    for (const file of event.dataTransfer.files) {
      const coordinates = editor.view.posAtCoords({
        left: event.clientX,
        top: event.clientY,
      });

      uploadImageAction(file, editor, coordinates?.pos ?? 0 - 1, pageId);
      uploadVideoAction(file, editor, coordinates?.pos ?? 0 - 1, pageId);
      uploadAttachmentAction(file, editor, coordinates?.pos ?? 0 - 1, pageId);
    }
    return true;
  }
  return false;
};
