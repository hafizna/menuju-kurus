"use client";

import { Suspense, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import BodyTab from "@/components/progress/BodyTab";
import OverviewTab from "@/components/progress/OverviewTab";
import FitnessTab from "@/components/progress/FitnessTab";
import WeeklyTab from "@/components/progress/WeeklyTab";

const TABS = [
  { id: "overview", label: "Ringkasan" },
  { id: "body", label: "Tubuh" },
  { id: "fitness", label: "Fitness" },
  { id: "weekly", label: "Mingguan" },
] as const;
type Tab = (typeof TABS)[number]["id"];
function ProgressContent() {
  const router = useRouter();
  const params = useSearchParams();
  const requested = params.get("tab");
  const tab: Tab =
    requested === "weight"
      ? "body"
      : (TABS.find((entry) => entry.id === requested)?.id ?? "overview");
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  function selectTab(next: Tab) {
    const query = new URLSearchParams(params.toString());
    query.set("tab", next);
    router.replace(`/progress?${query.toString()}`, { scroll: false });
  }
  return (
    <div className="space-y-4 p-4">
      <header className="pt-2">
        <h1 className="text-xl font-bold">Progress</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Perubahan tubuh, aktivitas, dan kebiasaan dari waktu ke waktu.
        </p>
      </header>
      <div
        className="grid grid-cols-4 gap-1 rounded-2xl bg-neutral-100 p-1 dark:bg-neutral-900"
        role="tablist"
        aria-label="Bagian Progress"
      >
        {TABS.map((entry, index) => (
          <button
            key={entry.id}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            id={`tab-${entry.id}`}
            role="tab"
            aria-selected={tab === entry.id}
            aria-controls={`panel-${entry.id}`}
            tabIndex={tab === entry.id ? 0 : -1}
            onClick={() => selectTab(entry.id)}
            onKeyDown={(event) => {
              let target: number | null = null;
              if (event.key === "ArrowRight")
                target = (index + 1) % TABS.length;
              if (event.key === "ArrowLeft")
                target = (index - 1 + TABS.length) % TABS.length;
              if (event.key === "Home") target = 0;
              if (event.key === "End") target = TABS.length - 1;
              if (target !== null) {
                event.preventDefault();
                selectTab(TABS[target].id);
                buttons.current[target]?.focus();
              }
            }}
            className={`rounded-xl px-1 py-3 text-xs font-medium transition-colors ${tab === entry.id ? "bg-white text-brand-700 shadow-xs dark:bg-neutral-800 dark:text-brand-400" : "text-neutral-500"}`}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <div
        key={tab}
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
        tabIndex={0}
      >
        {tab === "overview" && (
          <OverviewTab onCheckIn={() => selectTab("body")} />
        )}
        {tab === "body" && <BodyTab />}
        {tab === "fitness" && <FitnessTab />}
        {tab === "weekly" && <WeeklyTab />}
      </div>
    </div>
  );
}
export default function ProgressPage() {
  return (
    <Suspense
      fallback={
        <p className="p-6 text-center text-neutral-500">Memuat progress...</p>
      }
    >
      <ProgressContent />
    </Suspense>
  );
}
