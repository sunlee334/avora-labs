import { Section } from "@/components/ui/Primitives";
import { NotifyForm } from "@/components/notify/NotifyForm";
import { getT } from "@/i18n/server";

/** ⑩ 알림 신청 */
export async function NotifySection() {
  const { m } = await getT();
  return (
    <Section eyebrow={m.home.notify.eyebrow} title={m.home.notify.title} className="bg-mist-50/60">
      <div className="max-w-md">
        <NotifyForm interest="all" compact />
      </div>
    </Section>
  );
}
