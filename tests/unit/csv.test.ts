import { describe, expect, it } from "vitest";
import { csvEscape, csvLine, parseCsvLine, parseTrackingCsv, TRACKING_CSV_MAX_ROWS } from "@/lib/csv";

describe("csvEscape / csvLine", () => {
  it("quotes every cell and doubles inner quotes", () => {
    expect(csvEscape('서울 "마포"')).toBe('"서울 ""마포"""');
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape("줄\n바꿈")).toBe('"줄\n바꿈"');
    expect(csvEscape(null)).toBe('""');
    expect(csvEscape(32000)).toBe('"32000"');
  });

  it("neutralizes spreadsheet formula injection", () => {
    for (const bad of ["=SUM(A1)", "+1", "-1", "@cmd", "\tx", "\rx"]) {
      expect(csvEscape(bad)).toBe(`"'${bad}"`);
    }
    // 전화번호처럼 숫자로 시작하는 값은 건드리지 않는다
    expect(csvEscape("01012345678")).toBe('"01012345678"');
  });

  it("joins a line", () => {
    expect(csvLine(["a", "b,c", ""])).toBe('"a","b,c",""');
  });
});

describe("parseCsvLine", () => {
  it("handles quoted commas and escaped quotes", () => {
    expect(parseCsvLine('PR-1,"CJ대한통운, 본사","12""34"')).toEqual(["PR-1", "CJ대한통운, 본사", '12"34']);
    expect(parseCsvLine(" a , b ")).toEqual(["a", "b"]);
  });
});

describe("parseTrackingCsv", () => {
  it("parses BOM + CRLF + Korean/English headers and defaults carrier to null", () => {
    const text = "﻿orderNumber,carrier,trackingNumber\r\npr-20260912-abc123,,1234-5678-90\r\nPR-20260912-DEF456,한진,555 666\r\n\r\n";
    const parsed = parseTrackingCsv(text);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toEqual([
      { line: 2, orderNumber: "PR-20260912-ABC123", carrier: null, trackingNumber: "1234567890" },
      { line: 3, orderNumber: "PR-20260912-DEF456", carrier: "한진", trackingNumber: "555666" },
    ]);
    const korean = parseTrackingCsv("주문번호,송장번호\nPR-20260912-ABC123,999");
    expect(korean.rows[0]).toMatchObject({ orderNumber: "PR-20260912-ABC123", trackingNumber: "999", carrier: null });
  });

  it("reports malformed rows without dropping the good ones", () => {
    const parsed = parseTrackingCsv("orderNumber,carrier,trackingNumber\n,,123\nPR-1,,\nPR-2,,ok1");
    expect(parsed.rows.map((r) => r.orderNumber)).toEqual(["PR-2"]);
    expect(parsed.errors.map((e) => e.line)).toEqual([2, 3]);
  });

  it("rejects a file without the required headers or with no content", () => {
    expect(parseTrackingCsv("foo,bar\n1,2").errors[0].reason).toContain("orderNumber");
    expect(parseTrackingCsv("").errors[0].reason).toContain("비어");
  });

  it("caps the number of rows", () => {
    const lines = ["orderNumber,trackingNumber"];
    for (let i = 0; i < TRACKING_CSV_MAX_ROWS + 5; i += 1) lines.push(`PR-20260912-${String(i).padStart(6, "0")},${i}`);
    const parsed = parseTrackingCsv(lines.join("\n"));
    expect(parsed.rows).toHaveLength(TRACKING_CSV_MAX_ROWS);
    expect(parsed.truncated).toBe(5);
  });
});
