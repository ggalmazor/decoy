// Generates the e2e fixtures: a PNG "account handover" page and a three-page PDF with real text on page 2.
// Run with: node scripts/make-fixtures.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const out = new URL('../e2e/fixtures/', import.meta.url);
mkdirSync(out, { recursive: true });

// --- PNG: a 640x400 light page with dark "text" bars and one high-contrast "password" line.
const W = 640;
const H = 400;
const px = new Uint8Array(W * H * 3);
function fill(x0, y0, w, h, [r, g, b]) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const i = (y * W + x) * 3;
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
    }
  }
}
fill(0, 0, W, H, [246, 241, 230]);
fill(40, 40, 320, 18, [23, 20, 15]);
for (let row = 0; row < 6; row++) fill(40, 90 + row * 28, 200 + ((row * 97) % 300), 8, [120, 112, 100]);
// The "secret": a line of 7px x 10px glyph-like blocks at (260, 270) 300 wide 24 high.
for (let k = 0; k < 24; k++) fill(262 + k * 12, 276, 7, 12, [23, 20, 15]);
fill(40, 270, 180, 24, [180, 170, 150]);

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) {
  raw[y * (W * 3 + 1)] = 0;
  Buffer.from(px.buffer, y * W * 3, W * 3).copy(raw, y * (W * 3 + 1) + 1);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;
ihdr[9] = 2;
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);
writeFileSync(new URL('page.png', out), png);

// --- PDF: three A4 pages with extractable text; page 2 carries the secret.
const pdf = await PDFDocument.create();
pdf.setTitle('Account handover');
pdf.setAuthor('M. Etxeberria');
const font = await pdf.embedFont(StandardFonts.Courier);
const bold = await pdf.embedFont(StandardFonts.CourierBold);
const lines = [
  ['Page one. Nothing to see here yet.', 'Scroll on.'],
  [
    'Account handover',
    'Username   m.etxeberria',
    'Password   Summer2026!',
    'IBAN       ES91 2100 0418 4502 0005 1332',
  ],
  ['Page three. Shred after reading.'],
];
for (const [index, body] of lines.entries()) {
  const page = pdf.addPage([595.28, 841.89]);
  page.drawText(`CONFIDENTIAL - PAGE ${index + 1}`, {
    x: 56,
    y: 780,
    size: 20,
    font: bold,
    color: rgb(0.09, 0.08, 0.06),
  });
  body.forEach((line, i) => {
    page.drawText(line, { x: 56, y: 720 - i * 28, size: 14, font, color: rgb(0.09, 0.08, 0.06) });
  });
}
writeFileSync(new URL('three-pages.pdf', out), await pdf.save());
console.log('fixtures written to e2e/fixtures/');
