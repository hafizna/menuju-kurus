"use client";

import { useEffect, useState } from "react";

// The choice lives in this browser only; the inline script in app/layout.tsx
// reapplies it before first paint on every load.
export default function DisplaySettings() {
  const [motion, setMotion] = useState<"auto" | "off">("auto");

  useEffect(() => {
    try {
      if (localStorage.getItem("mk_motion") === "off") setMotion("off");
    } catch {
      // Storage can be blocked (private mode); the toggle still works for this visit.
    }
  }, []);

  function chooseMotion(next: "auto" | "off") {
    setMotion(next);
    document.documentElement.dataset.motion = next;
    try { localStorage.setItem("mk_motion", next); } catch { /* Keep the choice for this visit. */ }
    window.dispatchEvent(new Event("mk-motion"));
  }

  return (
    <label className="flex items-start gap-3 text-sm">
      <input type="checkbox" checked={motion === "off"} onChange={(event) => chooseMotion(event.target.checked ? "off" : "auto")} className="mt-0.5 h-5 w-5 shrink-0 accent-brand-700" />
      <span>Kurangi animasi<span className="mt-1 block text-xs text-neutral-500">Maskot tetap terlihat. Saat opsi ini mati, gerakan mengikuti pengaturan perangkatmu.</span></span>
    </label>
  );
}
