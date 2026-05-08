// Generates a vibe ghost icon (Phantom VPN) - pure Node.js, no dependencies
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// CRC32
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c;
}
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ crcTable[(c ^ buf[i]) & 0xFF];
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function pngChunk(type, data) {
  const t = Buffer.from(type);
  const len = Buffer.allocUnsafe(4); len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([t, data]);
  const crc = Buffer.allocUnsafe(4); crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v) { return Math.max(0, Math.min(255, Math.round(v))); }

function inRoundedRect(x, y, size, radius) {
  const hw = size / 2;
  const rx = Math.abs(x - hw), ry = Math.abs(y - hw);
  if (rx <= hw - radius && ry <= hw) return true;
  if (ry <= hw - radius && rx <= hw) return true;
  const cx = hw - radius, cy = hw - radius;
  if (rx > cx && ry > cy) return Math.hypot(rx - cx, ry - cy) <= radius;
  return rx <= hw && ry <= hw;
}

function generatePixels(size) {
  const pixels = new Uint8Array(size * size * 4);
  const cx = size / 2, cy = size / 2;
  const r = size * 0.38;          // ghost radius
  const cornerR = size * 0.22;    // rounded square corner radius

  function ghostAlpha(x, y) {
    const sx = (x - cx) / r;
    const sy = (y - cy) / r;

    // Head: upper semicircle
    if (sx * sx + sy * sy < 1 && sy < 0.12) return 1;

    // Body: rectangle + wavy bottom
    if (Math.abs(sx) <= 0.88) {
      // Wavy bottom with 3 bumps (ghost feet)
      const waveY = 0.82 + 0.18 * Math.cos(sx * Math.PI * 3.5);
      if (sy >= -0.05 && sy <= waveY) return 1;
    }
    return 0;
  }

  function eyeAlpha(x, y) {
    const sx = (x - cx) / r;
    const sy = (y - cy) / r;
    const leftD = Math.hypot(sx + 0.3, sy + 0.18);
    const rightD = Math.hypot(sx - 0.3, sy + 0.18);
    if (leftD < 0.14 || rightD < 0.14) return 1;
    return 0;
  }

  // Pre-compute glow: distance to ghost edge per pixel
  const ghostMap = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      ghostMap[y * size + x] = ghostAlpha(x, y) && !eyeAlpha(x, y) ? 1 : 0;
    }
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;

      // Clip to rounded square (icon mask)
      if (!inRoundedRect(x, y, size, cornerR)) {
        pixels[i + 3] = 0; // transparent outside
        continue;
      }

      const dx = (x - cx) / cx, dy = (y - cy) / cy;
      const dist = Math.hypot(dx, dy);

      // Background: deep purple radial gradient to near-black
      const t = Math.min(1, dist * 1.15);
      const bgR = clamp(lerp(38, 7, t));
      const bgG = clamp(lerp(12, 5, t));
      const bgB = clamp(lerp(78, 16, t));

      const g = ghostMap[y * size + x];
      const e = eyeAlpha(x, y);

      if (g) {
        // Ghost body: soft white with purple tint
        const ny = (y - cy) / r;
        const ghostT = Math.min(1, Math.max(0, (ny + 1) / 1.8));
        pixels[i]     = clamp(lerp(245, 210, ghostT));
        pixels[i + 1] = clamp(lerp(240, 200, ghostT));
        pixels[i + 2] = clamp(lerp(255, 250, ghostT));
        pixels[i + 3] = 255;
      } else if (e) {
        // Eyes: dark purple (same as bg but slightly brighter)
        pixels[i]     = clamp(bgR + 8);
        pixels[i + 1] = clamp(bgG + 4);
        pixels[i + 2] = clamp(bgB + 15);
        pixels[i + 3] = 255;
      } else {
        // Background pixel — compute glow from nearby ghost pixels
        let glow = 0;
        const glowRad = Math.ceil(size * 0.055);
        for (let dy2 = -glowRad; dy2 <= glowRad; dy2++) {
          for (let dx2 = -glowRad; dx2 <= glowRad; dx2++) {
            const nx = x + dx2, ny2 = y + dy2;
            if (nx >= 0 && nx < size && ny2 >= 0 && ny2 < size) {
              if (ghostMap[ny2 * size + nx]) {
                const d = Math.hypot(dx2, dy2);
                glow = Math.max(glow, 1 - d / glowRad);
              }
            }
          }
        }
        const g2 = glow * glow; // square for sharper falloff
        pixels[i]     = clamp(bgR + 55 * g2);
        pixels[i + 1] = clamp(bgG + 20 * g2);
        pixels[i + 2] = clamp(bgB + 120 * g2);
        pixels[i + 3] = 255;
      }
    }
  }

  return pixels;
}

function buildPNG(size, pixels) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // RGBA

  // Raw rows: filter byte + pixel data
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 4)] = 0; // None filter
    Buffer.from(pixels.buffer, y * size * 4, size * 4).copy(raw, y * (1 + size * 4) + 1);
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', compressed), pngChunk('IEND', Buffer.alloc(0))]);
}

function buildICO(pngBufs) {
  // ICO with one or more embedded PNGs (Vista+ format)
  const count = pngBufs.length;
  const headerSize = 6 + count * 16;
  let offset = headerSize;

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(count, 4);

  const dirs = [];
  for (const png of pngBufs) {
    const dir = Buffer.alloc(16);
    dir[0] = 0;  // 0 = 256 for width
    dir[1] = 0;  // 0 = 256 for height
    dir[2] = 0;  dir[3] = 0;
    dir.writeUInt16LE(1, 4); dir.writeUInt16LE(32, 6);
    dir.writeUInt32LE(png.length, 8);
    dir.writeUInt32LE(offset, 12);
    offset += png.length;
    dirs.push(dir);
  }

  return Buffer.concat([header, ...dirs, ...pngBufs]);
}

// Generate multiple sizes for ICO
console.log('Generating Phantom VPN ghost icon...');

const sizes = [256, 64, 48, 32, 16];
const pngs = sizes.map(s => {
  console.log(`  Rendering ${s}x${s}...`);
  const pixels = generatePixels(s);
  return buildPNG(s, pixels);
});

const icoPath = path.join(__dirname, '..', 'public', 'icon.ico');
const pngPath = path.join(__dirname, '..', 'public', 'icon.png');
const pubDir = path.dirname(icoPath);
if (!fs.existsSync(pubDir)) fs.mkdirSync(pubDir, { recursive: true });

// Save 256x256 PNG (used as primary icon)
fs.writeFileSync(pngPath, pngs[0]);

// Save multi-size ICO
const ico = buildICO(pngs);
fs.writeFileSync(icoPath, ico);

console.log(`Done! icon.ico: ${ico.length} bytes, icon.png: ${pngs[0].length} bytes`);
