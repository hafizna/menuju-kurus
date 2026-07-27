import HabitIntelligence from "@/components/HabitIntelligence";

export default function HabitsPage() {
  return (
    <div className="space-y-4 p-4">
      <header className="pt-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">Habit Intelligence</p>
        <h1 className="mt-1 text-xl font-bold">Belajar dari pola makanmu sendiri</h1>
        <p className="mt-1 text-sm text-neutral-500">Temukan menu berulang, waktu makan yang sering muncul, dan quick add tanpa mengetik ulang.</p>
      </header>
      <HabitIntelligence />
    </div>
  );
}
