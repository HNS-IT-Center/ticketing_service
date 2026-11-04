import { describe, expect, it } from "vitest";
import { inflateRawSync } from "node:zlib";
import { buildXlsx, columnLetter, crc32, excelDateSerial } from "./xlsx";

/** Read a zip back through its central directory: name → contents. */
function unzip(buf: Buffer): Map<string, string> {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const out = new Map<string, string>();
  for (let i = 0; i < count; i++) {
    expect(buf.readUInt32LE(p)).toBe(0x02014b50);
    const crc = buf.readUInt32LE(p + 16);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const offset = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    const localNameLen = buf.readUInt16LE(offset + 26);
    const dataStart = offset + 30 + localNameLen;
    const data = inflateRawSync(buf.subarray(dataStart, dataStart + csize));
    expect(data.length).toBe(usize);
    expect(crc32(data)).toBe(crc);
    out.set(name, data.toString("utf8"));
    p += 46 + nameLen;
  }
  return out;
}

describe("crc32", () => {
  it("matches the standard check value", () => {
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
  });
});

describe("columnLetter", () => {
  it("counts like Excel", () => {
    expect([0, 25, 26, 27, 51, 52, 701, 702].map(columnLetter)).toEqual([
      "A", "Z", "AA", "AB", "AZ", "BA", "ZZ", "AAA",
    ]);
  });
});

describe("excelDateSerial", () => {
  it("is the WIB wall clock: 2026-11-02 00:00 WIB is a whole day", () => {
    // 2026-11-01T17:00Z = 2026-11-02 00:00 in Batam.
    expect(excelDateSerial(new Date("2026-11-01T17:00:00Z"))).toBe(46328);
  });
});

describe("buildXlsx", () => {
  const file = buildXlsx({
    name: "Tiket",
    columns: [{ header: "Kode" }, { header: "Tanggal" }, { header: "Total", format: "rupiah" }],
    rows: [
      ["NGW-000001", new Date("2026-11-01T17:00:00Z"), 150000],
      ['=HYPERLINK("x") & <b>"', null, undefined],
    ],
  });
  const parts = unzip(file);
  const sheet = parts.get("xl/worksheets/sheet1.xml")!;

  it("holds every part a workbook needs", () => {
    expect([...parts.keys()].sort()).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/workbook.xml",
      "xl/worksheets/sheet1.xml",
    ]);
    expect(file.subarray(0, 2).toString()).toBe("PK");
  });

  it("writes a bold header, then typed cells", () => {
    expect(sheet).toContain('<c r="A1" t="inlineStr" s="2"><is><t xml:space="preserve">Kode</t></is></c>');
    expect(sheet).toContain('<c r="A2" t="inlineStr"><is><t xml:space="preserve">NGW-000001</t></is></c>');
    expect(sheet).toContain('<c r="B2" s="1"><v>46328</v></c>');
    expect(sheet).toContain('<c r="C2" s="3"><v>150000</v></c>');
  });

  it("keeps a formula-looking value as escaped text, and leaves empty cells out", () => {
    expect(sheet).toContain(
      '<c r="A3" t="inlineStr"><is><t xml:space="preserve">=HYPERLINK(&quot;x&quot;) &amp; &lt;b&gt;&quot;</t></is></c>',
    );
    expect(sheet).not.toContain('r="B3"');
    expect(sheet).not.toContain("<f>");
  });

  it("freezes the header and filters the whole range", () => {
    expect(sheet).toContain('state="frozen"');
    expect(sheet).toContain('<autoFilter ref="A1:C3"/>');
    expect(parts.get("xl/workbook.xml")).toContain("'Tiket'!$A$1:$C$3");
  });

  it("drops characters XML cannot carry", () => {
    const x = unzip(buildXlsx({ name: "S", columns: [{ header: "a\u0001b" }], rows: [] }));
    expect(x.get("xl/worksheets/sheet1.xml")).toContain(">ab</t>");
  });
});
