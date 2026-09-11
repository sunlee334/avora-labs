"use client";

import Image from "next/image";

export interface GalleryImage {
  src: string;
  alt: string;
}

/** 제품 이미지. 선택한 구성에 따라 대표 컷이 바뀐다. */
export function ProductGallery({
  images,
  activeIndex,
  onSelect,
}: {
  images: GalleryImage[];
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  const active = images[activeIndex] ?? images[0];
  if (!active) return null;

  return (
    <div className="space-y-4">
      <div className="grain overflow-hidden rounded-lg border border-line bg-paper-2">
        <Image
          src={active.src}
          alt={active.alt}
          width={900}
          height={900}
          priority
          unoptimized
          className="h-auto w-full object-cover"
        />
      </div>

      {images.length > 1 ? (
        <ul className="flex gap-3">
          {images.map((image, index) => (
            <li key={image.src}>
              <button
                type="button"
                onClick={() => onSelect(index)}
                aria-label={image.alt}
                aria-current={index === activeIndex}
                className={`overflow-hidden rounded-md border bg-paper-2 transition ${
                  index === activeIndex ? "border-ink" : "border-line hover:border-line-2"
                }`}
              >
                <Image
                  src={image.src}
                  alt=""
                  width={80}
                  height={80}
                  unoptimized
                  className="h-16 w-16 object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
