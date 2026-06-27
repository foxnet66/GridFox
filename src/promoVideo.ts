import {
  createGrid,
  describeRadialSegment,
  formatTime,
  getAccentClass,
  getRadialGeometry,
  getTargetRange,
  polarToCartesian,
  type ChallengeLayout,
  type ChallengeOrder,
  type ColorCount,
  type RotationSpeed,
  type ThemeOption,
} from "./game";

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;
const DURATION_MS = 120_000;
const INTRO_MS = 3_000;

type PromoVideoOptions = {
  size: number;
  colorCount: ColorCount;
  theme: ThemeOption["id"];
  order: ChallengeOrder;
  layout: ChallengeLayout;
  rotation: RotationSpeed;
};

const themePalettes: Record<
  ThemeOption["id"],
  {
    ink: string;
    paper: string;
    primary: string;
    accent: string;
    muted: string;
    grid: string;
    colors: Record<string, string>;
  }
> = {
  fresh: {
    ink: "#18212f",
    paper: "#fffdf8",
    primary: "#116b5d",
    accent: "#ef6f48",
    muted: "#6d7789",
    grid: "#c9d3ce",
    colors: {
      "number-dark": "#18212f",
      "number-blue": "#2369c9",
      "number-red": "#df4f3f",
      "number-green": "#138a66",
      "number-purple": "#7b4cc2",
      "number-gold": "#c78919",
      "number-teal": "#00858a",
      "number-rose": "#c83f70",
    },
  },
  ocean: {
    ink: "#142134",
    paper: "#f8fbff",
    primary: "#185c8f",
    accent: "#e45f4f",
    muted: "#65758d",
    grid: "#cfdae8",
    colors: {
      "number-dark": "#142134",
      "number-blue": "#1c66d2",
      "number-red": "#d95550",
      "number-green": "#17806d",
      "number-purple": "#6652c7",
      "number-gold": "#b57c10",
      "number-teal": "#007c8f",
      "number-rose": "#b94672",
    },
  },
  vivid: {
    ink: "#1d1a2e",
    paper: "#fffaf4",
    primary: "#b5531f",
    accent: "#f05f38",
    muted: "#756f86",
    grid: "#e2d8cc",
    colors: {
      "number-dark": "#1d1a2e",
      "number-blue": "#1668d9",
      "number-red": "#e2473f",
      "number-green": "#11885d",
      "number-purple": "#8053cf",
      "number-gold": "#c47a00",
      "number-teal": "#00848f",
      "number-rose": "#cf3d7d",
    },
  },
};

export async function createPromoVideo(options: PromoVideoOptions): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法创建视频画布");
  const ctx = context;

  const stream = canvas.captureStream(FPS);
  const mimeType = getSupportedMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];
  const grid = createGrid(options.size);
  const started = performance.now();

  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  });

  recorder.start(1000);

  await new Promise<void>((resolve) => {
    function frame(now: number) {
      const progressMs = Math.min(now - started, INTRO_MS + DURATION_MS);
      if (progressMs < INTRO_MS) {
        drawIntroFrame(ctx, Math.max(1, 3 - Math.floor(progressMs / 1000)), options);
      } else {
        drawFrame(ctx, grid, progressMs - INTRO_MS, options);
      }

      if (progressMs < INTRO_MS + DURATION_MS) {
        requestAnimationFrame(frame);
      } else {
        recorder.stop();
        resolve();
      }
    }

    requestAnimationFrame(frame);
  });

  await new Promise<void>((resolve) => {
    recorder.addEventListener("stop", () => resolve(), { once: true });
  });

  return new Blob(chunks, { type: mimeType || "video/webm" });
}

function drawIntroFrame(context: CanvasRenderingContext2D, countdown: number, options: PromoVideoOptions) {
  const palette = themePalettes[options.theme];
  const ghostLeft = 126;
  const ghostTop = 512;
  const ghostSize = 828;
  const ghostCell = ghostSize / options.size;

  context.fillStyle = palette.paper;
  context.fillRect(0, 0, WIDTH, HEIGHT);

  context.globalAlpha = 0.16;
  context.strokeStyle = palette.grid;
  context.lineWidth = 2;
  roundRect(context, ghostLeft, ghostTop, ghostSize, ghostSize, 22);
  context.stroke();
  for (let index = 1; index < options.size; index += 1) {
    const offset = index * ghostCell;
    context.beginPath();
    context.moveTo(ghostLeft + offset, ghostTop);
    context.lineTo(ghostLeft + offset, ghostTop + ghostSize);
    context.moveTo(ghostLeft, ghostTop + offset);
    context.lineTo(ghostLeft + ghostSize, ghostTop + offset);
    context.stroke();
  }
  context.globalAlpha = 1;

  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = palette.ink;
  context.font = "950 86px Arial, sans-serif";
  context.fillText("每日专注力训练", WIDTH / 2, 278);

  context.fillStyle = palette.primary;
  context.font = "900 46px Arial, sans-serif";
  context.fillText(
    options.layout === "radial" && options.rotation !== "none"
      ? `旋转圆盘舒尔特 ${options.size * options.size}`
      : options.layout === "radial"
        ? `圆盘舒尔特 ${options.size * options.size}`
        : `舒尔特方格 ${options.size}×${options.size}`,
    WIDTH / 2,
    382,
  );

  context.strokeStyle = palette.grid;
  context.lineWidth = 12;
  context.beginPath();
  context.arc(WIDTH / 2, 890, 200, 0, Math.PI * 2);
  context.stroke();
  context.strokeStyle = palette.accent;
  context.beginPath();
  context.arc(WIDTH / 2, 890, 200, -Math.PI / 2, Math.PI / 4);
  context.stroke();

  context.fillStyle = palette.accent;
  context.font = "950 228px Arial, sans-serif";
  context.fillText(String(countdown), WIDTH / 2, 900);

  context.fillStyle = palette.muted;
  context.font = "850 42px Arial, sans-serif";
  context.fillText("准备开始", WIDTH / 2, 1168);

  context.font = "800 34px Arial, sans-serif";
  context.fillText("计时挑战@新加坡大小AI玩", WIDTH / 2, 1688);
}

function drawFrame(
  context: CanvasRenderingContext2D,
  grid: number[],
  elapsedMs: number,
  options: PromoVideoOptions,
) {
  const palette = themePalettes[options.theme];
  const gridLeft = 76;
  const gridTop = 540;
  const gridSize = WIDTH - gridLeft * 2;
  const cellSize = gridSize / options.size;
  const range = getTargetRange({ size: options.size, label: `${options.size}x${options.size}`, title: "" }, options.order);

  context.fillStyle = palette.paper;
  context.fillRect(0, 0, WIDTH, HEIGHT);

  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = palette.primary;
  context.font = "900 46px Arial, sans-serif";
  context.fillText(
    options.layout === "radial" && options.rotation !== "none"
      ? "GridFox 旋转圆盘挑战"
      : options.layout === "radial"
        ? "GridFox 圆盘舒尔特挑战"
        : "GridFox 舒尔特方格挑战",
    WIDTH / 2,
    116,
  );

  context.font = "900 78px Arial, sans-serif";
  drawRichTitle(context, palette, range.start, range.end);

  context.fillStyle = palette.muted;
  context.font = "800 38px Arial, sans-serif";
  context.fillText(`从 ${range.start} 到 ${range.end}，看看你需要多久`, WIDTH / 2, 326);

  context.fillStyle = palette.primary;
  context.font = "900 78px Arial, sans-serif";
  context.fillText(formatTime(elapsedMs), WIDTH / 2, 424);

  if (options.layout === "radial") {
    drawRadialBoard(context, grid, elapsedMs, options, palette, gridLeft, gridTop, gridSize);
  } else {
    roundRect(context, gridLeft, gridTop, gridSize, gridSize, 18);
    context.fillStyle = "#ffffff";
    context.fill();
    context.strokeStyle = palette.grid;
    context.lineWidth = 3;
    context.stroke();

    grid.forEach((number, index) => {
      const row = Math.floor(index / options.size);
      const col = index % options.size;
      const x = gridLeft + col * cellSize;
      const y = gridTop + row * cellSize;

      context.strokeStyle = palette.grid;
      context.lineWidth = 2;
      context.strokeRect(x, y, cellSize, cellSize);

      context.fillStyle = palette.colors[getAccentClass(number, options.colorCount)];
      context.font = `900 ${options.size >= 6 ? 66 : 82}px Arial, sans-serif`;
      context.fillText(String(number), x + cellSize / 2, y + cellSize / 2 + 2);
    });
  }

  context.fillStyle = palette.ink;
  context.font = "900 48px Arial, sans-serif";
  context.fillText("评论区留下年龄和成绩", WIDTH / 2, 1588);

  context.fillStyle = palette.muted;
  context.font = "700 30px Arial, sans-serif";
  context.fillText("计时挑战@新加坡大小AI玩", WIDTH / 2, 1682);
}

function drawRadialBoard(
  context: CanvasRenderingContext2D,
  grid: number[],
  elapsedMs: number,
  options: PromoVideoOptions,
  palette: (typeof themePalettes)[ThemeOption["id"]],
  left: number,
  top: number,
  size: number,
) {
  const scale = size / 100;
  const geometry = getRadialGeometry(options.size * options.size);

  context.save();
  context.translate(left + size / 2, top + size / 2);
  context.rotate((getRotationDegrees(options.rotation, elapsedMs) * Math.PI) / 180);
  context.translate(-size / 2, -size / 2);
  context.scale(scale, scale);
  context.fillStyle = "#ffffff";
  context.strokeStyle = palette.grid;
  context.lineWidth = 0.46;

  grid.forEach((number, index) => {
    const cellGeometry = geometry[index];
    const path = new Path2D(describeRadialSegment(cellGeometry));
    context.fillStyle = "#ffffff";
    context.fill(path);
    context.strokeStyle = palette.grid;
    context.stroke(path);

    const labelPoint = polarToCartesian(50, cellGeometry.labelRadius, cellGeometry.labelAngle);
    context.fillStyle = palette.colors[getAccentClass(number, options.colorCount)];
    context.font = "950 5.4px Arial, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(String(number), labelPoint.x, labelPoint.y + 0.25);
  });

  context.beginPath();
  context.arc(50, 50, 8, 0, Math.PI * 2);
  context.fillStyle = palette.paper;
  context.fill();
  context.strokeStyle = palette.grid;
  context.stroke();
  context.restore();
}

function getRotationDegrees(rotation: RotationSpeed, elapsedMs: number): number {
  if (rotation === "slow") return (elapsedMs / 1000) * 6;
  if (rotation === "fast") return (elapsedMs / 1000) * 10;
  return 0;
}

function drawRichTitle(
  context: CanvasRenderingContext2D,
  palette: (typeof themePalettes)[ThemeOption["id"]],
  start: number,
  end: number,
) {
  const parts = [
    { text: "请按顺序从 ", color: palette.ink },
    { text: String(start), color: palette.accent },
    { text: " 找到 ", color: palette.ink },
    { text: String(end), color: palette.accent },
  ];
  const widths = parts.map((part) => context.measureText(part.text).width);
  let cursor = (WIDTH - widths.reduce((sum, width) => sum + width, 0)) / 2;

  parts.forEach((part, index) => {
    context.fillStyle = part.color;
    context.fillText(part.text, cursor + widths[index] / 2, 232);
    cursor += widths[index];
  });
}

function getSupportedMimeType(): string {
  const candidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || "";
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}
