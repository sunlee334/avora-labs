"use client";

import { useActionState } from "react";
import { updateConsents, type AccountState } from "@/app/[locale]/(store)/account/actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Primitives";
import { Checkbox, FormMessage } from "@/components/ui/Field";
import { useMessages } from "@/i18n/client";

const initial: AccountState = {};

export function ConsentToggles({
  marketingEmailOptIn,
  marketingSmsOptIn,
}: {
  marketingEmailOptIn: boolean;
  marketingSmsOptIn: boolean;
}) {
  const m = useMessages();
  const [state, action, pending] = useActionState(updateConsents, initial);

  return (
    <Card>
      <h2 className="mb-4 text-sm font-semibold text-ink">{m.account.consent}</h2>
      <form action={action} className="space-y-3">
        <Checkbox
          id="consent-email"
          name="marketingEmail"
          defaultChecked={marketingEmailOptIn}
          label={m.account.consentEmail}
        />
        <Checkbox
          id="consent-sms"
          name="marketingSms"
          defaultChecked={marketingSmsOptIn}
          label={m.account.consentSms}
          description={m.account.consentSmsDesc}
        />
        {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
        {state.success ? <FormMessage tone="success">{state.success}</FormMessage> : null}
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending ? m.common.saving : m.common.save}
        </Button>
      </form>
    </Card>
  );
}
