/**
 * schema.org 구조화 데이터. 값은 DB·설정에서만 오지만, 문자열 안의 `<` 는 이스케이프해 스크립트 종료 주입을 막는다.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
