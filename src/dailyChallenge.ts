import type { ChallengeLayout, ChallengeOrder, ColorCount, ThemeOption } from "./game";

const DAILY_EPOCH = Date.UTC(2026, 0, 1);
const DAY_MS = 86_400_000;

type DailyPreset = {
  size: number;
  layout: ChallengeLayout;
  order: ChallengeOrder;
  theme: ThemeOption["id"];
  colors: ColorCount;
};

export type DailyChallenge = DailyPreset & {
  day: number;
  seed: number;
};

const dailyPresets: DailyPreset[] = [
  { size: 5, layout: "grid", order: "asc", theme: "fresh", colors: 4 },
  { size: 5, layout: "grid", order: "desc", theme: "ocean", colors: 4 },
  { size: 6, layout: "radial", order: "asc", theme: "fresh", colors: 4 },
  { size: 6, layout: "radial", order: "desc", theme: "vivid", colors: 4 },
  { size: 4, layout: "grid", order: "asc", theme: "vivid", colors: 2 },
  { size: 6, layout: "grid", order: "desc", theme: "ocean", colors: 8 },
];

export function getDailyChallenge(date = new Date()): DailyChallenge {
  const utcMidnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const day = Math.max(1, Math.floor((utcMidnight - DAILY_EPOCH) / DAY_MS) + 1);
  const preset = dailyPresets[(day - 1) % dailyPresets.length];

  return {
    day,
    seed: 10_000 + day,
    ...preset,
  };
}
