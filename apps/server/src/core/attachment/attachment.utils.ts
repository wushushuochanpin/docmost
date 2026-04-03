import { MultipartFile } from '@fastify/multipart';
import * as mime from 'mime-types';
import * as path from 'path';
import { AttachmentType } from './attachment.constants';
import { sanitizeFileName } from '../../common/helpers';
import { getMimeType } from '../../common/helpers';

export interface PreparedFile {
  buffer?: Buffer;
  fileName: string;
  fileSize: number;
  fileExtension: string;
  mimeType: string;
  multiPartFile?: MultipartFile;
}

export async function prepareFile(
  filePromise: Promise<MultipartFile>,
  options: { skipBuffer?: boolean } = {},
): Promise<PreparedFile> {
  const file = await filePromise;

  if (!file) {
    throw new Error('No file provided');
  }

  try {
    let buffer: Buffer | undefined;
    let fileSize = 0;

    if (!options.skipBuffer) {
      buffer = await file.toBuffer();
      fileSize = buffer.length;
    }

    const fileExtension = getPreparedFileExtension(file.filename, file.mimetype);
    const fileName = getPreparedFileName(
      file.filename,
      fileExtension,
      file.mimetype,
    );

    return {
      buffer,
      fileName,
      fileSize,
      fileExtension,
      mimeType: getPreparedFileMimeType(fileName, file.mimetype),
      multiPartFile: file,
    };
  } catch (error) {
    throw error;
  }
}

function getPreparedFileExtension(
  fileName: string,
  mimeType?: string,
): string {
  const fileExtension = path.extname(fileName).toLowerCase();
  if (fileExtension) {
    return fileExtension;
  }

  const mimeExtension = mime.extension(mimeType || '');
  return mimeExtension ? `.${mimeExtension}` : '';
}

function getPreparedFileName(
  fileName: string,
  fileExtension: string,
  mimeType?: string,
): string {
  const sanitizedFileName = sanitizeFileName(fileName || '').slice(0, 255);

  if (sanitizedFileName) {
    if (path.extname(sanitizedFileName) || !fileExtension) {
      return sanitizedFileName;
    }

    const baseName = sanitizedFileName.slice(
      0,
      Math.max(0, 255 - fileExtension.length),
    );
    return `${baseName}${fileExtension}`;
  }

  const fallbackBaseName = mimeType?.startsWith('image/')
    ? 'pasted-image'
    : mimeType?.startsWith('video/')
      ? 'pasted-video'
      : 'upload';

  return `${fallbackBaseName}${fileExtension}`;
}

function getPreparedFileMimeType(fileName: string, mimeType?: string): string {
  const normalizedMimeType = mimeType?.toLowerCase();
  if (
    normalizedMimeType &&
    normalizedMimeType !== 'application/octet-stream'
  ) {
    return normalizedMimeType;
  }

  return getMimeType(fileName);
}

export function validateFileType(
  fileExtension: string,
  allowedTypes: string[],
) {
  if (!allowedTypes.includes(fileExtension)) {
    throw new Error('Invalid file type');
  }
}

export function getAttachmentFolderPath(
  type: AttachmentType,
  workspaceId: string,
): string {
  switch (type) {
    case AttachmentType.Avatar:
      return `${workspaceId}/avatars`;
    case AttachmentType.WorkspaceIcon:
      return `${workspaceId}/workspace-logos`;
    case AttachmentType.SpaceIcon:
      return `${workspaceId}/space-logos`;
    case AttachmentType.File:
      return `${workspaceId}/files`;
    default:
      return `${workspaceId}/files`;
  }
}

export const validAttachmentTypes = Object.values(AttachmentType);
