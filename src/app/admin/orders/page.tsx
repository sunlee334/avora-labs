import Link from "next/link";
import { and, count, desc, eq, like, or } from "drizzle-orm";
import { BulkShippingForm } from "@/components/admin/BulkShippingForm";
import { Pagination } from "@/components/admin/Pagination";
import { OrderStatusBadge } from "@/components/ui/StatusBadge";
import { db } from "@/db/client";
import { orders } from "@/db/schema";
import { formatDateTime } from "@/lib/format";
import { formatKrw, ORDER_STATUS, ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/config";
import { buildOrderName } from "@/lib/orders";

const PAGE_SIZE = 30;

function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUS as readonly string[]).includes(value);
}

export default async function AdminOrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  const sp = await searchParams;
  const statusParam = typeof sp.status === "string" ? sp.status : undefined;
  const status = statusParam && isOrderStatus(statusParam) ? statusParam : undefined;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const page = Math.max(1, Number(typeof sp.page === "string" ? sp.page : "1") || 1);

  const conditions = [];
  if (status) conditions.push(eq(orders.status, status));
  if (q) {
    const pattern = `%${q}%`;
    conditions.push(
      or(
        like(orders.orderNumber, pattern),
        like(orders.email, pattern),
        like(orders.customerName, pattern),
      ),
    );
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalRow, rows] = await Promise.all([
    db.select({ c: count() }).from(orders).where(where).get(),
    db.query.orders.findMany({
      where,
      orderBy: [desc(orders.createdAt)],
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      with: { items: true },
    }),
  ]);
  const total = totalRow?.c ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function chipHref(nextStatus?: OrderStatus) {
    const qs = new URLSearchParams();
    if (nextStatus) qs.set("status", nextStatus);
    if (q) qs.set("q", q);
    const query = qs.toString();
    return `/admin/orders${query ? `?${query}` : ""}`;
  }

  function exportHref() {
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    const query = qs.toString();
    return `/admin/orders/export${query ? `?${query}` : ""}`;
  }

  function pageHref(nextPage: number) {
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    if (q) qs.set("q", q);
    qs.set("page", String(nextPage));
    return `/admin/orders?${qs.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="display text-2xl text-ink">주문</h1>
        <form method="GET" action="/admin/orders" className="flex items-center gap-2">
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="주문번호, 이메일, 이름 검색"
            className="h-9 w-64 rounded-md border border-line-2 bg-white px-3 text-[13px] text-ink placeholder:text-stone-2 focus:border-ink focus:outline-none"
          />
          <button type="submit" className="h-9 rounded-full bg-ink px-4 text-[13px] font-medium text-paper">
            검색
          </button>
        </form>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={chipHref(undefined)}
          className={`rounded-full border px-3.5 py-1.5 text-[12px] font-medium ${
            !status ? "border-ink bg-ink text-paper" : "border-line bg-white text-stone"
          }`}
        >
          전체
        </Link>
        {ORDER_STATUS.map((s) => (
          <Link
            key={s}
            href={chipHref(s)}
            className={`rounded-full border px-3.5 py-1.5 text-[12px] font-medium ${
              status === s ? "border-ink bg-ink text-paper" : "border-line bg-white text-stone"
            }`}
          >
            {ORDER_STATUS_LABEL[s]}
          </Link>
        ))}
        <a
          href={exportHref()}
          className="ml-auto rounded-full border border-line-2 bg-white px-3.5 py-1.5 text-[12px] font-medium text-ink hover:border-ink"
          title={status ? `${ORDER_STATUS_LABEL[status]} 주문을 CSV 로 내려받기` : "출고 대기(결제 완료·상품 준비 중) 주문을 CSV 로 내려받기"}
        >
          CSV 내보내기{status ? "" : " (출고 대기)"}
        </a>
      </div>

      <div className="rounded-lg border border-line bg-white/70 p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink">송장 일괄 등록</h2>
        <BulkShippingForm />
      </div>

      <div className="overflow-x-auto rounded-lg border border-line bg-white">
        <table className="w-full min-w-[860px] text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-stone">
              <th className="px-4 py-3 font-medium">주문번호</th>
              <th className="px-4 py-3 font-medium">일시</th>
              <th className="px-4 py-3 font-medium">고객</th>
              <th className="px-4 py-3 font-medium">상품 요약</th>
              <th className="px-4 py-3 font-medium">총액</th>
              <th className="px-4 py-3 font-medium">상태</th>
              <th className="px-4 py-3 font-medium">송장</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/orders/${o.id}`}
                    className="text-ink underline decoration-line-2 underline-offset-2 hover:text-mist-600"
                  >
                    {o.orderNumber}
                  </Link>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-stone">{formatDateTime(o.createdAt)}</td>
                <td className="px-4 py-3">
                  <div>{o.customerName}</div>
                  <div className="text-[12px] text-stone-2">{o.email}</div>
                </td>
                <td className="px-4 py-3 text-stone">{buildOrderName(o.items)}</td>
                <td className="px-4 py-3 tabular-nums">{formatKrw(o.totalKrw)}</td>
                <td className="px-4 py-3">
                  <OrderStatusBadge status={o.status} />
                </td>
                <td className="px-4 py-3 text-stone">{o.trackingNumber ?? "-"}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-stone">
                  조건에 맞는 주문이 없습니다.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <Pagination page={page} totalPages={totalPages} buildHref={pageHref} />
    </div>
  );
}
