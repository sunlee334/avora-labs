"use server";

import { z } from "zod";
import { db } from "@/db/client";
import { notifySignups } from "@/db/schema";
import { getT } from "@/i18n/server";
import { rateLimit } from "@/lib/auth/rate-limit";
import { clientIp } from "@/lib/request-ip";
import { verifyTurnstileToken } from "@/lib/turnstile";

export interface NotifyState {
  status: "idle" | "success" | "error";
  message?: string;
}

export async function subscribeNotify(_prev: NotifyState, formData: FormData): Promise<NotifyState> {
  const { m } = await getT();
  const ip = await clientIp();
  const limit = await rateLimit(`notify:${ip}`, { limit: 10, windowMs: 10 * 60_000 });
  if (!limit.ok) {
    return { status: "error", message: m.actions.generic };
  }
  // 봇 확인(Turnstile, 키가 있을 때만). D1 에 쓰기 전에 거른다.
  if (!(await verifyTurnstileToken(String(formData.get("cf-turnstile-response") ?? "") || null, ip))) {
    return { status: "error", message: m.actions.botCheckFailed };
  }

  // 오류 문구가 요청 언어를 따르도록 스키마는 액션 안에서 만든다.
  const schema = z.object({
    email: z.email({ message: m.actions.auth.emailInvalid }).max(254),
    interest: z.string().regex(/^[a-z0-9-]{1,40}$/).default("all"),
    marketingOptIn: z.literal("on", { message: m.actions.notify.consentRequired }),
    source: z.string().regex(/^[a-z0-9-]{1,40}$/).default("site"),
  });

  const parsed = schema.safeParse({
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    interest: String(formData.get("interest") ?? "all"),
    marketingOptIn: formData.get("marketingOptIn"),
    source: String(formData.get("source") ?? "site").toLowerCase(),
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? m.actions.invalidInput };
  }

  const { email, interest, source } = parsed.data;
  try {
    await db
      .insert(notifySignups)
      .values({ email, interest, marketingOptIn: true, source })
      .onConflictDoUpdate({
        target: [notifySignups.email, notifySignups.interest],
        set: { marketingOptIn: true, unsubscribedAt: null, source },
      });
  } catch (error) {
    console.error("[notify] signup failed", error);
    return { status: "error", message: m.actions.notify.failed };
  }

  return { status: "success", message: m.actions.notify.success };
}
