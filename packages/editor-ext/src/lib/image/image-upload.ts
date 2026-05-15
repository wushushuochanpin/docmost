import { MediaUploadOptions, UploadFn } from '../media-utils';
import { IAttachment } from '../types';
import { generateNodeId } from '../utils';
import { Node } from '@tiptap/pm/model';
import { Command } from '@tiptap/core';

type ImageDimensions = { width: number; height: number };

const readUint16BE = (data: Uint8Array, offset: number) =>
  (data[offset] << 8) | data[offset + 1];

const readUint16LE = (data: Uint8Array, offset: number) =>
  data[offset] | (data[offset + 1] << 8);

const readUint24LE = (data: Uint8Array, offset: number) =>
  data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16);

const readImageDimensions = (data: Uint8Array): ImageDimensions | undefined => {
  if (
    data.length >= 24 &&
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47
  ) {
    return {
      width: readUint16BE(data, 18) + (readUint16BE(data, 16) << 16),
      height: readUint16BE(data, 22) + (readUint16BE(data, 20) << 16),
    };
  }

  if (
    data.length >= 10 &&
    data[0] === 0x47 &&
    data[1] === 0x49 &&
    data[2] === 0x46
  ) {
    return {
      width: readUint16LE(data, 6),
      height: readUint16LE(data, 8),
    };
  }

  if (
    data.length >= 30 &&
    data[0] === 0x52 &&
    data[1] === 0x49 &&
    data[2] === 0x46 &&
    data[3] === 0x46 &&
    data[8] === 0x57 &&
    data[9] === 0x45 &&
    data[10] === 0x42 &&
    data[11] === 0x50
  ) {
    const chunkType = String.fromCharCode(
      data[12],
      data[13],
      data[14],
      data[15],
    );

    if (chunkType === 'VP8X') {
      return {
        width: readUint24LE(data, 24) + 1,
        height: readUint24LE(data, 27) + 1,
      };
    }

    if (chunkType === 'VP8L' && data.length >= 25) {
      const bits =
        data[21] | (data[22] << 8) | (data[23] << 16) | (data[24] << 24);
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
    let offset = 2;

    while (offset + 9 < data.length) {
      if (data[offset] !== 0xff) {
        offset++;
        continue;
      }

      const marker = data[offset + 1];
      const segmentLength = readUint16BE(data, offset + 2);

      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        ![0xc4, 0xc8, 0xcc].includes(marker)
      ) {
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

const findImageNodeByPlaceholderId = (
  doc: Node,
  placeholderId: string,
): { node: Node; pos: number } | null => {
  let result: { node: Node; pos: number } | null = null;

  doc.descendants((node, pos) => {
    if (result) return false;
    if (
      node.type.name === 'image' &&
      node.attrs.placeholder?.id === placeholderId
    ) {
      result = { node, pos };
      return false;
    }
    return true;
  });

  return result;
};
const handleImageUpload =
  ({ validateFn, onUpload }: MediaUploadOptions): UploadFn =>
  async (file, editor, pos, pageId) => {
    // check if the file is an image
    const validated = validateFn?.(file);
    // @ts-ignore
    if (!validated) return;

    const objectUrl = URL.createObjectURL(file);
    let imageDimensions: ImageDimensions | undefined;

    try {
      imageDimensions = readImageDimensions(
        new Uint8Array(await file.arrayBuffer()),
      );
    } catch {
      imageDimensions = undefined;
    }

    const placeholderId = generateNodeId();
    const width = imageDimensions?.width ?? undefined;
    const height = imageDimensions?.height ?? undefined;
    const aspectRatio = imageDimensions
      ? imageDimensions.width / imageDimensions.height
      : undefined;

    let placeholderInserted = false;

    editor.storage.shared.imagePreviews =
      editor.storage.shared.imagePreviews || {};
    editor.storage.shared.imagePreviews[placeholderId] = objectUrl;

    const insertPlaceholder = (): Command => {
      return ({ tr, state }) => {
        const initialPlaceholderNode = state.schema.nodes.image?.create({
          placeholder: {
            id: placeholderId,
            name: file.name,
          },
          width,
          height,
          aspectRatio,
        });

        if (!initialPlaceholderNode) return false;

        const { parent } = tr.doc.resolve(pos);
        const isEmptyTextBlock = parent.isTextblock && !parent.childCount;

        if (isEmptyTextBlock) {
          // Replace e.g. empty paragraph with the image
          tr.replaceRangeWith(pos - 1, pos + 1, initialPlaceholderNode);
        } else {
          tr.insert(pos, initialPlaceholderNode);
        }

        return true;
      };
    };
    const replacePlaceholderWithImage = (attachment: IAttachment): Command => {
      return ({ tr }) => {
        const { pos: currentPos = null } =
          findImageNodeByPlaceholderId(tr.doc, placeholderId) || {};

        //  If the placeholder is not found or attachment is missing, abort the process
        if (currentPos === null || !attachment) return false;

        // Update the placeholder node with the actual image data
        tr.setNodeMarkup(currentPos, undefined, {
          src: `/api/files/${attachment.id}/${attachment.fileName}`,
          attachmentId: attachment.id,
          size: attachment.fileSize,
          width,
          height,
          aspectRatio,
        });

        return true;
      };
    };
    const removePlaceholder = (): Command => {
      return ({ tr }) => {
        const { pos: currentPos = null } =
          findImageNodeByPlaceholderId(tr.doc, placeholderId) || {};

        if (currentPos === null) return false;

        // Remove the placeholder node
        tr.delete(currentPos, currentPos + 2);

        return true;
      };
    };
    // Only show the placeholder if the upload takes more than 250ms
    const insertPlaceholderTimeout = setTimeout(() => {
      editor.commands.command(insertPlaceholder());
      placeholderInserted = true;
    }, 250);
    const disposePreviewFile = () => {
      URL.revokeObjectURL(objectUrl);

      if (editor.storage.shared.imagePreviews) {
        delete editor.storage.shared.imagePreviews[placeholderId];
      }
    };

    try {
      const attachment: IAttachment = await onUpload(file, pageId);

      clearTimeout(insertPlaceholderTimeout);

      if (placeholderInserted) {
        setTimeout(() => {
          editor.commands.command(replacePlaceholderWithImage(attachment));
          disposePreviewFile();
        }, 100);
      } else {
        editor
          .chain()
          .command(insertPlaceholder())
          .command(replacePlaceholderWithImage(attachment))
          .run();
        disposePreviewFile();
      }
    } catch (error) {
      clearTimeout(insertPlaceholderTimeout);

      editor.commands.command(removePlaceholder());
      disposePreviewFile();
    }
  };

export { handleImageUpload };
