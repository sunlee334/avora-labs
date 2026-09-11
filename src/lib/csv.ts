/**
 * CSV 유틸 (순수 함수, DB 없음). 관리자 주문 내보내기와 송장 일괄 등록이 함께 쓴다.
 */

/**
 * 셀 이스케이프. 모든 값을 큰따옴표로 감싸고 내부 따옴표는 두 번 쓴다.
 * 수식 인젝션 방지: = + - @ 탭 CR 로 시작하는 값 앞에 작은따옴표를 붙여 스프레드시트가 수식으로 해석하지 못하게 한다.
 */
export function csvEscape(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  const neutralized = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${neutralized.replace(/"/g, '""')}"`;
}

export function csvLine(cells: ReadonlyArray<string | number | null | undefined>): string {
  return cells.map(csvEscape).join(",");
}

/** RFC 4180 식 한 줄 파싱 (큰따옴표 안의 쉼표·따옴표 처리). 줄 안의 개행은 지원하지 않는다. */
export function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      cells.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

export interface TrackingRow {
  line: number;
  orderNumber: string;
  carrier: string | null;
  trackingNumber: string;
}

export interface TrackingParseResult {
  rows: TrackingRow[];
  errors: { line: number; reason: string }[];
  /** 상한을 넘겨 버린 줄 수 */
  truncated: number;
}

export const TRACKING_CSV_MAX_ROWS = 2_000;

/**
 * 송장 CSV 파싱. 헤더 `orderNumber,carrier,trackingNumber` (carrier 는 비워도 됨). BOM·CRLF·빈 줄·헤더 대소문자 허용.
 * 형식 검증만 한다 — 주문 존재·상태 검사는 DB 를 아는 쪽(bulkMarkShipped)이 한다.
 */
export function parseTrackingCsv(text: string, maxRows = TRACKING_CSV_MAX_ROWS): TrackingParseResult {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const rows: TrackingRow[] = [];
  const errors: { line: number; reason: string }[] = [];
  let truncated = 0;
  let headerIndex: { orderNumber: number; carrier: number; trackingNumber: number } | null = null;

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    if (raw.trim() === "") continue;
    const cells = parseCsvLine(raw);
    const lineNo = i + 1;

    if (!headerIndex) {
      const lower = cells.map((c) => c.toLowerCase().replace(/[\s_-]/g, ""));
      const idx = {
        orderNumber: lower.findIndex((c) => c === "ordernumber" || c === "주문번호"),
        carrier: lower.findIndex((c) => c === "carrier" || c === "택배사"),
        trackingNumber: lower.findIndex((c) => c === "trackingnumber" || c === "송장번호"),
      };
      if (idx.orderNumber === -1 || idx.trackingNumber === -1) {
        errors.push({ line: lineNo, reason: "헤더에 orderNumber 와 trackingNumber 가 있어야 합니다." });
        return { rows, errors, truncated };
      }
      headerIndex = idx;
      continue;
    }

    if (rows.length >= maxRows) {
      truncated += 1;
      continue;
    }
    const orderNumber = (cells[headerIndex.orderNumber] ?? "").toUpperCase();
    const trackingNumber = (cells[headerIndex.trackingNumber] ?? "").replace(/[\s-]/g, "");
    const carrierRaw = headerIndex.carrier === -1 ? "" : (cells[headerIndex.carrier] ?? "");
    if (!orderNumber) {
      errors.push({ line: lineNo, reason: "주문번호가 비어 있습니다." });
      continue;
    }
    if (!trackingNumber) {
      errors.push({ line: lineNo, reason: "송장번호가 비어 있습니다." });
      continue;
    }
    if (trackingNumber.length > 40) {
      errors.push({ line: lineNo, reason: "송장번호가 40자를 넘습니다." });
      continue;
    }
    rows.push({ line: lineNo, orderNumber, carrier: carrierRaw.trim() || null, trackingNumber });
  }

  if (!headerIndex) errors.push({ line: 0, reason: "비어 있는 파일입니다." });
  return { rows, errors, truncated };
}
