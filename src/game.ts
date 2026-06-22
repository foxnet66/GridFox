export type GameMode = {
  size: number;
  label: string;
  title: string;
};

export type ChallengeOrder = "asc" | "desc";

export type ChallengeOrderOption = {
  id: ChallengeOrder;
  label: string;
  name: string;
};

export type ColorCount = 1 | 2 | 4 | 8;

export type ThemeOption = {
  id: "fresh" | "ocean" | "vivid";
  label: string;
};

export type TapRecord = {
  number: number;
  target: number;
  elapsedMs: number;
  row: number;
  col: number;
  correct: boolean;
};

export type FinishedRun = {
  mode: GameMode;
  order: ChallengeOrder;
  grid: number[];
  taps: TapRecord[];
  elapsedMs: number;
  completedAt: string;
};

export const DEFAULT_MODE: GameMode = {
  size: 6,
  label: "6x6",
  title: "按顺序从 1 找到 36",
};

export const MODES: GameMode[] = [
  { size: 4, label: "4x4", title: "按顺序从 1 找到 16" },
  { size: 5, label: "5x5", title: "按顺序从 1 找到 25" },
  DEFAULT_MODE,
];

export const COLOR_COUNTS: ColorCount[] = [1, 2, 4, 8];

export const CHALLENGE_ORDERS: ChallengeOrderOption[] = [
  { id: "asc", label: "顺序", name: "顺序查找" },
  { id: "desc", label: "倒序", name: "倒序查找" },
];

export const THEMES: ThemeOption[] = [
  { id: "fresh", label: "清爽" },
  { id: "ocean", label: "深海" },
  { id: "vivid", label: "活力" },
];

export function createGrid(size: number): number[] {
  const values = Array.from({ length: size * size }, (_, index) => index + 1);

  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }

  return values;
}

export function formatTime(ms: number, withCenti = false): string {
  const totalCentiseconds = Math.floor(ms / 10);
  const minutes = Math.floor(totalCentiseconds / 6000);
  const seconds = Math.floor((totalCentiseconds % 6000) / 100);
  const centiseconds = totalCentiseconds % 100;

  if (withCenti) {
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(
      centiseconds,
    ).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function getAccentClass(number: number, colorCount: ColorCount): string {
  const accents = [
    "number-dark",
    "number-blue",
    "number-red",
    "number-green",
    "number-purple",
    "number-gold",
    "number-teal",
    "number-rose",
  ];
  return accents[number % colorCount];
}

export function getInitialTarget(mode: GameMode, order: ChallengeOrder): number {
  return order === "desc" ? mode.size * mode.size : 1;
}

export function getNextTarget(target: number, order: ChallengeOrder): number {
  return order === "desc" ? target - 1 : target + 1;
}

export function isFinalTarget(target: number, order: ChallengeOrder, total: number): boolean {
  return order === "desc" ? target === 1 : target === total;
}

export function getTargetRange(mode: GameMode, order: ChallengeOrder): { start: number; end: number } {
  const total = mode.size * mode.size;
  return order === "desc" ? { start: total, end: 1 } : { start: 1, end: total };
}

export function getBestTime(mode: GameMode, order: ChallengeOrder): number | null {
  const stored = localStorage.getItem(`gridfox-best-${mode.size}-${order}`) ?? getLegacyBestTime(mode, order);
  if (!stored) return null;

  const parsed = Number(stored);
  return Number.isFinite(parsed) ? parsed : null;
}

function getLegacyBestTime(mode: GameMode, order: ChallengeOrder): string | null {
  if (order !== "asc") return null;
  return localStorage.getItem(`gridfox-best-${mode.size}`);
}

export function saveBestTime(mode: GameMode, order: ChallengeOrder, elapsedMs: number): number {
  const previous = getBestTime(mode, order);
  const best = previous === null ? elapsedMs : Math.min(previous, elapsedMs);
  localStorage.setItem(`gridfox-best-${mode.size}-${order}`, String(best));
  return best;
}
