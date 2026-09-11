import Link from "next/link";
import { count, desc, eq } from "drizzle-orm";
import { Pagination } from "@/components/admin/Pagination";
import { Badge } from "@/components/ui/Primitives";
import { db } from "@/db/client";
import { notifySignups } from "@/db/schema";
import { formatDateTime } from "@/lib/format";
import { firstParam } from "@/lib/search-params";

const PAGE_SIZE = 50;

export default async function AdminSignupsPage({ searchParams }: PageProps<"/admin/signups">) {
  const sp = await searchParams;
  const rawInterest = firstParam(sp.interest);
  const interest = /^[a-z0-9-]{1,40}$/.test(rawInterest) ? rawInterest : undefined;
  const requestedPage = Math.max(1, Number.parseInt(firstParam(sp.page) || "1", 10) || 1);

  // 전량 조회 후 JS 필터 대신 DB 에서 걸러 페이지 단위로 읽는다 (신청이 수천 건이어도 화면이 버틴다).
  const where = interest ? eq(notifySignups.interest, interest) : undefined;
  const [totalRow, interestRows] = await Promise.all([
    db.select({ c: count() }).from(notifySignups).where(where).get(),
    db.selectDistinct({ interest: notifySignups.interest }).from(notifySignups).orderBy(notifySignups.interest),
  ]);
  const total = totalRow?.c ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // 범위를 넘는 page 로 거대 offset 스캔을 시키지 못하게 잘라낸다.
  const page = Math.min(requestedPage, totalPages);
  const rows = await db
    .select()
    .from(notifySignups)
    .where(where)
    .orderBy(desc(notifySignups.createdAt))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);
  const interests = interestRows.map((r) => r.interest);

  function chipHref(next?: string) {
    return next ? `/admin/signups?interest=${encodeURIComponent(next)}` : "/admin/signups";
  }
  function pageHref(p: number) {
    const params = new URLSearchParams();
    if (interest) params.set("interest", interest);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/admin/signups?${qs}` : "/admin/signups";
  }

  const exportHref = interest
    ? `/admin/signups/export?interest=${encodeURIComponent(interest)}`
    : "/admin/signups/export";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="display text-2xl text-ink">
          알림 신청 <span className="ml-2 text-base font-normal text-stone">{total}건</span>
        </h1>
        <Link
          href={exportHref}
          className="rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-paper"
        >
          CSV 내보내기
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href={chipHref(undefined)}
          className={`rounded-full border px-3.5 py-1.5 text-[12px] font-medium ${
            !interest ? "border-ink bg-ink text-paper" : "border-line bg-white text-stone"
          }`}
        >
          전체
        </Link>
        {interests.map((i) => (
          <Link
            key={i}
            href={chipHref(i)}
            className={`rounded-full border px-3.5 py-1.5 text-[12px] font-medium ${
              interest === i ? "border-ink bg-ink text-paper" : "border-line bg-white text-stone"
            }`}
          >
            {i}
          </Link>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-line bg-white">
        <table className="w-full min-w-[720px] text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-stone">
              <th className="px-4 py-3 font-medium">이메일</th>
              <th className="px-4 py-3 font-medium">관심 제품</th>
              <th className="px-4 py-3 font-medium">유입 경로</th>
              <th className="px-4 py-3 font-medium">수신 동의</th>
              <th className="px-4 py-3 font-medium">신청일</th>
              <th className="px-4 py-3 font-medium">수신 거부</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3">{row.email}</td>
                <td className="px-4 py-3 text-stone">{row.interest}</td>
                <td className="px-4 py-3 text-stone">{row.source}</td>
                <td className="px-4 py-3">
                  <Badge tone={row.marketingOptIn ? "success" : "neutral"}>
                    {row.marketingOptIn ? "동의" : "미동의"}
                  </Badge>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-stone">{formatDateTime(row.createdAt)}</td>
                <td className="px-4 py-3 text-stone">
                  {row.unsubscribedAt ? formatDateTime(row.unsubscribedAt) : "-"}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-stone">
                  신청 내역이 없습니다.
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
