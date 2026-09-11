import { count, desc, like, or, sql } from "drizzle-orm";
import { TempPasswordButton } from "@/components/admin/TempPasswordButton";
import { Badge } from "@/components/ui/Primitives";
import { db } from "@/db/client";
import { orders, users } from "@/db/schema";
import { tempPasswordState } from "@/lib/auth/temp-password";
import { formatDateTime } from "@/lib/format";
import { firstParam } from "@/lib/search-params";
import { isCustomerSegment, loadSegmentsForUsers, SEGMENT_LABEL, SEGMENTS, type CustomerSegment } from "@/lib/segments";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  const sp = await searchParams;
  const q = firstParam(sp.q).trim().slice(0, 100);
  const pattern = `%${q.replace(/[%_]/g, "")}%`;
  const rawSegment = firstParam(sp.segment);
  const segmentFilter: CustomerSegment | null = isCustomerSegment(rawSegment) ? rawSegment : null;

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      phone: users.phone,
      role: users.role,
      createdAt: users.createdAt,
      passwordResetRequired: users.passwordResetRequired,
      tempPasswordExpiresAt: users.tempPasswordExpiresAt,
      orderCount: sql<number>`(select count(*) from ${orders} where ${orders.userId} = ${users.id} and ${orders.status} in ('paid','preparing','shipped','delivered'))`,
    })
    .from(users)
    .where(q ? or(like(users.email, pattern), like(users.name, pattern)) : undefined)
    .orderBy(desc(users.createdAt))
    .limit(PAGE_SIZE);
  const [totalRow] = await db
    .select({ c: count() })
    .from(users)
    .where(q ? or(like(users.email, pattern), like(users.name, pattern)) : undefined);
  const now = new Date();
  // 세그먼트는 이 페이지에 실린 회원(≤50명)에 대해서만 그룹 쿼리 두 번으로 계산한다.
  const segments = await loadSegmentsForUsers(rows.map((r) => r.id));
  const visibleRows = segmentFilter ? rows.filter((r) => (segments.get(r.id) ?? "new") === segmentFilter) : rows;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="display text-2xl text-ink">회원</h1>
        <p className="text-[13px] text-stone">{q ? `검색 결과 ${totalRow?.c ?? 0}명` : `전체 ${totalRow?.c ?? 0}명`}</p>
      </div>

      <form className="flex flex-wrap gap-2" action="/admin/users">
        <input
          name="q"
          defaultValue={q}
          placeholder="이메일 또는 이름"
          className="w-72 rounded-md border border-line-2 bg-white px-3.5 py-2 text-[14px] text-ink focus:border-ink focus:outline-none"
        />
        <select
          name="segment"
          defaultValue={segmentFilter ?? ""}
          aria-label="세그먼트"
          className="rounded-md border border-line-2 bg-white px-3 py-2 text-[14px] text-ink focus:border-ink focus:outline-none"
        >
          <option value="">세그먼트 전체</option>
          {SEGMENTS.map((seg) => (
            <option key={seg} value={seg}>
              {SEGMENT_LABEL[seg]}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-paper">
          검색
        </button>
      </form>

      <div className="overflow-x-auto rounded-lg border border-line bg-white">
        <table className="w-full min-w-[760px] text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-stone">
              <th className="px-4 py-3 font-medium">이메일</th>
              <th className="px-4 py-3 font-medium">이름</th>
              <th className="px-4 py-3 font-medium">연락처</th>
              <th className="px-4 py-3 font-medium">역할</th>
              <th className="px-4 py-3 font-medium">구매</th>
              <th className="px-4 py-3 font-medium">세그먼트</th>
              <th className="px-4 py-3 font-medium">가입일</th>
              <th className="px-4 py-3 font-medium">비밀번호</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.id} className="border-b border-line last:border-0 align-top">
                <td className="px-4 py-3">{row.email}</td>
                <td className="px-4 py-3">{row.name}</td>
                <td className="px-4 py-3 text-stone">{row.phone ?? "-"}</td>
                <td className="px-4 py-3">
                  <Badge tone={row.role === "admin" ? "accent" : "neutral"}>{row.role === "admin" ? "관리자" : "고객"}</Badge>
                </td>
                <td className="px-4 py-3 tabular-nums text-stone">{row.orderCount}건</td>
                <td className="px-4 py-3">
                  {(() => {
                    const seg = segments.get(row.id) ?? "new";
                    return <Badge tone={seg === "funding" ? "accent" : seg === "set" ? "mist" : seg === "single" ? "success" : "neutral"}>{SEGMENT_LABEL[seg]}</Badge>;
                  })()}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-stone">{formatDateTime(row.createdAt)}</td>
                <td className="px-4 py-3">
                  {row.passwordResetRequired ? (
                    <p className="mb-1 text-[12px] text-stone">
                      {tempPasswordState(row, now) === "expired"
                        ? "임시 비밀번호 만료 — 다시 발급 필요"
                        : `임시 비밀번호 사용 중 · ${formatDateTime(row.tempPasswordExpiresAt)} 까지`}
                    </p>
                  ) : null}
                  <TempPasswordButton userId={row.id} />
                </td>
              </tr>
            ))}
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-stone">
                  {q || segmentFilter ? "조건에 맞는 회원이 없습니다." : "회원이 없습니다."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {rows.length === PAGE_SIZE ? (
        <p className="text-[12px] text-stone-2">
          최근 {PAGE_SIZE}명만 표시합니다. 검색으로 좁혀 주세요.{segmentFilter ? " 세그먼트 필터는 표시된 회원 안에서만 적용됩니다." : ""}
        </p>
      ) : null}
      <p className="text-[12px] text-stone-2">
        세그먼트 우선순위: 펀딩 참여(WITHPAROS 코드 사용) → 세트 구매 → 단품 구매 → 미구매. 재구매 문안을 나눌 때의 기준입니다.
      </p>
    </div>
  );
}
