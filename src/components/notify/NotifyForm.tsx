"use client";

import { useActionState } from "react";
import { subscribeNotify, type NotifyState } from "@/app/[locale]/(store)/notify/actions";
import { Button } from "@/components/ui/Button";
import { Checkbox, FormMessage, Input } from "@/components/ui/Field";
import { useMessages } from "@/i18n/client";

const initial: NotifyState = { status: "idle" };

/**
 * 출시 알림 신청 폼. 광고성 정보 수신 동의와 수신 거부 안내를 함께 표시한다 (제품기획안 10장 선행 조건).
 * interest: 'all' 또는 제품 slug. compact: 홈/제품 페이지 인라인용.
 */
export function NotifyForm({
  interest = "all",
  source = "site",
  compact = false,
  buttonLabel,
}: {
  interest?: string;
  source?: string;
  compact?: boolean;
  buttonLabel?: string;
}) {
  const m = useMessages();
  const [state, action, pending] = useActionState(subscribeNotify, initial);
  const id = `notify-${interest}`;

  if (state.status === "success") {
    return <FormMessage tone="success">{state.message}</FormMessage>;
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="interest" value={interest} />
      <input type="hidden" name="source" value={source} />
      <div className={compact ? "flex flex-col gap-2 sm:flex-row" : "space-y-2"}>
        <Input
          id={`${id}-email`}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          placeholder={m.notify.emailPlaceholder}
          aria-label={m.notify.emailPlaceholder}
          className={compact ? "sm:flex-1" : ""}
        />
        <Button type="submit" disabled={pending} className={compact ? "sm:shrink-0" : "w-full"}>
          {pending ? m.notify.submitting : (buttonLabel ?? m.notify.defaultButton)}
        </Button>
      </div>
      <Checkbox
        id={`${id}-opt`}
        name="marketingOptIn"
        required
        label={m.notify.consent}
        description={m.notify.consentDesc}
      />
      {state.status === "error" ? <FormMessage tone="error">{state.message}</FormMessage> : null}
    </form>
  );
}
