const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

// Utility to create a PNG file buffer with deflateSync
function createPngBuffer(width, height, getPixelRgba) {
  const bytesPerPixel = 4;
  const rawData = Buffer.alloc(height * (width * bytesPerPixel + 1));

  let offset = 0;
  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0; // Filter type 0 (None)
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getPixelRgba(x, y, width, height);
      rawData[offset++] = Math.max(0, Math.min(255, Math.round(r)));
      rawData[offset++] = Math.max(0, Math.min(255, Math.round(g)));
      rawData[offset++] = Math.max(0, Math.min(255, Math.round(b)));
      rawData[offset++] = Math.max(0, Math.min(255, Math.round(a)));
    }
  }

  const compressedData = zlib.deflateSync(rawData);

  // PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR Chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // Bit depth: 8
  ihdrData[9] = 6; // Color type: RGBA (6)
  ihdrData[10] = 0; // Compression
  ihdrData[11] = 0; // Filter
  ihdrData[12] = 0; // Interlace

  const ihdrChunk = createChunk("IHDR", ihdrData);
  const idatChunk = createChunk("IDAT", compressedData);
  const iendChunk = createChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const length = data.length;
  const chunk = Buffer.alloc(8 + length + 4);
  chunk.writeUInt32BE(length, 0);
  chunk.write(type, 4, 4, "ascii");
  data.copy(chunk, 8);

  const crcTarget = chunk.subarray(4, 8 + length);
  const crc = calculateCrc32(crcTarget);
  chunk.writeUInt32BE(crc, 8 + length);

  return chunk;
}

// CRC32 table & calculation
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    if (c & 1) {
      c = 0xedb88320 ^ (c >>> 1);
    } else {
      c = c >>> 1;
    }
  }
  crcTable[n] = c;
}

function calculateCrc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Helper drawing math
function dist(x1, y1, x2, y2) {
  return Math.hypot(x1 - x2, y1 - y2);
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
  if (l2 === 0) return dist(px, py, x1, y1);
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  return dist(px, py, x1 + t * (x2 - x1), y1 + t * (y2 - y1));
}

// Draw the iconic BuJo Beetle
function renderBujoIconPixel(x, y, size, isMaskable = false) {
  // Normalize to 512x512 coordinates
  const scale = size / 512;
  const nx = x / scale;
  const ny = y / scale;

  // Background Paper Color: #f7f4eb (RGB: 247, 244, 235)
  let r = 247, g = 244, b = 235, a = 255;

  // Dot grid background (24px grid at 512 base)
  const gx = (nx % 40) - 20;
  const gy = (ny % 40) - 20;
  if (gx * gx + gy * gy <= 5) {
    r = 190; g = 181; b = 165;
  }

  // Washi tape at top (yellow/amber tape)
  if (ny >= 30 && ny <= 64 && nx >= 170 && nx <= 342) {
    r = 253; g = 230; b = 138; // #fde68a
    if (ny <= 32 || ny >= 62 || nx <= 172 || nx >= 340) {
      r = 217; g = 119; b = 6; // #d97706 border
    }
  }

  // Center Circular Card (Radius 160 around cx=256, cy=270)
  const cx = 256;
  const cy = 270;
  const dCard = dist(nx, ny, cx, cy);

  if (dCard <= 164) {
    if (dCard >= 156) {
      // Dark ink outer ring
      r = 46; g = 40; b = 35; // #2e2823
    } else if (dCard >= 138 && dCard <= 144) {
      // Dashed blue ring
      const angle = Math.atan2(ny - cy, nx - cx);
      const segment = Math.floor(((angle + Math.PI) / (Math.PI * 2)) * 32);
      if (segment % 2 === 0) {
        r = 2; g = 132; b = 199; // #0284c7
      } else {
        r = 252; g = 251; b = 247;
      }
    } else {
      // Paper Card inner: #fcfbf7
      r = 252; g = 251; b = 247;
    }
  }

  // Draw Beetle
  const bx = nx - 256;
  const by = ny - 270;

  // Beetle Legs (stroke width ~ 7)
  const legSegments = [
    [-60, -20, -90, -40],
    [-70, 10, -95, 10],
    [-60, 40, -90, 60],
    [60, -20, 90, -40],
    [70, 10, 95, 10],
    [60, 40, 90, 60],
    // Antennas
    [-20, -50, -45, -75],
    [20, -50, 45, -75],
  ];

  for (const [x1, y1, x2, y2] of legSegments) {
    if (distToSegment(bx, by, x1, y1, x2, y2) <= 3.5) {
      r = 46; g = 40; b = 35;
    }
  }

  // Beetle Head (circle at 0, -35, radius 22)
  const dHead = dist(bx, by, 0, -35);
  if (dHead <= 22) {
    r = 46; g = 40; b = 35;
    // Eyes (yellow dots)
    if (dist(bx, by, -10, -40) <= 4.5 || dist(bx, by, 10, -40) <= 4.5) {
      r = 254; g = 240; b = 138;
    }
  }

  // Beetle Body (ellipse rx=48, ry=52 around 0, 18)
  const ex = bx / 48;
  const ey = (by - 18) / 52;
  const dBody = ex * ex + ey * ey;
  if (dBody <= 1.0) {
    if (dBody >= 0.85 || Math.abs(bx) <= 3) {
      // Body border or spine line
      r = 30; g = 41; b = 59;
    } else {
      // Blue body fill
      r = 2; g = 132; b = 199;

      // Ladybug spots (dark ink dots)
      if (
        dist(bx, by, -24, 5) <= 7 ||
        dist(bx, by, 24, 5) <= 7 ||
        dist(bx, by, -30, 35) <= 6 ||
        dist(bx, by, 30, 35) <= 6
      ) {
        r = 30; g = 41; b = 59;
      }
    }
  }

  // Outer border if not maskable
  if (!isMaskable) {
    const rx = 108 * scale;
    // Keep clean rounded corners or full fill
  }

  return [r, g, b, a];
}

// Generate Screenshots (Rich Preview Cards)
function renderDesktopScreenshotPixel(x, y, width, height) {
  // 1280 x 720
  // Background: BuJo paper
  let r = 247, g = 244, b = 235, a = 255;
  const gx = (x % 24) - 12;
  const gy = (y % 24) - 12;
  if (gx * gx + gy * gy <= 2.5) {
    r = 190; g = 181; b = 165;
  }

  // Top Bar Card: x: 400 to 880, y: 16 to 64
  if (x >= 400 && x <= 880 && y >= 16 && y <= 64) {
    r = 252; g = 251; b = 247;
    if (x <= 402 || x >= 878 || y <= 18 || y >= 62) {
      r = 46; g = 40; b = 35;
    }
  }

  // Center Notebook Card: x: 340 to 940, y: 110 to 620
  if (x >= 340 && x <= 940 && y >= 110 && y <= 620) {
    r = 252; g = 251; b = 247;
    // Border
    if (x <= 343 || x >= 937 || y <= 113 || y >= 617) {
      r = 46; g = 40; b = 35;
    }
    // Washi tape at top of card
    if (x >= 540 && x <= 740 && y >= 100 && y <= 126) {
      r = 253; g = 230; b = 138;
    }
    // Title bar marker inside card
    if (x >= 440 && x <= 840 && y >= 220 && y <= 260) {
      r = 254; g = 240; b = 138; // Yellow highlight marker
    }
    // Main button (Criar Sala): x: 420 to 860, y: 340 to 390
    if (x >= 420 && x <= 860 && y >= 340 && y <= 390) {
      r = 2; g = 132; b = 199; // Blue button
    }
  }

  // Some cute bugs crawling on board
  const bugCenters = [
    [180, 240, 2, 132, 199],
    [1080, 320, 225, 29, 72],
    [220, 520, 22, 163, 74],
    [1120, 180, 217, 119, 6],
  ];

  for (const [bcx, bcy, br, bg, bb] of bugCenters) {
    if (dist(x, y, bcx, bcy) <= 24) {
      r = br; g = bg; b = bb;
    }
  }

  return [r, g, b, a];
}

function renderMobileScreenshotPixel(x, y, width, height) {
  // 390 x 844
  let r = 247, g = 244, b = 235, a = 255;
  const gx = (x % 20) - 10;
  const gy = (y % 20) - 10;
  if (gx * gx + gy * gy <= 2.2) {
    r = 190; g = 181; b = 165;
  }

  // Top Bar: x: 16 to 374, y: 50 to 94
  if (x >= 16 && x <= 374 && y >= 50 && y <= 94) {
    r = 252; g = 251; b = 247;
    if (x <= 18 || x >= 372 || y <= 52 || y >= 92) {
      r = 46; g = 40; b = 35;
    }
  }

  // Center Card: x: 20 to 370, y: 130 to 680
  if (x >= 20 && x <= 370 && y >= 130 && y <= 680) {
    r = 252; g = 251; b = 247;
    if (x <= 23 || x >= 367 || y <= 133 || y >= 677) {
      r = 46; g = 40; b = 35;
    }
    // Washi Tape
    if (x >= 120 && x <= 270 && y >= 120 && y <= 144) {
      r = 253; g = 230; b = 138;
    }
    // Main button (Criar Sala): x: 44 to 346, y: 380 to 430
    if (x >= 44 && x <= 346 && y >= 380 && y <= 430) {
      r = 2; g = 132; b = 199;
    }
    // Secondary button: x: 44 to 346, y: 450 to 495
    if (x >= 44 && x <= 346 && y >= 450 && y <= 495) {
      r = 247; g = 244, b = 235;
    }
  }

  // Bottom Audio Panel: x: 20 to 140, y: 720 to 765
  if (x >= 20 && x <= 140 && y >= 720 && y <= 765) {
    r = 252; g = 251; b = 247;
  }

  return [r, g, b, a];
}

// Generate all files
const publicDir = path.join(__dirname, "public");

console.log("🎨 Gerando assets PWA de alta fidelidade...");

// 1. icon-192.png
const icon192 = createPngBuffer(192, 192, (x, y, w, h) => renderBujoIconPixel(x, y, 192, false));
fs.writeFileSync(path.join(publicDir, "icon-192.png"), icon192);
console.log("✅ icon-192.png gerado.");

// 2. icon-512.png
const icon512 = createPngBuffer(512, 512, (x, y, w, h) => renderBujoIconPixel(x, y, 512, false));
fs.writeFileSync(path.join(publicDir, "icon-512.png"), icon512);
console.log("✅ icon-512.png gerado.");

// 3. icon-maskable-192.png
const iconMaskable192 = createPngBuffer(192, 192, (x, y, w, h) => renderBujoIconPixel(x, y, 192, true));
fs.writeFileSync(path.join(publicDir, "icon-maskable-192.png"), iconMaskable192);
console.log("✅ icon-maskable-192.png gerado.");

// 4. icon-maskable-512.png
const iconMaskable512 = createPngBuffer(512, 512, (x, y, w, h) => renderBujoIconPixel(x, y, 512, true));
fs.writeFileSync(path.join(publicDir, "icon-maskable-512.png"), iconMaskable512);
console.log("✅ icon-maskable-512.png gerado.");

// 5. apple-touch-icon.png (180x180)
const appleIcon = createPngBuffer(180, 180, (x, y, w, h) => renderBujoIconPixel(x, y, 180, false));
fs.writeFileSync(path.join(publicDir, "apple-touch-icon.png"), appleIcon);
console.log("✅ apple-touch-icon.png gerado.");

// 6. screenshot-desktop.png (1280x720)
const screenshotDesktop = createPngBuffer(1280, 720, renderDesktopScreenshotPixel);
fs.writeFileSync(path.join(publicDir, "screenshot-desktop.png"), screenshotDesktop);
console.log("✅ screenshot-desktop.png gerado.");

// 7. screenshot-mobile.png (390x844)
const screenshotMobile = createPngBuffer(390, 844, renderMobileScreenshotPixel);
fs.writeFileSync(path.join(publicDir, "screenshot-mobile.png"), screenshotMobile);
console.log("✅ screenshot-mobile.png gerado.");

console.log("🎉 Todos os assets gráficos foram gerados com sucesso!");
