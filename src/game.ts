export type GameMode = {
  size: number;
  label: string;
  title: string;
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

export function getBestTime(mode: GameMode): number | null {
  const stored = localStorage.getItem(`gridfox-best-${mode.size}`);
  if (!stored) return null;

  const parsed = Number(stored);
  return Number.isFinite(parsed) ? parsed : null;
}

export function saveBestTime(mode: GameMode, elapsedMs: number): number {
  const previous = getBestTime(mode);
  const best = previous === null ? elapsedMs : Math.min(previous, elapsedMs);
  localStorage.setItem(`gridfox-best-${mode.size}`, String(best));
  return best;
}
