"use client";

import { useActionState } from "react";
import { registerAction, type AuthState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/Button";
import { Checkbox, FieldError, FormMessage, Input, Label } from "@/components/ui/Field";
import { useMessages } from "@/i18n/client";
import { Link } from "@/i18n/link";

const initial: AuthState = {};

export function RegisterForm({ next }: { next?: string }) {
  const m = useMessages();
  const [state, action, pending] = useActionState(registerAction, initial);
  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : "/login";
  const fieldErrors = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-5">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div>
        <Label htmlFor="register-email">{m.auth.email}</Label>
        <Input
          id="register-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          aria-invalid={Boolean(fieldErrors.email)}
          placeholder="you@example.com"
        />
        <FieldError>{fieldErrors.email}</FieldError>
      </div>
      <div>
        <Label htmlFor="register-password" hint={m.auth.passwordHint}>
          {m.auth.password}
        </Label>
        <Input
          id="register-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={72}
          aria-invalid={Boolean(fieldErrors.password)}
        />
        <FieldError>{fieldErrors.password}</FieldError>
      </div>
      <div>
        <Label htmlFor="register-name">{m.auth.name}</Label>
        <Input
          id="register-name"
          name="name"
          autoComplete="name"
          required
          maxLength={40}
          aria-invalid={Boolean(fieldErrors.name)}
        />
        <FieldError>{fieldErrors.name}</FieldError>
      </div>
      <div>
        <Label htmlFor="register-phone" hint={m.common.optional}>
          {m.auth.phone}
        </Label>
        <Input
          id="register-phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          placeholder="010-0000-0000"
          aria-invalid={Boolean(fieldErrors.phone)}
        />
        <FieldError>{fieldErrors.phone}</FieldError>
      </div>

      <div className="space-y-3 border-t border-line pt-4">
        <Checkbox
          id="register-terms"
          name="terms"
          required
          label={
            <>
              {m.auth.termsBefore}
              <Link href="/policy/terms" target="_blank" className="underline underline-offset-4">
                {m.auth.terms}
              </Link>
              {m.auth.termsAfter}
            </>
          }
        />
        <Checkbox
          id="register-privacy"
          name="privacy"
          required
          label={
            <>
              {m.auth.termsBefore}
              <Link href="/policy/privacy" target="_blank" className="underline underline-offset-4">
                {m.auth.privacy}
              </Link>
              {m.auth.termsAfter}
            </>
          }
        />
        <Checkbox id="register-marketing-email" name="marketingEmail" label={m.auth.marketingEmail} />
        <Checkbox
          id="register-marketing-sms"
          name="marketingSms"
          label={m.auth.marketingSms}
          description={m.auth.marketingSmsDesc}
        />
        <FieldError>{fieldErrors.terms ?? fieldErrors.privacy}</FieldError>
      </div>

      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? m.auth.registering : m.auth.register}
      </Button>
      <p className="text-center text-[13px] text-stone">
        {m.auth.haveAccount}{" "}
        <Link href={loginHref} className="font-medium text-ink underline underline-offset-4">
          {m.auth.login}
        </Link>
      </p>
    </form>
  );
}
