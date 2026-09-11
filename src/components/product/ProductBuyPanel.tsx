"use client";

import { useState, type ReactNode } from "react";
import { ProductGallery, type GalleryImage } from "./ProductGallery";
import { PurchaseBox } from "./PurchaseBox";
import type { PurchaseVariant } from "./VariantSelector";

/**
 * 갤러리와 구매 박스가 선택한 구성을 공유하도록 묶는 클라이언트 경계.
 * 헤더와 하단 안내(리뷰 요약·배송 안내)는 서버 컴포넌트를 그대로 받는다.
 */
export function ProductBuyPanel({
  images,
  variants,
  defaultVariantId,
  variantImageIndex,
  header,
  children,
}: {
  images: GalleryImage[];
  variants: PurchaseVariant[];
  defaultVariantId: number;
  variantImageIndex: Record<number, number>;
  header?: ReactNode;
  children?: ReactNode;
}) {
  const [selectedId, setSelectedId] = useState(defaultVariantId);
  const [imageIndex, setImageIndex] = useState(variantImageIndex[defaultVariantId] ?? 0);

  function select(id: number) {
    setSelectedId(id);
    const next = variantImageIndex[id];
    if (typeof next === "number") setImageIndex(next);
  }

  return (
    <div className="grid gap-10 lg:grid-cols-2 lg:gap-14">
      <ProductGallery images={images} activeIndex={imageIndex} onSelect={setImageIndex} />
      <div className="space-y-8">
        {header}
        <PurchaseBox variants={variants} selectedId={selectedId} onSelect={select} />
        {children}
      </div>
    </div>
  );
}
