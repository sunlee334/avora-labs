"use client";

import { useActionState } from "react";
import { createReviewAction, type ReviewState } from "@/app/[locale]/(store)/account/orders/[id]/actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Primitives";
import { Checkbox, FieldError, FormMessage, Label, Select, Textarea } from "@/components/ui/Field";
import { useMessages } from "@/i18n/client";
import { fill } from "@/i18n/format";
import { ACTIVITY_TAGS, type ActivityTag } from "@/lib/config";

const initial: ReviewState = {};
const ACTIVITY_KEYS = Object.keys(ACTIVITY_TAGS) as ActivityTag[];

export function ReviewForm({
  orderId,
  productId,
  productName,
}: {
  orderId: number;
  productId: number;
  productName: string;
}) {
  const m = useMessages();
  const [state, action, pending] = useActionState(createReviewAction, initial);
  const fieldErrors = state.fieldErrors ?? {};

  return (
    <Card>
      <h3 className="mb-1 text-sm font-semibold text-ink">{fill(m.review.formTitle, { product: productName })}</h3>
      <p className="mb-4 text-[13px] text-stone">{m.review.formLede}</p>
      <form action={action} className="space-y-4">
        <input type="hidden" name="orderId" value={orderId} />
        <input type="hidden" name="productId" value={productId} />

        <fieldset>
          <Label>{m.review.rating}</Label>
          <div className="flex gap-3">
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n} className="flex items-center gap-1.5 text-sm text-charcoal">
                <input type="radio" name="rating" value={n} required className="accent-ink" />
                {n}
              </label>
            ))}
          </div>
          <FieldError>{fieldErrors.rating}</FieldError>
        </fieldset>

        <div>
          <Label htmlFor="review-activity">{m.review.activity}</Label>
          <Select id="review-activity" name="activityTag" defaultValue="daily" required>
            {ACTIVITY_KEYS.map((key) => (
              <option key={key} value={key}>
                {m.activity[key]}
              </option>
            ))}
          </Select>
          <FieldError>{fieldErrors.activityTag}</FieldError>
        </div>

        <div>
          <Label htmlFor="review-body" hint={m.review.bodyHint}>
            {m.review.body}
          </Label>
          <Textarea id="review-body" name="body" minLength={20} maxLength={1000} required rows={5} />
          <FieldError>{fieldErrors.body}</FieldError>
        </div>

        <div>
          <Label htmlFor="review-photos" hint={m.review.photosHint}>
            {m.review.photos}
          </Label>
          <input
            id="review-photos"
            name="photos"
            type="file"
            accept="image/*"
            multiple
            className="block w-full text-sm text-charcoal file:mr-3 file:rounded-full file:border file:border-ink/80 file:bg-transparent file:px-3 file:py-1.5 file:text-[13px] file:text-ink"
          />
          <FieldError>{fieldErrors.photos}</FieldError>
        </div>

        <Checkbox id="review-disclosure" name="disclosure" label={m.review.disclosure} />

        {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
        <Button type="submit" disabled={pending}>
          {pending ? m.review.submitting : m.review.submit}
        </Button>
      </form>
    </Card>
  );
}
