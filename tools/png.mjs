/**
 * Minimal PNG decode/encode for the build tools.
 *
 * Deliberately dependency-free: the only thing these tools need is to read the
 * reference mosaic (8-bit RGB / RGBA, non-interlaced) and write an 8-bit
 * grayscale tile. Node's zlib covers the compression, so a full image library
 * would be a lot of install weight for ~100 lines of work.
 */
import zlib from "node:zlib";

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** Undo the per-scanline PNG filter. Operates in place on `raw`. */
function unfilter(raw, width, height, bpp) {
  const stride = width * bpp;
  const out = Buffer.alloc(stride * height);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const line = raw.subarray(pos, pos + stride);
    pos += stride;
    const o = y * stride;
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[o + x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      switch (filter) {
        case 0: break;
        case 1: v += a; break;
        case 2: v += b; break;
        case 3: v += (a + b) >> 1; break;
        case 4: {
          // Paeth
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          break;
        }
        default: throw new Error(`unsupported PNG filter ${filter} on row ${y}`);
      }
      out[o + x] = v & 0xff;
    }
  }
  return out;
}

/** Decode to { width, height, data } where data is tightly packed RGB (3 bytes/px). */
export function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const bitDepth = buf[24];
  const colorType = buf[25];
  const interlace = buf[28];
  if (bitDepth !== 8) throw new Error(`only 8-bit PNGs supported (got ${bitDepth})`);
  if (interlace !== 0) throw new Error("interlaced PNGs not supported");
  if (![0, 2, 6].includes(colorType)) {
    throw new Error(`only grayscale/RGB/RGBA supported (got colorType ${colorType})`);
  }

  const idat = [];
  let pos = 8;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    if (type === "IDAT") idat.push(buf.subarray(pos + 8, pos + 8 + len));
    if (type === "IEND") break;
    pos += 12 + len;
  }

  const bpp = { 0: 1, 2: 3, 6: 4 }[colorType];
  const raw = unfilter(zlib.inflateSync(Buffer.concat(idat)), width, height, bpp);

  if (bpp === 3) return { width, height, data: raw };

  // Normalise to tightly packed RGB: expand grayscale, drop alpha.
  const rgb = Buffer.alloc(width * height * 3);
  for (let p = 0; p < width * height; p++) {
    const i = p * bpp;
    rgb[p * 3] = raw[i];
    rgb[p * 3 + 1] = bpp === 1 ? raw[i] : raw[i + 1];
    rgb[p * 3 + 2] = bpp === 1 ? raw[i] : raw[i + 2];
  }
  return { width, height, data: rgb };
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** Encode 8-bit grayscale (colorType 0). `gray` is width*height bytes. */
export function encodeGrayPNG(gray, width, height) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 0;   // color type: grayscale
  // 10..12 = compression, filter, interlace — all 0

  // Filter type 0 (None) on every row: the tile is tiny, so the extra bytes
  // cost nothing and it keeps the encoder trivial.
  const src = Buffer.from(gray.buffer ?? gray, gray.byteOffset ?? 0, width * height);
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width + 1)] = 0;
    src.copy(raw, y * (width + 1) + 1, y * width, (y + 1) * width);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
