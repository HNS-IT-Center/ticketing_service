import { deflateRawSync } from "node:zlib";

/**
 * A one-sheet .xlsx writer, dependency free.
 *
 * Why not CSV: Excel set to an Indonesian locale reads ";" as the list
 * separator, so a comma CSV opens as one long column, and a cell starting with
 * "=" in a CSV runs as a formula. An .xlsx has neither problem — cells are
 * typed, so text stays text, dates sort as dates and amounts sum as numbers.
 *
 * Why not a library: the spreadsheet libraries are megabytes for what is six
 * small XML files in a zip. This writes exactly that and nothing else: inline
 * strings (no shared-string table), one frozen bold header row, an autofilter,
 * and three number formats. Server-only — it uses node:zlib.
 */

export type XlsxCell = string | number | Date | null | undefined;

export type XlsxColumn = {
  header: string;
  /** Width in Excel's character units. */
  width?: number;
  /** How a number in this column is formatted. Dates are always date cells. */
  format?: "rupiah";
};

export type XlsxSheet = {
  name: string;
  columns: readonly XlsxColumn[];
  rows: readonly (readonly XlsxCell[])[];
};

/** Hours east of UTC the dates are written in. Excel dates carry no zone. */
const WIB_OFFSET_MS = 7 * 3600_000;
/** Excel's day 0 is 1899-12-30; the Unix epoch is day 25569. */
const EXCEL_EPOCH_DAY = 25569;
/** Excel refuses a cell longer than this. */
const MAX_CELL_CHARS = 32767;

// Style indexes into cellXfs in styles.xml below.
const STYLE_DATE = 1;
const STYLE_HEADER = 2;
const STYLE_RUPIAH = 3;

/** A Date as an Excel serial day number, in WIB. */
export function excelDateSerial(d: Date): number {
  return (d.getTime() + WIB_OFFSET_MS) / 86_400_000 + EXCEL_EPOCH_DAY;
}

/** "A", "B", … "Z", "AA", … for a 0-based column index. */
export function columnLetter(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function escapeXml(text: string): string {
  return (
    text
      // Control characters are not allowed in XML 1.0 at all, escaped or not.
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
  );
}

function stringCell(ref: string, value: string, style?: number): string {
  const text = value.length > MAX_CELL_CHARS ? value.slice(0, MAX_CELL_CHARS) : value;
  const s = style !== undefined ? ` s="${style}"` : "";
  return `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`;
}

function cellXml(ref: string, value: XlsxCell, column: XlsxColumn): string {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    return `<c r="${ref}" s="${STYLE_DATE}"><v>${excelDateSerial(value)}</v></c>`;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    const s = column.format === "rupiah" ? ` s="${STYLE_RUPIAH}"` : "";
    return `<c r="${ref}"${s}><v>${value}</v></c>`;
  }
  return stringCell(ref, value);
}

/** Sheet names may not hold []:*?/\ and are capped at 31 characters. */
function safeSheetName(name: string): string {
  return name.replace(/[[\]:*?/\\]/g, " ").slice(0, 31).trim() || "Sheet1";
}

function sheetXml(sheet: XlsxSheet): string {
  const lastCol = columnLetter(Math.max(sheet.columns.length - 1, 0));
  const lastRow = sheet.rows.length + 1;

  const cols = sheet.columns
    .map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width ?? 14}" customWidth="1"/>`)
    .join("");

  const header = `<row r="1">${sheet.columns
    .map((c, i) => stringCell(`${columnLetter(i)}1`, c.header, STYLE_HEADER))
    .join("")}</row>`;

  const body = sheet.rows
    .map((row, r) => {
      const n = r + 2;
      const cells = sheet.columns.map((col, i) => cellXml(`${columnLetter(i)}${n}`, row[i], col)).join("");
      return `<row r="${n}">${cells}</row>`;
    })
    .join("");

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    (cols ? `<cols>${cols}</cols>` : "") +
    `<sheetData>${header}${body}</sheetData>` +
    `<autoFilter ref="A1:${lastCol}${lastRow}"/>` +
    `</worksheet>`
  );
}

function workbookXml(sheet: XlsxSheet): string {
  const name = safeSheetName(sheet.name);
  const lastCol = columnLetter(Math.max(sheet.columns.length - 1, 0));
  const quoted = `'${name.replace(/'/g, "''")}'`;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="${escapeXml(name)}" sheetId="1" r:id="rId1"/></sheets>` +
    `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">${escapeXml(
      `${quoted}!$A$1:$${lastCol}$${sheet.rows.length + 1}`,
    )}</definedName></definedNames>` +
    `</workbook>`
  );
}

const CONTENT_TYPES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
  `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
  `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
  `</Types>`;

const ROOT_RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
  `</Relationships>`;

const WORKBOOK_RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
  `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
  `</Relationships>`;

// cellXfs order is load-bearing: 0 default, 1 date, 2 header, 3 rupiah.
const STYLES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd hh:mm"/></numFmts>` +
  `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
  `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
  `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="4">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
  `<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `</cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `</styleSheet>`;

// ── zip ──────────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** A deflated zip of the given files. Fixed 1980-01-01 timestamps, UTF-8 names. */
export function zip(files: readonly { name: string; data: Buffer }[]): Buffer {
  const DOS_DATE = (0 << 9) | (1 << 5) | 1;
  const FLAG_UTF8 = 0x0800;
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const f of files) {
    const name = Buffer.from(f.name, "utf8");
    const compressed = deflateRawSync(f.data);
    const crc = crc32(f.data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(FLAG_UTF8, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(f.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(FLAG_UTF8, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(f.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    // extra, comment, disk, internal and external attributes all 0
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + compressed.length;
  }

  const centralDir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, centralDir, end]);
}

/** The finished .xlsx file. */
export function buildXlsx(sheet: XlsxSheet): Buffer {
  const file = (name: string, xml: string) => ({ name, data: Buffer.from(xml, "utf8") });
  return zip([
    file("[Content_Types].xml", CONTENT_TYPES),
    file("_rels/.rels", ROOT_RELS),
    file("xl/workbook.xml", workbookXml(sheet)),
    file("xl/_rels/workbook.xml.rels", WORKBOOK_RELS),
    file("xl/styles.xml", STYLES),
    file("xl/worksheets/sheet1.xml", sheetXml(sheet)),
  ]);
}

export const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
