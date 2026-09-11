"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";
import { useMessages } from "@/i18n/client";
import { Button } from "./Button";

/**
 * 폼 제출 중 비활성화되는 버튼. 토스 취소처럼 몇 초 걸리는 서버 액션에서 운영자의 재클릭(중복 제출)을 막는다.
 * 반드시 해당 <form> 안에 두어야 한다 (useFormStatus 는 가장 가까운 form 의 상태를 읽는다).
 */
export function SubmitButton({
  children,
  pendingLabel,
  disabled,
  ...props
}: Omit<ComponentProps<typeof Button>, "type"> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  const m = useMessages();
  return (
    <Button type="submit" disabled={pending || disabled} aria-busy={pending} {...props}>
      {pending ? (pendingLabel ?? m.common.processing) : children}
    </Button>
  );
}
