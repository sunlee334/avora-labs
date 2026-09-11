import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/db/client";
import { notifySignups } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * CSV 셀 이스케이프. 수식 인젝션(= + - @ 탭 CR로 시작하는 셀)을 막기 위해
 * 해당 문자로 시작하면 작은따옴표를 앞에 붙이고, 모든 값을 인용부호로 감싼다.
 */
function csvEscape(value: string): string {
  const neutralized = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${neutralized.replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return new Response("Forbidden", { status: 403 });
  }

  const interest = request.nextUrl.searchParams.get("interest");
  const rows = interest
    ? await db.query.notifySignups.findMany({
        where: eq(notifySignups.interest, interest),
        orderBy: (n, { desc }) => [desc(n.createdAt)],
      })
    : await db.query.notifySignups.findMany({ orderBy: (n, { desc }) => [desc(n.createdAt)] });

  const header = ["email", "interest", "source", "marketingOptIn", "createdAt", "unsubscribedAt"];
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(
      [
        csvEscape(row.email),
        csvEscape(row.interest),
        csvEscape(row.source),
        row.marketingOptIn ? "true" : "false",
        row.createdAt ? row.createdAt.toISOString() : "",
        row.unsubscribedAt ? row.unsubscribedAt.toISOString() : "",
      ].join(","),
    );
  }

  const csv = "\uFEFF" + lines.join("\n");
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  const filename = `paros-signups-${y}${m}${d}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
