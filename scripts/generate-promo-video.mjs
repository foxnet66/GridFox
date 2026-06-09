import { mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;
const ROOT = resolve(new URL("..", import.meta.url).pathname);
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const FFMPEG = "/opt/homebrew/bin/ffmpeg";
const DEFAULT_OUTPUT = resolve(ROOT, "dist/gridfox-xiaohongshu.mp4");

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
const duration = clamp(Number(args.duration ?? 120), 1, 600);
const themeName = String(args.theme ?? "fresh");
const colorCount = clamp(Number(args.colors ?? 4), 1, 8);
const size = clamp(Number(args.size ?? 6), 4, 6);
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

const grid = createGrid(size, 20260609);
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

  for (let second = 0; second < duration; second += 1) {
    const framePath = resolve(framesDir, `frame-${String(second).padStart(4, "0")}.png`);
    const html = renderHtml({ elapsedMs: second * 1000, grid, theme, colorCount, size });
    await setHtml(client, html);
    const screenshot = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    await writeFile(framePath, Buffer.from(screenshot.data, "base64"));
    process.stdout.write(`\rRendered frame ${second + 1}/${duration}`);
  }

  process.stdout.write("\nEncoding MP4...\n");
  await run(FFMPEG, [
    "-y",
    "-framerate",
    "1",
    "-i",
    resolve(framesDir, "frame-%04d.png"),
    "-t",
    String(duration),
    "-r",
    String(FPS),
    "-c:v",
    "libx264",
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

function renderHtml({ elapsedMs, grid, theme, colorCount, size }) {
  const total = size * size;
  const gridSize = 928;
  const cellSize = gridSize / size;
  const fontSize = size >= 6 ? 66 : 82;
  const cells = grid
    .map((number, index) => {
      const row = Math.floor(index / size);
      const col = index % size;
      const color = theme.colors[number % colorCount];
      return `<div class="cell" style="left:${col * cellSize}px;top:${row * cellSize}px;color:${color}">${number}</div>`;
    })
    .join("");

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
      <div class="brand">舒尔特方格挑战</div>
      <div class="title">请按顺序从 <span>1</span> 找到 <span>${total}</span></div>
      <div class="subtitle">从 1 到 ${total}，看看你需要多久</div>
      <div class="timer">${formatTime(elapsedMs)}</div>
      <div class="grid">${cells}</div>
      <div class="prompt">评论区留下年龄和成绩</div>
      <div class="credit">计时挑战@新加坡大小AI玩</div>
    </main>
  </body>
</html>`;
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
  const child = spawn(CHROME, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });

  child.stderr.setEncoding("utf8");
  await waitForChrome(port, child);
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

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const [key, value] = arg.slice(2).split("=");
    parsed[key] = value ?? argv[index + 1];
    if (value === undefined) index += 1;
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
