import { mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { getDailyChallenge } from "./daily-challenge.mjs";

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;
const INTRO_SECONDS = 3;
const ROOT = resolve(new URL("..", import.meta.url).pathname);
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const FFMPEG = "/opt/homebrew/bin/ffmpeg";
const DEFAULT_OUTPUT = resolve(ROOT, "dist/gridfox-xiaohongshu.mp4");

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
const duration = clamp(Number(args.duration ?? 120), 1, 600);
const themeName = String(args.theme ?? dailyChallenge?.theme ?? "fresh");
const colorCount = clamp(Number(args.colors ?? dailyChallenge?.colors ?? 4), 1, 8);
const size = clamp(Number(args.size ?? dailyChallenge?.size ?? 6), 4, 6);
const order = String(args.order ?? dailyChallenge?.order ?? "asc") === "desc" ? "desc" : "asc";
const layout = String(args.layout ?? dailyChallenge?.layout ?? "grid") === "radial" ? "radial" : "grid";
const rotation = layout === "radial" && ["slow", "fast"].includes(String(args.rotation)) ? String(args.rotation) : "none";
const captureFps = rotation === "none" ? 1 : clamp(Number(args["capture-fps"] ?? 6), 2, 12);
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

await rm(tempDir, { recursive: true, force: true });
await mkdir(framesDir, { recursive: true });
await mkdir(dirname(output), { recursive: true });

const grid = createGrid(size, seed);
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
}

if (completed) {
  await rm(tempDir, { recursive: true, force: true });
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
  const total = size * size;

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
        position: absolute; left: 126px; top: 512px; width: 828px; height: 828px;
        opacity: 0.16;
        background:
          linear-gradient(${theme.grid} 2px, transparent 2px),
          linear-gradient(90deg, ${theme.grid} 2px, transparent 2px);
        background-size: ${828 / size}px ${828 / size}px;
        border: 2px solid ${theme.grid};
        border-radius: 22px;
      }
      .title {
        position: absolute; top: 232px; left: 0; width: 100%;
        text-align: center; color: ${theme.ink}; font-size: 86px; font-weight: 950;
      }
      .project {
        position: absolute; top: 358px; left: 0; width: 100%;
        text-align: center; color: ${theme.primary}; font-size: 46px; font-weight: 900;
      }
      .ring {
        position: absolute; left: 340px; top: 690px; width: 400px; height: 400px;
        border: 12px solid ${theme.grid}; border-top-color: ${theme.accent};
        border-radius: 50%;
      }
      .count {
        position: absolute; top: 744px; left: 0; width: 100%;
        text-align: center; color: ${theme.accent}; font-size: 228px; font-weight: 950;
      }
      .ready {
        position: absolute; top: 1148px; left: 0; width: 100%;
        text-align: center; color: ${theme.muted}; font-size: 42px; font-weight: 850;
      }
      .credit {
        position: absolute; top: 1668px; left: 0; width: 100%;
        text-align: center; color: ${theme.muted}; font-size: 34px; font-weight: 800;
      }
    </style>
  </head>
  <body>
    <main class="stage">
      <div class="ghost-grid"></div>
      <div class="title">每日专注力训练</div>
      <div class="project">${layout === "radial" ? `圆盘舒尔特 ${size * size}` : `舒尔特方格 ${size}×${size}`}</div>
      <div class="ring"></div>
      <div class="count">${countdown}</div>
      <div class="ready">准备开始</div>
      <div class="credit">计时挑战@新加坡大小AI玩</div>
    </main>
  </body>
</html>`;
}

function renderChallengeHtml({ elapsedMs, grid, theme, colorCount, size, order, layout, rotation }) {
  const total = size * size;
  const range = getTargetRange(total, order);
  const gridSize = 928;
  const cellSize = gridSize / size;
  const fontSize = size >= 6 ? 66 : 82;
  const board =
    layout === "radial"
      ? renderRadialBoard({ grid, theme, colorCount, rotationDeg: getRotationDegrees(rotation, elapsedMs) })
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
        position: absolute; top: 86px; left: 0; width: 100%;
        text-align: center; color: ${theme.primary}; font-size: 46px; font-weight: 900;
      }
      .title {
        position: absolute; top: 178px; left: 0; width: 100%;
        text-align: center; font-size: 78px; line-height: 1.15; font-weight: 900;
      }
      .title span { color: ${theme.accent}; }
      .subtitle {
        position: absolute; top: 296px; left: 0; width: 100%;
        text-align: center; color: ${theme.muted}; font-size: 38px; font-weight: 800;
      }
      .timer {
        position: absolute; top: 370px; left: 0; width: 100%;
        text-align: center; color: ${theme.primary}; font-size: 78px; font-weight: 900;
      }
      .grid {
        position: absolute; left: 76px; top: 540px; width: 928px; height: 928px;
        border: 3px solid ${theme.grid}; border-radius: 18px; overflow: hidden; background: white;
      }
      .radial {
        position: absolute; left: 76px; top: 540px; width: 928px; height: 928px;
        filter: drop-shadow(0 14px 34px rgba(24, 33, 47, 0.1));
      }
      .radial svg { display: block; width: 100%; height: 100%; overflow: visible; }
      .radial path { fill: white; stroke: ${theme.grid}; stroke-width: 0.42; }
      .radial .center { fill: ${theme.paper}; stroke: ${theme.grid}; stroke-width: 0.6; }
      .radial text {
        dominant-baseline: middle; text-anchor: middle;
        font-size: 5.4px; font-weight: 950;
      }
      .cell {
        position: absolute; width: ${cellSize}px; height: ${cellSize}px;
        display: flex; align-items: center; justify-content: center;
        border-right: 2px solid ${theme.grid}; border-bottom: 2px solid ${theme.grid};
        font-size: ${fontSize}px; font-weight: 900; line-height: 1;
      }
      .prompt {
        position: absolute; top: 1548px; left: 0; width: 100%;
        text-align: center; color: ${theme.ink}; font-size: 48px; font-weight: 900;
      }
      .credit {
        position: absolute; top: 1648px; left: 0; width: 100%;
        text-align: center; color: ${theme.muted}; font-size: 34px; font-weight: 800;
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
  const cells = grid
    .map((number, index) => {
      const cellGeometry = geometry[index];
      const point = polarToCartesian(50, cellGeometry.labelRadius, cellGeometry.labelAngle);
      const color = theme.colors[number % colorCount];
      return `<g>
        <path d="${describeRadialSegment(cellGeometry)}"></path>
        <text x="${point.x.toFixed(3)}" y="${(point.y + 0.25).toFixed(3)}" fill="${color}">${number}</text>
      </g>`;
    })
    .join("");

  return `<div class="radial">
    <svg viewBox="0 0 100 100" aria-label="圆盘舒尔特数字盘" style="transform:rotate(${rotationDeg.toFixed(3)}deg);transform-origin:center;transform-box:fill-box;">
      ${cells}
      <circle class="center" cx="50" cy="50" r="8"></circle>
    </svg>
  </div>`;
}

function getRotationDegrees(rotation, elapsedMs) {
  if (rotation === "slow") return (elapsedMs / 1000) * 6;
  if (rotation === "fast") return (elapsedMs / 1000) * 10;
  return 0;
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

function createGrid(size, seed) {
  const random = mulberry32(seed);
  const values = Array.from({ length: size * size }, (_, index) => index + 1);
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
  return values;
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

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}
