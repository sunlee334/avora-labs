import Link from "next/link";
import { OrderStatusBadge } from "@/components/ui/StatusBadge";
import { Card } from "@/components/ui/Primitives";
import { formatKrw } from "@/lib/config";
import { formatPercent, getAdminDashboardMetrics } from "@/lib/admin/metrics";
import { formatDateTime } from "@/lib/format";

export default async function AdminDashboardPage() {
  const m = await getAdminDashboardMetrics();

  const stockBreakdown = m.stock.variants
    .map((v) => `${v.variantName} ${v.stock.toLocaleString("ko-KR")}`)
    .join(" · ");

  const cards: { label: string; value: string; sub?: string }[] = [
    { label: "오늘 주문", value: `${m.today.orders}건`, sub: formatKrw(m.today.salesKrw) },
    { label: "이번 달 주문", value: `${m.month.orders}건`, sub: formatKrw(m.month.salesKrw) },
    { label: "결제 완료 후 미출고", value: `${m.awaitingShipment}건` },
    { label: "재고 합계", value: `${m.stock.total.toLocaleString("ko-KR")}개`, sub: stockBreakdown || undefined },
    {
      label: "리뷰",
      value: `${m.reviews.count}건`,
      sub: m.reviews.count > 0 ? `평균 ${m.reviews.average.toFixed(1)}점` : undefined,
    },
    { label: "알림 신청자", value: `${m.notifySignups}명` },
    { label: "활성 장바구니", value: `${m.activeCarts}개`, sub: "최근 7일 기준" },
  ];

  const managementCards: { label: string; value: string; note?: string }[] = [
    { label: "세트 구매 비중", value: formatPercent(m.setShareRatio) },
    { label: "재구매율", value: formatPercent(m.repeatPurchaseRatio) },
    { label: "장바구니 이탈률", value: formatPercent(m.cartAbandonmentRatio), note: "근사치" },
  ];

  return (
    <div className="space-y-10">
      <div>
        <h1 className="display text-2xl text-ink">대시보드</h1>
        <p className="mt-1 text-[13px] text-stone">{formatDateTime(new Date())} 기준</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} className="p-5">
            <p className="text-[12px] text-stone">{c.label}</p>
            <p className="mt-2 text-xl font-semibold text-ink">{c.value}</p>
            {c.sub ? <p className="mt-1 text-[12px] text-stone-2">{c.sub}</p> : null}
          </Card>
        ))}
      </div>

      <div>
        <h2 className="mb-3 text-[13px] font-semibold text-charcoal">관리 지표</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {managementCards.map((c) => (
            <Card key={c.label} className="p-5">
              <p className="text-[12px] text-stone">
                {c.label}
                {c.note ? <span className="ml-1.5 text-stone-2">({c.note})</span> : null}
              </p>
              <p className="mt-2 text-xl font-semibold text-ink">{c.value}</p>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-charcoal">최근 주문</h2>
          <Link href="/admin/orders" className="text-[13px] text-stone hover:text-ink">
            전체 보기
          </Link>
        </div>
        <div className="overflow-x-auto rounded-lg border border-line bg-white">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-stone">
                <th className="px-4 py-3 font-medium">주문번호</th>
                <th className="px-4 py-3 font-medium">일시</th>
                <th className="px-4 py-3 font-medium">고객</th>
                <th className="px-4 py-3 font-medium">상품</th>
                <th className="px-4 py-3 font-medium">총액</th>
                <th className="px-4 py-3 font-medium">상태</th>
              </tr>
            </thead>
            <tbody>
              {m.recentOrders.map((o) => (
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
                  <td className="px-4 py-3">{o.customerName}</td>
                  <td className="px-4 py-3 text-stone">{o.summary}</td>
                  <td className="px-4 py-3 tabular-nums">{formatKrw(o.totalKrw)}</td>
                  <td className="px-4 py-3">
                    <OrderStatusBadge status={o.status} />
                  </td>
                </tr>
              ))}
              {m.recentOrders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-stone">
                    주문이 없습니다.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
