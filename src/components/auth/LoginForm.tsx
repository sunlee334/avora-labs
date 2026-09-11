"use client";

import { useActionState } from "react";
import { loginAction, type AuthState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/Button";
import { FormMessage, Input, Label } from "@/components/ui/Field";
import { useMessages } from "@/i18n/client";
import { Link } from "@/i18n/link";

const initial: AuthState = {};

export function LoginForm({ next }: { next?: string }) {
  const m = useMessages();
  const [state, action, pending] = useActionState(loginAction, initial);
  const registerHref = next ? `/register?next=${encodeURIComponent(next)}` : "/register";

  return (
    <form action={action} className="space-y-5">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div>
        <Label htmlFor="login-email">{m.auth.email}</Label>
        <Input
          id="login-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
        />
      </div>
      <div>
        <Label htmlFor="login-password">{m.auth.password}</Label>
        <Input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? m.auth.loggingIn : m.auth.login}
      </Button>
      <div className="flex flex-col gap-2 pt-2 text-center text-[13px] text-stone">
        <span>
          {m.auth.noAccount}{" "}
          <Link href={registerHref} className="font-medium text-ink underline underline-offset-4">
            {m.auth.register}
          </Link>
        </span>
        <Link href="/orders/lookup" className="text-ink underline underline-offset-4">
          {m.nav.guestLookup}
        </Link>
      </div>
    </form>
  );
}
