"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { affectedRows } from "@/db/affected";
import { db } from "@/db/client";
import { products, variants } from "@/db/schema";
import { assertAdmin } from "@/lib/auth/guards";
import { PRODUCT_STATUS } from "@/lib/config";
import { redirectWithMessage } from "@/app/admin/_lib/redirect";

function revalidateCatalog() {
  // 스토어 라우트는 [locale] 세그먼트 아래에 있으므로 라우트 패턴으로 모든 언어를 한 번에 무효화한다.
  revalidatePath("/[locale]", "page");
  revalidatePath("/[locale]/shop", "page");
  revalidatePath("/[locale]/products/[slug]", "page");
  revalidatePath("/admin/products");
}

const variantSchema = z.object({
  priceKrw: z.coerce.number().int().min(0),
  compareAtKrw: z.coerce.number().int().min(0).nullable(),
  stock: z.coerce.number().int().min(0),
  /** 화면을 열었을 때의 재고. 그 사이 결제가 차감했다면 저장을 거부한다 (덮어쓰기 방지). */
  expectedStock: z.coerce.number().int().min(0),
  isActive: z.literal("on").optional(),
});

export async function updateVariantAction(variantId: number, formData: FormData) {
  await assertAdmin();
  const rawCompareAt = formData.get("compareAtKrw");
  const compareAtValue =
    typeof rawCompareAt === "string" && rawCompareAt.trim() !== "" ? rawCompareAt : null;

  const parsed = variantSchema.safeParse({
    priceKrw: formData.get("priceKrw"),
    compareAtKrw: compareAtValue,
    stock: formData.get("stock"),
    expectedStock: formData.get("expectedStock"),
    isActive: formData.get("isActive") ?? undefined,
  });
  if (!parsed.success) {
    redirectWithMessage("/admin/products", { error: "변형 정보를 확인해 주세요." });
  }

  const variant = await db.query.variants.findFirst({
    where: eq(variants.id, variantId),
    with: { product: true },
  });
  if (!variant) {
    redirectWithMessage("/admin/products", { error: "변형을 찾을 수 없습니다." });
  }

  // 재고는 결제 승인이 동시에 차감할 수 있는 값이다. 화면에 있던 값과 같을 때만 저장해 lost update 를 막는다.
  const result = await db
    .update(variants)
    .set({
      priceKrw: parsed.data.priceKrw,
      compareAtKrw: parsed.data.compareAtKrw,
      stock: parsed.data.stock,
      isActive: Boolean(parsed.data.isActive),
    })
    .where(and(eq(variants.id, variantId), eq(variants.stock, parsed.data.expectedStock)))
    .run();
  if (affectedRows(result) === 0) {
    redirectWithMessage("/admin/products", {
      error: `${variant.name}: 저장하는 사이 재고가 바뀌었습니다(결제 차감 등). 새로고침 후 현재 재고를 확인하고 다시 저장해 주세요.`,
    });
  }

  revalidateCatalog();
  redirectWithMessage("/admin/products", { success: "변형 정보를 저장했습니다." });
}

const productSchema = z.object({
  status: z.enum(PRODUCT_STATUS),
  launchLabel: z.string().max(60),
});

export async function updateProductAction(productId: number, formData: FormData) {
  await assertAdmin();
  const parsed = productSchema.safeParse({
    status: formData.get("status"),
    launchLabel: String(formData.get("launchLabel") ?? ""),
  });
  if (!parsed.success) {
    redirectWithMessage("/admin/products", { error: "상품 정보를 확인해 주세요." });
  }

  const product = await db.query.products.findFirst({ where: eq(products.id, productId) });
  if (!product) {
    redirectWithMessage("/admin/products", { error: "상품을 찾을 수 없습니다." });
  }

  await db
    .update(products)
    .set({ status: parsed.data.status, launchLabel: parsed.data.launchLabel, updatedAt: new Date() })
    .where(eq(products.id, productId));

  revalidateCatalog();
  redirectWithMessage("/admin/products", { success: "상품 정보를 저장했습니다." });
}
