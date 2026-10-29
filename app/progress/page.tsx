"use client";

import { Suspense, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import BodyTab from "@/components/progress/BodyTab";
import OverviewTab from "@/components/progress/OverviewTab";
import FitnessTab from "@/components/progress/FitnessTab";
import JournalHeader from "@/components/JournalHeader";
import KukangLoader from "@/components/KukangLoader";

const TABS = [
  { id: "overview", label: "Ringkasan" },
  { id: "body", label: "Tubuh" },
  { id: "fitness", label: "Kebugaran" },
] as const;
type Tab = (typeof TABS)[number]["id"];
function ProgressContent() {
  const router = useRouter();
  const params = useSearchParams();
  const requested = params.get("tab");
  // Older links: weight is now Tubuh, and the weekly review is part of Ringkasan.
  const tab: Tab =
    requested === "weight"
      ? "body"
      : requested === "weekly"
        ? "overview"
        : (TABS.find((entry) => entry.id === requested)?.id ?? "overview");
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  function selectTab(next: Tab) {
    const query = new URLSearchParams(params.toString());
    query.set("tab", next);
    router.replace(`/progress?${query.toString()}`, { scroll: false });
  }
  return (
    <div className="journal-page journal-page--progress space-y-4 p-4">
      <JournalHeader scene="progress" kicker="Jejak kecilmu" title="Progress" description="Minggu ini, tubuhmu, dan kebugaranmu dari waktu ke waktu." />
      <div
        className="journal-tabs grid grid-cols-3 gap-1 rounded-2xl p-1"
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
            className={`rounded-xl px-1 py-3 text-xs font-medium transition-colors ${tab === entry.id ? "bg-white text-brand-700 shadow-xs" : "text-neutral-500"}`}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <div
        className="journal-content"
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
      </div>
    </div>
  );
}
export default function ProgressPage() {
  return (
    <Suspense fallback={<KukangLoader label="Memuat progress..." />}>
      <ProgressContent />
    </Suspense>
  );
}
