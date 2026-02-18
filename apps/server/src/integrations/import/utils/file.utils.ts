import * as yauzl from 'yauzl';
import * as path from 'path';
import * as fs from 'node:fs';

const MAX_ZIP_ENTRIES = 20_000;
const MAX_ZIP_UNCOMPRESSED_BYTES = 2 * 1024 * 1024 * 1024; // 2GB

export enum FileTaskType {
  Import = 'import',
  Export = 'export',
}

export enum FileImportSource {
  Generic = 'generic',
  Notion = 'notion',
  Confluence = 'confluence',
}

export enum FileTaskStatus {
  Processing = 'processing',
  Success = 'success',
  Failed = 'failed',
}

export function getFileTaskFolderPath(
  type: FileTaskType,
  workspaceId: string,
): string {
  switch (type) {
    case FileTaskType.Import:
      return `${workspaceId}/imports`;
    case FileTaskType.Export:
      return `${workspaceId}/exports`;
  }
}

/**
 * Extracts a ZIP archive.
 */
export async function extractZip(
  source: string,
  target: string,
): Promise<void> {
  return extractZipInternal(source, target, true);
}

/**
 * Internal helper to extract a ZIP, with optional single-nested-ZIP handling.
 * @param source   Path to the ZIP file
 * @param target   Directory to extract into
 * @param allowNested  Whether to check and unwrap one level of nested ZIP
 */
function extractZipInternal(
  source: string,
  target: string,
  allowNested: boolean,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let entryCount = 0;
    let totalUncompressedBytes = 0;

    const checkZipLimits = (entry: yauzl.Entry) => {
      entryCount += 1;
      if (entryCount > MAX_ZIP_ENTRIES) {
        throw new Error(
          `ZIP contains too many entries. Maximum allowed is ${MAX_ZIP_ENTRIES}`,
        );
      }

      const entrySize =
        typeof entry.uncompressedSize === 'number' ? entry.uncompressedSize : 0;
      totalUncompressedBytes += entrySize;
      if (totalUncompressedBytes > MAX_ZIP_UNCOMPRESSED_BYTES) {
        throw new Error(
          `ZIP is too large after extraction. Maximum allowed is ${MAX_ZIP_UNCOMPRESSED_BYTES} bytes`,
        );
      }
    };

    yauzl.open(
      source,
      { lazyEntries: true, decodeStrings: false, autoClose: true },
      (err, zipfile) => {
        if (err) return reject(err);

        // Handle one level of nested ZIP if allowed
        if (allowNested && zipfile.entryCount === 1) {
          zipfile.readEntry();
          zipfile.once('entry', (entry) => {
            try {
              checkZipLimits(entry);
            } catch (zipLimitErr) {
              return reject(zipLimitErr);
            }

            const name = entry.fileName.toString('utf8').replace(/^\/+/, '');
            const isZip =
              !/\/$/.test(entry.fileName) &&
              name.toLowerCase().endsWith('.zip');
            if (isZip) {
              // temporary name to avoid overwriting file
              const nestedPath = source.endsWith('.zip')
                ? source.slice(0, -4) + '.inner.zip'
                : source + '.inner.zip';

              zipfile.openReadStream(entry, (openErr, rs) => {
                if (openErr) return reject(openErr);
                const ws = fs.createWriteStream(nestedPath);
                rs.on('error', reject);
                ws.on('error', reject);
                ws.on('finish', () => {
                  zipfile.close();
                  extractZipInternal(nestedPath, target, false)
                    .then(() => {
                      fs.unlinkSync(nestedPath);
                      resolve();
                    })
                    .catch(reject);
                });
                rs.pipe(ws);
              });
            } else {
              zipfile.close();
              extractZipInternal(source, target, false).then(resolve, reject);
            }
          });
          zipfile.once('error', reject);
          return;
        }

        // Normal extraction
        zipfile.readEntry();
        zipfile.on('entry', (entry) => {
          try {
            checkZipLimits(entry);
          } catch (zipLimitErr) {
            zipfile.close();
            return reject(zipLimitErr);
          }

          const name = entry.fileName.toString('utf8');
          const safe = name.replace(/^\/+/, '');

          const validationError = yauzl.validateFileName(safe);
          if (validationError) {
            console.warn(`Skipping invalid entry (${validationError})`);
            zipfile.readEntry();
            return;
          }

          if (safe.startsWith('__MACOSX/')) {
            zipfile.readEntry();
            return;
          }

          const fullPath = path.join(target, safe);

          const resolved = path.resolve(fullPath);
          const targetResolved = path.resolve(target);

          if (!resolved.startsWith(targetResolved + path.sep)) {
            console.warn(`Skipping entry (path outside target): ${safe}`);
            zipfile.readEntry();
            return;
          }

          // Handle directories
          if (/\/$/.test(name)) {
            try {
              fs.mkdirSync(fullPath, { recursive: true });
            } catch (mkdirErr: any) {
              if (mkdirErr.code === 'ENAMETOOLONG') {
                console.warn(`Skipping directory (path too long): ${fullPath}`);
                zipfile.readEntry();
                return;
              }
              return reject(mkdirErr);
            }
            zipfile.readEntry();
            return;
          }

          // Handle files
          try {
            fs.mkdirSync(path.dirname(fullPath), { recursive: true });
          } catch (mkdirErr: any) {
            if (mkdirErr.code === 'ENAMETOOLONG') {
              console.warn(
                `Skipping file directory creation (path too long): ${fullPath}`,
              );
              zipfile.readEntry();
              return;
            }
            return reject(mkdirErr);
          }

          zipfile.openReadStream(entry, (openErr, rs) => {
            if (openErr) return reject(openErr);

            let ws: fs.WriteStream;
            try {
              ws = fs.createWriteStream(fullPath);
            } catch (openWsErr: any) {
              if (openWsErr.code === 'ENAMETOOLONG') {
                console.warn(
                  `Skipping file write (path too long): ${fullPath}`,
                );
                zipfile.readEntry();
                return;
              }
              return reject(openWsErr);
            }

            rs.on('error', (err) => reject(err));
            ws.on('error', (err) => {
              if ((err as any).code === 'ENAMETOOLONG') {
                console.warn(
                  `Skipping file write on stream (path too long): ${fullPath}`,
                );
                zipfile.readEntry();
              } else {
                reject(err);
              }
            });
            ws.on('finish', () => zipfile.readEntry());
            rs.pipe(ws);
          });
        });

        zipfile.on('end', () => resolve());
        zipfile.on('error', (err) => reject(err));
      },
    );
  });
}

export function cleanUrlString(url: string): string {
  if (!url) return null;
  const [mainUrl] = url.split('?', 1);
  return mainUrl;
}
