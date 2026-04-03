import { prepareFile } from './attachment.utils';
import { MultipartFile } from '@fastify/multipart';

function createMultipartFile(
  filename: string,
  mimetype: string,
  content = 'test',
): MultipartFile {
  return {
    filename,
    mimetype,
    toBuffer: jest.fn().mockResolvedValue(Buffer.from(content)),
  } as unknown as MultipartFile;
}

describe('prepareFile', () => {
  it('builds a fallback name for clipboard images without a filename', async () => {
    const preparedFile = await prepareFile(
      Promise.resolve(createMultipartFile('', 'image/png')),
    );

    expect(preparedFile.fileName).toBe('pasted-image.png');
    expect(preparedFile.fileExtension).toBe('.png');
    expect(preparedFile.mimeType).toBe('image/png');
    expect(preparedFile.fileSize).toBe(4);
  });

  it('appends an extension when the upload has a mime type but no filename extension', async () => {
    const preparedFile = await prepareFile(
      Promise.resolve(createMultipartFile('clipboard-image', 'image/webp')),
    );

    expect(preparedFile.fileName).toBe('clipboard-image.webp');
    expect(preparedFile.fileExtension).toBe('.webp');
    expect(preparedFile.mimeType).toBe('image/webp');
  });

  it('prefers the derived mime type when the upload reports application/octet-stream', async () => {
    const preparedFile = await prepareFile(
      Promise.resolve(
        createMultipartFile('document.pdf', 'application/octet-stream'),
      ),
    );

    expect(preparedFile.fileName).toBe('document.pdf');
    expect(preparedFile.fileExtension).toBe('.pdf');
    expect(preparedFile.mimeType).toBe('application/pdf');
  });
});
