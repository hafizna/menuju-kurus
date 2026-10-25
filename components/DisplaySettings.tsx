"use client";

import { useEffect, useState } from "react";

type Theme = "auto" | "light" | "dark";
const OPTIONS: Array<{ value: Theme; label: string }> = [
  { value: "auto", label: "Otomatis" },
  { value: "light", label: "Terang" },
  { value: "dark", label: "Gelap" },
];

// The choice lives in this browser only; the inline script in app/layout.tsx
// reapplies it before first paint on every load.
export default function DisplaySettings() {
  const [theme, setTheme] = useState<Theme>("auto");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("mk_theme");
      if (saved === "light" || saved === "dark") setTheme(saved);
    } catch {
      // Storage can be blocked (private mode); the toggle still works for this visit.
    }
  }, []);

  function choose(next: Theme) {
    setTheme(next);
    try {
      localStorage.setItem("mk_theme", next);
    } catch {
      // See above.
    }
    window.dispatchEvent(new Event("mk-theme"));
  }

  return (
    <div className="grid grid-cols-3 gap-1 rounded-xl bg-neutral-100 p-1 dark:bg-neutral-800" role="radiogroup" aria-label="Tema tampilan">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={theme === option.value}
          onClick={() => choose(option.value)}
          className={`rounded-lg py-2 text-sm font-medium transition-colors ${
            theme === option.value
              ? "bg-white text-brand-700 shadow-xs dark:bg-neutral-700 dark:text-brand-300"
              : "text-neutral-500"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
