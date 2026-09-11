import { redirect } from "next/navigation";

/** 관리자 액션 결과를 쿼리 스트링 메시지로 넘기며 원래 화면으로 돌려보낸다. */
export function redirectWithMessage(
  path: string,
  params: { error?: string; success?: string },
): never {
  const qs = new URLSearchParams();
  if (params.error) qs.set("error", params.error);
  if (params.success) qs.set("success", params.success);
  const query = qs.toString();
  return redirect(`${path}${query ? `?${query}` : ""}`);
}
