import type { DailyCoachResult } from "@/lib/dailyCoach";
import { IconSparkle } from "@/components/icons";

export default function DailyCoach({ coach }: { coach: DailyCoachResult }) {
  const tone =
    coach.status === "recover"
      ? "border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950/40"
      : coach.status === "watch"
      ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40"
      : "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40";

  return (
    <section className={`rounded-2xl border p-4 ${tone}`}>
      <div className="mb-3 flex items-center gap-2">
        <IconSparkle className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" />
        <div>
          <div className="text-sm font-semibold">Fokus berikutnya</div>
          <div className="text-sm text-neutral-600 dark:text-neutral-300">{coach.headline}</div>
        </div>
      </div>
      <ul className="space-y-3">
        {coach.recommendations.map((item) => (
          <li key={item.id} className="flex gap-3 border-l-2 border-neutral-200 pl-3 dark:border-neutral-700">
            <div>
              <div className="text-sm font-medium">{item.title}</div>
              <div className="text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">{item.detail}</div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
