import { Link } from "@/i18n/link";
import { getT } from "@/i18n/server";

/** ⑤ 스펙 3줄 스트립. 제품 상세로 연결한다. */
export async function SpecStrip() {
  const { m } = await getT();
  const lines = [
    { label: m.home.spec.uv, value: "SPF50+ / PA++++" },
    { label: m.home.spec.water, value: m.home.spec.waterValue },
    { label: m.home.spec.finish, value: m.home.spec.finishValue },
  ];
  return (
    <Link href="/products/daily-sunscreen" className="group block border-y border-line bg-ink text-paper">
      <div className="container-x grid gap-4 py-8 sm:grid-cols-3 md:py-10">
        {lines.map((line) => (
          <div key={line.label} className="flex items-baseline gap-3">
            <span className="eyebrow text-mist-300">{line.label}</span>
            <span className="text-[15px] font-medium tracking-tight">{line.value}</span>
          </div>
        ))}
      </div>
      <div className="container-x pb-6 md:pb-8">
        <span className="text-[13px] font-medium text-mist-300 underline underline-offset-4 transition group-hover:text-paper">
          {m.home.spec.viewAll}
        </span>
      </div>
    </Link>
  );
}
