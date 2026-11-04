import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { S3Driver } from './s3.driver';

describe('backup replica checksum', () => {
  const data = Buffer.alloc(8 * 1024 * 1024 + 17, 0x5a);
  const etag = '"stable-object"';
  let driver: S3Driver;
  let send: jest.Mock;

  beforeEach(() => {
    driver = new S3Driver({
      bucket: 'test',
      region: 'test',
      endpoint: 'https://example.test',
    });
    send = jest.fn(async (command) => {
      const input = command.input;
      if (!input.Range) return { ContentLength: data.length, ETag: etag };
      const [, from, to] = /bytes=(\d+)-(\d+)/.exec(input.Range)!;
      const start = Number(from),
        end = Number(to);
      return {
        $metadata: { httpStatusCode: 206 },
        ETag: etag,
        ContentLength: end - start + 1,
        ContentRange: `bytes ${start}-${end}/${data.length}`,
        Body: Readable.from([data.subarray(start, end + 1)]),
      };
    });
    (driver as any).s3Client = { send };
  });

  it('resumes an interrupted range without hashing partial data twice', async () => {
    const normal = send.getMockImplementation()!;
    let interrupted = false;
    send.mockImplementation(async (command) => {
      const result = await normal(command);
      if (command.input.Range && !interrupted) {
        interrupted = true;
        result.Body = Readable.from(
          (async function* () {
            yield data.subarray(0, 100);
            throw Object.assign(new Error('aborted'), { code: 'ECONNRESET' });
          })(),
        );
      }
      return result;
    });
    await expect(driver.checksumObject('backup')).resolves.toEqual({
      sha256: createHash('sha256').update(data).digest('hex'),
      sizeBytes: data.length,
    });
    expect(send).toHaveBeenCalledTimes(4);
    expect(send.mock.calls[1][0].input.IfMatch).toBe(etag);
    expect(send.mock.calls[2][0].input.Range).toBe(
      send.mock.calls[1][0].input.Range,
    );
  });

  it('rejects an invalid range instead of treating it as verified', async () => {
    const normal = send.getMockImplementation()!;
    send.mockImplementation(async (command) => {
      const result = await normal(command);
      if (command.input.Range) result.ContentRange = 'bytes 0-0/1';
      return result;
    });
    await expect(driver.checksumObject('backup')).rejects.toThrow(
      'Invalid backup replica range response',
    );
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('fails after repeated interrupted streams', async () => {
    const normal = send.getMockImplementation()!;
    send.mockImplementation(async (command) => {
      const result = await normal(command);
      if (command.input.Range)
        result.Body = Readable.from(
          (async function* () {
            throw Object.assign(new Error('aborted'), { code: 'ECONNRESET' });
          })(),
        );
      return result;
    });
    await expect(driver.checksumObject('backup')).rejects.toThrow('aborted');
    expect(send).toHaveBeenCalledTimes(4);
  });
});
