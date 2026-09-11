"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { reviews } from "@/db/schema";
import { assertAdmin } from "@/lib/auth/guards";
import { redirectWithMessage } from "@/app/admin/_lib/redirect";

const replySchema = z.object({
  reply: z.string().trim().min(1, "답글 내용을 입력해 주세요.").max(1000),
});

export async function replyReviewAction(reviewId: number, formData: FormData) {
  await assertAdmin();
  const parsed = replySchema.safeParse({ reply: String(formData.get("reply") ?? "") });
  if (!parsed.success) {
    redirectWithMessage("/admin/reviews", {
      error: parsed.error.issues[0]?.message ?? "답글 내용을 확인해 주세요.",
    });
  }

  const review = await db.query.reviews.findFirst({
    where: eq(reviews.id, reviewId),
    with: { product: true },
  });
  if (!review) {
    redirectWithMessage("/admin/reviews", { error: "리뷰를 찾을 수 없습니다." });
  }

  await db
    .update(reviews)
    .set({ adminReply: parsed.data.reply, adminRepliedAt: new Date() })
    .where(eq(reviews.id, reviewId));

  revalidatePath("/[locale]/products/[slug]", "page");
  revalidatePath("/[locale]", "page");
  revalidatePath("/admin/reviews");
  redirectWithMessage("/admin/reviews", { success: "답글을 저장했습니다." });
}
