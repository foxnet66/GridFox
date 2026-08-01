import { mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DEFAULT_OUTPUT = resolve(ROOT, "dist/gridfox-print-pack.pdf");
const TEMP_DIR = resolve(ROOT, ".tmp/print-pack");
const CHROME_PROFILE = resolve(TEMP_DIR, "chrome-profile");

const args = parseArgs(process.argv.slice(2));
const output = resolve(ROOT, String(args.output ?? DEFAULT_OUTPUT));
const count = clamp(Number(args.count ?? 30), 1, 300);
const size = clamp(Number(args.size ?? 6), 4, 6);
const order = String(args.order ?? "asc") === "desc" ? "desc" : "asc";
const seed = Number.isFinite(Number(args.seed)) ? Number(args.seed) : Date.now();
const brand = String(args.brand ?? "新加坡大小AI玩");
const title = String(args.title ?? "每日专注力训练");
const layout = String(args.layout ?? "grid");

if (layout !== "grid") {
  throw new Error("Print pack MVP currently supports --layout grid only.");
}

if (!existsSync(CHROME)) throw new Error(`Chrome not found at ${CHROME}`);

await rm(TEMP_DIR, { recursive: true, force: true });
await mkdir(TEMP_DIR, { recursive: true });
await mkdir(dirname(output), { recursive: true });

let chrome;
try {
  const puzzles = createPuzzles({ count, size, order, seed });
  chrome = await launchChrome(CHROME_PROFILE);
  const client = await createPageClient(chrome.port);
  await client.send("Page.enable");
  await setHtml(client, renderPrintPackHtml({ puzzles, size, order, brand, title }));
  const pdf = await client.send("Page.printToPDF", {
    printBackground: true,
    preferCSSPageSize: true,
    marginTop: 0,
    marginBottom: 0,
    marginLeft: 0,
    marginRight: 0,
  });
  await writeFile(output, Buffer.from(pdf.data, "base64"));
  console.log(`Done: ${output}`);
} finally {
  if (chrome) {
    chrome.process.kill("SIGTERM");
    await sleep(300);
  }
  await rm(TEMP_DIR, { recursive: true, force: true }).catch(() => {});
}

function createPuzzles({ count, size, order, seed }) {
  const total = size * size;
  const range = order === "desc" ? { start: total, end: 1 } : { start: 1, end: total };
  return Array.from({ length: count }, (_, index) => ({
    index: index + 1,
    grid: createGrid(total, seed + index * 7919),
    range,
  }));
}

function renderPrintPackHtml({ puzzles, size, order, brand, title }) {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <style>
      @page { size: A4; margin: 0; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        color: #141b2a;
        background: white;
        font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", Arial, sans-serif;
      }
      .page {
        width: 210mm;
        height: 297mm;
        padding: 16mm 16mm 13mm;
        page-break-after: always;
        display: grid;
        grid-template-rows: auto 1fr auto;
      }
      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10mm;
        padding-bottom: 7mm;
        border-bottom: 0.3mm solid #dce4e1;
      }
      .eyebrow {
        margin: 0 0 2.2mm;
        color: #0f766e;
        font-size: 10.5pt;
        font-weight: 750;
        letter-spacing: 0.08em;
      }
      h1 {
        margin: 0;
        font-size: 25pt;
        font-weight: 800;
        line-height: 1.1;
        letter-spacing: -0.03em;
      }
      .meta {
        display: grid;
        justify-items: end;
        gap: 2mm;
        text-align: right;
        color: #526071;
        font-size: 9.5pt;
        white-space: nowrap;
      }
      .number-badge {
        display: inline-flex;
        align-items: center;
        min-height: 8mm;
        padding: 0 3.5mm;
        border-radius: 999px;
        color: #0f766e;
        background: #edf7f4;
        font-size: 10pt;
        font-weight: 750;
      }
      .mode {
        padding-right: 1mm;
        color: #667085;
        font-weight: 600;
      }
      .content {
        display: grid;
        align-content: center;
        justify-items: center;
        gap: 8mm;
        padding: 6mm 0 4mm;
      }
      .instruction-block {
        display: grid;
        justify-items: center;
        gap: 2.5mm;
      }
      .instruction-label {
        margin: 0;
        color: #7a8495;
        font-size: 8.5pt;
        font-weight: 700;
        letter-spacing: 0.16em;
      }
      .instruction {
        margin: 0;
        color: #141b2a;
        font-size: 18pt;
        font-weight: 750;
        letter-spacing: -0.02em;
      }
      .instruction span {
        color: #f06443;
        font-size: 21pt;
        font-weight: 850;
      }
      .grid {
        width: 164mm;
        height: 164mm;
        display: grid;
        grid-template-columns: repeat(${size}, 1fr);
        grid-template-rows: repeat(${size}, 1fr);
        overflow: hidden;
        border: 0.55mm solid #1f2937;
        border-radius: 2.5mm;
      }
      .cell {
        display: grid;
        place-items: center;
        border-right: 0.24mm solid #9aa4b2;
        border-bottom: 0.24mm solid #9aa4b2;
        font-size: ${size >= 6 ? "23pt" : "30pt"};
        font-weight: 800;
        line-height: 1;
        font-variant-numeric: tabular-nums;
      }
      .cell:nth-child(${size}n) {
        border-right: 0;
      }
      .cell:nth-last-child(-n + ${size}) {
        border-bottom: 0;
      }
      .footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        color: #717b8d;
        font-size: 8.8pt;
        border-top: 0.3mm solid #e1e7e5;
        padding-top: 4.5mm;
      }
      .time-record {
        display: flex;
        align-items: baseline;
        gap: 2.5mm;
      }
      .time-label {
        color: #4b5565;
        font-weight: 700;
      }
      .time-field {
        display: inline-block;
        width: 14mm;
        height: 5mm;
        border-bottom: 0.3mm solid #aeb7c2;
      }
      .time-unit {
        color: #7b8494;
      }
      .brand {
        color: #8993a2;
      }
    </style>
  </head>
  <body>
    ${puzzles.map((puzzle) => renderPuzzlePage({ puzzle, size, order, brand, title })).join("")}
  </body>
</html>`;
}

function renderPuzzlePage({ puzzle, size, order, brand, title }) {
  const rangeText = order === "desc" ? `${size * size} → 1` : `1 → ${size * size}`;
  return `<section class="page">
    <header class="header">
      <div>
        <p class="eyebrow">${escapeHtml(title)}</p>
        <h1>${size} × ${size} 舒尔特方格</h1>
      </div>
      <div class="meta">
        <div class="number-badge">第 ${String(puzzle.index).padStart(2, "0")} 题</div>
        <div class="mode">${order === "desc" ? "倒序挑战" : "正序挑战"}</div>
      </div>
    </header>
    <main class="content">
      <div class="instruction-block">
        <p class="instruction-label">训练目标</p>
        <p class="instruction">按顺序找到 <span>${rangeText}</span></p>
      </div>
      <div class="grid" aria-label="舒尔特方格">
        ${puzzle.grid.map((number) => `<div class="cell">${number}</div>`).join("")}
      </div>
    </main>
    <footer class="footer">
      <div class="time-record">
        <span class="time-label">完成用时</span>
        <span class="time-field"></span><span class="time-unit">分</span>
        <span class="time-field"></span><span class="time-unit">秒</span>
      </div>
      <span class="brand">每日训练 · @${escapeHtml(brand)}</span>
    </footer>
  </section>`;
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
  while (Date.now() - started < 30_000) {
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

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
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
  return Math.max(min, Math.min(max, value));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
