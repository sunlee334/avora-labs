"use client";

import { useActionState } from "react";
import { updateProfile, type AccountState } from "@/app/[locale]/(store)/account/actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Primitives";
import { FieldError, FormMessage, Input, Label } from "@/components/ui/Field";
import { useMessages } from "@/i18n/client";

const initial: AccountState = {};

export function ProfileCard({
  email,
  name,
  phone,
}: {
  email: string;
  name: string;
  phone: string | null;
}) {
  const m = useMessages();
  const [state, action, pending] = useActionState(updateProfile, initial);
  const fieldErrors = state.fieldErrors ?? {};

  return (
    <Card>
      <h2 className="mb-4 text-sm font-semibold text-ink">{m.account.profile}</h2>
      <form action={action} className="space-y-4">
        <div>
          <Label htmlFor="profile-email">{m.account.email}</Label>
          <Input id="profile-email" value={email} disabled readOnly />
        </div>
        <div>
          <Label htmlFor="profile-name">{m.account.name}</Label>
          <Input
            id="profile-name"
            name="name"
            defaultValue={name}
            required
            maxLength={40}
            aria-invalid={Boolean(fieldErrors.name)}
          />
          <FieldError>{fieldErrors.name}</FieldError>
        </div>
        <div>
          <Label htmlFor="profile-phone" hint={m.common.optional}>
            {m.account.phone}
          </Label>
          <Input
            id="profile-phone"
            name="phone"
            type="tel"
            defaultValue={phone ?? ""}
            placeholder="010-0000-0000"
            aria-invalid={Boolean(fieldErrors.phone)}
          />
          <FieldError>{fieldErrors.phone}</FieldError>
        </div>
        {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
        {state.success ? <FormMessage tone="success">{state.success}</FormMessage> : null}
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending ? m.common.saving : m.common.save}
        </Button>
      </form>
    </Card>
  );
}
