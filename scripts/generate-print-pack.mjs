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
  await setHtml(client, renderPrintPackHtml({ puzzles, size, order, seed, brand, title }));
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

function renderPrintPackHtml({ puzzles, size, order, seed, brand, title }) {
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
        padding: 18mm 18mm 14mm;
        page-break-after: always;
        display: grid;
        grid-template-rows: auto 1fr auto;
      }
      .header {
        display: flex;
        align-items: end;
        justify-content: space-between;
        gap: 12mm;
        padding-bottom: 8mm;
        border-bottom: 0.4mm solid #d7dedb;
      }
      .eyebrow {
        margin: 0 0 2mm;
        color: #116b5d;
        font-size: 12pt;
        font-weight: 850;
      }
      h1 {
        margin: 0;
        font-size: 28pt;
        line-height: 1.05;
        letter-spacing: 0;
      }
      .meta {
        text-align: right;
        color: #6d7789;
        font-size: 10pt;
        line-height: 1.7;
        white-space: nowrap;
      }
      .content {
        display: grid;
        align-content: center;
        justify-items: center;
        gap: 10mm;
      }
      .instruction {
        margin: 0;
        color: #141b2a;
        font-size: 20pt;
        font-weight: 850;
      }
      .instruction span {
        color: #ef6f48;
      }
      .grid {
        width: 160mm;
        height: 160mm;
        display: grid;
        grid-template-columns: repeat(${size}, 1fr);
        grid-template-rows: repeat(${size}, 1fr);
        border: 0.65mm solid #111827;
      }
      .cell {
        display: grid;
        place-items: center;
        border-right: 0.32mm solid #111827;
        border-bottom: 0.32mm solid #111827;
        font-size: ${size >= 6 ? "24pt" : "31pt"};
        font-weight: 850;
        line-height: 1;
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
        color: #6d7789;
        font-size: 9.5pt;
        border-top: 0.3mm solid #e5ebe8;
        padding-top: 5mm;
      }
    </style>
  </head>
  <body>
    ${puzzles.map((puzzle) => renderPuzzlePage({ puzzle, size, order, seed, brand, title })).join("")}
  </body>
</html>`;
}

function renderPuzzlePage({ puzzle, size, order, seed, brand, title }) {
  const rangeText = order === "desc" ? `${size * size} 找到 1` : `1 找到 ${size * size}`;
  return `<section class="page">
    <header class="header">
      <div>
        <p class="eyebrow">${title}</p>
        <h1>舒尔特方格 ${size}×${size}</h1>
      </div>
      <div class="meta">
        <div>训练 ${String(puzzle.index).padStart(2, "0")}</div>
        <div>${order === "desc" ? "倒序" : "正序"} · Seed ${seed}</div>
      </div>
    </header>
    <main class="content">
      <p class="instruction">请按顺序从 <span>${rangeText}</span></p>
      <div class="grid" aria-label="舒尔特方格">
        ${puzzle.grid.map((number) => `<div class="cell">${number}</div>`).join("")}
      </div>
    </main>
    <footer class="footer">
      <span>用时：______ 分 ______ 秒</span>
      <span>计时挑战@${escapeHtml(brand)}</span>
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
