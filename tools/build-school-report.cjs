const fs = require('node:fs');
const path = require('node:path');
const { AlignmentType, BorderStyle, Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } = require('docx');

const root = path.resolve(__dirname, '..');
const markdown = fs.readFileSync(path.join(root, 'school-review-report.md'), 'utf8');
const output = path.join(root, 'PCDAV_school_ERP_school_review_report.docx');
const clean = value => value.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').trim();
const cells = line => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => clean(cell.trim()));
const separator = line => cells(line).every(cell => /^:?-{3,}:?$/.test(cell.replace(/\s/g, '')));
const p = (text, options = {}) => new Paragraph({ ...options, children: [new TextRun({ text: clean(text), bold: options.bold })] });
const table = rows => new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: Object.fromEntries(['top','bottom','left','right','insideHorizontal','insideVertical'].map(key => [key, { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' }])), rows: rows.map((row, index) => new TableRow({ children: row.map(value => new TableCell({ shading: index === 0 ? { fill: 'EAF3FB' } : undefined, children: [new Paragraph({ children: [new TextRun({ text: value, bold: index === 0, size: 18 })] })] })) })) });

const children = []; const lines = markdown.split(/\r?\n/); let i = 0;
while (i < lines.length) {
  const line = lines[i];
  if (!line.trim()) { i++; continue; }
  const heading = /^(#{1,4})\s+(.+)$/.exec(line);
  if (heading) { const level = heading[1].length; children.push(p(heading[2], { heading: level === 1 ? HeadingLevel.TITLE : level === 2 ? HeadingLevel.HEADING_1 : level === 3 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3 })); i++; continue; }
  if (line.trim() === '---' || line.trim() === '***') { children.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'B7C3D0' } } })); i++; continue; }
  if (line.trim().startsWith('|') && i + 1 < lines.length && lines[i + 1].trim().startsWith('|') && separator(lines[i + 1])) { const rows = [cells(line)]; i += 2; while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(cells(lines[i++])); children.push(table(rows), new Paragraph('')); continue; }
  const bullet = /^\s*[-*+]\s+(.+)$/.exec(line); if (bullet) { children.push(new Paragraph({ text: clean(bullet[1]), bullet: { level: 0 } })); i++; continue; }
  const number = /^\s*\d+[.)]\s+(.+)$/.exec(line); if (number) { children.push(new Paragraph({ text: clean(number[1]), numbering: { reference: 'numbered-list', level: 0 } })); i++; continue; }
  if (line.startsWith('> ')) { children.push(new Paragraph({ text: clean(line.slice(2)), indent: { left: 600 }, style: 'Quote' })); i++; continue; }
  const block = [line]; i++; while (i < lines.length && lines[i].trim() && !/^(#{1,4})\s+/.test(lines[i]) && !lines[i].trim().startsWith('|') && !/^\s*[-*+]\s+/.test(lines[i])) block.push(lines[i++]); children.push(p(block.join(' ')));
}

const document = new Document({ creator: 'PCDAV ERP', title: 'PCDAV School ERP — School Review and Approval Report', description: 'School ERP requirements and approval report', styles: { default: { document: { run: { font: 'Aptos', size: 21 } } } }, numbering: { config: [{ reference: 'numbered-list', levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.LEFT }] }] }, sections: [{ properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } }, children }] });
Packer.toBuffer(document).then(buffer => fs.writeFileSync(output, buffer));
