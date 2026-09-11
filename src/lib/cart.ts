import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { cache } from "react";
import { db } from "@/db/client";
import { cartItems, carts, type Product, type Variant } from "@/db/schema";
import { CART_COOKIE, MAX_QTY_PER_LINE } from "@/lib/config";
import { calculateSubtotal } from "@/lib/pricing";

export { MAX_QTY_PER_LINE };

export interface CartLine {
  id: number;
  variantId: number;
  qty: number;
  variant: Variant & { product: Product };
  lineTotalKrw: number;
  /** 재고·판매 상태 문제 시 사유 */
  issue: "out_of_stock" | "insufficient_stock" | "not_for_sale" | null;
}

export interface CartView {
  id: string | null;
  lines: CartLine[];
  itemCount: number;
  subtotalKrw: number;
  /** 하나라도 issue가 있으면 결제로 진행할 수 없다 */
  purchasable: boolean;
}

async function readCartId(): Promise<string | null> {
  const store = await cookies();
  return store.get(CART_COOKIE)?.value ?? null;
}

/** 쿠키에 카트가 없으면 새로 만든다(쓰기 컨텍스트에서만 호출). */
async function getOrCreateCartId(userId?: number | null): Promise<string> {
  const existing = await readCartId();
  if (existing) {
    const row = await db.query.carts.findFirst({ where: eq(carts.id, existing) });
    if (row) {
      if (userId && row.userId !== userId) {
        await db.update(carts).set({ userId, updatedAt: new Date() }).where(eq(carts.id, row.id));
      }
      return row.id;
    }
  }
  const id = randomUUID();
  await db.insert(carts).values({ id, userId: userId ?? null });
  const store = await cookies();
  store.set(CART_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
  return id;
}

export const getCart = cache(async (): Promise<CartView> => {
  const cartId = await readCartId();
  const empty: CartView = { id: cartId, lines: [], itemCount: 0, subtotalKrw: 0, purchasable: false };
  if (!cartId) return empty;

  const rows = await db.query.cartItems.findMany({
    where: eq(cartItems.cartId, cartId),
    with: { variant: { with: { product: true } } },
    orderBy: (t, { asc }) => [asc(t.createdAt)],
  });

  const lines: CartLine[] = rows.map((row) => {
    let issue: CartLine["issue"] = null;
    if (!row.variant.isActive || row.variant.product.status !== "on_sale") {
      issue = "not_for_sale";
    } else if (row.variant.stock <= 0) {
      issue = "out_of_stock";
    } else if (row.variant.stock < row.qty) {
      issue = "insufficient_stock";
    }
    return {
      id: row.id,
      variantId: row.variantId,
      qty: row.qty,
      variant: row.variant,
      lineTotalKrw: row.variant.priceKrw * row.qty,
      issue,
    };
  });

  const subtotalKrw = calculateSubtotal(
    lines.map((l) => ({ variantId: l.variantId, unitPriceKrw: l.variant.priceKrw, qty: l.qty })),
  );

  return {
    id: cartId,
    lines,
    itemCount: lines.reduce((n, l) => n + l.qty, 0),
    subtotalKrw,
    purchasable: lines.length > 0 && lines.every((l) => l.issue === null),
  };
});

export async function addToCart(variantId: number, qty: number, userId?: number | null) {
  const cartId = await getOrCreateCartId(userId);
  const existing = await db.query.cartItems.findFirst({
    where: and(eq(cartItems.cartId, cartId), eq(cartItems.variantId, variantId)),
  });
  const nextQty = Math.min(MAX_QTY_PER_LINE, Math.max(1, (existing?.qty ?? 0) + qty));
  if (existing) {
    await db.update(cartItems).set({ qty: nextQty }).where(eq(cartItems.id, existing.id));
  } else {
    await db.insert(cartItems).values({ cartId, variantId, qty: nextQty });
  }
  await db.update(carts).set({ updatedAt: new Date() }).where(eq(carts.id, cartId));
}

export async function setCartItemQty(lineId: number, qty: number) {
  const cartId = await readCartId();
  if (!cartId) return;
  if (qty <= 0) {
    await db.delete(cartItems).where(and(eq(cartItems.id, lineId), eq(cartItems.cartId, cartId)));
  } else {
    await db
      .update(cartItems)
      .set({ qty: Math.min(MAX_QTY_PER_LINE, qty) })
      .where(and(eq(cartItems.id, lineId), eq(cartItems.cartId, cartId)));
  }
  await db.update(carts).set({ updatedAt: new Date() }).where(eq(carts.id, cartId));
}

export async function clearCart() {
  const cartId = await readCartId();
  if (!cartId) return;
  await db.delete(cartItems).where(eq(cartItems.cartId, cartId));
}

/** 로그인 시 비회원 카트를 회원에게 귀속한다. */
export async function attachCartToUser(userId: number) {
  const cartId = await readCartId();
  if (!cartId) return;
  await db.update(carts).set({ userId, updatedAt: new Date() }).where(eq(carts.id, cartId));
}
