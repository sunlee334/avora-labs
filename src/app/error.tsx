"use client";

import { ErrorContent } from "@/components/site/ErrorContent";

/** 루트 오류 경계(관리자·API 등 스토어 그룹 밖). 스토어 화면은 (store)/error.tsx 가 담당한다. */
export default function GlobalError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorContent {...props} />;
}
