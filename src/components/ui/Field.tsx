import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

const control =
  "w-full rounded-md border border-line-2 bg-white px-3.5 py-2.5 text-[15px] text-ink placeholder:text-stone-2 focus:border-ink focus:outline-none disabled:bg-paper-2 aria-[invalid=true]:border-danger";

export function Label({ htmlFor, children, hint }: { htmlFor?: string; children: ReactNode; hint?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-charcoal">
      {children}
      {hint ? <span className="ml-1.5 font-normal text-stone-2">{hint}</span> : null}
    </label>
  );
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${control} ${className}`} {...props} />;
}

export function Textarea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${control} min-h-28 ${className}`} {...props} />;
}

export function Select({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${control} ${className}`} {...props} />;
}

export function Checkbox({
  id,
  label,
  description,
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; description?: ReactNode }) {
  return (
    <label htmlFor={id} className={`flex cursor-pointer items-start gap-3 ${className}`}>
      <input
        id={id}
        type="checkbox"
        className="mt-1 h-4 w-4 shrink-0 rounded-xs border-line-2 accent-ink"
        {...props}
      />
      <span className="text-[14px] leading-snug text-charcoal">
        {label}
        {description ? <span className="mt-0.5 block text-[12px] text-stone">{description}</span> : null}
      </span>
    </label>
  );
}

export function FieldError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="mt-1.5 text-[12px] text-danger">
      {children}
    </p>
  );
}

export function FormMessage({
  tone = "info",
  children,
}: {
  tone?: "info" | "success" | "error";
  children: ReactNode;
}) {
  const tones = {
    info: "border-mist-200 bg-mist-50 text-charcoal",
    success: "border-success/30 bg-success/5 text-success",
    error: "border-danger/30 bg-danger/5 text-danger",
  };
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-md border px-4 py-3 text-sm ${tones[tone]}`}>
      {children}
    </div>
  );
}
