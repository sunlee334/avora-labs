import { ButtonLink } from "@/components/ui/Button";
import { getT } from "@/i18n/server";

/** 404 본문. 스토어 라우트 그룹 안에서는 레이아웃이 헤더·푸터를 그리고, 루트 404 는 직접 감싼다. */
export async function NotFoundContent() {
  const { m } = await getT();
  return (
    <div className="container-x flex min-h-[60vh] flex-col items-center justify-center py-24 text-center">
      <p className="eyebrow mb-4">404</p>
      <h1 className="display text-3xl text-ink md:text-4xl">{m.pages.notFound.title}</h1>
      <p className="measure mt-4 text-[15px] leading-relaxed text-stone">{m.pages.notFound.body}</p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <ButtonLink href="/">{m.common.home}</ButtonLink>
        <ButtonLink href="/shop" variant="secondary">
          {m.common.viewProduct}
        </ButtonLink>
      </div>
    </div>
  );
}
