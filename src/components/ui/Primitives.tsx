import type { ReactNode } from "react";
export { Price } from "./Price";

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "mist" | "accent" | "success" | "danger" | "ink";
  children: ReactNode;
}) {
  const tones = {
    neutral: "bg-paper-2 text-stone",
    mist: "bg-mist-100 text-mist-600",
    accent: "bg-accent-soft text-accent",
    success: "bg-success/10 text-success",
    danger: "bg-danger/10 text-danger",
    ink: "bg-ink text-paper",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Section({
  eyebrow,
  title,
  lede,
  children,
  className = "",
  id,
}: {
  eyebrow?: string;
  title?: ReactNode;
  lede?: ReactNode;
  children?: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`container-x py-16 md:py-24 ${className}`}>
      {(eyebrow || title || lede) && (
        <header className="mb-10 max-w-3xl md:mb-14">
          {eyebrow ? <p className="eyebrow mb-4">{eyebrow}</p> : null}
          {title ? <h2 className="display text-3xl text-ink md:text-5xl">{title}</h2> : null}
          {lede ? <p className="measure mt-5 text-base leading-relaxed text-stone md:text-lg">{lede}</p> : null}
        </header>
      )}
      {children}
    </section>
  );
}

export function Divider({ className = "" }: { className?: string }) {
  return <hr className={`border-line ${className}`} />;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-line bg-white/70 p-6 shadow-soft ${className}`}>{children}</div>;
}

export function PageTitle({
  eyebrow,
  title,
  lede,
}: {
  eyebrow?: string;
  title: ReactNode;
  lede?: ReactNode;
}) {
  return (
    <header className="container-x pt-12 pb-8 md:pt-20 md:pb-12">
      {eyebrow ? <p className="eyebrow mb-4">{eyebrow}</p> : null}
      <h1 className="display text-4xl text-ink md:text-6xl">{title}</h1>
      {lede ? <p className="measure mt-5 text-base leading-relaxed text-stone md:text-lg">{lede}</p> : null}
    </header>
  );
}
