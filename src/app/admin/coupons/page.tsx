import { Button } from "@/components/ui/Button";
import { FormMessage, Input, Label, Select, Textarea } from "@/components/ui/Field";
import { Badge, Card } from "@/components/ui/Primitives";
import { count } from "drizzle-orm";
import { Pagination } from "@/components/admin/Pagination";
import { db } from "@/db/client";
import { coupons } from "@/db/schema";
import { formatDate } from "@/lib/format";
import { COUPON_TYPES, formatKrw, type CouponType } from "@/lib/config";
import { firstParam } from "@/lib/search-params";
import { createCouponAction, toggleCouponActiveAction } from "./actions";

const PAGE_SIZE = 30;

const COUPON_TYPE_LABEL: Record<CouponType, string> = {
  free_shipping: "무료배송",
  amount: "정액 할인",
  percent: "정률 할인",
};

function formatValue(type: CouponType, value: number): string {
  if (type === "free_shipping") return "배송비 면제";
  if (type === "percent") return `${value}%`;
  return formatKrw(value);
}

export default async function AdminCouponsPage({ searchParams }: PageProps<"/admin/coupons">) {
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : undefined;
  const success = typeof sp.success === "string" ? sp.success : undefined;

  const requestedPage = Math.max(1, Number.parseInt(firstParam(sp.page) || "1", 10) || 1);
  const totalRow = await db.select({ c: count() }).from(coupons).get();
  const totalPages = Math.max(1, Math.ceil((totalRow?.c ?? 0) / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const couponRows = await db.query.coupons.findMany({
    orderBy: (c, { desc }) => [desc(c.createdAt)],
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const pageHref = (p: number) => (p > 1 ? `/admin/coupons?page=${p}` : "/admin/coupons");

  return (
    <div className="space-y-6">
      <h1 className="display text-2xl text-ink">쿠폰</h1>
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
      {success ? <FormMessage tone="success">{success}</FormMessage> : null}

      <Card>
        <h2 className="mb-4 text-[13px] font-semibold text-charcoal">새 쿠폰 만들기</h2>
        <form action={createCouponAction} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="code" hint="영문 대문자·숫자 4~20자">
              코드
            </Label>
            <Input id="code" name="code" required maxLength={20} className="uppercase" />
          </div>
          <div>
            <Label htmlFor="type">유형</Label>
            <Select id="type" name="type" defaultValue="amount">
              {COUPON_TYPES.map((t) => (
                <option key={t} value={t}>
                  {COUPON_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="value" hint="정액(원) · 정률(%). 무료배송은 0">
              값
            </Label>
            <Input id="value" name="value" type="number" min={0} defaultValue={0} />
          </div>
          <div>
            <Label htmlFor="minSubtotalKrw">최소 주문금액(원)</Label>
            <Input id="minSubtotalKrw" name="minSubtotalKrw" type="number" min={0} defaultValue={0} />
          </div>
          <div>
            <Label htmlFor="maxUses" hint="비우면 무제한">
              전체 사용 한도
            </Label>
            <Input id="maxUses" name="maxUses" type="number" min={1} />
          </div>
          <div>
            <Label htmlFor="perUserLimit">회원당 사용 한도</Label>
            <Input id="perUserLimit" name="perUserLimit" type="number" min={1} defaultValue={1} />
          </div>
          <div>
            <Label htmlFor="startsAt" hint="비우면 즉시 시작">
              시작일
            </Label>
            <Input id="startsAt" name="startsAt" type="date" />
          </div>
          <div>
            <Label htmlFor="endsAt" hint="비우면 무기한">
              종료일
            </Label>
            <Input id="endsAt" name="endsAt" type="date" />
          </div>
          <div className="sm:col-span-3">
            <Label htmlFor="note">메모</Label>
            <Textarea id="note" name="note" rows={2} />
          </div>
          <div className="sm:col-span-3">
            <label className="inline-flex items-center gap-2 text-[13px] text-charcoal">
              <input type="checkbox" name="membersOnly" className="h-4 w-4 accent-ink" />
              회원 전용 (비회원 주문에서는 사용 불가 — 이메일만 바꿔 반복 사용하는 것을 막습니다)
            </label>
          </div>
          <div className="sm:col-span-3">
            <Button type="submit">쿠폰 생성</Button>
          </div>
        </form>
      </Card>

      <div className="overflow-x-auto rounded-lg border border-line bg-white">
        <table className="w-full min-w-[900px] text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-stone">
              <th className="px-4 py-3 font-medium">코드</th>
              <th className="px-4 py-3 font-medium">유형 / 값</th>
              <th className="px-4 py-3 font-medium">최소 주문금액</th>
              <th className="px-4 py-3 font-medium">사용</th>
              <th className="px-4 py-3 font-medium">기간</th>
              <th className="px-4 py-3 font-medium">상태</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {couponRows.map((coupon) => (
              <tr key={coupon.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 font-medium text-ink">
                  {coupon.code}
                  {coupon.membersOnly ? (
                    <span className="ml-2 align-middle">
                      <Badge tone="mist">회원 전용</Badge>
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-stone">
                  {COUPON_TYPE_LABEL[coupon.type]} · {formatValue(coupon.type, coupon.value)}
                </td>
                <td className="px-4 py-3 tabular-nums">{formatKrw(coupon.minSubtotalKrw)}</td>
                <td className="px-4 py-3 tabular-nums">
                  {coupon.usedCount} / {coupon.maxUses ?? "무제한"}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-stone">
                  {coupon.startsAt ? formatDate(coupon.startsAt) : "즉시"} ~ {coupon.endsAt ? formatDate(coupon.endsAt) : "무기한"}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={coupon.isActive ? "success" : "neutral"}>
                    {coupon.isActive ? "사용 중" : "비활성"}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <form action={toggleCouponActiveAction.bind(null, coupon.id, !coupon.isActive)}>
                    <Button type="submit" size="sm" variant="ghost">
                      {coupon.isActive ? "비활성화" : "활성화"}
                    </Button>
                  </form>
                </td>
              </tr>
            ))}
            {couponRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-stone">
                  등록된 쿠폰이 없습니다.
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
