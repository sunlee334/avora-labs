"use client";

import { ErrorContent } from "@/components/site/ErrorContent";

/** 스토어 라우트의 오류 경계. (store)/layout 안에 있으므로 헤더·푸터가 유지된다. */
export default function StoreError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorContent {...props} />;
}
