import { count, desc, like, or, sql } from "drizzle-orm";
import { TempPasswordButton } from "@/components/admin/TempPasswordButton";
import { Badge } from "@/components/ui/Primitives";
import { db } from "@/db/client";
import { orders, users } from "@/db/schema";
import { tempPasswordState } from "@/lib/auth/temp-password";
import { formatDateTime } from "@/lib/format";
import { firstParam } from "@/lib/search-params";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  const sp = await searchParams;
  const q = firstParam(sp.q).trim().slice(0, 100);
  const pattern = `%${q.replace(/[%_]/g, "")}%`;

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="display text-2xl text-ink">회원</h1>
        <p className="text-[13px] text-stone">{q ? `검색 결과 ${totalRow?.c ?? 0}명` : `전체 ${totalRow?.c ?? 0}명`}</p>
      </div>

      <form className="flex gap-2" action="/admin/users">
        <input
          name="q"
          defaultValue={q}
          placeholder="이메일 또는 이름"
          className="w-72 rounded-md border border-line-2 bg-white px-3.5 py-2 text-[14px] text-ink focus:border-ink focus:outline-none"
        />
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
              <th className="px-4 py-3 font-medium">가입일</th>
              <th className="px-4 py-3 font-medium">비밀번호</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-line last:border-0 align-top">
                <td className="px-4 py-3">{row.email}</td>
                <td className="px-4 py-3">{row.name}</td>
                <td className="px-4 py-3 text-stone">{row.phone ?? "-"}</td>
                <td className="px-4 py-3">
                  <Badge tone={row.role === "admin" ? "accent" : "neutral"}>{row.role === "admin" ? "관리자" : "고객"}</Badge>
                </td>
                <td className="px-4 py-3 tabular-nums text-stone">{row.orderCount}건</td>
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
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-stone">
                  {q ? "검색 결과가 없습니다." : "회원이 없습니다."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {rows.length === PAGE_SIZE ? (
        <p className="text-[12px] text-stone-2">최근 {PAGE_SIZE}명만 표시합니다. 검색으로 좁혀 주세요.</p>
      ) : null}
    </div>
  );
}
