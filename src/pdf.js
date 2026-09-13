/**
 * Builds the PDF: one page per rendered image (comparison sheet first, then
 * the detail grid), followed by the written client takeaway.
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const LETTER_W = 612;

function wrap(font, text, size, maxWidth) {
  const lines = [];
  for (const para of String(text ?? '').split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else line = test;
    }
    lines.push(line);
  }
  return lines;
}

/** Standard PDF fonts only cover WinAnsi; swap the few glyphs we use. */
function sanitize(s) {
  return String(s ?? '')
    .replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-').replace(/×/g, 'x').replace(/★/g, '*').replace(/·/g, '-');
}

export async function buildPdf({ pages = [], report, takeaway }) {
  const doc = await PDFDocument.create();
  doc.setTitle(`${report.business.name} - Local rankings for "${report.keyword}"`);

  for (const p of pages) {
    if (!p?.png) continue;
    const img = await doc.embedPng(p.png);
    const h = (p.height / p.width) * LETTER_W;
    const page = doc.addPage([LETTER_W, h]);
    page.drawImage(img, { x: 0, y: 0, width: LETTER_W, height: h });
  }

  doc.addPage([LETTER_W, 792]);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const margin = 54;
  let y = 740;

  const draw = (text, { font = reg, size = 11, color = rgb(0.2, 0.25, 0.33), gap = 4 } = {}) => {
    for (const line of wrap(font, sanitize(text), size, LETTER_W - margin * 2)) {
      if (y < 60) {
        doc.addPage([LETTER_W, 792]);
        y = 740;
      }
      doc.getPages().at(-1).drawText(line, { x: margin, y, size, font, color });
      y -= size + gap;
    }
    y -= 8;
  };

  draw('What this means for you', { font: bold, size: 18, color: rgb(0.06, 0.09, 0.16) });
  draw('The good', { font: bold, size: 12, color: rgb(0.13, 0.77, 0.37) });
  draw(takeaway.good);
  draw('The revenue leak', { font: bold, size: 12, color: rgb(0.94, 0.27, 0.27) });
  draw(takeaway.leak);
  draw('The competitive context', { font: bold, size: 12, color: rgb(0.96, 0.62, 0.04) });
  draw(takeaway.context);

  return Buffer.from(await doc.save());
}
