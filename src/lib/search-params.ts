/** 배열로 들어온 쿼리 파라미터는 첫 값만 쓴다. 없으면 빈 문자열. */
export function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}
