import type { UserSettings } from "./types";

// The profile editor must reject out-of-range values before showing a target;
// otherwise the settings API's normalisation could apply a different number.
export function programDraftError(settings: UserSettings): string | null {
  if (settings.age !== null && (!Number.isInteger(settings.age) || settings.age < 18 || settings.age > 100)) return "Isi usia 18–100 tahun.";
  if (settings.heightCm !== null && (!Number.isFinite(settings.heightCm) || settings.heightCm < 120 || settings.heightCm > 230)) return "Isi tinggi 120–230 cm.";
  if (!Number.isFinite(settings.weightKg) || settings.weightKg < 30 || settings.weightKg > 300) return "Isi berat acuan 30–300 kg.";
  if (!Number.isFinite(settings.goalWeightKg) || settings.goalWeightKg < 30 || settings.goalWeightKg > 300) return "Isi target berat 30–300 kg.";
  if (!Number.isFinite(settings.dailyTargetKcal) || settings.dailyTargetKcal < 800) return "Target kalori harus berupa angka minimal 800 kcal sesuai batas input app.";
  if (!Number.isFinite(settings.proteinTargetG) || settings.proteinTargetG < 20) return "Target protein harus berupa angka minimal 20 g sesuai batas input app.";
  if (!Number.isFinite(settings.ifWindowHours) || settings.ifWindowHours < 4 || settings.ifWindowHours > 16) return "Isi window makan antara 4–16 jam.";
  try { new Intl.DateTimeFormat("id-ID", { timeZone: settings.timezone }).format(); }
  catch { return "Zona waktu belum valid. Contoh: Asia/Jakarta."; }
  return null;
}
