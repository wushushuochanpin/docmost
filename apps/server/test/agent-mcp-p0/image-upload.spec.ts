import {
  ImageUploadService,
  decodeImage,
} from '../../src/core/mcp/image-upload.service';
const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const actor = {
  workspaceId: 'workspace',
  userId: 'user',
  pageId: 'page',
  grantId: 'grant',
  clientId: 'client',
};
const input = {
  file_name: '../../photo.png',
  data_base64: png,
  idempotency_key: 'retry-image',
};
function query(existing?: object) {
  const chain: any = {
    select: () => chain,
    where: () => chain,
    executeTakeFirst: async () => existing,
  };
  return { selectFrom: () => chain };
}
test('P3 7 MiB image boundary covers original article GIF without changing bytes', () => {
  const original = Buffer.from(png, 'base64');
  const large = Buffer.concat([
    original,
    Buffer.alloc(7083321 - original.length),
  ]);
  const parsed = decodeImage(large.toString('base64'));
  expect(parsed.bytes.equals(large)).toBe(true);
  expect(() => decodeImage(Buffer.alloc(7340033).toString('base64'))).toThrow(
    'CONTENT_TOO_LARGE',
  );
});
test('P3 failed permission check never writes storage', async () => {
  const storage = { upload: jest.fn(), delete: jest.fn() };
  const commands = {
    imageAttachmentTransaction: async () => {
      throw Error('denied');
    },
  };
  const service = new ImageUploadService(
    commands as any,
    storage as any,
    query() as any,
  );
  await expect(service.upload(actor, input)).rejects.toThrow('denied');
  expect(storage.upload).not.toHaveBeenCalled();
  expect(storage.delete).not.toHaveBeenCalled();
});
test.each([false, true])(
  'P3 rollback cleans failed objects; unknown commit preserves committed objects (%s)',
  async (committed) => {
    const storage = {
      upload: jest.fn(async (_path: string, _bytes: Buffer) => {}),
      delete: jest.fn(async () => {}),
    };
    const commands = {
      imageAttachmentTransaction: async (_a: any, _b: any, write: any) => {
        const trx = {
          insertInto: () => ({
            values: () => ({
              execute: async () => {
                if (!committed) throw Error('insert failed');
              },
            }),
          }),
        };
        await write(trx, 'space');
        throw Error('commit acknowledgement lost');
      },
    };
    const service = new ImageUploadService(
      commands as any,
      storage as any,
      query(committed ? { id: 'committed' } : undefined) as any,
    );
    await expect(service.upload(actor, input)).rejects.toThrow();
    expect(storage.upload).toHaveBeenCalledTimes(1);
    expect(storage.upload.mock.calls[0][0].split('/')).not.toContain('..');
    expect(storage.delete).toHaveBeenCalledTimes(committed ? 0 : 1);
  },
);
