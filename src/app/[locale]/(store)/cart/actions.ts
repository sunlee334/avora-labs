"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { cartItems, variants } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { addToCart, MAX_QTY_PER_LINE, setCartItemQty } from "@/lib/cart";
import { CART_COOKIE, SALES_OPEN } from "@/lib/config";
import { cookies } from "next/headers";
import { fill } from "@/i18n/format";
import { getT } from "@/i18n/server";

export interface CartActionState {
  ok: boolean;
  message: string;
  itemCount: number;
}

const addSchema = z.object({
  variantId: z.number().int().positive(),
  qty: z.number().int().min(1).max(MAX_QTY_PER_LINE),
});

const lineIdSchema = z.number().int().positive();
const qtySchema = z.number().int().min(0).max(MAX_QTY_PER_LINE);

function refresh() {
  // 언어 접두사와 무관하게 모든 언어의 장바구니·주문서를 갱신한다.
  revalidatePath("/[locale]/cart", "page");
  revalidatePath("/[locale]/checkout", "page");
  revalidatePath("/", "layout");
}

async function currentItemCount(): Promise<number> {
  try {
    const cartId = (await cookies()).get(CART_COOKIE)?.value;
    if (!cartId) return 0;
    const row = await db
      .select({ n: sql<number>`coalesce(sum(${cartItems.qty}), 0)` })
      .from(cartItems)
      .where(eq(cartItems.cartId, cartId))
      .get();
    return Number(row?.n ?? 0);
  } catch {
    return 0;
  }
}

/** DB 오류를 에러 경계(제품 페이지 전체)로 올리지 않고 인라인 메시지로 돌려준다. */
async function guarded(run: () => Promise<CartActionState>): Promise<CartActionState> {
  try {
    return await run();
  } catch (error) {
    // redirect()/notFound() 는 예외로 구현돼 있다. 삼키면 안 되므로 그대로 올린다.
    const digest = (error as { digest?: unknown })?.digest;
    if (typeof digest === "string" && (digest.startsWith("NEXT_") || digest === "DYNAMIC_SERVER_USAGE")) throw error;
    console.error("[cart] action failed", error);
    const { m } = await getT();
    return { ok: false, message: m.actions.cart.failed, itemCount: await currentItemCount() };
  }
}

/** 장바구니 담기. 판매 상태·재고를 서버에서 다시 확인한다. */
export async function addToCartAction(input: {
  variantId: number;
  qty: number;
}): Promise<CartActionState> {
  return guarded(() => addToCartUnguarded(input));
}

async function addToCartUnguarded(input: { variantId: number; qty: number }): Promise<CartActionState> {
  const { m } = await getT();
  if (!SALES_OPEN) {
    return { ok: false, message: m.actions.cart.salesClosed, itemCount: await currentItemCount() };
  }
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: m.actions.invalidInput, itemCount: await currentItemCount() };
  }
  const { variantId, qty } = parsed.data;

  const variant = await db.query.variants.findFirst({
    where: eq(variants.id, variantId),
    with: { product: true },
  });
  if (!variant || !variant.isActive || variant.product.status !== "on_sale") {
    return { ok: false, message: m.actions.cart.notForSale, itemCount: await currentItemCount() };
  }
  if (variant.stock <= 0) {
    return { ok: false, message: m.actions.cart.soldOut, itemCount: await currentItemCount() };
  }

  const user = await getCurrentUser();
  const cartId = (await cookies()).get(CART_COOKIE)?.value;
  const existing = cartId
    ? await db.query.cartItems.findFirst({
        where: and(eq(cartItems.cartId, cartId), eq(cartItems.variantId, variantId)),
      })
    : null;
  const nextQty = (existing?.qty ?? 0) + qty;
  if (nextQty > variant.stock) {
    return {
      ok: false,
      message: fill(m.actions.cart.stockLeft, { n: variant.stock }),
      itemCount: await currentItemCount(),
    };
  }
  if (nextQty > MAX_QTY_PER_LINE) {
    return {
      ok: false,
      message: fill(m.actions.cart.maxPerLine, { n: MAX_QTY_PER_LINE }),
      itemCount: await currentItemCount(),
    };
  }

  await addToCart(variantId, qty, user?.id);
  refresh();
  return { ok: true, message: m.actions.cart.added, itemCount: await currentItemCount() };
}

/** 수량 변경. 0이면 삭제한다. */
export async function updateCartQtyAction(lineId: number, qty: number): Promise<CartActionState> {
  return guarded(() => updateCartQtyUnguarded(lineId, qty));
}

async function updateCartQtyUnguarded(lineId: number, qty: number): Promise<CartActionState> {
  const { m } = await getT();
  const parsedId = lineIdSchema.safeParse(lineId);
  const parsedQty = qtySchema.safeParse(qty);
  if (!parsedId.success || !parsedQty.success) {
    return { ok: false, message: m.actions.invalidInput, itemCount: await currentItemCount() };
  }

  const cartId = (await cookies()).get(CART_COOKIE)?.value;
  if (!cartId) {
    return { ok: false, message: m.actions.cart.notFound, itemCount: 0 };
  }
  const line = await db.query.cartItems.findFirst({
    where: and(eq(cartItems.id, parsedId.data), eq(cartItems.cartId, cartId)),
    with: { variant: { with: { product: true } } },
  });
  if (!line) {
    return { ok: false, message: m.actions.cart.lineNotFound, itemCount: await currentItemCount() };
  }
  if (parsedQty.data > 0 && parsedQty.data > line.variant.stock) {
    return {
      ok: false,
      message: fill(m.actions.cart.stockLeft, { n: line.variant.stock }),
      itemCount: await currentItemCount(),
    };
  }

  await setCartItemQty(parsedId.data, parsedQty.data);
  refresh();
  return {
    ok: true,
    message: parsedQty.data === 0 ? m.actions.cart.removed : m.actions.cart.updated,
    itemCount: await currentItemCount(),
  };
}

/** 장바구니에서 한 줄 삭제. */
export async function removeCartLineAction(lineId: number): Promise<CartActionState> {
  return updateCartQtyAction(lineId, 0);
}
