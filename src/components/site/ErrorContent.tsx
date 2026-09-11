"use client";

import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { useMessages } from "@/i18n/client";
import { fill } from "@/i18n/format";

/**
 * 오류 경계 본문. 서버 액션 413(본문 크기 초과) 등 예상치 못한 오류를 Next 기본 화면 대신 사이트 톤으로 안내한다.
 * 스토어 라우트 그룹의 error.tsx 와 루트 error.tsx 가 공유한다.
 */
export function ErrorContent({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const m = useMessages();
  useEffect(() => {
    console.error(error);
  }, [error]);

  const tooLarge = /413|body exceeded|Body exceeded|too large/i.test(error.message);

  return (
    <section className="container-x py-24">
      <p className="eyebrow mb-4">{m.pages.error.eyebrow}</p>
      <h1 className="display text-3xl text-ink md:text-5xl">
        {tooLarge ? m.pages.error.tooLargeTitle : m.pages.error.title}
      </h1>
      <p className="measure mt-5 text-base leading-relaxed text-stone">
        {tooLarge ? m.pages.error.tooLargeBody : m.pages.error.body}
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button type="button" onClick={reset}>
          {m.pages.error.retry}
        </Button>
        <ButtonLink href="/" variant="secondary">
          {m.common.home}
        </ButtonLink>
      </div>
      {error.digest ? <p className="mt-6 text-[11px] text-stone-2">{fill(m.pages.error.reference, { digest: error.digest })}</p> : null}
    </section>
  );
}
