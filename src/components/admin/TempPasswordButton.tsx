"use client";

import { useActionState } from "react";
import { issueTempPasswordAction } from "@/app/admin/users/actions";
import { SubmitButton } from "@/components/ui/SubmitButton";

export function TempPasswordButton({ userId }: { userId: number }) {
  const [state, action] = useActionState(issueTempPasswordAction, {});

  if (state.tempPassword) {
    return (
      <div className="space-y-1 text-[12px]">
        <code className="block rounded-md bg-paper-2 px-2 py-1 font-mono text-[13px] text-ink">{state.tempPassword}</code>
        <p className="text-stone-2">한 번만 표시됩니다. 고객에게 전달한 뒤 로그인 후 비밀번호를 바꾸도록 안내하세요.</p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-1">
      <input type="hidden" name="userId" value={userId} />
      <SubmitButton size="sm" variant="ghost" pendingLabel="발급 중…">
        임시 비밀번호 발급
      </SubmitButton>
      {state.error ? <p className="text-[12px] text-danger">{state.error}</p> : null}
    </form>
  );
}
