import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../public/icons');

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function png(size, pixelAt) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixelAt(x, y, size);
      const offset = rowStart + 1 + x * 4;
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      raw[offset + 3] = a;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function iconPixel(x, y, size) {
  const cx = (x + 0.5) / size;
  const cy = (y + 0.5) / size;
  const radius = size * 0.22;
  const dx = Math.min(x + 0.5, size - x - 0.5);
  const dy = Math.min(y + 0.5, size - y - 0.5);
  const insideRounded =
    dx >= radius || dy >= radius
      ? dx >= 0 && dy >= 0
      : Math.hypot(radius - dx, radius - dy) <= radius;
  if (!insideRounded) return [0, 0, 0, 0];

  const dxc = x + 0.5 - size / 2;
  const dyc = y + 0.5 - size / 2;
  const distance = Math.hypot(dxc, dyc);
  const ring = Math.abs(distance - size * 0.2) <= size * 0.035;
  const dot = distance <= size * 0.065;
  const tick = size * 0.29;
  const gap = size * 0.26;
  const crosshair =
    (Math.abs(dxc) <= size * 0.025 && Math.abs(dyc) >= gap && Math.abs(dyc) <= tick) ||
    (Math.abs(dyc) <= size * 0.025 && Math.abs(dxc) >= gap && Math.abs(dxc) <= tick);

  const light = 1 - y / size / 3;
  if (ring || dot || crosshair) {
    return [Math.round(245 * light), Math.round(243 * light), Math.round(255 * light), 255];
  }
  return [Math.round(139 * light), Math.round(109 * light), Math.round(255 * light), 255];
}

mkdirSync(outDir, { recursive: true });
for (const size of [16, 48, 128]) {
  writeFileSync(resolve(outDir, `icon-${size}.png`), png(size, iconPixel));
}
