import { mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { getDailyChallenge } from "./daily-challenge.mjs";

const FPS = 30;
const INTRO_SECONDS = 3;
const ROOT = resolve(new URL("..", import.meta.url).pathname);
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const FFMPEG = "/opt/homebrew/bin/ffmpeg";
const DEFAULT_OUTPUT = resolve(ROOT, "dist/gridfox-xiaohongshu.mp4");

const canvasProfiles = {
  "9:16": {
    width: 1080,
    height: 1920,
    intro: {
      ghostLeft: 126,
      ghostTop: 512,
      ghostSize: 828,
      titleTop: 214,
      titleFont: 90,
      projectTop: 350,
      projectFont: 58,
      ringLeft: 330,
      ringTop: 674,
      ringSize: 400,
      countTop: 728,
      countFont: 228,
      readyTop: 1118,
      readyFont: 54,
      creditTop: 1668,
      creditFont: 34,
    },
    challenge: {
      brandTop: 86,
      brandFont: 46,
      titleTop: 178,
      titleFont: 78,
      subtitleTop: 296,
      subtitleFont: 38,
      timerTop: 370,
      timerFont: 78,
      boardLeft: 76,
      boardTop: 540,
      boardSize: 928,
      tallBoardTop: 548,
      tallBoardHeight: 965,
      promptTop: 1548,
      promptFont: 48,
      creditTop: 1648,
      creditFont: 34,
    },
  },
  "3:4": {
    width: 1080,
    height: 1440,
    intro: {
      ghostLeft: 160,
      ghostTop: 352,
      ghostSize: 760,
      titleTop: 104,
      titleFont: 84,
      projectTop: 226,
      projectFont: 56,
      ringLeft: 360,
      ringTop: 474,
      ringSize: 340,
      countTop: 520,
      countFont: 190,
      readyTop: 850,
      readyFont: 52,
      creditTop: 1272,
      creditFont: 32,
    },
    challenge: {
      brandTop: 54,
      brandFont: 42,
      titleTop: 126,
      titleFont: 70,
      subtitleTop: 226,
      subtitleFont: 34,
      timerTop: 284,
      timerFont: 72,
      boardLeft: 120,
      boardTop: 410,
      boardSize: 840,
      tallBoardTop: 414,
      tallBoardHeight: 874,
      promptTop: 1310,
      promptFont: 40,
      creditTop: 1362,
      creditFont: 30,
    },
  },
};

const musicProfiles = {
  none: null,
  soft: {
    bpm: 86,
    melody: [392, 440, 523.25, 587.33, 659.25, 587.33, 523.25, 440],
    bass: [196, 261.63, 293.66, 261.63],
    volume: 0.28,
  },
  focus: {
    bpm: 102,
    melody: [329.63, 392, 493.88, 523.25, 493.88, 392, 440, 523.25],
    bass: [164.81, 196, 246.94, 196],
    volume: 0.26,
  },
  energy: {
    bpm: 124,
    melody: [440, 523.25, 659.25, 783.99, 659.25, 523.25, 587.33, 659.25],
    bass: [220, 261.63, 329.63, 293.66],
    volume: 0.24,
  },
};

const themes = {
  fresh: {
    ink: "#18212f",
    paper: "#fffdf8",
    primary: "#116b5d",
    accent: "#ef6f48",
    muted: "#6d7789",
    grid: "#c9d3ce",
    colors: ["#18212f", "#2369c9", "#df4f3f", "#138a66", "#7b4cc2", "#c78919", "#00858a", "#c83f70"],
  },
  ocean: {
    ink: "#142134",
    paper: "#f8fbff",
    primary: "#185c8f",
    accent: "#e45f4f",
    muted: "#65758d",
    grid: "#cfdae8",
    colors: ["#142134", "#1c66d2", "#d95550", "#17806d", "#6652c7", "#b57c10", "#007c8f", "#b94672"],
  },
  vivid: {
    ink: "#1d1a2e",
    paper: "#fffaf4",
    primary: "#b5531f",
    accent: "#f05f38",
    muted: "#756f86",
    grid: "#e2d8cc",
    colors: ["#1d1a2e", "#1668d9", "#e2473f", "#11885d", "#8053cf", "#c47a00", "#00848f", "#cf3d7d"],
  },
};

const args = parseArgs(process.argv.slice(2));
const dailyChallenge = args.daily === true || args.daily === "true" ? getDailyChallenge() : null;
const aspect = String(args.aspect ?? "9:16");
const canvas = canvasProfiles[aspect] ?? canvasProfiles["9:16"];
const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const duration = clamp(Number(args.duration ?? 120), 1, 600);
const themeName = String(args.theme ?? dailyChallenge?.theme ?? "fresh");
const colorCount = clamp(Number(args.colors ?? dailyChallenge?.colors ?? 4), 1, 8);
const size = clamp(Number(args.size ?? dailyChallenge?.size ?? 6), 4, 6);
const order = String(args.order ?? dailyChallenge?.order ?? "asc") === "desc" ? "desc" : "asc";
const layoutArg = String(args.layout ?? dailyChallenge?.layout ?? "grid");
const layout =
  layoutArg === "float"
    ? "float"
    : layoutArg === "mosaic"
      ? "mosaic"
      : layoutArg === "hex"
        ? "hex"
        : layoutArg === "radial"
          ? "radial"
          : "grid";
const rotation = layout === "radial" && ["slow", "fast"].includes(String(args.rotation)) ? String(args.rotation) : "none";
const captureFps = rotation === "none" ? 1 : clamp(Number(args["capture-fps"] ?? 12), 2, 24);
const seed = Number.isFinite(Number(args.seed)) ? Number(args.seed) : (dailyChallenge?.seed ?? Date.now());
const musicName = String(args.music ?? "soft");
const music = Object.hasOwn(musicProfiles, musicName) ? musicProfiles[musicName] : musicProfiles.soft;
const musicFile = args["music-file"] ? resolve(ROOT, String(args["music-file"])) : null;
const output = resolve(ROOT, args.output ?? DEFAULT_OUTPUT);
const theme = themes[themeName] ?? themes.fresh;
const tempDir = resolve(ROOT, ".tmp/promo-video");
const framesDir = resolve(tempDir, "frames");
const chromeProfile = resolve(tempDir, "chrome-profile");
let completed = false;

if (!existsSync(CHROME)) throw new Error(`Chrome not found at ${CHROME}`);
if (!existsSync(FFMPEG)) throw new Error(`ffmpeg not found at ${FFMPEG}`);

await cleanupTempDir(tempDir);
await mkdir(framesDir, { recursive: true });
await mkdir(dirname(output), { recursive: true });

const total = getChallengeTotal(size, layout);
const grid = createGrid(total, seed);
const totalDurationSeconds = INTRO_SECONDS + duration;
const totalFrames = Math.ceil(totalDurationSeconds * captureFps);
const chrome = await launchChrome(chromeProfile);

try {
  const client = await createPageClient(chrome.port);
  await client.send("Page.enable");
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: WIDTH,
    height: HEIGHT,
    deviceScaleFactor: 1,
    mobile: false,
  });

  for (let frame = 0; frame < totalFrames; frame += 1) {
    const second = frame / captureFps;
    const framePath = resolve(framesDir, `frame-${String(frame).padStart(4, "0")}.png`);
    const html =
      second < INTRO_SECONDS
        ? renderIntroHtml({ countdown: Math.ceil(INTRO_SECONDS - second), theme, size, layout })
        : renderChallengeHtml({
            elapsedMs: (second - INTRO_SECONDS) * 1000,
            grid,
            theme,
            colorCount,
            size,
            order,
            layout,
            rotation,
          });
    await setHtml(client, html);
    const screenshot = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    await writeFile(framePath, Buffer.from(screenshot.data, "base64"));
    process.stdout.write(`\rRendered frame ${frame + 1}/${totalFrames}`);
  }

  process.stdout.write("\nEncoding MP4...\n");
  const audio = await prepareAudioInput({ music, musicFile, duration: totalDurationSeconds });
  await run(FFMPEG, [
    "-y",
    "-framerate",
    String(captureFps),
    "-i",
    resolve(framesDir, "frame-%04d.png"),
    ...audio.inputArgs,
    "-t",
    String(totalDurationSeconds),
    "-r",
    String(FPS),
    ...audio.filterArgs,
    "-c:v",
    "libx264",
    ...audio.codecArgs,
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    output,
  ]);
  completed = true;
} finally {
  chrome.process.kill("SIGTERM");
  await waitForExit(chrome.process, 2_000);
}

if (completed) {
  await cleanupTempDir(tempDir);
}

console.log(`Done: ${output}`);

async function prepareAudioInput({ music, musicFile, duration }) {
  if (musicFile) {
    if (!existsSync(musicFile)) throw new Error(`Music file not found: ${musicFile}`);
    return {
      inputArgs: ["-stream_loop", "-1", "-i", musicFile],
      filterArgs: getAudioMapArgs(duration, 0.72),
      codecArgs: ["-c:a", "aac", "-b:a", "160k", "-shortest"],
    };
  }

  if (!music) {
    return {
      inputArgs: [],
      filterArgs: ["-an"],
      codecArgs: [],
    };
  }

  const audioPath = resolve(tempDir, "music.wav");
  await writeGeneratedMusicWav(audioPath, duration, music);
  return {
    inputArgs: ["-i", audioPath],
    filterArgs: getAudioMapArgs(duration, 1),
    codecArgs: ["-c:a", "aac", "-b:a", "128k", "-shortest"],
  };
}

function getAudioMapArgs(duration, volume) {
  const fadeOutStart = Math.max(0, duration - 2);
  return [
    "-map",
    "0:v",
    "-map",
    "1:a",
    "-af",
    `volume=${volume},afade=t=in:st=0:d=1,afade=t=out:st=${fadeOutStart}:d=2`,
  ];
}

async function writeGeneratedMusicWav(path, duration, profile) {
  const sampleRate = 44100;
  const channelCount = 1;
  const bytesPerSample = 2;
  const sampleCount = Math.ceil(duration * sampleRate);
  const dataSize = sampleCount * channelCount * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);
  const beatDuration = 60 / profile.bpm;

  writeAscii(buffer, 0, "RIFF");
  buffer.writeUInt32LE(36 + dataSize, 4);
  writeAscii(buffer, 8, "WAVE");
  writeAscii(buffer, 12, "fmt ");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channelCount, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channelCount * bytesPerSample, 28);
  buffer.writeUInt16LE(channelCount * bytesPerSample, 32);
  buffer.writeUInt16LE(bytesPerSample * 8, 34);
  writeAscii(buffer, 36, "data");
  buffer.writeUInt32LE(dataSize, 40);

  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / sampleRate;
    const beat = Math.floor(time / beatDuration);
    const beatPosition = (time % beatDuration) / beatDuration;
    const melodyFrequency = profile.melody[beat % profile.melody.length];
    const bassFrequency = profile.bass[Math.floor(beat / 2) % profile.bass.length];
    const melodyEnvelope = Math.min(1, beatPosition / 0.08) * Math.exp(-beatPosition * 2.6);
    const bassEnvelope = 0.42 + 0.2 * Math.sin(Math.PI * beatPosition);
    const shimmerFrequency = profile.melody[(beat + 2) % profile.melody.length] * 2;

    const melody =
      Math.sin(Math.PI * 2 * melodyFrequency * time) * 0.62 +
      Math.sin(Math.PI * 4 * melodyFrequency * time) * 0.14;
    const bass = Math.sin(Math.PI * 2 * bassFrequency * time) * 0.34 * bassEnvelope;
    const shimmer = Math.sin(Math.PI * 2 * shimmerFrequency * time) * 0.08 * Math.exp(-beatPosition * 3.8);
    const fadeIn = Math.min(1, time / 1.2);
    const fadeOut = Math.min(1, Math.max(0, (duration - time) / 2));
    const value = (melody * melodyEnvelope + bass + shimmer) * profile.volume * fadeIn * fadeOut;
    const sample = Math.max(-1, Math.min(1, value));
    buffer.writeInt16LE(Math.round(sample * 32767), 44 + index * 2);
  }

  await writeFile(path, buffer);
}

function writeAscii(buffer, offset, value) {
  buffer.write(value, offset, value.length, "ascii");
}

function renderIntroHtml({ countdown, theme, size, layout }) {
  const total = getChallengeTotal(size, layout);
  const metrics = canvas.intro;

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <style>
      * { box-sizing: border-box; }
      body {
        width: ${WIDTH}px;
        height: ${HEIGHT}px;
        margin: 0;
        overflow: hidden;
        background: ${theme.paper};
        font-family: Inter, -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", Arial, sans-serif;
      }
      .stage { position: relative; width: ${WIDTH}px; height: ${HEIGHT}px; color: ${theme.ink}; }
      .ghost-grid {
        position: absolute; left: ${metrics.ghostLeft}px; top: ${metrics.ghostTop}px;
        width: ${metrics.ghostSize}px; height: ${metrics.ghostSize}px;
        opacity: 0.1;
        background:
          linear-gradient(${theme.grid} 2px, transparent 2px),
          linear-gradient(90deg, ${theme.grid} 2px, transparent 2px);
        background-size: ${metrics.ghostSize / size}px ${metrics.ghostSize / size}px;
        border: 2px solid ${theme.grid};
        border-radius: 22px;
      }
      .title {
        position: absolute; top: ${metrics.titleTop}px; left: 0; width: 100%;
        text-align: center; color: ${theme.ink}; font-size: ${metrics.titleFont}px; font-weight: 950;
      }
      .project {
        position: absolute; top: ${metrics.projectTop}px; left: 0; width: 100%;
        text-align: center; color: ${theme.primary}; font-size: ${metrics.projectFont}px; font-weight: 950;
        letter-spacing: 1px;
      }
      .project span { color: ${theme.accent}; font-size: 1.12em; }
      .ring {
        position: absolute; left: ${metrics.ringLeft}px; top: ${metrics.ringTop}px;
        width: ${metrics.ringSize}px; height: ${metrics.ringSize}px;
        border: 12px solid ${theme.grid}; border-top-color: ${theme.accent};
        border-radius: 50%;
      }
      .count {
        position: absolute; top: ${metrics.countTop}px; left: 0; width: 100%;
        text-align: center; color: ${theme.accent}; font-size: ${metrics.countFont}px; font-weight: 950;
      }
      .ready {
        position: absolute; top: ${metrics.readyTop}px; left: 50%; transform: translateX(-50%);
        min-width: 300px; padding: 18px 36px 20px;
        text-align: center; color: white; background: ${theme.ink};
        border-radius: 999px; font-size: ${metrics.readyFont}px; font-weight: 950;
        box-shadow: 0 20px 45px rgba(24, 33, 47, 0.12);
      }
      .credit {
        position: absolute; top: ${metrics.creditTop}px; left: 0; width: 100%;
        text-align: center; color: ${theme.muted}; font-size: ${metrics.creditFont}px; font-weight: 800;
      }
    </style>
  </head>
  <body>
    <main class="stage">
      <div class="ghost-grid"></div>
      <div class="title">每日专注力训练</div>
      <div class="project">${getProjectLabelHtml({ layout, size, total })}</div>
      <div class="ring"></div>
      <div class="count">${countdown}</div>
      <div class="ready">准备开始</div>
      <div class="credit">计时挑战@新加坡大小AI玩</div>
    </main>
  </body>
</html>`;
}

function renderChallengeHtml({ elapsedMs, grid, theme, colorCount, size, order, layout, rotation }) {
  const total = getChallengeTotal(size, layout);
  const range = getTargetRange(total, order);
  const metrics = canvas.challenge;
  const gridSize = metrics.boardSize;
  const cellSize = gridSize / size;
  const fontSize = Math.round((size >= 6 ? 66 : 82) * (gridSize / 928));
  const board =
    layout === "radial"
      ? renderRadialBoard({ grid, theme, colorCount, rotationDeg: getRotationDegrees(rotation, elapsedMs) })
      : layout === "hex"
        ? renderHexBoard({ grid, theme, colorCount })
        : layout === "mosaic"
          ? renderMosaicBoard({ grid, theme, colorCount })
          : layout === "float"
            ? renderFloatBoard({ grid, theme, colorCount, elapsedMs })
          : `<div class="grid">${grid
              .map((number, index) => {
                const row = Math.floor(index / size);
                const col = index % size;
                const color = theme.colors[number % colorCount];
                return `<div class="cell" style="left:${col * cellSize}px;top:${row * cellSize}px;color:${color}">${number}</div>`;
              })
              .join("")}</div>`;

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <style>
      * { box-sizing: border-box; }
      body {
        width: ${WIDTH}px;
        height: ${HEIGHT}px;
        margin: 0;
        overflow: hidden;
        background: ${theme.paper};
        font-family: Inter, -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", Arial, sans-serif;
      }
      .stage { position: relative; width: ${WIDTH}px; height: ${HEIGHT}px; color: ${theme.ink}; }
      .brand {
        position: absolute; top: ${metrics.brandTop}px; left: 0; width: 100%;
        text-align: center; color: ${theme.primary}; font-size: ${metrics.brandFont}px; font-weight: 900;
      }
      .title {
        position: absolute; top: ${metrics.titleTop}px; left: 0; width: 100%;
        text-align: center; font-size: ${metrics.titleFont}px; line-height: 1.15; font-weight: 900;
      }
      .title span { color: ${theme.accent}; }
      .subtitle {
        position: absolute; top: ${metrics.subtitleTop}px; left: 0; width: 100%;
        text-align: center; color: ${theme.muted}; font-size: ${metrics.subtitleFont}px; font-weight: 800;
      }
      .timer {
        position: absolute; top: ${metrics.timerTop}px; left: 0; width: 100%;
        text-align: center; color: ${theme.primary}; font-size: ${metrics.timerFont}px; font-weight: 900;
      }
      .grid {
        position: absolute; left: ${metrics.boardLeft}px; top: ${metrics.boardTop}px;
        width: ${metrics.boardSize}px; height: ${metrics.boardSize}px;
        border: 3px solid ${theme.grid}; border-radius: 18px; overflow: hidden; background: white;
      }
      .radial {
        position: absolute; left: ${metrics.boardLeft}px; top: ${metrics.boardTop}px;
        width: ${metrics.boardSize}px; height: ${metrics.boardSize}px;
        filter: drop-shadow(0 14px 34px rgba(24, 33, 47, 0.1));
      }
      .hex {
        position: absolute; left: ${metrics.boardLeft}px; top: ${metrics.tallBoardTop}px;
        width: ${metrics.boardSize}px; height: ${metrics.tallBoardHeight}px;
        filter: drop-shadow(0 14px 34px rgba(24, 33, 47, 0.1));
      }
      .mosaic {
        position: absolute; left: ${metrics.boardLeft}px; top: ${metrics.tallBoardTop}px;
        width: ${metrics.boardSize}px; height: ${metrics.tallBoardHeight}px;
        filter: drop-shadow(0 14px 34px rgba(24, 33, 47, 0.1));
      }
      .float {
        position: absolute; left: ${metrics.boardLeft}px; top: ${metrics.boardTop + 38}px;
        width: ${metrics.boardSize}px; height: ${Math.round(metrics.boardSize * 0.72)}px;
        filter: drop-shadow(0 18px 38px rgba(8, 18, 28, 0.22));
      }
      .radial svg { display: block; width: 100%; height: 100%; overflow: visible; }
      .hex svg { display: block; width: 100%; height: 100%; overflow: visible; }
      .mosaic svg { display: block; width: 100%; height: 100%; overflow: visible; }
      .float svg { display: block; width: 100%; height: 100%; overflow: visible; }
      .radial path { fill: white; stroke: ${theme.grid}; stroke-width: 0.42; }
      .radial .center { fill: ${theme.paper}; stroke: ${theme.grid}; stroke-width: 0.6; }
      .radial text {
        dominant-baseline: middle; text-anchor: middle;
        font-size: 5.4px; font-weight: 950;
      }
      .hex polygon { fill: white; stroke: ${theme.ink}; stroke-width: 0.5; }
      .hex text {
        dominant-baseline: middle; text-anchor: middle;
        font-size: 7.8px; font-weight: 950;
      }
      .mosaic polygon { fill: white; stroke: ${theme.grid}; stroke-width: 0.55; }
      .mosaic text {
        dominant-baseline: middle; text-anchor: middle;
        font-size: 7.1px; font-weight: 950;
      }
      .float .panel { fill: #18262f; stroke: rgba(214, 236, 235, 0.52); stroke-width: 0.35; }
      .float .grid-line { stroke: rgba(214, 236, 235, 0.07); stroke-width: 0.18; }
      .float circle {
        fill: #e8fffb; stroke: #9ee0d7; stroke-width: 0.45;
        filter: drop-shadow(0 1.2px 1px rgba(0, 0, 0, 0.38));
      }
      .float text {
        dominant-baseline: middle; text-anchor: middle;
        fill: #17222d; font-size: 4.45px; font-weight: 950;
      }
      .cell {
        position: absolute; width: ${cellSize}px; height: ${cellSize}px;
        display: flex; align-items: center; justify-content: center;
        border-right: 2px solid ${theme.grid}; border-bottom: 2px solid ${theme.grid};
        font-size: ${fontSize}px; font-weight: 900; line-height: 1;
      }
      .prompt {
        position: absolute; top: ${metrics.promptTop}px; left: 0; width: 100%;
        text-align: center; color: ${theme.ink}; font-size: ${metrics.promptFont}px; font-weight: 900;
      }
      .credit {
        position: absolute; top: ${metrics.creditTop}px; left: 0; width: 100%;
        text-align: center; color: ${theme.muted}; font-size: ${metrics.creditFont}px; font-weight: 800;
      }
    </style>
  </head>
  <body>
    <main class="stage">
      <div class="brand">${
        layout === "radial" && rotation !== "none"
          ? "旋转圆盘舒尔特挑战"
          : layout === "radial"
            ? "圆盘舒尔特挑战"
            : layout === "hex"
              ? "蜂巢舒尔特挑战"
              : layout === "mosaic"
                ? "变形舒尔特挑战"
                : layout === "float"
                  ? "浮球舒尔特挑战"
                : "舒尔特方格挑战"
      }</div>
      <div class="title">请按顺序从 <span>${range.start}</span> 找到 <span>${range.end}</span></div>
      <div class="subtitle">从 ${range.start} 到 ${range.end}，看看你需要多久</div>
      <div class="timer">${formatTime(elapsedMs)}</div>
      ${board}
      <div class="prompt">评论区留下年龄和成绩</div>
      <div class="credit">计时挑战@新加坡大小AI玩</div>
    </main>
  </body>
</html>`;
}

function renderRadialBoard({ grid, theme, colorCount, rotationDeg }) {
  const geometry = getRadialGeometry(grid.length);
  const rings = Array.from(new Set(geometry.map((cell) => cell.ring)));
  const cells = rings
    .map((ring) => {
      const ringCells = grid
        .map((number, index) => {
          const cellGeometry = geometry[index];
          if (cellGeometry.ring !== ring) return "";
          const ringRotation = rotationDeg;
          const rotatedGeometry = rotateRadialGeometry(cellGeometry, ringRotation);
          const point = polarToCartesian(50, rotatedGeometry.labelRadius, rotatedGeometry.labelAngle);
          const color = theme.colors[number % colorCount];
          return `<g>
            <path d="${describeRadialSegment(rotatedGeometry)}"></path>
            <text x="${point.x.toFixed(3)}" y="${(point.y + 0.25).toFixed(3)}" fill="${color}">${number}</text>
          </g>`;
        })
        .join("");
      return `<g>${ringCells}</g>`;
    })
    .join("");

  return `<div class="radial">
    <svg viewBox="0 0 100 100" aria-label="圆盘舒尔特数字盘">
      ${cells}
      <circle class="center" cx="50" cy="50" r="8"></circle>
    </svg>
  </div>`;
}

function renderHexBoard({ grid, theme, colorCount }) {
  const geometry = getHexGeometry();
  const cells = grid
    .map((number, index) => {
      const cellGeometry = geometry[index];
      const color = theme.colors[number % colorCount];
      return `<g>
        <polygon points="${cellGeometry.points}"></polygon>
        <text x="${cellGeometry.labelX.toFixed(3)}" y="${cellGeometry.labelY.toFixed(3)}" fill="${color}">${number}</text>
      </g>`;
    })
    .join("");

  return `<div class="hex">
    <svg viewBox="0 0 100 104" aria-label="蜂巢舒尔特数字盘">
      ${cells}
    </svg>
  </div>`;
}

function renderMosaicBoard({ grid, theme, colorCount }) {
  const geometry = getMosaicGeometry();
  const cells = grid
    .map((number, index) => {
      const cellGeometry = geometry[index];
      const color = theme.colors[number % colorCount];
      return `<g>
        <polygon points="${cellGeometry.points}"></polygon>
        <text x="${cellGeometry.labelX.toFixed(3)}" y="${cellGeometry.labelY.toFixed(3)}" fill="${color}">${number}</text>
      </g>`;
    })
    .join("");

  return `<div class="mosaic">
    <svg viewBox="0 0 100 104" aria-label="变形舒尔特数字盘">
      ${cells}
    </svg>
  </div>`;
}

function renderFloatBoard({ grid, theme, colorCount, elapsedMs }) {
  const geometry = getFloatGeometry(elapsedMs);
  const gridLines = [
    ...Array.from(
      { length: 13 },
      (_, index) =>
        `<line class="grid-line" x1="${(4 + index * 7.7).toFixed(2)}" x2="${(4 + index * 7.7).toFixed(
          2,
        )}" y1="2" y2="70"></line>`,
    ),
    ...Array.from(
      { length: 8 },
      (_, index) =>
        `<line class="grid-line" x1="2" x2="98" y1="${(6 + index * 8.5).toFixed(2)}" y2="${(
          6 + index * 8.5
        ).toFixed(2)}"></line>`,
    ),
  ].join("");
  const cells = grid
    .map((number, index) => {
      const cellGeometry = geometry[index];
      const color = number === 1 ? theme.accent : theme.colors[number % colorCount];
      const fill = number === 1 ? "#fff4ed" : "#e8fffb";
      const stroke = number === 1 ? theme.accent : "#9ee0d7";
      return `<g>
        <circle cx="${cellGeometry.x.toFixed(3)}" cy="${cellGeometry.y.toFixed(3)}" r="${cellGeometry.radius}" fill="${fill}" stroke="${stroke}"></circle>
        <text x="${cellGeometry.x.toFixed(3)}" y="${(cellGeometry.y + 0.25).toFixed(3)}" fill="${color}">${number}</text>
      </g>`;
    })
    .join("");

  return `<div class="float">
    <svg viewBox="0 0 100 72" aria-label="浮球舒尔特数字盘">
      <rect class="panel" x="1.5" y="1.5" width="97" height="69" rx="3.8"></rect>
      ${gridLines}
      ${cells}
    </svg>
  </div>`;
}

function getRotationDegrees(rotation, elapsedMs) {
  if (rotation === "slow") return (elapsedMs / 1000) * 6;
  if (rotation === "fast") return (elapsedMs / 1000) * 10;
  return 0;
}

function rotateRadialGeometry(geometry, degrees) {
  return {
    ...geometry,
    startAngle: geometry.startAngle + degrees,
    endAngle: geometry.endAngle + degrees,
    labelAngle: geometry.labelAngle + degrees,
  };
}

async function setHtml(client, html) {
  const tree = await client.send("Page.getFrameTree");
  await client.send("Page.setDocumentContent", {
    frameId: tree.frameTree.frame.id,
    html,
  });
  await client.send("Runtime.evaluate", {
    expression: "document.fonts ? document.fonts.ready.then(() => true) : true",
    awaitPromise: true,
  });
}

async function launchChrome(userDataDir) {
  const port = 9300 + Math.floor(Math.random() * 1000);
  let stderr = "";
  const child = spawn(CHROME, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  try {
    await waitForChrome(port, child);
  } catch (error) {
    child.kill("SIGTERM");
    const detail = stderr.trim().split("\n").slice(-3).join("\n");
    throw new Error(`${error.message}${detail ? `\n${detail}` : ""}`);
  }

  return { port, process: child };
}

async function waitForChrome(port, child) {
  const started = Date.now();
  while (Date.now() - started < 10_000) {
    if (child.exitCode !== null) throw new Error(`Chrome exited with code ${child.exitCode}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return;
    } catch {
      await sleep(100);
    }
  }
  throw new Error("Timed out waiting for Chrome DevTools");
}

async function createPageClient(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/new`, { method: "PUT" });
  if (!response.ok) throw new Error(`Unable to create Chrome target: ${response.status}`);
  const target = await response.json();
  return createCdpClient(target.webSocketDebuggerUrl);
}

function createCdpClient(url) {
  const socket = new WebSocket(url);
  let nextId = 1;
  const pending = new Map();

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });

  return {
    async send(method, params = {}) {
      if (socket.readyState !== WebSocket.OPEN) {
        await new Promise((resolve, reject) => {
          socket.addEventListener("open", resolve, { once: true });
          socket.addEventListener("error", reject, { once: true });
        });
      }
      const id = nextId;
      nextId += 1;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    },
  };
}

function createGrid(total, seed) {
  const random = mulberry32(seed);
  const values = Array.from({ length: total }, (_, index) => index + 1);
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
  return values;
}

function getChallengeTotal(size, layout) {
  if (layout === "float") return 36;
  return layout === "hex" || layout === "mosaic" ? 30 : size * size;
}

function getProjectLabel({ layout, size, total }) {
  if (layout === "radial") return `圆盘舒尔特 ${total}`;
  if (layout === "hex") return "蜂巢舒尔特 30";
  if (layout === "mosaic") return "变形舒尔特 30";
  if (layout === "float") return "浮球舒尔特 36";
  return `舒尔特方格 ${size}×${size}`;
}

function getProjectLabelHtml({ layout, size, total }) {
  if (layout === "radial") return `圆盘舒尔特 <span>${total}</span>`;
  if (layout === "hex") return "蜂巢舒尔特 <span>30</span>";
  if (layout === "mosaic") return "变形舒尔特 <span>30</span>";
  if (layout === "float") return "浮球舒尔特 <span>36</span>";
  return `舒尔特方格 <span>${size}×${size}</span>`;
}

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function formatTime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function getTargetRange(total, order) {
  return order === "desc" ? { start: total, end: 1 } : { start: 1, end: total };
}

function getRadialRingCounts(total) {
  if (total === 36) return [6, 12, 18];
  if (total === 25) return [5, 8, 12];
  if (total === 16) return [4, 5, 7];
  const inner = Math.max(4, Math.round(total * 0.18));
  const middle = Math.max(6, Math.round(total * 0.32));
  return [inner, middle, total - inner - middle];
}

function getRadialGeometry(total) {
  const ringCounts = getRadialRingCounts(total);
  const ringWidth = 48 / ringCounts.length;

  return ringCounts
    .flatMap((countInRing, ring) => {
      const innerRadius = 8 + ring * ringWidth;
      const outerRadius = innerRadius + ringWidth;
      const angleOffset = ring % 2 === 0 ? -90 : -90 + 180 / countInRing;
      return Array.from({ length: countInRing }, (_, indexInRing) => {
        const startAngle = angleOffset + (360 / countInRing) * indexInRing;
        const endAngle = angleOffset + (360 / countInRing) * (indexInRing + 1);
        return {
          ring,
          startAngle,
          endAngle,
          innerRadius,
          outerRadius,
          labelRadius: (innerRadius + outerRadius) / 2,
          labelAngle: (startAngle + endAngle) / 2,
        };
      });
    })
    .slice(0, total);
}

function getHexGeometry() {
  const rows = 6;
  const cols = 5;
  const radius = 8.9;
  const xStep = Math.sqrt(3) * radius;
  const yStep = 1.5 * radius;
  const rawCells = Array.from({ length: rows * cols }, (_, index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    return {
      centerX: radius + col * xStep + (row % 2 === 1 ? xStep / 2 : 0),
      centerY: radius + row * yStep,
    };
  });
  const allPoints = rawCells.flatMap((cell) => getHexPoints(cell.centerX, cell.centerY, radius));
  const minX = Math.min(...allPoints.map((point) => point.x));
  const maxX = Math.max(...allPoints.map((point) => point.x));
  const minY = Math.min(...allPoints.map((point) => point.y));
  const maxY = Math.max(...allPoints.map((point) => point.y));
  const scale = Math.min(94 / (maxX - minX), 96 / (maxY - minY));
  const offsetX = (100 - (maxX - minX) * scale) / 2;
  const offsetY = (104 - (maxY - minY) * scale) / 2;

  return rawCells.map((cell) => {
    const points = getHexPoints(cell.centerX, cell.centerY, radius).map((point) => ({
      x: offsetX + (point.x - minX) * scale,
      y: offsetY + (point.y - minY) * scale,
    }));
    return {
      points: points.map((point) => `${point.x.toFixed(3)},${point.y.toFixed(3)}`).join(" "),
      labelX: offsetX + (cell.centerX - minX) * scale,
      labelY: offsetY + (cell.centerY - minY) * scale + 0.45,
    };
  });
}

function getHexPoints(centerX, centerY, radius) {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = (Math.PI / 180) * (60 * index - 90);
    return {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    };
  });
}

function getMosaicGeometry() {
  const rows = 6;
  const cols = 5;
  const jitter = [
    [0, 0],
    [-1.4, 1.2],
    [1.1, -0.8],
    [-0.8, 1.4],
    [1.2, -1.1],
    [0, 0],
    [0, 0],
    [1.5, -1.2],
    [-1.2, 1.3],
    [1.4, 0.9],
    [-1.1, -1.4],
    [0, 0],
    [0, 0],
    [-1.1, 1.5],
    [1.6, -1.1],
    [-1.5, 0.8],
    [1.1, 1.4],
    [0, 0],
    [0, 0],
    [1.3, 1.1],
    [-1.4, -1.3],
    [1.2, 1.5],
    [-1.6, -0.9],
    [0, 0],
    [0, 0],
    [-1.5, -1.1],
    [1.1, 1.4],
    [-1.2, -1.5],
    [1.5, 1.1],
    [0, 0],
    [0, 0],
    [1.2, -1.4],
    [-1.6, 1.1],
    [1.5, -0.8],
    [-1.1, 1.5],
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
  ];

  const points = Array.from({ length: rows + 1 }, (_, row) =>
    Array.from({ length: cols + 1 }, (_, col) => {
      const baseX = 2.5 + (95 / cols) * col;
      const baseY = 3.5 + (97 / rows) * row;
      const isEdge = row === 0 || row === rows || col === 0 || col === cols;
      const [dx, dy] = isEdge ? [0, 0] : jitter[row * (cols + 1) + col] ?? [0, 0];
      return { x: baseX + dx * 1.75, y: baseY + dy * 1.75 };
    }),
  );

  return Array.from({ length: rows * cols }, (_, index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    const corners = [
      points[row][col],
      points[row][col + 1],
      points[row + 1][col + 1],
      points[row + 1][col],
    ];
    const labelX = corners.reduce((sum, point) => sum + point.x, 0) / corners.length;
    const labelY = corners.reduce((sum, point) => sum + point.y, 0) / corners.length + 0.55;
    return {
      points: corners.map((point) => `${point.x.toFixed(3)},${point.y.toFixed(3)}`).join(" "),
      labelX,
      labelY,
    };
  });
}

function getFloatGeometry(elapsedMs = 0) {
  const positions = [
    [15, 12],
    [22, 20],
    [31, 16],
    [39, 20],
    [53, 12],
    [63, 9],
    [85, 13],
    [92, 9],
    [18, 29],
    [27, 31],
    [36, 28],
    [48, 34],
    [59, 31],
    [72, 28],
    [84, 30],
    [10, 44],
    [24, 42],
    [36, 39],
    [54, 45],
    [67, 41],
    [81, 43],
    [92, 41],
    [15, 55],
    [28, 54],
    [42, 51],
    [57, 56],
    [73, 54],
    [88, 55],
    [9, 63],
    [20, 63],
    [34, 64],
    [49, 63],
    [63, 62],
    [77, 63],
    [89, 64],
    [95, 34],
  ];
  const time = elapsedMs / 1000;

  return positions.map(([baseX, baseY], index) => {
    const amplitudeX = 0.42 + (index % 5) * 0.08;
    const amplitudeY = 0.34 + (index % 4) * 0.07;
    const speed = 0.82 + (index % 6) * 0.06;
    const phase = index * 0.71;
    return {
      x: baseX + Math.sin(time * speed + phase) * amplitudeX,
      y: baseY + Math.cos(time * (speed * 0.9) + phase) * amplitudeY,
      radius: 3.35,
    };
  });
}

function polarToCartesian(center, radius, angleDegrees) {
  const angleRadians = (angleDegrees * Math.PI) / 180;
  return {
    x: center + radius * Math.cos(angleRadians),
    y: center + radius * Math.sin(angleRadians),
  };
}

function describeRadialSegment(geometry) {
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

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const [key, value] = arg.slice(2).split("=");
    const next = argv[index + 1];
    if (value !== undefined) {
      parsed[key] = value;
    } else if (next && !next.startsWith("--")) {
      parsed[key] = next;
      index += 1;
    } else {
      parsed[key] = true;
    }
  }
  return parsed;
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function cleanupTempDir(path) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await rm(path, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 2) throw error;
      await sleep(250);
    }
  }
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();

  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, timeoutMs);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}
