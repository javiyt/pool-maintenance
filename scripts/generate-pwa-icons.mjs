import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const sizes = [32, 48, 96, 144, 180, 192, 256, 384, 512];
const outDir = 'public/icons';

for (const size of sizes) {
  writeFileSync(join(outDir, `icon-${size}.png`), makeIcon(size, false));
}
writeFileSync(join(outDir, 'apple-touch-icon-180.png'), makeIcon(180, false));
writeFileSync(join(outDir, 'icon-maskable-192.png'), makeIcon(192, true));
writeFileSync(join(outDir, 'icon-maskable-512.png'), makeIcon(512, true));

function makeIcon(size, maskable) {
  const safe = maskable ? 0.72 : 0.86;
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const nx = x / size;
      const ny = y / size;
      const bg = mix([8, 127, 140], [56, 198, 189], clamp((nx + ny) / 1.55, 0, 1));
      pixels[i] = bg[0];
      pixels[i + 1] = bg[1];
      pixels[i + 2] = bg[2];
      pixels[i + 3] = 255;

      const cx = size * 0.5;
      const cy = size * 0.38;
      const dx = x - cx;
      const dy = y - cy;
      const drop = Math.hypot(dx / (size * 0.24 * safe), dy / (size * 0.30 * safe)) < 1
        && y > size * 0.12
        && y < size * 0.63;
      if (drop) setPixel(pixels, i, [255, 255, 255, 255]);

      if (onWave(x, y, size, safe)) setPixel(pixels, i, [184, 243, 244, 255]);
      if (inCheck(x, y, size, safe)) setPixel(pixels, i, [8, 127, 140, 255]);
      if (inCircle(x, y, size * 0.76, size * 0.25, size * 0.065 * safe)) setPixel(pixels, i, [245, 213, 107, 255]);
    }
  }

  return encodePng(size, size, pixels);
}

function onWave(x, y, size, safe) {
  const waveY = size * 0.62 + Math.sin((x / size) * Math.PI * 4) * size * 0.035;
  return y > waveY && y < waveY + size * 0.13 * safe;
}

function inCheck(x, y, size, safe) {
  const p1 = [size * 0.43, size * 0.36];
  const p2 = [size * 0.49, size * 0.43];
  const p3 = [size * 0.62, size * 0.28];
  return distanceToSegment(x, y, p1, p2) < size * 0.025 * safe
    || distanceToSegment(x, y, p2, p3) < size * 0.025 * safe;
}

function inCircle(x, y, cx, cy, r) {
  return Math.hypot(x - cx, y - cy) <= r;
}

function distanceToSegment(x, y, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy), 0, 1);
  return Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy));
}

function mix(a, b, t) {
  return a.map((value, index) => Math.round(value + (b[index] - value) * t));
}

function setPixel(pixels, i, rgba) {
  pixels[i] = rgba[0];
  pixels[i + 1] = rgba[1];
  pixels[i + 2] = rgba[2];
  pixels[i + 3] = rgba[3];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function encodePng(width, height, rgba) {
  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    scanlines[rowStart] = 0;
    rgba.copy(scanlines, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', Buffer.concat([u32(width), u32(height), Buffer.from([8, 6, 0, 0, 0])])),
    chunk('IDAT', deflateSync(scanlines)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  return Buffer.concat([u32(data.length), typeBuffer, data, u32(crc32(Buffer.concat([typeBuffer, data])))]);
}

function u32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0);
  return buffer;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
