type ImageDimensions = { width: number; height: number };

const readUint16BE = (data: Uint8Array, offset: number) =>
  (data[offset] << 8) | data[offset + 1];

const readUint16LE = (data: Uint8Array, offset: number) =>
  data[offset] | (data[offset + 1] << 8);

const readUint24LE = (data: Uint8Array, offset: number) =>
  data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16);

export const readImageDimensions = (
  data: Uint8Array,
): ImageDimensions | undefined => {
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
