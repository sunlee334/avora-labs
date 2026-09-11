"use client";

import { useActionState } from "react";
import { CustomerCancelForm } from "@/components/orders/CustomerCancelForm";
import { OrderDetail } from "@/components/orders/OrderDetail";
import { Button } from "@/components/ui/Button";
import { FormMessage, Input, Label } from "@/components/ui/Field";
import { useMessages } from "@/i18n/client";
import { isCustomerCancellable } from "@/lib/config";
import { cancelGuestOrder, lookupOrder, type LookupState } from "./actions";

const initial: LookupState = { status: "idle" };

export function LookupForm() {
  const m = useMessages();
  const [state, action, pending] = useActionState(lookupOrder, initial);

  return (
    <div className="space-y-8">
      <form action={action} className="space-y-4">
        <div>
          <Label htmlFor="lookup-order-number">{m.lookup.orderNumber}</Label>
          <Input id="lookup-order-number" name="orderNumber" placeholder="PR-20270101-ABCD" required />
        </div>
        <div>
          <Label htmlFor="lookup-email">{m.lookup.email}</Label>
          <Input id="lookup-email" name="email" type="email" required />
        </div>
        {state.status === "error" ? <FormMessage tone="error">{state.message}</FormMessage> : null}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? m.lookup.submitting : m.lookup.submit}
        </Button>
      </form>
      {state.status === "success" && state.order ? (
        <>
          <OrderDetail order={state.order} />
          {isCustomerCancellable(state.order.status) ? (
            <CustomerCancelForm
              key={state.order.orderNumber}
              action={cancelGuestOrder}
              hidden={{ orderNumber: state.order.orderNumber, email: state.order.email }}
              totalKrw={state.order.totalKrw}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
