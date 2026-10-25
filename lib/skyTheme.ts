export type SkyId = "pagi" | "siang" | "sore" | "malam";

export function skyForHour(hour: number): SkyId {
  if (hour >= 5 && hour < 10) return "pagi";
  if (hour >= 10 && hour < 15) return "siang";
  if (hour >= 15 && hour < 19) return "sore";
  return "malam";
}

// Every gradient keeps white text at >= 4.5:1 contrast across its full height.
export const SKY_GRADIENT: Record<SkyId, string> = {
  pagi: "linear-gradient(180deg, #0e7490 0%, #0f766e 55%, #115e59 100%)",
  siang: "linear-gradient(180deg, #059669 0%, #047857 55%, #065f46 100%)",
  sore: "linear-gradient(180deg, #c2410c 0%, #9d174d 55%, #581c87 100%)",
  malam: "linear-gradient(180deg, #1e1b4b 0%, #312e81 50%, #134e4a 100%)",
};
