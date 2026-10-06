"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BODY_FIELDS,
  BODY_LABELS,
  avatarHeight,
  bodyRatios,
  checkInDue,
  comparisonRows,
  type BodyField,
  type BodySnapshot,
} from "@/lib/body";
import type { WeightTrend } from "@/lib/weight";
import WeightForecastCard from "@/components/WeightForecastCard";
import BodyAvatar from "./BodyAvatar";
import MetricChart from "./MetricChart";

export interface BodyResponse {
  snapshots: BodySnapshot[];
  today: string;
  profileHeightCm: number | null;
  weightTrend: WeightTrend;
}
const emptyDraft = () =>
  Object.fromEntries(BODY_FIELDS.map((field) => [field, ""])) as Record<
    BodyField,
    string
  >;
const sourceLabel = (source: string) =>
  source === "shortcuts" ? "Apple Health" : "Manual";

export default function BodyTab() {
  const [data, setData] = useState<BodyResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [dirty, setDirty] = useState<BodyField[]>([]);
  const [date, setDate] = useState("");
  const [height, setHeight] = useState("");
  const [beforeDate, setBeforeDate] = useState("");
  const [afterDate, setAfterDate] = useState("");
  const [showAvatar, setShowAvatar] = useState(true);
  const [showReminder, setShowReminder] = useState(true);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/body");
      if (!response.ok)
        throw new Error(
          "Pengukuran belum dapat dimuat. Periksa koneksi dan konfigurasi database.",
        );
      setData(await response.json());
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Gagal memuat ukuran tubuh.",
      );
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    try {
      setShowAvatar(localStorage.getItem("mk:body-avatar:hidden") !== "true");
      setShowReminder(
        localStorage.getItem("mk:body-reminder:hidden") !== "true",
      );
    } catch {
      /* Storage preference is optional. */
    }
  }, []);

  function prepareForm(nextDate: string) {
    if (!data) return;
    const snapshot = data.snapshots.find((entry) => entry.date === nextDate);
    setDate(nextDate);
    setDraft(
      Object.fromEntries(
        BODY_FIELDS.map((field) => [
          field,
          snapshot?.[field]?.value.toString() ?? "",
        ]),
      ) as Record<BodyField, string>,
    );
    const references = BODY_FIELDS.flatMap((field) =>
      snapshot?.[field]?.heightCm ? [snapshot[field]!.heightCm!] : [],
    );
    const sameHeight =
      references.length && references.every((value) => value === references[0]);
    setHeight(
      sameHeight
        ? String(references[0])
        : !snapshot && nextDate === data.today
          ? String(data.profileHeightCm ?? "")
          : "",
    );
    setDirty([]);
    setNotice("");
    setShowForm(true);
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    const values = Object.fromEntries(
      dirty
        .filter((field) => draft[field].trim() !== "")
        .map((field) => [field, Number(draft[field])]),
    ) as Partial<Record<BodyField, number>>;
    if (!Object.keys(values).length) {
      setError(
        "Isi atau ubah minimal satu ukuran. Kolom kosong tidak menghapus data lama.",
      );
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/body", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          ...values,
          ...(height ? { heightCm: Number(height) } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Pengukuran belum tersimpan.");
      setData(result);
      setAfterDate(date);
      setShowForm(false);
      setNotice("Pengukuran tersimpan. Kolom lain tetap dipertahankan.");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Gagal menyimpan pengukuran.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function remove(date: string, field: BodyField) {
    if (
      !window.confirm(
        `Hapus hanya ${BODY_LABELS[field].label.toLowerCase()} tanggal ${date}? Ukuran lain tetap disimpan.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/body?date=${encodeURIComponent(date)}&field=${field}`,
        { method: "DELETE" },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Pengukuran belum dihapus.");
      setData(result);
      setShowForm(false);
      setNotice("Ukuran dihapus; ukuran lain tetap disimpan.");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Gagal menghapus ukuran.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return error ? (
      <div className="space-y-3">
        <p role="alert" className="text-sm text-red-500">
          {error}
        </p>
        <button
          onClick={() => void load()}
          className="rounded-xl border px-4 py-2"
        >
          Coba lagi
        </button>
      </div>
    ) : (
      <p className="py-6 text-center text-neutral-500">
        Memuat ukuran tubuh...
      </p>
    );

  const snapshots = data.snapshots;
  const circleSnapshots = snapshots.filter(
    (entry) => entry.waistCm || entry.hipCm || entry.thighCm,
  );
  const defaultBefore = circleSnapshots[0] ?? snapshots[0];
  const defaultAfter = circleSnapshots.at(-1) ?? snapshots.at(-1);
  const before =
    snapshots.find((entry) => entry.date === beforeDate) ?? defaultBefore;
  const after =
    snapshots.find((entry) => entry.date === afterDate) ?? defaultAfter;
  const referenceHeight =
    Math.max(
      before ? (avatarHeight(before) ?? 0) : 0,
      after ? (avatarHeight(after) ?? 0) : 0,
    ) || null;
  const ratios = after ? bodyRatios(after) : null;
  const waistDue = checkInDue(snapshots, "waistCm", data.today);
  const hipDue = checkInDue(snapshots, "hipCm", data.today);
  const thighDue = checkInDue(snapshots, "thighCm", data.today);

  return (
    <div className="space-y-4">
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950"
        >
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-brand-700 dark:text-brand-400">
          {notice}
        </p>
      )}
      <button
        onClick={() => prepareForm(data.today)}
        disabled={busy}
        className="w-full rounded-xl bg-brand-600 px-4 py-3 font-medium text-white disabled:opacity-50"
      >
        + Check-in tubuh
      </button>
      {showReminder && (
        <section className="rounded-2xl border border-brand-100 bg-brand-50 p-4 dark:border-brand-900 dark:bg-brand-950/30">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-sm font-semibold">
              {waistDue.due
                ? "Waktunya check-in pinggang, jika berkenan"
                : "Check-in tubuh tidak perlu setiap hari"}
            </h2>
            <button
              type="button"
              aria-label="Sembunyikan pengingat check-in pada perangkat ini"
              onClick={() => {
                setShowReminder(false);
                try {
                  localStorage.setItem("mk:body-reminder:hidden", "true");
                } catch {}
              }}
              className="text-xs text-neutral-500"
            >
              Sembunyikan
            </button>
          </div>
          <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-300">
            Pinggang:{" "}
            {waistDue.lastDate
              ? `terakhir ${waistDue.lastDate} (${waistDue.days} hari lalu)`
              : "belum diukur"}
            . Saran mingguan; pinggul dan paha dua mingguan opsional.
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            Pinggul{" "}
            {hipDue.due ? "boleh diperbarui" : `terakhir ${hipDue.lastDate}`} ·
            paha{" "}
            {thighDue.due
              ? "boleh diperbarui"
              : `terakhir ${thighDue.lastDate}`}
            . Pengingat boleh diabaikan.
          </p>
        </section>
      )}
      {!showReminder && (
        <button
          type="button"
          className="text-xs text-neutral-500 underline"
          onClick={() => {
            setShowReminder(true);
            try {
              localStorage.removeItem("mk:body-reminder:hidden");
            } catch {}
          }}
        >
          Tampilkan pengingat check-in
        </button>
      )}
      {showForm && (
        <form
          onSubmit={save}
          className="space-y-4 rounded-2xl border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
        >
          <h2 className="font-semibold">Catat atau koreksi ukuran</h2>
          <label className="block text-sm">
            Tanggal
            <input
              required
              type="date"
              max={data.today}
              value={date}
              onChange={(event) => prepareForm(event.target.value)}
              disabled={busy}
              className="mt-1 block w-full rounded-lg border border-neutral-300 bg-transparent p-2 dark:border-neutral-700"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            {BODY_FIELDS.map((field) => (
              <label key={field} className="block text-sm">
                {BODY_LABELS[field].label}{" "}
                <span className="text-xs text-neutral-500">
                  ({BODY_LABELS[field].unit})
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min={BODY_LABELS[field].min}
                  max={BODY_LABELS[field].max}
                  value={draft[field]}
                  placeholder="Opsional"
                  disabled={busy}
                  onChange={(event) => {
                    setDraft((current) => ({
                      ...current,
                      [field]: event.target.value,
                    }));
                    setDirty((current) =>
                      current.includes(field) ? current : [...current, field],
                    );
                  }}
                  className="mt-1 w-full rounded-lg border border-neutral-300 bg-transparent p-2 dark:border-neutral-700"
                />
              </label>
            ))}
          </div>
          <label className="block text-sm">
            Tinggi referensi (cm, opsional)
            <input
              type="number"
              inputMode="decimal"
              min={120}
              max={230}
              step="0.1"
              value={height}
              onChange={(event) => setHeight(event.target.value)}
              disabled={busy}
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-transparent p-2 dark:border-neutral-700"
            />
          </label>
          <p className="text-xs text-neutral-500">
            Hanya kolom ukuran yang diubah disimpan. Kolom kosong mempertahankan
            data lama. Tinggi referensi melekat pada ukuran yang disimpan, bukan
            mengubah tinggi di Profil. Untuk menambahkan tinggi ke ukuran lama,
            ubah atau isi ulang ukuran tersebut.
          </p>
          <details className="text-xs text-neutral-600 dark:text-neutral-300">
            <summary className="cursor-pointer font-medium">
              Panduan pengukuran konsisten
            </summary>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              <li>
                Ukur pada waktu dan kondisi yang serupa. Berdiri rileks, pita
                mendatar dan tidak menekan kulit.
              </li>
              <li>
                Pinggang: gunakan titik yang sama, di tengah antara tulang rusuk
                terbawah dan puncak tulang panggul, setelah napas biasa
                diembuskan.
              </li>
              <li>
                Pinggul: bagian terlebar bokong. Paha: pilih titik dan sisi yang
                sama setiap kali; catat secara konsisten.
              </li>
              <li>
                Perbedaan kecil dapat berasal dari posisi pita atau kondisi
                tubuh. Tidak perlu menyimpulkan dari satu ukuran.
              </li>
            </ul>
          </details>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setShowForm(false)}
              className="flex-1 rounded-lg border border-neutral-300 p-2 dark:border-neutral-700"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={busy}
              className="flex-1 rounded-lg bg-brand-600 p-2 text-white disabled:opacity-50"
            >
              {busy ? "Menyimpan..." : "Simpan ukuran"}
            </button>
          </div>
        </form>
      )}
      {!snapshots.length ? (
        <section className="rounded-2xl border border-dashed border-neutral-300 p-6 text-center dark:border-neutral-700">
          <h2 className="font-semibold">Mulai dari berat atau pinggang</h2>
          <p className="mt-2 text-sm text-neutral-500">
            Satu ukuran sudah cukup untuk baseline. Pinggul, paha, dan body fat
            boleh menyusul. Grafik serta perbandingan muncul dari catatanmu
            sendiri.
          </p>
        </section>
      ) : (
        <>
          <section className="space-y-4 rounded-2xl border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="font-semibold">Bandingkan dua tanggal</h2>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  ["Awal", before?.date ?? "", setBeforeDate],
                  ["Terbaru", after?.date ?? "", setAfterDate],
                ] as const
              ).map(([label, value, setter]) => (
                <label key={label} className="text-xs text-neutral-500">
                  {label}
                  <select
                    value={value}
                    onChange={(event) => setter(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-neutral-300 bg-transparent p-2 text-sm text-neutral-900 dark:border-neutral-700 dark:text-neutral-100"
                  >
                    {snapshots.map((entry) => (
                      <option key={entry.date} value={entry.date}>
                        {entry.date}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            {before && after && before.date >= after.date && (
              <p className="text-xs text-neutral-500">
                Pilih tanggal awal yang lebih lama untuk melihat perubahan. Satu
                tanggal hanya menunjukkan baseline.
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <caption className="sr-only">
                  Perbandingan ukuran pada dua tanggal terpilih
                </caption>
                <thead>
                  <tr>
                    <th className="py-2">Ukuran</th>
                    <th>Awal</th>
                    <th>Terbaru</th>
                    <th>Selisih</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonRows(before, after).map((row) => (
                    <tr
                      key={row.field}
                      className="border-t border-neutral-100 dark:border-neutral-800"
                    >
                      <th className="py-3 font-medium">
                        {BODY_LABELS[row.field].label}
                      </th>
                      <td>
                        {row.before
                          ? `${row.before.value} ${BODY_LABELS[row.field].unit}`
                          : "Belum diukur"}
                      </td>
                      <td>
                        {row.after
                          ? `${row.after.value} ${BODY_LABELS[row.field].unit}`
                          : "Belum diukur"}
                      </td>
                      <td>
                        {row.delta === null
                          ? "—"
                          : `${row.delta > 0 ? "+" : ""}${row.delta} ${BODY_LABELS[row.field].unit}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showAvatar}
                onChange={(event) => {
                  setShowAvatar(event.target.checked);
                  try {
                    localStorage.setItem(
                      "mk:body-avatar:hidden",
                      String(!event.target.checked),
                    );
                  } catch {}
                }}
              />
              Tampilkan ilustrasi tubuh
            </label>
            {showAvatar && before && after && (
              <div className="grid grid-cols-2 gap-2">
                <BodyAvatar
                  snapshot={before}
                  referenceHeightCm={referenceHeight}
                />
                <BodyAvatar
                  snapshot={after}
                  referenceHeightCm={referenceHeight}
                />
              </div>
            )}
            {showAvatar && (
              <p className="text-xs leading-relaxed text-neutral-500">
                Ilustrasi berdasarkan ukuran tercatat; bentuk tubuh sebenarnya
                dapat berbeda. Garis putus-putus adalah template atau bagian
                yang belum diukur. Lingkar tubuh tidak menentukan lebar
                penampang, struktur rangka, lemak visceral, atau massa otot. BMI
                tidak mengubah bentuk avatar.
              </p>
            )}
            {ratios && (
              <details className="text-sm">
                <summary className="cursor-pointer text-neutral-500">
                  Rasio pada {after?.date}
                </summary>
                <dl className="mt-3 grid grid-cols-2 gap-3">
                  {(
                    [
                      ["BMI", ratios.bmi],
                      ["Pinggang / tinggi", ratios.whtr],
                      ["Pinggang / pinggul", ratios.whr],
                      ["Pinggang / paha", ratios.wtr],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-xs text-neutral-500">{label}</dt>
                      <dd className="font-medium">
                        {value ?? "Belum cukup ukuran"}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-2 text-xs text-neutral-500">
                  Rasio memakai ukuran pada tanggal yang sama. BMI memakai
                  tinggi referensi berat (
                  {after?.weightKg?.heightCm ?? "belum ada"} cm);
                  pinggang/tinggi memakai tinggi referensi pinggang (
                  {after?.waistCm?.heightCm ?? "belum ada"} cm). Rasio paha
                  hanya eksploratif; tidak ada skor atau diagnosis gabungan.
                </p>
              </details>
            )}
          </section>
          <WeightForecastCard trend={data.weightTrend} />
          <section className="rounded-2xl border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="mb-2 text-sm font-semibold">
              Berat · 30 tanggal terakhir
            </h2>
            <MetricChart snapshots={snapshots.slice(-30)} field="weightKg" />
            <p className="mt-2 text-xs text-neutral-500">
              Rata-rata 7 hari saat ini:{" "}
              {data.weightTrend.avg7 !== null
                ? `${data.weightTrend.avg7} kg`
                : "belum ada data"}
              .
            </p>
          </section>
          <section className="rounded-2xl border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="mb-2 text-sm font-semibold">
              Pinggang · 30 tanggal terakhir
            </h2>
            <MetricChart snapshots={snapshots.slice(-30)} field="waistCm" />
          </section>
          <section className="space-y-3">
            <h2 className="font-semibold">Riwayat pengukuran</h2>
            {snapshots
              .slice()
              .reverse()
              .map((entry) => (
                <details
                  key={entry.date}
                  className="rounded-2xl border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
                >
                  <summary className="cursor-pointer text-sm font-medium">
                    {entry.date} ·{" "}
                    {BODY_FIELDS.filter((field) => entry[field]).length} ukuran
                  </summary>
                  <ul className="mt-3 space-y-3">
                    {BODY_FIELDS.filter((field) => entry[field]).map(
                      (field) => (
                        <li
                          key={field}
                          className="flex items-start justify-between gap-2 text-sm"
                        >
                          <div>
                            <span className="font-medium">
                              {BODY_LABELS[field].label}: {entry[field]!.value}{" "}
                              {BODY_LABELS[field].unit}
                            </span>
                            <p className="text-xs text-neutral-500">
                              {sourceLabel(entry[field]!.source)} · tinggi
                              referensi{" "}
                              {entry[field]!.heightCm
                                ? `${entry[field]!.heightCm} cm`
                                : "belum ada"}
                            </p>
                            <p className="text-xs text-neutral-500">
                              Disimpan{" "}
                              {new Date(
                                entry[field]!.recordedAt,
                              ).toLocaleString("id-ID")}
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void remove(entry.date, field)}
                            aria-label={`Hapus ${BODY_LABELS[field].label} tanggal ${entry.date}`}
                            className="rounded-lg border border-neutral-200 px-2 py-1 text-xs dark:border-neutral-700"
                          >
                            Hapus
                          </button>
                        </li>
                      ),
                    )}
                  </ul>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => prepareForm(entry.date)}
                    className="mt-3 rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700"
                  >
                    Koreksi tanggal ini
                  </button>
                </details>
              ))}
          </section>
        </>
      )}
    </div>
  );
}
