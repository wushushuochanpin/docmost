import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { createHash, randomUUID } from 'node:crypto';
import { KyselyDB } from '../../database/types/kysely.types';
import { StorageService } from '../../integrations/storage/storage.service';
import { readImageDimensions } from '../../common/helpers/image-dimensions';
import {
  AgentDocumentActor,
  DocumentCommandService,
} from '../document-command/document-command.service';
import { DocumentCommandError } from '../document-command/document-candidate';

export function decodeImage(base64: string) {
  if (base64.length > 9786712)
    throw new DocumentCommandError('CONTENT_TOO_LARGE');
  const bytes = Buffer.from(base64, 'base64');
  if (!bytes.length || bytes.toString('base64') !== base64)
    throw new DocumentCommandError('INVALID_ARGUMENT');
  if (bytes.length > 7340032)
    throw new DocumentCommandError('CONTENT_TOO_LARGE');
  const ext = bytes
    .subarray(0, 8)
    .equals(Buffer.from('89504e470d0a1a0a', 'hex'))
    ? 'png'
    : ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString())
      ? 'gif'
      : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        ? 'jpeg'
        : bytes.subarray(0, 4).toString() === 'RIFF' &&
            bytes.subarray(8, 12).toString() === 'WEBP'
          ? 'webp'
          : null;
  const size = readImageDimensions(bytes);
  if (
    !ext ||
    !size ||
    size.width <= 0 ||
    size.height <= 0 ||
    size.width * size.height > 100000000
  )
    throw new DocumentCommandError('UNSUPPORTED_CONTENT');
  return {
    bytes,
    ext,
    mime: `image/${ext}`,
    ...size,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}
@Injectable()
export class ImageUploadService {
  private readonly logger = new Logger(ImageUploadService.name);
  constructor(
    private readonly commands: DocumentCommandService,
    private readonly storage: StorageService,
    @InjectKysely() private readonly db: KyselyDB,
  ) {}
  async upload(
    actor: AgentDocumentActor,
    input: { idempotency_key: string; file_name: string; data_base64: string },
  ) {
    const image = decodeImage(input.data_base64);
    const id = randomUUID();
    const name =
      input.file_name
        .normalize('NFC')
        .replace(/[^\p{L}\p{N}._ -]/gu, '_')
        .replace(/^\.+/, '')
        .slice(0, 160)
        .replace(/\.[^.]*$/, '') || 'image';
    const fileName = `${name}.${image.ext}`;
    const path = `${actor.workspaceId}/files/${id}/${fileName}`;
    let attempted = false;
    try {
      return await this.commands.imageAttachmentTransaction(
        actor,
        {
          key: input.idempotency_key,
          payload: {
            page_id: actor.pageId,
            file_name: input.file_name,
            sha256: image.sha256,
          },
        },
        async (trx, spaceId) => {
          // No conversion: retain animation frames and exact source bytes.
          attempted = true;
          await this.storage.upload(path, image.bytes);
          await trx
            .insertInto('attachments')
            .values({
              id,
              workspaceId: actor.workspaceId,
              pageId: actor.pageId,
              spaceId,
              creatorId: actor.userId,
              type: 'file',
              filePath: path,
              fileName,
              fileExt: `.${image.ext}`,
              fileSize: image.bytes.length,
              mimeType: image.mime,
            })
            .execute();
          return {
            attachment_id: id,
            page_id: actor.pageId,
            src: `/files/by-id/${id}`,
            file_name: fileName,
            mime_type: image.mime,
            bytes: image.bytes.length,
            sha256: image.sha256,
            width: image.width,
            height: image.height,
            node: {
              type: 'image',
              attrs: {
                src: `/files/by-id/${id}`,
                attachmentId: id,
                alt: name,
                width: image.width,
                height: image.height,
              },
            },
          };
        },
      );
    } catch (error) {
      if (attempted) {
        // A lost commit acknowledgement must never delete a committed attachment.
        try {
          const committed = await this.db
            .selectFrom('attachments')
            .select('id')
            .where('id', '=', id)
            .where('workspaceId', '=', actor.workspaceId)
            .executeTakeFirst();
          if (!committed) await this.storage.delete(path);
        } catch {
          this.logger.warn(`Attachment cleanup requires retry: ${id}`);
        }
      }
      throw error;
    }
  }
}
