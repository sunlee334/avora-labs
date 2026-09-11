import { and, asc, gte, inArray, lt } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/db/client";
import { orders } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { deliveryMemoLabel, ORDER_STATUS, ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/config";
import { csvLine } from "@/lib/csv";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const MAX_ROWS = 5_000;
/** 출고 대기: status 파라미터가 없을 때의 기본 필터 */
const DEFAULT_STATUSES: OrderStatus[] = ["paid", "preparing"];

function isOrderStatus(value: string | null): value is OrderStatus {
  return value !== null && (ORDER_STATUS as readonly string[]).includes(value);
}

/** YYYY-MM-DD (KST 자정) → Date. 잘못된 값은 undefined. */
function parseKstDate(value: string | null, endOfDay: boolean): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) return undefined;
  if (endOfDay) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

/**
 * 주문 CSV 내보내기 (택배 접수·물류 대행 전달용). 주문 한 건이 한 줄, 품목은 요약 문자열.
 * `?status=paid` 처럼 상태 하나, `?from=YYYY-MM-DD&to=YYYY-MM-DD`(KST, to 포함) 로 기간을 제한한다.
 * 상태를 주지 않으면 출고 대기(paid·preparing)만 내보낸다.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return new Response("Forbidden", { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const statusParam = params.get("status");
  const statuses = isOrderStatus(statusParam) ? [statusParam] : DEFAULT_STATUSES;
  const from = parseKstDate(params.get("from"), false);
  const to = parseKstDate(params.get("to"), true);

  const conditions = [inArray(orders.status, statuses)];
  if (from) conditions.push(gte(orders.createdAt, from));
  if (to) conditions.push(lt(orders.createdAt, to));

  const rows = await db.query.orders.findMany({
    where: conditions.length === 1 ? conditions[0] : and(...conditions),
    orderBy: [asc(orders.createdAt)],
    limit: MAX_ROWS,
    with: { items: true },
  });

  const header = [
    "주문번호",
    "주문일시",
    "상태",
    "수령인",
    "연락처",
    "우편번호",
    "주소1",
    "주소2",
    "배송메모",
    "품목",
    "총수량",
    "결제금액",
    "주문자이메일",
    "택배사",
    "송장번호",
  ];
  const lines = [csvLine(header)];
  for (const order of rows) {
    const items = order.items.map((i) => `${i.productName} ${i.variantName} ×${i.qty}`).join("; ");
    const qty = order.items.reduce((sum, i) => sum + i.qty, 0);
    lines.push(
      csvLine([
        order.orderNumber,
        formatDateTime(order.createdAt),
        ORDER_STATUS_LABEL[order.status],
        order.recipientName,
        order.recipientPhone,
        order.postalCode,
        order.address1,
        order.address2,
        deliveryMemoLabel(order.deliveryMemo),
        items,
        qty,
        order.totalKrw,
        order.email,
        order.trackingCarrier ?? "",
        order.trackingNumber ?? "",
      ]),
    );
  }

  const csv = "﻿" + lines.join("\r\n") + "\r\n";
  const today = new Date();
  const stamp = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
  const filename = `paros-orders-${statuses.join("-")}-${stamp}.csv`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
