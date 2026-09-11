import { Button } from "@/components/ui/Button";
import { FormMessage, Label, Select } from "@/components/ui/Field";
import { Card, Divider } from "@/components/ui/Primitives";
import { ProductStatusBadge } from "@/components/ui/StatusBadge";
import { db } from "@/db/client";
import { PRODUCT_STATUS, PRODUCT_STATUS_LABEL } from "@/lib/config";
import { updateProductAction, updateVariantAction } from "./actions";

export default async function AdminProductsPage({ searchParams }: PageProps<"/admin/products">) {
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : undefined;
  const success = typeof sp.success === "string" ? sp.success : undefined;

  const productRows = await db.query.products.findMany({
    with: { variants: { orderBy: (v, { asc }) => [asc(v.sortOrder)] } },
    orderBy: (p, { asc }) => [asc(p.sortOrder), asc(p.stage)],
  });

  return (
    <div className="space-y-6">
      <h1 className="display text-2xl text-ink">상품</h1>
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
      {success ? <FormMessage tone="success">{success}</FormMessage> : null}

      <div className="space-y-6">
        {productRows.map((product) => (
          <Card key={product.id}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="eyebrow">{product.code || `STAGE ${product.stage}`}</p>
                <h2 className="mt-1 text-lg font-semibold text-ink">{product.name}</h2>
                <p className="text-[13px] text-stone">{product.subtitle}</p>
              </div>
              <ProductStatusBadge status={product.status} />
            </div>

            <form
              action={updateProductAction.bind(null, product.id)}
              className="mt-4 flex flex-wrap items-end gap-3"
            >
              <div>
                <Label htmlFor={`status-${product.id}`}>판매 상태</Label>
                <Select
                  id={`status-${product.id}`}
                  name="status"
                  defaultValue={product.status}
                  className="w-40"
                >
                  {PRODUCT_STATUS.map((s) => (
                    <option key={s} value={s}>
                      {PRODUCT_STATUS_LABEL[s]}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="min-w-48 flex-1">
                <Label htmlFor={`launchLabel-${product.id}`}>출시 안내 문구</Label>
                <input
                  id={`launchLabel-${product.id}`}
                  name="launchLabel"
                  defaultValue={product.launchLabel}
                  className="w-full rounded-md border border-line-2 bg-white px-3.5 py-2.5 text-[15px] text-ink focus:border-ink focus:outline-none"
                />
              </div>
              <Button type="submit" size="sm" variant="secondary">
                저장
              </Button>
            </form>

            {product.variants.length > 0 ? (
              <>
                <Divider className="my-5" />
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-[13px]">
                    <thead>
                      <tr className="border-b border-line text-left text-stone">
                        <th className="py-2 font-medium">변형</th>
                        <th className="py-2 font-medium">가격</th>
                        <th className="py-2 font-medium">정가(비교)</th>
                        <th className="py-2 font-medium">재고</th>
                        <th className="py-2 font-medium">노출</th>
                        <th className="py-2 font-medium" />
                      </tr>
                    </thead>
                    <tbody>
                      {product.variants.map((variant) => {
                        const formId = `variant-${variant.id}`;
                        return (
                          <tr key={variant.id} className="border-b border-line last:border-0">
                            <td className="py-2.5 pr-2">
                              <div>{variant.name}</div>
                              <div className="text-[11px] text-stone-2">{variant.sku}</div>
                            </td>
                            <td className="py-2.5 pr-2">
                              <input
                                form={formId}
                                type="number"
                                name="priceKrw"
                                min={0}
                                defaultValue={variant.priceKrw}
                                className="w-28 rounded-md border border-line-2 bg-white px-2.5 py-1.5 text-[13px] focus:border-ink focus:outline-none"
                              />
                            </td>
                            <td className="py-2.5 pr-2">
                              <input
                                form={formId}
                                type="number"
                                name="compareAtKrw"
                                min={0}
                                defaultValue={variant.compareAtKrw ?? ""}
                                className="w-28 rounded-md border border-line-2 bg-white px-2.5 py-1.5 text-[13px] focus:border-ink focus:outline-none"
                              />
                            </td>
                            <td className="py-2.5 pr-2">
                              <input
                                form={formId}
                                type="number"
                                name="stock"
                                min={0}
                                defaultValue={variant.stock}
                                className="w-24 rounded-md border border-line-2 bg-white px-2.5 py-1.5 text-[13px] focus:border-ink focus:outline-none"
                              />
                            </td>
                            <td className="py-2.5 pr-2">
                              <input
                                form={formId}
                                type="checkbox"
                                name="isActive"
                                defaultChecked={variant.isActive}
                                className="h-4 w-4 accent-ink"
                              />
                            </td>
                            <td className="py-2.5">
                              <Button form={formId} type="submit" size="sm" variant="ghost">
                                저장
                              </Button>
                              <form
                                id={formId}
                                action={updateVariantAction.bind(null, variant.id)}
                              >
                                <input type="hidden" name="expectedStock" value={variant.stock} />
                              </form>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="mt-4 text-[13px] text-stone">등록된 변형이 없습니다.</p>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
