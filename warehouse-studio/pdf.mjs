import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { HOURS_PER_UNIT, durationHours, requirements, formatNumber, stockVisualization } from './public/model.js';

const PDFDocument = createRequire(import.meta.url)('pdfkit');

const fonts = Object.fromEntries(['Regular', 'Italic', 'Bold'].map((style) => [style,
  fileURLToPath(new URL(`./assets/fonts/NotoSerif-${style}.ttf`, import.meta.url))]));
const number = (value) => value === null ? '-' : formatNumber(value);
const date = (value) => value.replace('T', ' ');
const ink = '#262626';
const muted = '#707070';

export function pdfFilename(warehouse) {
  const name = warehouse.name.normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'inventory';
  return `${name.toLowerCase()}-${warehouse.period.start.slice(0, 10)}.pdf`;
}

export function createInventoryPdf(warehouse, { itemIds, filters = {} } = {}) {
  const selected = itemIds ? new Set(itemIds) : null;
  const rows = warehouse.items.map((item, index) => ({ item, index: index + 1 }))
    .filter(({ item }) => !selected || selected.has(item.id));
  const hours = durationHours(warehouse.period);
  if (hours === null) throw new Error('Select a valid planning interval before exporting.');
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margins: { top: 32, bottom: 20, left: 32, right: 32 },
    bufferPages: true, autoFirstPage: false, info: { Title: `${warehouse.name} - Inventory`, Author: 'Warehouse Studio', Subject: 'Inventory, supply and demand for the selected interval' } });
  const output = new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  for (const [style, file] of Object.entries(fonts)) doc.registerFont(style, file);
  const margin = 32;
  const width = 841.89 - margin * 2;
  const widths = [26, 158, 138, 70, 90, 90, width - 572];
  const xs = widths.map((_, index) => margin + widths.slice(0, index).reduce((a, b) => a + b, 0));
  const bodyBottom = 535;
  const filterText = [filters.type && `Type: ${filters.type}`, filters.query && `Search: ${filters.query.slice(0, 200)}${filters.query.length > 200 ? '...' : ''}`, filters.shortageOnly && 'Shortfalls only'].filter(Boolean).join('  |  ');
  let y;

  function text(value, x, top, w, { font = 'Regular', size = 8.6, color = ink, align = 'left' } = {}) {
    doc.font(font).fontSize(size).fillColor(color).text(String(value), x, top, { width: w, align, lineGap: 1 });
  }
  function height(value, w, font = 'Regular', size = 8.6) {
    return doc.font(font).fontSize(size).heightOfString(String(value), { width: w, lineGap: 1 });
  }
  function page(first) {
    doc.addPage();
    if (first) {
      text(warehouse.name, margin, 28, width, { size: 21, font: 'Bold' });
      y = 28 + height(warehouse.name, width, 'Bold', 21) + 8;
    } else {
      text(warehouse.name, margin, 24, width, { size: 12, font: 'Bold' });
      y = 24 + height(warehouse.name, width, 'Bold', 12) + 5;
    }
    const period = `${date(warehouse.period.start)} to ${date(warehouse.period.end)}  |  ${number(hours / HOURS_PER_UNIT[warehouse.period.durationUnit || 'day'])} ${warehouse.period.durationUnit || 'day'}s  |  ${rows.length} of ${warehouse.items.length} materials`;
    text(period, margin, y, width, { size: 8.5, color: muted });
    y += height(period, width, 'Regular', 8.5) + 5;
    if (filterText) {
      text(filterText, margin, y, width, { size: 8, font: 'Italic', color: muted });
      y += height(filterText, width, 'Italic', 8) + 5;
    }
    y += 7;
    doc.strokeColor(ink).lineWidth(.9).moveTo(margin, y).lineTo(margin + width, y).stroke();
    ['No.', 'Material', 'Type', 'Stock / Unit', 'Supply rule', 'Demand rule', 'Stock balance'].forEach((label, index) => {
      text(label, xs[index] + 5, y + 7, widths[index] - 10, { size: 8.2, font: index === 2 ? 'Italic' : 'Regular', color: muted, align: index === 0 ? 'center' : 'left' });
    });
    y += 27;
    doc.lineWidth(.5).moveTo(margin, y).lineTo(margin + width, y).stroke();
  }
  function rule(item, supply) {
    const mode = supply ? item.supplyMode || 'fixed' : item.mode;
    const amount = supply ? item.supplyAmount ?? 0 : item.amount;
    const unit = supply ? item.supplyRateUnit || 'day' : item.rateUnit;
    return mode === 'rate' ? `${number(amount)} ${item.unit}/${unit}` : `${number(amount)} ${item.unit} (fixed)`;
  }
  function meter(result, x, top) {
    const visual = stockVisualization(result.available, result.required);
    const w = 56, h = 8;
    doc.save().rect(x, top, w, h).fill('#eeeeee');
    if (visual) {
      const covered = w * visual.covered / 100;
      const missing = w * visual.missing / 100;
      const surplus = w * visual.surplus / 100;
      if (covered) doc.rect(x, top, covered, h).fill('#687e58');
      if (missing) {
        doc.rect(x + covered, top, missing, h).fill('#e6d7d2');
        doc.save().rect(x + covered, top, missing, h).clip().strokeColor('#b78579').lineWidth(.45);
        for (let offset = -h; offset < missing + h; offset += 4) doc.moveTo(x + covered + offset, top + h).lineTo(x + covered + offset + h, top).stroke();
        doc.restore();
      }
      if (surplus) doc.rect(x + covered + missing, top, surplus, h).fill('#a4b5a0');
      doc.strokeColor('#ffffff').lineWidth(.35);
      for (let index = 1; index < 10; index++) doc.moveTo(x + w * index / 10, top).lineTo(x + w * index / 10, top + h).stroke();
      if (result.required > 0) doc.strokeColor(ink).lineWidth(.8).moveTo(x + w * visual.target / 100, top - 2).lineTo(x + w * visual.target / 100, top + h + 2).stroke();
    }
    doc.rect(x, top, w, h).strokeColor('#b8beb3').lineWidth(.35).stroke().restore();
  }

  try {
    page(true);
    if (!rows.length) {
      text('No materials match the current view.', margin + 5, y + 15, width - 10, { font: 'Italic', color: muted });
    }
    for (const { item, index } of rows) {
      const result = requirements(item, warehouse.period);
      const delta = result.remaining === null ? '-' : result.remaining > 0 ? `+${number(result.remaining)}` : number(result.remaining);
      const balance = `${delta}  (${number(result.supplied)}/${number(result.required)}) ${item.unit}`;
      const cells = [String(index), item.name, item.type, `${number(item.stock)} ${item.unit}`, rule(item, true), rule(item, false), balance];
      const rowHeight = Math.max(20, ...cells.map((value, col) => height(value, widths[col] - (col === 6 ? 76 : 10), col === 2 ? 'Italic' : 'Regular') + 8));
      if (y + rowHeight > bodyBottom) page(false);
      cells.forEach((value, col) => {
        if (col === 6) {
          meter(result, xs[col] + 5, y + rowHeight / 2 - 4);
          text(value, xs[col] + 69, y + (rowHeight - height(value, widths[col] - 76)) / 2, widths[col] - 76, { size: 8.6, color: result.shortage > 0 ? '#904a3d' : ink });
        } else text(value, xs[col] + 5, y + (rowHeight - height(value, widths[col] - 10, col === 2 ? 'Italic' : 'Regular')) / 2, widths[col] - 10, { font: col === 2 ? 'Italic' : 'Regular', size: 8.6, color: col === 0 ? '#aaaaaa' : col === 2 ? muted : ink, align: col === 0 ? 'center' : 'left' });
      });
      y += rowHeight;
      doc.strokeColor('#dddddd').lineWidth(.3).moveTo(margin, y).lineTo(margin + width, y).stroke();
    }
    const pages = doc.bufferedPageRange();
    for (let index = 0; index < pages.count; index++) {
      doc.switchToPage(index);
      doc.strokeColor('#bdbdbd').lineWidth(.4).moveTo(margin, 548).lineTo(margin + width, 548).stroke();
      text('Balance = stock + supply - required. Parentheses: supply/required. Hatched: shortfall; pale green: surplus.', margin, 555, width - 95, { size: 7.2, color: muted });
      text(`${index + 1} / ${pages.count}`, margin + width - 80, 555, 80, { size: 8, color: muted, align: 'right' });
    }
    doc.end();
  } catch (error) { doc.destroy(error); }
  return output;
}
