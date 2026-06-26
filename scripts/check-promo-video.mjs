import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const NODE = process.execPath;
const FFPROBE = existsSync("/opt/homebrew/bin/ffprobe") ? "/opt/homebrew/bin/ffprobe" : "ffprobe";
const VALIDATION_DIR = resolve(ROOT, ".tmp/promo-video-check");
const INTRO_SECONDS = 3;
const CASE_DURATION = 2;
const EXPECTED_DURATION = INTRO_SECONDS + CASE_DURATION;

const cases = [
  {
    name: "no music",
    output: resolve(VALIDATION_DIR, "no-music.mp4"),
    args: ["--size", "5", "--theme", "fresh", "--colors", "4", "--music", "none", "--duration", String(CASE_DURATION), "--seed", "101"],
    expectedAudioStreams: 0,
  },
  {
    name: "built-in music",
    output: resolve(VALIDATION_DIR, "with-music.mp4"),
    args: ["--size", "5", "--theme", "fresh", "--colors", "4", "--music", "soft", "--duration", String(CASE_DURATION), "--seed", "101"],
    expectedAudioStreams: 1,
  },
  {
    name: "radial no music",
    output: resolve(VALIDATION_DIR, "radial-no-music.mp4"),
    args: [
      "--size",
      "6",
      "--layout",
      "radial",
      "--order",
      "asc",
      "--theme",
      "fresh",
      "--colors",
      "4",
      "--music",
      "none",
      "--duration",
      String(CASE_DURATION),
      "--seed",
      "101",
    ],
    expectedAudioStreams: 0,
  },
];

await rm(VALIDATION_DIR, { recursive: true, force: true });
await mkdir(VALIDATION_DIR, { recursive: true });

try {
  for (const testCase of cases) {
    console.log(`\nChecking ${testCase.name}...`);
    await run(NODE, [
      resolve(ROOT, "scripts/generate-promo-video.mjs"),
      ...testCase.args,
      "--output",
      testCase.output,
    ]);

    const metadata = await probe(testCase.output);
    const duration = Number(metadata.format?.duration ?? 0);
    const audioStreams = metadata.streams.filter((stream) => stream.codec_type === "audio").length;

    assert(
      Math.abs(duration - EXPECTED_DURATION) <= 0.2,
      `${testCase.name}: expected about ${EXPECTED_DURATION}s, got ${duration.toFixed(3)}s`,
    );
    assert(
      audioStreams === testCase.expectedAudioStreams,
      `${testCase.name}: expected ${testCase.expectedAudioStreams} audio stream(s), got ${audioStreams}`,
    );

    console.log(`OK: ${duration.toFixed(2)}s, audio streams: ${audioStreams}`);
  }
} catch (error) {
  console.error(`\nVideo check failed: ${error.message}`);
  console.error(`Artifacts kept in ${VALIDATION_DIR}`);
  process.exitCode = 1;
  throw error;
}

await rm(VALIDATION_DIR, { recursive: true, force: true });
console.log("\nPromo video checks passed.");

function probe(file) {
  return runJson(FFPROBE, [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-show_streams",
    "-of",
    "json",
    file,
  ]);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run(command, args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd: ROOT, stdio: "inherit" });
    child.on("exit", (code) => {
      if (code === 0) resolveRun();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

function runJson(command, args) {
  return new Promise((resolveJson, reject) => {
    const child = spawn(command, args, { cwd: ROOT, stdio: ["ignore", "pipe", "inherit"] });
    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`${command} exited with code ${code}`));
        return;
      }
      try {
        resolveJson(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`Unable to parse ${command} JSON output: ${error.message}`));
      }
    });
  });
}
