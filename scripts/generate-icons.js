/**
 * アイコン生成スクリプト
 * 簡易的なPNGアイコンを生成
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 簡易PNGエンコーダー（1x1から拡大する単色アイコン）
function createSimplePNG(size, r, g, b) {
  // PNGシグネチャ
  const signature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

  // CRC計算
  function crc32(data) {
    let crc = 0xFFFFFFFF;
    const table = [];
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[i] = c;
    }
    for (let i = 0; i < data.length; i++) {
      crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  // チャンク作成
  function createChunk(type, data) {
    const length = data.length;
    const typeBytes = type.split('').map(c => c.charCodeAt(0));
    const chunk = new Uint8Array(4 + 4 + length + 4);

    // Length
    chunk[0] = (length >> 24) & 0xFF;
    chunk[1] = (length >> 16) & 0xFF;
    chunk[2] = (length >> 8) & 0xFF;
    chunk[3] = length & 0xFF;

    // Type
    chunk.set(typeBytes, 4);

    // Data
    chunk.set(data, 8);

    // CRC
    const crcData = new Uint8Array(4 + length);
    crcData.set(typeBytes, 0);
    crcData.set(data, 4);
    const crc = crc32(crcData);
    chunk[8 + length] = (crc >> 24) & 0xFF;
    chunk[8 + length + 1] = (crc >> 16) & 0xFF;
    chunk[8 + length + 2] = (crc >> 8) & 0xFF;
    chunk[8 + length + 3] = crc & 0xFF;

    return chunk;
  }

  // IHDR (Image Header)
  const ihdr = new Uint8Array(13);
  ihdr[0] = (size >> 24) & 0xFF;
  ihdr[1] = (size >> 16) & 0xFF;
  ihdr[2] = (size >> 8) & 0xFF;
  ihdr[3] = size & 0xFF;
  ihdr[4] = (size >> 24) & 0xFF;
  ihdr[5] = (size >> 16) & 0xFF;
  ihdr[6] = (size >> 8) & 0xFF;
  ihdr[7] = size & 0xFF;
  ihdr[8] = 8;  // Bit depth
  ihdr[9] = 2;  // Color type (RGB)
  ihdr[10] = 0; // Compression
  ihdr[11] = 0; // Filter
  ihdr[12] = 0; // Interlace

  // IDAT (Image Data) - 非圧縮
  const rawData = [];
  for (let y = 0; y < size; y++) {
    rawData.push(0); // Filter type: None
    for (let x = 0; x < size; x++) {
      // グラデーション円形アイコン
      const cx = size / 2;
      const cy = size / 2;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const maxDist = size / 2;

      if (dist < maxDist * 0.8) {
        // 内側：メインカラー
        const factor = 1 - (dist / (maxDist * 0.8)) * 0.3;
        rawData.push(Math.floor(r * factor));
        rawData.push(Math.floor(g * factor));
        rawData.push(Math.floor(b * factor));
      } else if (dist < maxDist) {
        // エッジ：ぼかし
        const alpha = 1 - (dist - maxDist * 0.8) / (maxDist * 0.2);
        rawData.push(Math.floor(r * alpha + 15 * (1 - alpha)));
        rawData.push(Math.floor(g * alpha + 23 * (1 - alpha)));
        rawData.push(Math.floor(b * alpha + 42 * (1 - alpha)));
      } else {
        // 外側：背景
        rawData.push(15);
        rawData.push(23);
        rawData.push(42);
      }
    }
  }

  // 非圧縮DEFLATE (ストアブロック)
  const deflateData = [];

  // Zlib header
  deflateData.push(0x78, 0x01);

  // 非圧縮ブロックで分割して格納
  const blockSize = 65535;
  for (let i = 0; i < rawData.length; i += blockSize) {
    const isLast = i + blockSize >= rawData.length;
    const chunk = rawData.slice(i, Math.min(i + blockSize, rawData.length));
    const len = chunk.length;

    deflateData.push(isLast ? 1 : 0); // BFINAL + BTYPE=00
    deflateData.push(len & 0xFF);
    deflateData.push((len >> 8) & 0xFF);
    deflateData.push((~len) & 0xFF);
    deflateData.push((~len >> 8) & 0xFF);
    deflateData.push(...chunk);
  }

  // Adler-32 checksum
  let adlerA = 1, adlerB = 0;
  for (let i = 0; i < rawData.length; i++) {
    adlerA = (adlerA + rawData[i]) % 65521;
    adlerB = (adlerB + adlerA) % 65521;
  }
  const adler = (adlerB << 16) | adlerA;
  deflateData.push((adler >> 24) & 0xFF);
  deflateData.push((adler >> 16) & 0xFF);
  deflateData.push((adler >> 8) & 0xFF);
  deflateData.push(adler & 0xFF);

  const idatChunk = createChunk('IDAT', new Uint8Array(deflateData));

  // IEND
  const iendChunk = createChunk('IEND', new Uint8Array(0));

  // IHDRチャンク
  const ihdrChunk = createChunk('IHDR', ihdr);

  // 全体を結合
  const png = new Uint8Array(
    signature.length + ihdrChunk.length + idatChunk.length + iendChunk.length
  );
  let offset = 0;
  png.set(signature, offset); offset += signature.length;
  png.set(ihdrChunk, offset); offset += ihdrChunk.length;
  png.set(idatChunk, offset); offset += idatChunk.length;
  png.set(iendChunk, offset);

  return Buffer.from(png);
}

// アイコン生成
const iconsDir = join(__dirname, '..', 'public', 'icons');
if (!existsSync(iconsDir)) {
  mkdirSync(iconsDir, { recursive: true });
}

const sizes = [16, 48, 128];
const color = { r: 56, g: 189, b: 248 }; // アクセントカラー

for (const size of sizes) {
  const png = createSimplePNG(size, color.r, color.g, color.b);
  const path = join(iconsDir, `icon${size}.png`);
  writeFileSync(path, png);
  console.log(`Created: ${path}`);
}

console.log('アイコン生成完了');
