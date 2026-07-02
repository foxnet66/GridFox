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

export type ChallengeLayout = "grid" | "radial" | "hex" | "mosaic";

export type ChallengeLayoutOption = {
  id: ChallengeLayout;
  label: string;
  name: string;
};

export type RotationSpeed = "none" | "slow" | "fast";

export type RotationSpeedOption = {
  id: RotationSpeed;
  label: string;
  name: string;
  durationSeconds: number | null;
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
  layout: ChallengeLayout;
  rotation: RotationSpeed;
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

export const HEX_TOTAL = 30;
export const MOSAIC_TOTAL = 30;

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

export const CHALLENGE_LAYOUTS: ChallengeLayoutOption[] = [
  { id: "grid", label: "方格", name: "标准方格" },
  { id: "radial", label: "圆盘", name: "圆盘舒尔特" },
  { id: "hex", label: "蜂巢", name: "蜂巢舒尔特" },
  { id: "mosaic", label: "变形", name: "变形舒尔特" },
];

export const ROTATION_SPEEDS: RotationSpeedOption[] = [
  { id: "none", label: "静态", name: "静态圆盘", durationSeconds: null },
  { id: "slow", label: "慢速", name: "慢速旋转", durationSeconds: 60 },
  { id: "fast", label: "快速", name: "快速旋转", durationSeconds: 36 },
];

export const THEMES: ThemeOption[] = [
  { id: "fresh", label: "清爽" },
  { id: "ocean", label: "深海" },
  { id: "vivid", label: "活力" },
];

export function createGrid(size: number): number[] {
  return createNumbers(size * size);
}

export function createNumbers(total: number): number[] {
  const values = Array.from({ length: total }, (_, index) => index + 1);

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

export function getChallengeTotal(mode: GameMode, layout: ChallengeLayout): number {
  if (layout === "mosaic") return MOSAIC_TOTAL;
  return layout === "hex" ? HEX_TOTAL : mode.size * mode.size;
}

export function getInitialTarget(mode: GameMode, order: ChallengeOrder, layout: ChallengeLayout = "grid"): number {
  return order === "desc" ? getChallengeTotal(mode, layout) : 1;
}

export function getNextTarget(target: number, order: ChallengeOrder): number {
  return order === "desc" ? target - 1 : target + 1;
}

export function isFinalTarget(target: number, order: ChallengeOrder, total: number): boolean {
  return order === "desc" ? target === 1 : target === total;
}

export function getTargetRange(
  mode: GameMode,
  order: ChallengeOrder,
  layout: ChallengeLayout = "grid",
): { start: number; end: number } {
  const total = getChallengeTotal(mode, layout);
  return order === "desc" ? { start: total, end: 1 } : { start: 1, end: total };
}

export function getBestTime(
  mode: GameMode,
  order: ChallengeOrder,
  layout: ChallengeLayout,
  rotation: RotationSpeed = "none",
): number | null {
  const rotationKey = layout === "radial" ? rotation : "none";
  const stored =
    localStorage.getItem(`gridfox-best-${mode.size}-${order}-${layout}-${rotationKey}`) ??
    getLegacyBestTime(mode, order, layout, rotationKey);
  if (!stored) return null;

  const parsed = Number(stored);
  return Number.isFinite(parsed) ? parsed : null;
}

function getLegacyBestTime(
  mode: GameMode,
  order: ChallengeOrder,
  layout: ChallengeLayout,
  rotation: RotationSpeed,
): string | null {
  if (rotation !== "none") return null;
  const layoutScoped = localStorage.getItem(`gridfox-best-${mode.size}-${order}-${layout}`);
  if (layoutScoped) return layoutScoped;
  if (order !== "asc" || layout !== "grid") return null;
  return localStorage.getItem(`gridfox-best-${mode.size}-asc`) ?? localStorage.getItem(`gridfox-best-${mode.size}`);
}

export function saveBestTime(
  mode: GameMode,
  order: ChallengeOrder,
  layout: ChallengeLayout,
  rotation: RotationSpeed,
  elapsedMs: number,
): number {
  const rotationKey = layout === "radial" ? rotation : "none";
  const previous = getBestTime(mode, order, layout, rotationKey);
  const best = previous === null ? elapsedMs : Math.min(previous, elapsedMs);
  localStorage.setItem(`gridfox-best-${mode.size}-${order}-${layout}-${rotationKey}`, String(best));
  return best;
}

export function getRadialRingCounts(total: number): number[] {
  if (total === 36) return [6, 12, 18];
  if (total === 25) return [5, 8, 12];
  if (total === 16) return [4, 5, 7];
  const inner = Math.max(4, Math.round(total * 0.18));
  const middle = Math.max(6, Math.round(total * 0.32));
  return [inner, middle, total - inner - middle];
}

export type RadialCellGeometry = {
  ring: number;
  indexInRing: number;
  countInRing: number;
  startAngle: number;
  endAngle: number;
  innerRadius: number;
  outerRadius: number;
  labelRadius: number;
  labelAngle: number;
};

export function getRadialGeometry(total: number): RadialCellGeometry[] {
  const ringCounts = getRadialRingCounts(total);
  const ringWidth = 48 / ringCounts.length;
  let cursor = 0;

  return ringCounts.flatMap((countInRing, ring) => {
    const innerRadius = 8 + ring * ringWidth;
    const outerRadius = innerRadius + ringWidth;
    const angleOffset = ring % 2 === 0 ? -90 : -90 + 180 / countInRing;
    return Array.from({ length: countInRing }, (_, indexInRing) => {
      const startAngle = angleOffset + (360 / countInRing) * indexInRing;
      const endAngle = angleOffset + (360 / countInRing) * (indexInRing + 1);
      cursor += 1;
      return {
        ring,
        indexInRing,
        countInRing,
        startAngle,
        endAngle,
        innerRadius,
        outerRadius,
        labelRadius: (innerRadius + outerRadius) / 2,
        labelAngle: (startAngle + endAngle) / 2,
      };
    });
  }).slice(0, total);
}

export function polarToCartesian(center: number, radius: number, angleDegrees: number): { x: number; y: number } {
  const angleRadians = (angleDegrees * Math.PI) / 180;
  return {
    x: center + radius * Math.cos(angleRadians),
    y: center + radius * Math.sin(angleRadians),
  };
}

export function describeRadialSegment(geometry: RadialCellGeometry): string {
  const center = 50;
  const outerStart = polarToCartesian(center, geometry.outerRadius, geometry.startAngle);
  const outerEnd = polarToCartesian(center, geometry.outerRadius, geometry.endAngle);
  const innerEnd = polarToCartesian(center, geometry.innerRadius, geometry.endAngle);
  const innerStart = polarToCartesian(center, geometry.innerRadius, geometry.startAngle);
  const largeArcFlag = geometry.endAngle - geometry.startAngle > 180 ? 1 : 0;

  return [
    `M ${outerStart.x.toFixed(3)} ${outerStart.y.toFixed(3)}`,
    `A ${geometry.outerRadius} ${geometry.outerRadius} 0 ${largeArcFlag} 1 ${outerEnd.x.toFixed(3)} ${outerEnd.y.toFixed(3)}`,
    `L ${innerEnd.x.toFixed(3)} ${innerEnd.y.toFixed(3)}`,
    `A ${geometry.innerRadius} ${geometry.innerRadius} 0 ${largeArcFlag} 0 ${innerStart.x.toFixed(3)} ${innerStart.y.toFixed(3)}`,
    "Z",
  ].join(" ");
}
