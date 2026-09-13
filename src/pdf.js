/** Builds a 2-page PDF: the report card image and the client takeaway text. */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

function wrap(font, text, size, maxWidth) {
  const lines = [];
  for (const para of text.split('\n')) {
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

export async function buildPdf({ png, width, height, report, takeaway }) {
  const doc = await PDFDocument.create();
  doc.setTitle(`${report.business.name} – Local rankings for "${report.keyword}"`);
  const img = await doc.embedPng(png);
  const scale = 612 / width; // fit letter width (8.5in @ 72dpi)
  const page = doc.addPage([612, height * scale]);
  page.drawImage(img, { x: 0, y: 0, width: 612, height: height * scale });

  const p2 = doc.addPage([612, 792]);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  let y = 740;
  const margin = 54;
  const draw = (text, { font = reg, size = 11, color = rgb(0.2, 0.25, 0.33), gap = 4 } = {}) => {
    for (const line of wrap(font, text, size, 612 - margin * 2)) {
      if (y < 60) { y = 740; doc.addPage([612, 792]); }
      const pg = doc.getPages().at(-1);
      pg.drawText(line, { x: margin, y, size, font, color });
      y -= size + gap;
    }
    y -= 8;
  };
  draw('What this means for you', { font: bold, size: 18, color: rgb(0.06, 0.09, 0.16) });
  draw('The good', { font: bold, size: 12, color: rgb(0.13, 0.77, 0.37) });
  draw(sanitize(takeaway.good));
  draw('The revenue leak', { font: bold, size: 12, color: rgb(0.94, 0.27, 0.27) });
  draw(sanitize(takeaway.leak));
  draw('The competitive context', { font: bold, size: 12, color: rgb(0.96, 0.62, 0.04) });
  draw(sanitize(takeaway.context));
  return Buffer.from(await doc.save());
}

/** Standard PDF fonts only cover WinAnsi; swap the few glyphs we use. */
function sanitize(s) {
  return s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/–/g, '-').replace(/×/g, 'x').replace(/★/g, '*');
}
