"use client";

import { useActionState } from "react";
import { changePasswordAction, type AccountState } from "@/app/[locale]/(store)/account/actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Card } from "@/components/ui/Primitives";
import { FieldError, FormMessage, Input, Label } from "@/components/ui/Field";
import { useMessages } from "@/i18n/client";

const initial: AccountState = {};

/** `next` 가 있으면(임시 비밀번호 강제 변경 흐름) 변경 성공 후 그 경로로 이동한다. */
export function PasswordForm({ next }: { next?: string }) {
  const m = useMessages();
  const [state, action] = useActionState(changePasswordAction, initial);

  return (
    <Card>
      <h2 className="mb-1 text-sm font-semibold text-ink">{m.account.password}</h2>
      <p className="mb-4 text-[13px] text-stone">{m.account.passwordLede}</p>
      <form action={action} className="space-y-3">
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <div>
          <Label htmlFor="current-password">{m.account.currentPassword}</Label>
          <Input id="current-password" name="currentPassword" type="password" autoComplete="current-password" required />
          {state.fieldErrors?.currentPassword ? <FieldError>{state.fieldErrors.currentPassword}</FieldError> : null}
        </div>
        <div>
          <Label htmlFor="new-password">{m.account.newPassword}</Label>
          <Input id="new-password" name="newPassword" type="password" autoComplete="new-password" minLength={8} required />
          {state.fieldErrors?.newPassword ? <FieldError>{state.fieldErrors.newPassword}</FieldError> : null}
        </div>
        <div>
          <Label htmlFor="confirm-password">{m.account.confirmPassword}</Label>
          <Input id="confirm-password" name="confirmPassword" type="password" autoComplete="new-password" required />
          {state.fieldErrors?.confirmPassword ? <FieldError>{state.fieldErrors.confirmPassword}</FieldError> : null}
        </div>
        {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
        {state.success ? <FormMessage tone="success">{state.success}</FormMessage> : null}
        <SubmitButton size="sm" variant="secondary" pendingLabel={m.account.changing}>
          {m.account.changePassword}
        </SubmitButton>
      </form>
    </Card>
  );
}
