"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import { coupons } from "@/db/schema";
import { assertAdmin } from "@/lib/auth/guards";
import { COUPON_TYPES } from "@/lib/config";
import { redirectWithMessage } from "@/app/admin/_lib/redirect";

/**
 * <input type="date"> 값(YYYY-MM-DD)을 한국 시간 기준 하루의 시작/끝으로 해석한다.
 * UTC 자정으로 파싱하면 종료일이 KST 09:00 에 만료되는 문제가 있다.
 */
function parseOptionalDate(
  raw: FormDataEntryValue | null,
  edge: "start" | "end",
): Date | null | "invalid" {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "invalid";
  const date = new Date(`${raw}T${edge === "start" ? "00:00:00.000" : "23:59:59.999"}+09:00`);
  if (Number.isNaN(date.getTime())) return "invalid";
  return date;
}

const couponSchema = z.object({
  code: z.string().regex(/^[A-Z0-9]{4,20}$/, "코드는 영문 대문자·숫자 4~20자여야 합니다."),
  type: z.enum(COUPON_TYPES),
  value: z.coerce.number().int().min(0),
  minSubtotalKrw: z.coerce.number().int().min(0),
  maxUses: z.coerce.number().int().min(1).nullable(),
  perUserLimit: z.coerce.number().int().min(1),
  membersOnly: z.boolean(),
  note: z.string().max(200),
}).refine((c) => c.type !== "percent" || c.value <= 100, {
  message: "정률 할인은 100% 를 넘을 수 없습니다.",
  path: ["value"],
}).refine((c) => c.type === "free_shipping" || c.maxUses !== null, {
  // 정액·정률 쿠폰은 비회원이 이메일만 바꿔 반복 사용할 수 있으므로 전체 한도가 반드시 있어야 손실이 열리지 않는다.
  message: "정액·정률 할인 쿠폰은 전체 사용 한도(maxUses)를 반드시 정해야 합니다.",
  path: ["maxUses"],
});

export async function createCouponAction(formData: FormData) {
  await assertAdmin();

  const rawMaxUses = formData.get("maxUses");
  const maxUsesValue = typeof rawMaxUses === "string" && rawMaxUses.trim() !== "" ? rawMaxUses : null;
  const startsAt = parseOptionalDate(formData.get("startsAt"), "start");
  const endsAt = parseOptionalDate(formData.get("endsAt"), "end");
  if (startsAt === "invalid" || endsAt === "invalid") {
    redirectWithMessage("/admin/coupons", { error: "유효기간 날짜를 확인해 주세요." });
  }

  const parsed = couponSchema.safeParse({
    code: String(formData.get("code") ?? "")
      .trim()
      .toUpperCase(),
    type: formData.get("type"),
    value: formData.get("value") || "0",
    minSubtotalKrw: formData.get("minSubtotalKrw") || "0",
    maxUses: maxUsesValue,
    perUserLimit: formData.get("perUserLimit") || "1",
    membersOnly: formData.get("membersOnly") === "on",
    note: String(formData.get("note") ?? ""),
  });
  if (!parsed.success) {
    redirectWithMessage("/admin/coupons", {
      error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.",
    });
  }

  const existing = await db.query.coupons.findFirst({ where: eq(coupons.code, parsed.data.code) });
  if (existing) {
    redirectWithMessage("/admin/coupons", { error: "이미 존재하는 쿠폰 코드입니다." });
  }

  await db.insert(coupons).values({
    code: parsed.data.code,
    type: parsed.data.type,
    value: parsed.data.value,
    minSubtotalKrw: parsed.data.minSubtotalKrw,
    maxUses: parsed.data.maxUses,
    perUserLimit: parsed.data.perUserLimit,
    membersOnly: parsed.data.membersOnly,
    startsAt,
    endsAt,
    note: parsed.data.note,
    isActive: true,
  });

  revalidatePath("/admin/coupons");
  redirectWithMessage("/admin/coupons", { success: "쿠폰을 생성했습니다." });
}

export async function toggleCouponActiveAction(couponId: number, nextActive: boolean) {
  await assertAdmin();
  await db.update(coupons).set({ isActive: nextActive }).where(eq(coupons.id, couponId));
  revalidatePath("/admin/coupons");
  redirect("/admin/coupons");
}
