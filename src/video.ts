import type { FinishedRun, TapRecord } from "./game";
import { formatTime } from "./game";

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;

type DrawState = {
  run: FinishedRun;
  elapsedMs: number;
  currentTarget: number;
  activeTap: TapRecord | null;
};

export async function createChallengeVideo(run: FinishedRun): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("无法创建视频画布");
  }
  const ctx = context;

  const stream = canvas.captureStream(FPS);
  const mimeType = getSupportedMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];

  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  });

  const duration = Math.max(3600, Math.min(18000, run.elapsedMs + 2600));
  const startDelay = 900;
  const endHold = 1300;
  const started = performance.now();

  recorder.start();

  await new Promise<void>((resolve) => {
    function frame(now: number) {
      const progressMs = now - started;
      const replayMs = Math.max(0, Math.min(run.elapsedMs, progressMs - startDelay));
      const activeTap = findActiveTap(run.taps, replayMs);
      const correctTaps = run.taps.filter((tap) => tap.correct && tap.elapsedMs <= replayMs);
      const currentTarget = Math.min(correctTaps.length + 1, run.mode.size * run.mode.size);

      drawFrame(ctx, {
        run,
        elapsedMs: progressMs > duration - endHold ? run.elapsedMs : replayMs,
        currentTarget,
        activeTap,
      });

      if (progressMs < duration) {
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

function getSupportedMimeType(): string {
  const candidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || "";
}

function findActiveTap(taps: TapRecord[], elapsedMs: number): TapRecord | null {
  const latest = [...taps].reverse().find((tap) => Math.abs(elapsedMs - tap.elapsedMs) < 260);
  return latest || null;
}

function drawFrame(context: CanvasRenderingContext2D, state: DrawState) {
  const { run, elapsedMs, currentTarget, activeTap } = state;
  const size = run.mode.size;
  const gridLeft = 76;
  const gridTop = 492;
  const gridSize = WIDTH - gridLeft * 2;
  const cellSize = gridSize / size;

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, WIDTH, HEIGHT);

  context.fillStyle = "#111827";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = "800 68px Arial, sans-serif";
  drawRichTitle(context, run.mode.size * run.mode.size);

  context.font = "800 48px Arial, sans-serif";
  context.fillStyle = "#111827";
  context.fillText("用时", WIDTH / 2 - 120, 330);
  context.font = "900 78px Arial, sans-serif";
  context.fillStyle = "#007783";
  context.fillText(formatTime(elapsedMs), WIDTH / 2 + 74, 330);

  context.strokeStyle = "#b9bec7";
  context.lineWidth = 2;
  roundRect(context, gridLeft, gridTop, gridSize, gridSize, 12);
  context.stroke();

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const x = gridLeft + col * cellSize;
      const y = gridTop + row * cellSize;
      const number = run.grid[row * size + col];
      const tapped = run.taps.some((tap) => tap.correct && tap.number === number && tap.elapsedMs <= elapsedMs);

      context.strokeStyle = "#c4c8d0";
      context.lineWidth = 1.6;
      context.strokeRect(x, y, cellSize, cellSize);

      if (tapped) {
        context.fillStyle = "rgba(0, 119, 131, 0.08)";
        context.fillRect(x + 2, y + 2, cellSize - 4, cellSize - 4);
      }

      context.fillStyle = getCanvasColor(number);
      context.font = `900 ${size >= 6 ? 64 : 78}px Arial, sans-serif`;
      context.fillText(String(number), x + cellSize / 2, y + cellSize / 2 + 2);
    }
  }

  if (activeTap) {
    const centerX = gridLeft + activeTap.col * cellSize + cellSize / 2;
    const centerY = gridTop + activeTap.row * cellSize + cellSize / 2;
    context.strokeStyle = activeTap.correct ? "#007783" : "#dc342f";
    context.lineWidth = 10;
    context.beginPath();
    context.arc(centerX, centerY, cellSize * 0.34, 0, Math.PI * 2);
    context.stroke();
  }

  context.fillStyle = "#111827";
  context.font = "800 38px Arial, sans-serif";
  context.fillText(`当前目标 ${currentTarget}`, WIDTH / 2, 1426);

  context.fillStyle = "#007783";
  context.font = "900 76px Arial, sans-serif";
  context.fillText(`完成 ${formatTime(run.elapsedMs, true)}`, WIDTH / 2, 1534);

  context.fillStyle = "#111827";
  context.font = "800 42px Arial, sans-serif";
  context.fillText("评论区留下年龄 + 用时", WIDTH / 2, 1692);

  context.fillStyle = "#6b7280";
  context.font = "700 26px Arial, sans-serif";
  context.fillText("GridFox 舒尔特方格挑战", WIDTH / 2, 1770);
}

function drawRichTitle(context: CanvasRenderingContext2D, total: number) {
  const parts = [
    { text: "按顺序从 ", color: "#111827" },
    { text: "1", color: "#dc342f" },
    { text: " 找到 ", color: "#111827" },
    { text: String(total), color: "#dc342f" },
  ];
  const widths = parts.map((part) => context.measureText(part.text).width);
  let cursor = (WIDTH - widths.reduce((sum, width) => sum + width, 0)) / 2;

  parts.forEach((part, index) => {
    context.fillStyle = part.color;
    context.fillText(part.text, cursor + widths[index] / 2, 210);
    cursor += widths[index];
  });
}

function getCanvasColor(number: number): string {
  if ([2, 4, 5, 14, 17, 19].includes(number)) return "#dc342f";
  if ([7, 11, 12, 20, 22, 23].includes(number)) return "#1268ad";
  if ([3, 6, 10, 13, 16, 18].includes(number)) return "#007f67";
  return "#111827";
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
