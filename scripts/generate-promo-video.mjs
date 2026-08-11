import { mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { getDailyChallenge } from "./daily-challenge.mjs";

const FPS = 30;
const INTRO_SECONDS = 3;
const ROOT = resolve(new URL("..", import.meta.url).pathname);
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const FFMPEG = "/opt/homebrew/bin/ffmpeg";
const FFPROBE = "/opt/homebrew/bin/ffprobe";
const XCRUN = "/usr/bin/xcrun";
const SPEECH_SYNTHESIZER = resolve(ROOT, "scripts/synthesize-speech.swift");
const DEFAULT_OUTPUT = resolve(ROOT, "dist/gridfox-xiaohongshu.mp4");
const MUSIC_DIR = resolve(ROOT, "assets/music");

const canvasProfiles = {
  "9:16": {
    width: 1080,
    height: 1920,
    intro: {
      ghostLeft: 290,
      ghostTop: 512,
      ghostSize: 500,
      titleTop: 190,
      titleFont: 42,
      projectTop: 282,
      projectFont: 82,
      ringLeft: 360,
      ringTop: 1050,
      ringSize: 360,
      countTop: 1098,
      countFont: 202,
      readyTop: 1450,
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
      creditTop: 1648,
      creditFont: 34,
    },
  },
  "3:4": {
    width: 1080,
    height: 1440,
    intro: {
      ghostLeft: 330,
      ghostTop: 352,
      ghostSize: 420,
      titleTop: 72,
      titleFont: 40,
      projectTop: 158,
      projectFont: 78,
      ringLeft: 390,
      ringTop: 805,
      ringSize: 300,
      countTop: 845,
      countFont: 168,
      readyTop: 1140,
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
    surface: "#ffffff",
    checker: "#e1ebe6",
    checkerDark: "#263c36",
    primary: "#116b5d",
    accent: "#ef6f48",
    muted: "#6d7789",
    grid: "#c9d3ce",
    colors: ["#18212f", "#2369c9", "#df4f3f", "#138a66", "#7b4cc2", "#c78919", "#00858a", "#c83f70"],
  },
  ocean: {
    ink: "#142134",
    paper: "#f8fbff",
    surface: "#ffffff",
    checker: "#e3edf7",
    checkerDark: "#26394d",
    primary: "#185c8f",
    accent: "#e45f4f",
    muted: "#65758d",
    grid: "#cfdae8",
    colors: ["#142134", "#1c66d2", "#d95550", "#17806d", "#6652c7", "#b57c10", "#007c8f", "#b94672"],
  },
  vivid: {
    ink: "#1d1a2e",
    paper: "#fffaf4",
    surface: "#ffffff",
    checker: "#f1e4d6",
    checkerDark: "#42342b",
    primary: "#b5531f",
    accent: "#f05f38",
    muted: "#756f86",
    grid: "#e2d8cc",
    colors: ["#1d1a2e", "#1668d9", "#e2473f", "#11885d", "#8053cf", "#c47a00", "#00848f", "#cf3d7d"],
  },
  neon: {
    ink: "#eff9ff",
    paper: "#070b1a",
    surface: "#0d1429",
    checker: "#132542",
    checkerDark: "#111c35",
    primary: "#35e7ff",
    accent: "#ff4fd8",
    muted: "#91a4c9",
    grid: "#28496d",
    colors: ["#eff9ff", "#35e7ff", "#ff5a7a", "#75ff92", "#b18cff", "#ffd166", "#36f1cd", "#ff72cf"],
    glow: true,
  },
};

const args = parseArgs(process.argv.slice(2));
const dailyChallenge = args.daily === true || args.daily === "true" ? getDailyChallenge() : null;
const aspect = String(args.aspect ?? "9:16");
const canvas = canvasProfiles[aspect] ?? canvasProfiles["9:16"];
const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const duration = clamp(Number(args.duration ?? 120), 1, 600);
const requestedShuffleInterval = clamp(Number(args["shuffle-interval"] ?? 0), 0, 120);
const midpointEffect = String(args.midpoint ?? "true") !== "false";
const urgencySeconds = Math.min(duration, clamp(Number(args.urgency ?? 10), 0, 60));
const endScreenSeconds = clamp(Number(args["end-screen"] ?? 1), 0, 5);
const themeName = String(args.theme ?? dailyChallenge?.theme ?? "fresh");
const colorCount = clamp(Number(args.colors ?? dailyChallenge?.colors ?? 4), 1, 8);
const size = clamp(Number(args.size ?? dailyChallenge?.size ?? 6), 4, 6);
const order = String(args.order ?? dailyChallenge?.order ?? "asc") === "desc" ? "desc" : "asc";
const introStyle = String(args["intro-style"] ?? "fast") === "showcase" ? "showcase" : "fast";
const layoutArg = String(args.layout ?? dailyChallenge?.layout ?? "grid");
const requestedCellStyle = String(args["cell-style"] ?? "plain");
const cellStyle = ["checker", "checker-dark"].includes(requestedCellStyle) ? requestedCellStyle : "plain";
const layout =
  layoutArg === "voronoi"
    ? "voronoi"
    : layoutArg === "missing"
    ? "missing"
    : layoutArg === "alphabet"
    ? "alphabet"
    : layoutArg === "redblack"
    ? "redblack"
    : layoutArg === "mixed"
    ? "mixed"
    : layoutArg === "star"
    ? "star"
    : layoutArg === "breathe"
    ? "breathe"
    : layoutArg === "dual"
    ? "dual"
    : layoutArg === "wave"
    ? "wave"
    : layoutArg === "maze"
    ? "maze"
    : layoutArg === "spiral"
    ? "spiral"
    : layoutArg === "float"
      ? "float"
      : layoutArg === "mosaic"
      ? "mosaic"
      : layoutArg === "hex"
        ? "hex"
        : layoutArg === "radial"
          ? "radial"
          : "grid";
if (requestedShuffleInterval > 0 && layout !== "grid") {
  throw new Error("--shuffle-interval currently supports --layout grid only");
}
const shuffleInterval = layout === "grid" ? requestedShuffleInterval : 0;
const rotation =
  ["radial", "spiral"].includes(layout) && ["slow", "fast"].includes(String(args.rotation))
    ? String(args.rotation)
    : "none";
const redBlackRule =
  layout === "redblack" && String(args["redblack-rule"] ?? "basic") === "advanced" ? "advanced" : "basic";
const captureFps =
  rotation === "none" && layout !== "float" && layout !== "breathe"
    ? 1
    : clamp(Number(args["capture-fps"] ?? 12), 2, 24);
const seed = Number.isFinite(Number(args.seed)) ? Number(args.seed) : (dailyChallenge?.seed ?? Date.now());
const musicName = String(args.music ?? "soft");
const music = Object.hasOwn(musicProfiles, musicName) ? musicProfiles[musicName] : musicProfiles.soft;
const musicTrack = args["music-track"] ? String(args["music-track"]) : null;
if (musicTrack && basename(musicTrack) !== musicTrack) {
  throw new Error("--music-track only accepts a filename from assets/music");
}
const musicFile = musicTrack
  ? resolve(MUSIC_DIR, musicTrack)
  : args["music-file"]
    ? resolve(ROOT, String(args["music-file"]))
    : null;
const voiceoverEnabled = args["voice-over"] === true || String(args["voice-over"] ?? "false") === "true";
const voiceName = String(args["voice-name"] ?? "Li-Mu");
const voiceRate = clamp(Number(args["voice-rate"] ?? 182), 120, 260);
const voiceCountdownRatio = clamp(Number(args["voice-countdown-at"] ?? 0.5), 0.3, 0.8);
const challengeDay = clamp(
  Number(args.day ?? dailyChallenge?.day ?? getDailyChallenge().day),
  1,
  9999,
);
const output = resolve(ROOT, args.output ?? DEFAULT_OUTPUT);
const theme = themes[themeName] ?? themes.fresh;
const tempDir = resolve(ROOT, ".tmp/promo-video");
const framesDir = resolve(tempDir, "frames");
const chromeProfile = resolve(tempDir, "chrome-profile");
let completed = false;

if (!existsSync(CHROME)) throw new Error(`Chrome not found at ${CHROME}`);
if (!existsSync(FFMPEG)) throw new Error(`ffmpeg not found at ${FFMPEG}`);
if (voiceoverEnabled && !existsSync(XCRUN)) throw new Error(`xcrun not found at ${XCRUN}`);
if (voiceoverEnabled && !existsSync(SPEECH_SYNTHESIZER)) {
  throw new Error(`Speech synthesizer not found at ${SPEECH_SYNTHESIZER}`);
}

await cleanupTempDir(tempDir);
await mkdir(framesDir, { recursive: true });
await mkdir(dirname(output), { recursive: true });

const total = getChallengeTotal(size, layout);
const missingNumber =
  layout === "missing"
    ? clamp(Number(args["missing-number"] ?? getSeededMissingNumber(seed, total)), 1, total)
    : null;
const narrationText = voiceoverEnabled
  ? String(
      args["voice-text"] ??
        getNarrationText({
          day: challengeDay,
          layout,
          size,
          total,
          order,
          cellStyle,
          redBlackRule,
          rotation,
          shuffleInterval,
        }),
    )
  : null;
const narration = narrationText
  ? await prepareNarration({ text: narrationText, voiceName, voiceRate })
  : null;
const voiceoverSeconds = narration ? Math.ceil(narration.duration + 0.35) : 0;
const countdownStartSeconds = narration
  ? Math.min(voiceoverSeconds * voiceCountdownRatio, Math.max(0, voiceoverSeconds - INTRO_SECONDS))
  : 0;
const grid = createGrid(total, seed).map((value) => (value === missingNumber ? 0 : value));
const shuffleRoundCount = shuffleInterval > 0 ? Math.ceil(duration / shuffleInterval) : 1;
const challengeGrids = Array.from({ length: shuffleRoundCount }, (_, roundIndex) =>
  roundIndex === 0 ? grid : createGrid(total, seed + roundIndex * 0x9e3779b1),
);
const challengeStartSeconds = narration ? voiceoverSeconds : INTRO_SECONDS;
const totalDurationSeconds = challengeStartSeconds + duration + endScreenSeconds;
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
    const challengeSecond = Math.max(0, second - challengeStartSeconds);
    const timeUp = challengeSecond >= duration;
    const shuffleRound =
      shuffleInterval > 0
        ? Math.min(Math.floor(challengeSecond / shuffleInterval), shuffleRoundCount - 1)
        : 0;
    const framePath = resolve(framesDir, `frame-${String(frame).padStart(4, "0")}.png`);
    const html =
      second < countdownStartSeconds
        ? renderVideoIntroHtml({
            introStyle,
            countdown: null,
            voiceoverText: narrationText,
            day: challengeDay,
            grid,
            theme,
            colorCount,
            size,
            order,
            layout,
            cellStyle,
            redBlackRule,
            rotation,
            shuffleInterval,
            seed,
            duration,
          })
        : second < challengeStartSeconds
        ? renderVideoIntroHtml({
            introStyle,
            countdown:
              second - countdownStartSeconds < 1
                ? 3
                : second - countdownStartSeconds < 2
                  ? 2
                  : 1,
            day: narration ? challengeDay : null,
            grid,
            theme,
            colorCount,
            size,
            order,
            layout,
            cellStyle,
            redBlackRule,
            rotation,
            shuffleInterval,
            seed,
            duration,
          })
        : renderChallengeHtml({
            elapsedMs: Math.min(challengeSecond, duration) * 1000,
            timeUp,
            grid: challengeGrids[shuffleRound],
            theme,
            colorCount,
            size,
            order,
            layout,
            cellStyle,
            duration,
            midpointEffect,
            urgencySeconds,
            rotation,
            redBlackRule,
            seed,
            shuffleInterval,
            shuffleRound,
            shuffleRoundCount,
          });
    await setHtml(client, html);
    const screenshot = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    await writeFile(framePath, Buffer.from(screenshot.data, "base64"));
    process.stdout.write(`\rRendered frame ${frame + 1}/${totalFrames}`);
  }

  process.stdout.write("\nEncoding MP4...\n");
  const audio = await prepareAudioInput({
    music,
    musicFile,
    duration: totalDurationSeconds,
    narrationFile: narration?.path ?? null,
    narrationDuration: narration?.duration ?? 0,
    musicDelay: countdownStartSeconds,
  });
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
if (missingNumber !== null) console.log(`Missing number: ${missingNumber}`);
if (narrationText) console.log(`Voice-over: ${narrationText}`);

async function prepareNarration({ text, voiceName, voiceRate }) {
  const narrationPath = resolve(tempDir, "narration.caf");
  const moduleCache = resolve(tempDir, "swift-module-cache");
  await mkdir(moduleCache, { recursive: true });
  await run(XCRUN, [
    "swift",
    "-module-cache-path",
    moduleCache,
    SPEECH_SYNTHESIZER,
    "--voice",
    getVoiceIdentifier(voiceName),
    "--rate",
    String(getSpeechRate(voiceRate)),
    "--output",
    narrationPath,
    "--text",
    text,
  ]);
  const duration = Number(
    await runCapture(FFPROBE, [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      narrationPath,
    ]),
  );
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("Unable to determine voice-over duration");
  return { path: narrationPath, duration };
}

function getVoiceIdentifier(voiceName) {
  const voices = {
    "li-mu": "com.apple.ttsbundle.siri_limu_zh-CN_compact",
    limu: "com.apple.ttsbundle.siri_limu_zh-CN_compact",
    "yu-shu": "com.apple.ttsbundle.siri_yushu_zh-CN_compact",
    yushu: "com.apple.ttsbundle.siri_yushu_zh-CN_compact",
    tingting: "com.apple.voice.compact.zh-CN.Tingting",
  };
  return voices[voiceName.toLowerCase()] ?? voiceName;
}

function getSpeechRate(wordsPerMinute) {
  return clamp(0.46 + (wordsPerMinute - 165) * 0.002, 0.35, 0.65).toFixed(3);
}

async function prepareAudioInput({
  music,
  musicFile,
  duration,
  narrationFile = null,
  narrationDuration = 0,
  musicDelay = 0,
}) {
  if (narrationFile) {
    return prepareNarratedAudio({ music, musicFile, duration, narrationFile, narrationDuration, musicDelay });
  }

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

async function prepareNarratedAudio({ music, musicFile, duration, narrationFile, narrationDuration, musicDelay }) {
  if (!existsSync(narrationFile)) throw new Error(`Voice-over file not found: ${narrationFile}`);
  if (musicFile && !existsSync(musicFile)) throw new Error(`Music file not found: ${musicFile}`);

  const combinedPath = resolve(tempDir, "narrated-audio.wav");
  const musicDuration = Math.max(0, duration - musicDelay);
  let resolvedMusicFile = musicFile;
  let musicVolume = 0.72;

  if (!resolvedMusicFile && music) {
    resolvedMusicFile = resolve(tempDir, "music.wav");
    musicVolume = 1;
    await writeGeneratedMusicWav(resolvedMusicFile, Math.max(1, musicDuration), music);
  }

  if (!resolvedMusicFile || musicDuration <= 0) {
    await run(FFMPEG, [
      "-y",
      "-i",
      narrationFile,
      "-af",
      `highpass=f=80,lowpass=f=10000,acompressor=threshold=-18dB:ratio=2:attack=20:release=180,apad=pad_dur=${duration},atrim=0:${duration},aresample=44100`,
      "-c:a",
      "pcm_s16le",
      combinedPath,
    ]);
  } else {
    const fadeOutStart = Math.max(0, musicDuration - 2);
    const delayMs = Math.round(musicDelay * 1000);
    const voiceOverlapDuration = Math.max(0, narrationDuration - musicDelay);
    const duckedMusicVolume = Number((musicVolume * 0.38).toFixed(3));
    await run(FFMPEG, [
      "-y",
      "-stream_loop",
      "-1",
      "-i",
      resolvedMusicFile,
      "-i",
      narrationFile,
      "-filter_complex",
      `[0:a]atrim=0:${musicDuration},asetpts=PTS-STARTPTS,volume='if(lt(t,${voiceOverlapDuration}),${duckedMusicVolume},${musicVolume})':eval=frame,afade=t=in:st=0:d=1,afade=t=out:st=${fadeOutStart}:d=2,adelay=${delayMs}:all=1[music];[1:a]highpass=f=80,lowpass=f=10000,acompressor=threshold=-18dB:ratio=2:attack=20:release=180[voice];[voice][music]amix=inputs=2:duration=longest:normalize=0,atrim=0:${duration},aresample=44100[mix]`,
      "-map",
      "[mix]",
      "-c:a",
      "pcm_s16le",
      combinedPath,
    ]);
  }

  return {
    inputArgs: ["-i", combinedPath],
    filterArgs: ["-map", "0:v", "-map", "1:a"],
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

function renderVideoIntroHtml({
  introStyle,
  countdown,
  voiceoverText = null,
  day = null,
  grid,
  theme,
  colorCount,
  size,
  order,
  layout,
  cellStyle,
  redBlackRule,
  rotation,
  shuffleInterval,
  seed,
  duration,
}) {
  if (introStyle === "showcase") {
    return renderIntroHtml({
      countdown,
      voiceoverText,
      day,
      theme,
      size,
      layout,
      cellStyle,
      redBlackRule,
      rotation,
      shuffleInterval,
      seed,
    });
  }

  return renderChallengeHtml({
    elapsedMs: 0,
    timeUp: false,
    grid,
    theme,
    colorCount,
    size,
    order,
    layout,
    cellStyle,
    duration,
    midpointEffect: false,
    urgencySeconds: 0,
    rotation,
    redBlackRule,
    seed,
    shuffleInterval,
    shuffleRound: 0,
    shuffleRoundCount: 1,
    introOverlay: { countdown, voiceoverText, day },
  });
}

function renderIntroHtml({
  countdown,
  voiceoverText = null,
  day = null,
  theme,
  size,
  layout,
  cellStyle,
  redBlackRule,
  rotation,
  shuffleInterval,
  seed,
}) {
  const total = getChallengeTotal(size, layout);
  const gridSize = ["redblack", "alphabet"].includes(layout) ? 5 : size;
  const metrics = canvas.intro;
  const projectLabel = getProjectLabelHtml({
    layout,
    size,
    total,
    cellStyle,
    redBlackRule,
    rotation,
    shuffleInterval,
  });
  const projectLabelLength = projectLabel.replace(/<[^>]+>/g, "").replace(/\s/g, "").length;
  const projectFont = Math.round(
    metrics.projectFont * (projectLabelLength >= 11 ? 0.78 : projectLabelLength >= 9 ? 0.88 : 1),
  );

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
      .intro-motif {
        position: absolute; left: ${metrics.ghostLeft}px; top: ${metrics.ghostTop}px;
        width: ${metrics.ghostSize}px; height: ${metrics.ghostSize}px;
        opacity: ${theme.glow ? 0.3 : 0.15};
        border: 2px solid ${theme.grid}; border-radius: 22px; overflow: hidden;
        ${theme.glow ? `filter: drop-shadow(0 0 12px ${theme.primary}33);` : ""}
      }
      .intro-motif svg { display: block; width: 100%; height: 100%; overflow: visible; }
      .intro-motif .motif-cell {
        fill: ${theme.surface}; stroke: ${theme.primary}; stroke-width: 0.7;
      }
      .intro-motif .motif-line {
        fill: none; stroke: ${theme.primary}; stroke-width: 0.78;
        stroke-linecap: round; stroke-linejoin: round;
      }
      .intro-motif .motif-soft { opacity: 0.58; }
      .motif-grid {
        width: 100%; height: 100%;
        background:
          linear-gradient(${theme.grid} 2px, transparent 2px),
          linear-gradient(90deg, ${theme.grid} 2px, transparent 2px);
        background-size: ${metrics.ghostSize / gridSize}px ${metrics.ghostSize / gridSize}px;
      }
      .motif-grid.checker {
        background: repeating-conic-gradient(${theme.primary} 0 25%, transparent 0 50%) 0 0 / ${
          (metrics.ghostSize / gridSize) * 2
        }px ${(metrics.ghostSize / gridSize) * 2}px;
      }
      .motif-symbol {
        position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
        color: ${theme.primary}; font-size: ${Math.round(metrics.ghostSize * 0.28)}px; font-weight: 950;
      }
      .title {
        position: absolute; top: ${metrics.titleTop}px; left: 12%; width: 76%;
        display: flex; align-items: center; justify-content: space-between;
        color: ${theme.muted}; font-size: ${metrics.titleFont}px; font-weight: 800;
        letter-spacing: 0.08em;
      }
      .title-centered { justify-content: center; }
      .day-badge {
        flex: 0 0 auto; padding: 10px 22px; border: 2px solid ${theme.primary}55;
        border-radius: 999px; color: ${theme.primary}; background: ${theme.primary}14;
        font-size: 0.78em; font-weight: 900; letter-spacing: 0.06em;
      }
      .project {
        position: absolute; top: ${metrics.projectTop}px; left: 0; width: 100%;
        text-align: center; color: ${theme.primary}; font-size: ${projectFont}px; font-weight: 950;
        letter-spacing: 0.01em; line-height: 1.08;
      }
      .project span { color: ${theme.accent}; font-size: 0.9em; }
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
      .status {
        position: absolute; left: 0; width: 100%;
        text-align: center; color: ${theme.muted};
        font-size: ${Math.round(metrics.readyFont * 0.72)}px; font-weight: 850;
        letter-spacing: 0.12em;
      }
      .voice-cue {
        position: absolute; top: ${Math.round(metrics.ghostTop + metrics.ghostSize + (aspect === "3:4" ? 44 : 54))}px;
        left: 0; width: 100%; text-align: center;
      }
      .sound-wave {
        height: 42px; display: flex; align-items: center; justify-content: center;
        gap: 10px; margin-bottom: 24px;
      }
      .sound-wave i {
        display: block; width: 7px; border-radius: 999px;
        background: ${theme.glow ? `linear-gradient(180deg, ${theme.primary}, ${theme.accent})` : theme.primary};
        ${theme.glow ? `box-shadow: 0 0 10px ${theme.primary}88;` : ""}
      }
      .sound-wave i:nth-child(1), .sound-wave i:nth-child(5) { height: 16px; opacity: 0.55; }
      .sound-wave i:nth-child(2), .sound-wave i:nth-child(4) { height: 29px; opacity: 0.78; }
      .sound-wave i:nth-child(3) { height: 42px; }
      .voice-status {
        position: relative; display: inline-flex; align-items: center; justify-content: center;
        width: auto; color: ${theme.primary};
        font-size: ${Math.round(metrics.readyFont * 1.12)}px; font-weight: 950;
        letter-spacing: 0.2em; line-height: 1;
        ${
          theme.glow
            ? `background: linear-gradient(90deg, ${theme.primary}, ${theme.accent});
               -webkit-background-clip: text; background-clip: text; color: transparent;
               filter: drop-shadow(0 0 10px ${theme.primary}55);`
            : ""
        }
      }
      .voice-status::before, .voice-status::after {
        content: ""; width: 74px; height: 2px; margin: 0 24px;
        background: linear-gradient(90deg, transparent, ${theme.primary}); opacity: 0.6;
      }
      .voice-status::after { transform: rotate(180deg); }
      .countdown-status { top: ${metrics.readyTop}px; }
      .credit {
        position: absolute; top: ${metrics.creditTop}px; left: 0; width: 100%;
        text-align: center; color: ${theme.muted}; font-size: ${metrics.creditFont}px; font-weight: 800;
      }
    </style>
  </head>
  <body>
    <main class="stage">
      ${renderIntroMotif({ layout, size, total, cellStyle, rotation, seed })}
      <div class="title${day ? "" : " title-centered"}"><span>每日舒尔特训练</span>${day ? `<span class="day-badge">DAY ${day}</span>` : ""}</div>
      <div class="project">${projectLabel}</div>
      ${voiceoverText ? "" : `<div class="ring"></div><div class="count">${countdown}</div>`}
      ${
        voiceoverText
          ? '<div class="voice-cue"><div class="sound-wave"><i></i><i></i><i></i><i></i><i></i></div><div class="voice-status">请听规则</div></div>'
          : '<div class="status countdown-status">准备开始</div>'
      }
      <div class="credit">计时挑战@新加坡大小AI玩</div>
    </main>
  </body>
</html>`;
}

function renderIntroMotif({ layout, size, total, cellStyle, seed }) {
  if (["grid", "alphabet", "redblack", "missing", "mixed"].includes(layout)) {
    const checker = cellStyle === "checker" || cellStyle === "checker-dark";
    const symbol =
      layout === "missing"
        ? '<div class="motif-symbol">?</div>'
        : layout === "alphabet"
          ? '<div class="motif-symbol" style="font-size:118px;letter-spacing:.22em">A·Y</div>'
          : layout === "redblack"
            ? '<div class="motif-symbol" style="font-size:96px">●&nbsp;●</div>'
            : "";
    return `<div class="intro-motif"><div class="motif-grid${checker ? " checker" : ""}"></div>${symbol}</div>`;
  }

  let viewBox = "0 0 100 100";
  let content = "";

  if (layout === "voronoi") {
    const geometry = getVoronoiGeometry(total, seed);
    content = `<defs><clipPath id="intro-voronoi"><circle cx="50" cy="50" r="47"></circle></clipPath></defs>
      <g clip-path="url(#intro-voronoi)">${geometry
        .map((cell) => `<polygon class="motif-cell" points="${cell.points}"></polygon>`)
        .join("")}</g>
      <circle class="motif-line" cx="50" cy="50" r="47"></circle>`;
  } else if (layout === "mosaic") {
    viewBox = "0 0 100 104";
    content = getMosaicGeometry()
      .map((cell) => `<polygon class="motif-cell" points="${cell.points}"></polygon>`)
      .join("");
  } else if (layout === "hex") {
    viewBox = "0 0 100 104";
    content = getHexGeometry()
      .map((cell) => `<polygon class="motif-cell" points="${cell.points}"></polygon>`)
      .join("");
  } else if (layout === "radial") {
    content = `${getRadialGeometry(total)
      .map((cell) => `<path class="motif-cell" d="${describeRadialSegment(cell)}"></path>`)
      .join("")}<circle class="motif-cell" cx="50" cy="50" r="8"></circle>`;
  } else if (layout === "float") {
    viewBox = "0 0 100 86";
    content = `<rect class="motif-line motif-soft" x="2" y="2" width="96" height="82" rx="4"></rect>${getFloatGeometry(0)
      .map(
        (cell) =>
          `<circle class="motif-cell" cx="${cell.x.toFixed(3)}" cy="${cell.y.toFixed(3)}" r="${cell.radius}"></circle>`,
      )
      .join("")}`;
  } else if (layout === "spiral") {
    const geometry = getSpiralGeometry(total, seed);
    content = `<path class="motif-line" d="${describeSpiralGuide(geometry, total <= 25)}"></path>${geometry
      .map(
        (cell) =>
          `<circle class="motif-cell" cx="${cell.x.toFixed(3)}" cy="${cell.y.toFixed(3)}" r="${cell.radius}"></circle>`,
      )
      .join("")}`;
  } else if (layout === "maze") {
    content = `<rect class="motif-line motif-soft" x="3" y="3" width="94" height="94" rx="5"></rect><path class="motif-line" style="stroke-width:7;opacity:.35" d="${describeMazeGuide()}"></path><path class="motif-line" d="${describeMazeGuide()}"></path>`;
  } else if (layout === "wave") {
    content = `<rect class="motif-line motif-soft" x="3" y="3" width="94" height="94" rx="5"></rect>${describeWaveGuides()
      .map((guide) => `<path class="motif-line" style="stroke-width:2" d="${guide}"></path>`)
      .join("")}`;
  } else if (layout === "dual") {
    content = `<rect class="motif-line" x="4" y="6" width="42" height="88" rx="4"></rect><rect class="motif-line" x="54" y="6" width="42" height="88" rx="4"></rect>${getDualGeometry()
      .map(
        (cell) =>
          `<rect class="motif-line motif-soft" style="stroke-width:.42" x="${cell.x.toFixed(3)}" y="${cell.y.toFixed(3)}" width="${cell.width}" height="${cell.height}"></rect>`,
      )
      .join("")}<line class="motif-line" style="stroke-width:1.15;stroke-dasharray:3 3" x1="50" x2="50" y1="8" y2="92"></line>`;
  } else if (layout === "breathe") {
    content = `<rect class="motif-line motif-soft" x="4" y="6" width="92" height="88" rx="5"></rect>${getBreatheGeometry(0)
      .filter((_, index) => index % 2 === 0)
      .map(
        (cell) =>
          `<circle class="motif-cell" cx="${cell.x.toFixed(3)}" cy="${cell.y.toFixed(3)}" r="${cell.radius.toFixed(3)}"></circle>`,
      )
      .join("")}`;
  } else if (layout === "star") {
    content = `${describeStarGuides()
      .map(
        (guide) =>
          `<ellipse class="motif-line motif-soft" cx="50" cy="50" rx="${guide.rx}" ry="${guide.ry}" transform="rotate(${guide.rotate} 50 50)"></ellipse>`,
      )
      .join("")}${describeStarPaths()
      .map((path) => `<path class="motif-line" d="${path}"></path>`)
      .join("")}`;
  } else {
    return '<div class="intro-motif"><div class="motif-grid"></div></div>';
  }

  return `<div class="intro-motif"><svg viewBox="${viewBox}" aria-hidden="true">${content}</svg></div>`;
}

function renderChallengeHtml({
  elapsedMs,
  timeUp,
  grid,
  theme,
  colorCount,
  size,
  order,
  layout,
  cellStyle,
  duration,
  midpointEffect,
  urgencySeconds,
  rotation,
  redBlackRule,
  seed,
  shuffleInterval,
  shuffleRound,
  shuffleRoundCount,
  introOverlay = null,
}) {
  const total = getChallengeTotal(size, layout);
  const elapsedSeconds = elapsedMs / 1000;
  const remainingSeconds = Math.max(0, duration - elapsedSeconds);
  const midpointStart = duration / 2;
  const showMidpoint =
    !timeUp &&
    shuffleInterval === 0 &&
    midpointEffect &&
    elapsedSeconds >= midpointStart &&
    elapsedSeconds < midpointStart + 2 &&
    remainingSeconds > urgencySeconds;
  const showUrgency = !timeUp && urgencySeconds > 0 && remainingSeconds > 0 && remainingSeconds <= urgencySeconds;
  const isCritical = timeUp || (showUrgency && remainingSeconds <= 5);
  const heartbeatExpanded = timeUp || (isCritical && Math.ceil(remainingSeconds) % 2 === 1);
  const timerColor = isCritical ? theme.colors[2] : showUrgency ? theme.accent : theme.primary;
  const timerShadow = isCritical ? `0 0 18px ${theme.colors[2]}44` : showUrgency ? `0 0 12px ${theme.accent}2b` : "none";
  const pulseColor = isCritical ? theme.colors[2] : showUrgency ? theme.accent : null;
  const pulseAlpha = isCritical ? (heartbeatExpanded ? "24" : "0d") : "0b";
  const baseBackground = theme.glow
    ? `radial-gradient(circle at 18% 18%, ${theme.primary}18 0%, ${theme.primary}00 34%), radial-gradient(circle at 82% 76%, ${theme.accent}14 0%, ${theme.accent}00 38%), ${theme.paper}`
    : theme.paper;
  const stageBackground = pulseColor
    ? `radial-gradient(circle at 50% 24%, ${pulseColor}${pulseAlpha} 0%, ${pulseColor}00 48%), radial-gradient(circle at 50% 82%, ${pulseColor}${pulseAlpha} 0%, ${pulseColor}00 56%), ${baseBackground}`
    : baseBackground;
  const secondsUntilShuffle =
    shuffleInterval > 0 ? shuffleInterval - (elapsedSeconds % shuffleInterval) : Number.POSITIVE_INFINITY;
  const showShuffleWarning =
    !timeUp && shuffleRound < shuffleRoundCount - 1 && secondsUntilShuffle > 0 && secondsUntilShuffle <= 1;
  const milestoneText = timeUp
    ? "时间到！"
    : showUrgency
      ? `还剩 ${Math.max(1, Math.ceil(remainingSeconds))} 秒`
      : showShuffleWarning
        ? "即将刷新"
      : showMidpoint
        ? "时间过半"
        : "";
  const range = layout === "redblack" ? { start: 1, end: 13 } : getTargetRange(total, order);
  const startLabel = getTargetLabel(range.start, layout);
  const endLabel = getTargetLabel(range.end, layout);
  const metrics = canvas.challenge;
  const gridSize = metrics.boardSize;
  const boardColumns = ["redblack", "alphabet"].includes(layout) ? 5 : size;
  const cellSize = gridSize / boardColumns;
  const fontSize = Math.round(
    (["redblack", "alphabet"].includes(layout) ? 82 : size >= 6 ? 66 : 82) * (gridSize / 928),
  );
  const introProjectLabel = introOverlay
    ? getProjectLabelHtml({
        layout,
        size,
        total,
        cellStyle,
        redBlackRule,
        rotation,
        shuffleInterval,
      })
    : "";
  const introProjectLength = introProjectLabel.replace(/<[^>]+>/g, "").replace(/\s/g, "").length;
  const introProjectFont = Math.round(
    (aspect === "3:4" ? 76 : 84) * (introProjectLength >= 11 ? 0.78 : introProjectLength >= 9 ? 0.88 : 1),
  );
  const introHook = introOverlay
    ? layout === "missing"
      ? `${formatCompactNumber(duration)}秒挑战 · 找出缺失数字`
      : layout === "redblack"
        ? redBlackRule === "advanced"
          ? `${formatCompactNumber(duration)}秒挑战 · 黑升红降交替`
          : `${formatCompactNumber(duration)}秒挑战 · 红黑交替找到13`
        : `${formatCompactNumber(duration)}秒挑战 · 从 ${startLabel} 找到 ${endLabel}`
    : "";
  const board =
    layout === "redblack"
      ? `<div class="grid">${grid
          .map((token, index) => {
            const row = Math.floor(index / boardColumns);
            const col = index % boardColumns;
            const isRed = token > 13;
            const displayNumber = isRed ? token - 13 : token;
            const color = isRed ? theme.colors[2] : theme.ink;
            return `<div class="cell" style="left:${col * cellSize}px;top:${row * cellSize}px;color:${color}">${displayNumber}</div>`;
            })
            .join("")}</div>`
      : layout === "missing"
        ? `<div class="grid">${grid
            .map((number, index) => {
              const row = Math.floor(index / boardColumns);
              const col = index % boardColumns;
              const background = getCellBackground(theme, cellStyle, row, col);
              const color =
                number === 0
                  ? cellStyle === "checker-dark" && (row + col) % 2 === 1
                    ? "#ff9b73"
                    : theme.accent
                  : getGridCellTextColor(theme, cellStyle, row, col, number, colorCount, -1);
              const label = number === 0 ? "?" : number;
              return `<div class="cell" style="left:${col * cellSize}px;top:${row * cellSize}px;color:${color};background:${background}">${label}</div>`;
            })
            .join("")}</div>`
      : layout === "alphabet"
        ? `<div class="grid">${grid
            .map((number, index) => {
              const row = Math.floor(index / boardColumns);
              const col = index % boardColumns;
              const color = getGridCellTextColor(theme, cellStyle, row, col, number, colorCount, range.start);
              const letter = getTargetLabel(number, layout);
              const background = getCellBackground(theme, cellStyle, row, col);
              return `<div class="cell" style="left:${col * cellSize}px;top:${row * cellSize}px;color:${color};background:${background}">${letter}</div>`;
            })
            .join("")}</div>`
      : layout === "radial"
      ? renderRadialBoard({
          grid,
          theme,
          colorCount,
          startNumber: range.start,
          rotationDeg: getRotationDegrees(rotation, elapsedMs),
        })
      : layout === "hex"
        ? renderHexBoard({ grid, theme, colorCount, startNumber: range.start })
        : layout === "voronoi"
          ? renderVoronoiBoard({ grid, theme, colorCount, startNumber: range.start, seed })
        : layout === "mosaic"
          ? renderMosaicBoard({ grid, theme, colorCount, startNumber: range.start })
        : layout === "float"
          ? renderFloatBoard({ grid, theme, colorCount, startNumber: range.start, elapsedMs })
          : layout === "spiral"
            ? renderSpiralBoard({
                grid,
                theme,
                colorCount,
                startNumber: range.start,
                rotationDeg: getRotationDegrees(rotation, elapsedMs, "spiral"),
                seed,
              })
            : layout === "maze"
              ? renderMazeBoard({ grid, theme, colorCount, startNumber: range.start })
              : layout === "wave"
                ? renderWaveBoard({ grid, theme, colorCount, startNumber: range.start })
                : layout === "dual"
                  ? renderDualBoard({ grid, theme, colorCount, startNumber: range.start })
                  : layout === "breathe"
                    ? renderBreatheBoard({ grid, theme, colorCount, startNumber: range.start, elapsedMs })
                    : layout === "star"
                      ? renderStarBoard({ grid, theme, colorCount, startNumber: range.start })
                      : layout === "mixed"
                        ? renderMixedBoard({ grid, theme, colorCount, startNumber: range.start })
          : `<div class="grid">${grid
              .map((number, index) => {
                const row = Math.floor(index / size);
                const col = index % size;
                const color = getGridCellTextColor(theme, cellStyle, row, col, number, colorCount, range.start);
                const background = getCellBackground(theme, cellStyle, row, col);
                return `<div class="cell" style="left:${col * cellSize}px;top:${row * cellSize}px;color:${color};background:${background}">${number}</div>`;
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
      .stage {
        position: relative; width: ${WIDTH}px; height: ${HEIGHT}px; color: ${theme.ink};
        background: ${stageBackground};
      }
      .brand {
        position: absolute; top: ${metrics.brandTop}px; left: 0; width: 100%;
        text-align: center; color: ${theme.primary}; font-size: ${metrics.brandFont}px; font-weight: 900;
        ${theme.glow ? `text-shadow: 0 0 14px ${theme.primary}66;` : ""}
      }
      .title {
        position: absolute; top: ${metrics.titleTop}px; left: 0; width: 100%;
        text-align: center; font-size: ${metrics.titleFont}px; line-height: 1.15; font-weight: 900;
      }
      .title span { color: ${theme.accent}; }
      .title .black-sequence { color: ${theme.ink}; }
      .title .red-sequence { color: ${theme.colors[2]}; }
      .subtitle {
        position: absolute; top: ${metrics.subtitleTop}px; left: 0; width: 100%;
        text-align: center; color: ${theme.muted}; font-size: ${metrics.subtitleFont}px; font-weight: 800;
      }
      .timer {
        position: absolute; top: ${metrics.timerTop}px; left: 0; width: 100%;
        text-align: center; color: ${timerColor}; font-size: ${metrics.timerFont}px; font-weight: 900;
        text-shadow: ${timerShadow};
      }
      .milestone {
        position: absolute; top: ${Math.round(metrics.timerTop + metrics.timerFont * 1.15)}px; left: 50%;
        transform: translateX(-50%); min-width: 180px; padding: 7px 20px 8px;
        border-radius: 999px; text-align: center; color: ${isCritical ? theme.colors[2] : theme.primary};
        background: ${isCritical ? `${theme.colors[2]}14` : `${theme.primary}12`};
        font-size: ${aspect === "3:4" ? 25 : 29}px; font-weight: 900;
      }
      .grid {
        position: absolute; left: ${metrics.boardLeft}px; top: ${metrics.boardTop}px;
        width: ${metrics.boardSize}px; height: ${metrics.boardSize}px;
        border: 3px solid ${theme.grid}; border-radius: 18px; overflow: hidden; background: ${theme.surface};
        ${theme.glow ? `box-shadow: 0 0 18px ${theme.primary}28, inset 0 0 28px ${theme.primary}0c;` : ""}
      }
      .mixed {
        position: absolute; left: ${metrics.boardLeft}px; top: ${metrics.boardTop}px;
        width: ${metrics.boardSize}px; height: ${metrics.boardSize}px;
        border: 3px solid ${theme.grid}; border-radius: 18px; overflow: hidden; background: ${theme.surface};
      }
      .radial {
        position: absolute; left: ${metrics.boardLeft}px; top: ${metrics.boardTop}px;
        width: ${metrics.boardSize}px; height: ${metrics.boardSize}px;
        filter: drop-shadow(0 14px 34px rgba(24, 33, 47, 0.1));
      }
      .hex {
        position: absolute; left: ${metrics.boardLeft}px; top: ${metrics.tallBoardTop}px;
        width: ${metrics.boardSize}px; height: ${metrics.tallBoardHeight}px;
        filter: ${theme.glow ? "none" : "drop-shadow(0 14px 34px rgba(24, 33, 47, 0.1))"};
      }
      .mosaic {
        position: absolute; left: ${metrics.boardLeft}px; top: ${metrics.tallBoardTop}px;
        width: ${metrics.boardSize}px; height: ${metrics.tallBoardHeight}px;
        filter: ${theme.glow ? "none" : "drop-shadow(0 14px 34px rgba(24, 33, 47, 0.1))"};
      }
      .voronoi {
        position: absolute; left: ${metrics.boardLeft}px; top: ${metrics.boardTop}px;
        width: ${metrics.boardSize}px; height: ${metrics.boardSize}px;
        filter: ${theme.glow ? "none" : "drop-shadow(0 14px 34px rgba(24, 33, 47, 0.1))"};
      }
      .float {
        position: absolute; left: ${metrics.boardLeft}px; top: ${metrics.boardTop + 38}px;
        width: ${metrics.boardSize}px; height: ${Math.round(metrics.boardSize * 0.86)}px;
        filter: ${theme.glow ? "none" : "drop-shadow(0 14px 34px rgba(24, 33, 47, 0.1))"};
      }
      .spiral {
        position: absolute; left: ${metrics.boardLeft}px; top: ${metrics.boardTop}px;
        width: ${metrics.boardSize}px; height: ${metrics.boardSize}px;
        filter: ${theme.glow ? "none" : "drop-shadow(0 14px 34px rgba(24, 33, 47, 0.1))"};
      }
      .maze {
        position: absolute; left: ${metrics.boardLeft}px; top: ${metrics.boardTop}px;
        width: ${metrics.boardSize}px; height: ${metrics.boardSize}px;
        filter: drop-shadow(0 14px 34px rgba(24, 33, 47, 0.1));
      }
      .wave {
        position: absolute; left: ${metrics.boardLeft}px; top: ${metrics.boardTop}px;
        width: ${metrics.boardSize}px; height: ${metrics.boardSize}px;
        filter: drop-shadow(0 14px 34px rgba(24, 33, 47, 0.1));
      }
      .dual {
        position: absolute; left: ${metrics.boardLeft}px; top: ${metrics.boardTop}px;
        width: ${metrics.boardSize}px; height: ${metrics.boardSize}px;
        filter: ${theme.glow ? "none" : "drop-shadow(0 14px 34px rgba(24, 33, 47, 0.1))"};
      }
      .breathe {
        position: absolute; left: ${metrics.boardLeft}px; top: ${metrics.boardTop}px;
        width: ${metrics.boardSize}px; height: ${metrics.boardSize}px;
        filter: drop-shadow(0 14px 34px rgba(24, 33, 47, 0.1));
      }
      .star {
        position: absolute; left: ${metrics.boardLeft}px; top: ${metrics.boardTop}px;
        width: ${metrics.boardSize}px; height: ${metrics.boardSize}px;
        filter: drop-shadow(0 14px 34px rgba(24, 33, 47, 0.1));
      }
      .radial svg { display: block; width: 100%; height: 100%; overflow: visible; }
      .hex svg { display: block; width: 100%; height: 100%; overflow: visible; }
      .mosaic svg { display: block; width: 100%; height: 100%; overflow: visible; }
      .voronoi svg { display: block; width: 100%; height: 100%; overflow: visible; }
      .float svg { display: block; width: 100%; height: 100%; overflow: visible; }
      .spiral svg { display: block; width: 100%; height: 100%; overflow: visible; }
      .maze svg { display: block; width: 100%; height: 100%; overflow: visible; }
      .wave svg { display: block; width: 100%; height: 100%; overflow: visible; }
      .dual svg { display: block; width: 100%; height: 100%; overflow: visible; }
      .breathe svg { display: block; width: 100%; height: 100%; overflow: visible; }
      .star svg { display: block; width: 100%; height: 100%; overflow: visible; }
      .radial path { fill: white; stroke: ${theme.grid}; stroke-width: 0.42; }
      .radial .center { fill: ${theme.paper}; stroke: ${theme.grid}; stroke-width: 0.6; }
      .radial text {
        dominant-baseline: middle; text-anchor: middle;
        font-size: 5.4px; font-weight: 950;
      }
      .hex polygon {
        stroke: ${theme.glow ? theme.primary : theme.ink}; stroke-width: ${theme.glow ? 0.42 : 0.5};
        stroke-opacity: ${theme.glow ? 0.62 : 1}; stroke-linejoin: round;
        ${theme.glow ? `filter: drop-shadow(0 0 0.18px ${theme.primary});` : ""}
      }
      .hex text {
        dominant-baseline: middle; text-anchor: middle;
        font-size: 7.8px; font-weight: 950;
        ${theme.glow ? "filter: none;" : ""}
      }
      .mosaic polygon {
        stroke: ${theme.glow ? theme.primary : theme.grid}; stroke-width: ${theme.glow ? 0.42 : 0.55};
        stroke-opacity: ${theme.glow ? 0.62 : 1}; stroke-linejoin: round;
        ${theme.glow ? `filter: drop-shadow(0 0 0.18px ${theme.primary});` : ""}
      }
      .mosaic text {
        dominant-baseline: middle; text-anchor: middle;
        font-size: 7.1px; font-weight: 950;
        ${theme.glow ? "filter: none;" : ""}
      }
      .voronoi polygon {
        stroke: ${theme.glow ? theme.primary : theme.grid}; stroke-width: ${theme.glow ? 0.38 : 0.52};
        stroke-opacity: ${theme.glow ? 0.58 : 1}; stroke-linejoin: round;
        ${theme.glow ? `filter: drop-shadow(0 0 0.14px ${theme.primary});` : ""}
      }
      .voronoi .outline {
        fill: none; stroke: ${theme.glow ? theme.primary : theme.grid}; stroke-width: ${theme.glow ? 0.62 : 0.75};
        stroke-opacity: ${theme.glow ? 0.84 : 1};
        ${theme.glow ? `filter: drop-shadow(0 0 0.24px ${theme.primary});` : ""}
      }
      .voronoi text {
        dominant-baseline: middle; text-anchor: middle;
        font-size: 5.25px; font-weight: 950;
        ${theme.glow ? "filter: none;" : ""}
      }
      .float .panel {
        fill: ${theme.surface}; stroke: ${theme.glow ? theme.primary : theme.grid}; stroke-width: 0.35;
        stroke-opacity: ${theme.glow ? 0.46 : 1};
        ${theme.glow ? `filter: drop-shadow(0 0 0.16px ${theme.primary});` : ""}
      }
      .float .grid-line {
        stroke: ${theme.glow ? theme.primary : theme.grid};
        stroke-opacity: ${theme.glow ? 0.1 : 0.38}; stroke-width: 0.18;
      }
      .float circle {
        stroke: ${theme.primary}; stroke-opacity: 0.42; stroke-width: 0.45;
        filter: ${theme.glow ? `drop-shadow(0 0 0.28px ${theme.primary})` : "drop-shadow(0 1px 1px rgba(24, 33, 47, 0.15))"};
      }
      .float text {
        dominant-baseline: middle; text-anchor: middle;
        font-size: 5.15px; font-weight: 950;
        ${theme.glow ? "filter: none;" : ""}
      }
      .spiral .guide {
        fill: none; stroke: ${theme.primary}; stroke-opacity: 0.22;
        stroke-width: 0.52; stroke-linecap: round; stroke-linejoin: round;
        ${theme.glow ? `filter: drop-shadow(0 0 0.22px ${theme.primary}); stroke-opacity: 0.42;` : ""}
      }
      .spiral circle {
        fill: ${theme.surface}; stroke: ${theme.primary}; stroke-opacity: 0.42; stroke-width: 0.45;
        filter: ${theme.glow ? `drop-shadow(0 0 0.3px ${theme.primary})` : "drop-shadow(0 1px 1px rgba(24, 33, 47, 0.14))"};
      }
      .spiral text {
        dominant-baseline: middle; text-anchor: middle;
        font-size: 5.05px; font-weight: 950;
        ${theme.glow ? "filter: none;" : ""}
      }
      .maze .panel { fill: white; stroke: ${theme.grid}; stroke-width: 0.45; }
      .maze .corridor {
        fill: none; stroke: ${theme.primary}; stroke-opacity: 0.12; stroke-width: 7.6;
        stroke-linecap: round; stroke-linejoin: round;
      }
      .maze .guide {
        fill: none; stroke: ${theme.primary}; stroke-opacity: 0.38; stroke-width: 0.72;
        stroke-linecap: round; stroke-linejoin: round;
      }
      .maze circle {
        fill: white; stroke: ${theme.primary}; stroke-opacity: 0.46; stroke-width: 0.5;
        filter: drop-shadow(0 1px 1px rgba(24, 33, 47, 0.14));
      }
      .maze text {
        dominant-baseline: middle; text-anchor: middle;
        font-size: 5.05px; font-weight: 950;
      }
      .wave .panel { fill: white; stroke: ${theme.grid}; stroke-width: 0.45; }
      .wave .guide {
        fill: none; stroke: ${theme.primary}; stroke-opacity: 0.24; stroke-width: 2.4;
        stroke-linecap: round; stroke-linejoin: round;
      }
      .wave circle {
        fill: white; stroke: ${theme.primary}; stroke-opacity: 0.46; stroke-width: 0.5;
        filter: drop-shadow(0 1px 1px rgba(24, 33, 47, 0.14));
      }
      .wave text {
        dominant-baseline: middle; text-anchor: middle;
        font-size: 5.05px; font-weight: 950;
      }
      .dual .panel {
        fill: ${theme.surface};
        stroke: ${theme.glow ? theme.primary : theme.grid};
        stroke-width: ${theme.glow ? 0.52 : 0.45};
        stroke-opacity: ${theme.glow ? 0.68 : 1};
        ${theme.glow ? `filter: drop-shadow(0 0 0.2px ${theme.primary});` : ""}
      }
      .dual .divider {
        stroke: ${theme.primary}; stroke-opacity: ${theme.glow ? 0.62 : 0.18};
        stroke-width: ${theme.glow ? 0.62 : 0.8};
        stroke-dasharray: 2.6 2.6;
        ${theme.glow ? `filter: drop-shadow(0 0 0.16px ${theme.primary});` : ""}
      }
      .dual .dual-grid-cell {
        fill: ${theme.surface}; fill-opacity: ${theme.glow ? 0.82 : 1};
        stroke: ${theme.primary};
        stroke-opacity: ${theme.glow ? 0.36 : 0.28};
        stroke-width: ${theme.glow ? 0.34 : 0.38};
      }
      .dual text {
        dominant-baseline: middle; text-anchor: middle;
        font-size: 5.75px; font-weight: 950;
        ${theme.glow ? "filter: none;" : ""}
      }
      .breathe .panel { fill: white; stroke: ${theme.grid}; stroke-width: 0.45; }
      .breathe .grid-line { stroke: ${theme.primary}; stroke-opacity: 0.13; stroke-width: 0.2; }
      .breathe circle {
        fill: white; stroke: ${theme.primary}; stroke-opacity: 0.48; stroke-width: 0.5;
        filter: drop-shadow(0 1px 1px rgba(24, 33, 47, 0.14));
      }
      .breathe text {
        dominant-baseline: middle; text-anchor: middle;
        font-size: 5.15px; font-weight: 950;
      }
      .star .panel { fill: white; stroke: ${theme.grid}; stroke-width: 0.45; }
      .star .guide {
        fill: none; stroke: ${theme.primary}; stroke-opacity: 0.22; stroke-width: 0.62;
        stroke-dasharray: 2.3 2.3;
      }
      .star .path {
        fill: none; stroke: ${theme.primary}; stroke-opacity: 0.24; stroke-width: 1.1;
        stroke-linecap: round; stroke-linejoin: round;
      }
      .star circle {
        fill: white; stroke: ${theme.primary}; stroke-opacity: 0.48; stroke-width: 0.5;
        filter: drop-shadow(0 1px 1px rgba(24, 33, 47, 0.14));
      }
      .star text {
        dominant-baseline: middle; text-anchor: middle;
        font-size: 4.75px; font-weight: 950;
      }
      .cell {
        position: absolute; width: ${cellSize}px; height: ${cellSize}px;
        display: flex; align-items: center; justify-content: center;
        border-right: 2px solid ${theme.grid}; border-bottom: 2px solid ${theme.grid};
        font-size: ${fontSize}px; font-weight: 900; line-height: 1;
        ${theme.glow ? "text-shadow: 0 0 7px currentColor;" : ""}
      }
      .mixed-cell {
        position: absolute; display: flex; align-items: center; justify-content: center;
        border-right: 2px solid ${theme.grid}; border-bottom: 2px solid ${theme.grid};
        font-weight: 950; line-height: 1;
      }
      .footer {
        position: absolute; top: ${metrics.creditTop}px; left: 0; width: 100%;
        text-align: center; color: ${theme.muted}; font-size: ${metrics.creditFont}px;
        font-weight: 800; line-height: 1.25; white-space: nowrap;
      }
      .footer.finish {
        color: ${theme.primary};
        font-size: ${aspect === "3:4" ? 32 : 38}px; font-weight: 900; letter-spacing: 0.04em;
        ${theme.glow ? `text-shadow: 0 0 12px ${theme.primary}55;` : ""}
      }
      .fast-intro .grid, .fast-intro .mixed, .fast-intro .radial, .fast-intro .hex,
      .fast-intro .mosaic, .fast-intro .voronoi, .fast-intro .float, .fast-intro .spiral,
      .fast-intro .maze, .fast-intro .wave, .fast-intro .dual, .fast-intro .breathe,
      .fast-intro .star {
        opacity: ${introOverlay?.voiceoverText ? 0.48 : 0.62};
        filter: saturate(0.82) brightness(${theme.glow ? 0.78 : 0.94});
      }
      .intro-series {
        position: absolute; z-index: 10; top: ${aspect === "3:4" ? 58 : 92}px;
        left: 12%; width: 76%; display: flex; align-items: center; justify-content: space-between;
        color: ${theme.muted}; font-size: ${aspect === "3:4" ? 38 : 42}px;
        font-weight: 800; letter-spacing: 0.08em;
      }
      .intro-series.centered { justify-content: center; }
      .intro-day {
        padding: ${aspect === "3:4" ? "9px 20px" : "11px 24px"};
        border: 2px solid ${theme.primary}55; border-radius: 999px;
        color: ${theme.primary}; background: ${theme.paper}e8;
        font-size: 0.78em; font-weight: 950; letter-spacing: 0.06em;
      }
      .intro-project {
        position: absolute; z-index: 10; top: ${aspect === "3:4" ? 140 : 202}px;
        left: 0; width: 100%; text-align: center; color: ${theme.primary};
        font-size: ${introProjectFont}px; line-height: 1.08; font-weight: 950;
      }
      .intro-project span { color: ${theme.accent}; font-size: 0.9em; }
      .intro-hook {
        position: absolute; z-index: 10; top: ${aspect === "3:4" ? 234 : 318}px;
        left: 0; width: 100%; text-align: center; color: ${theme.muted};
        font-size: ${aspect === "3:4" ? 34 : 40}px; font-weight: 850; letter-spacing: 0.04em;
      }
      .intro-focus-card {
        position: absolute; z-index: 12; left: 50%;
        top: ${metrics.boardTop - (aspect === "3:4" ? 76 : 102)}px;
        transform: translate(-50%, -50%); min-width: ${aspect === "3:4" ? 430 : 500}px;
        padding: ${aspect === "3:4" ? "20px 38px" : "24px 46px"};
        border: 2px solid ${theme.primary}55; border-radius: 999px;
        color: ${theme.primary}; background: ${theme.paper}e8;
        text-align: center; font-size: ${aspect === "3:4" ? 42 : 48}px;
        font-weight: 950; letter-spacing: 0.16em;
        box-shadow: 0 18px 50px ${theme.paper}99${theme.glow ? `, 0 0 22px ${theme.primary}33` : ""};
      }
      .intro-focus-card::before {
        content: ""; display: inline-block; width: 34px; height: 24px; margin-right: 22px;
        vertical-align: 4px;
        background: linear-gradient(90deg, ${theme.primary} 0 16%, transparent 16% 28%, ${theme.accent} 28% 48%, transparent 48% 60%, ${theme.primary} 60% 100%);
        border-radius: 8px;
      }
      .intro-count-ring {
        position: absolute; z-index: 12;
        right: 12%; top: ${metrics.boardTop - (aspect === "3:4" ? 154 : 194)}px;
        width: ${aspect === "3:4" ? 126 : 156}px; height: ${aspect === "3:4" ? 126 : 156}px;
        border: ${aspect === "3:4" ? 7 : 8}px solid ${theme.grid};
        border-top-color: ${theme.accent}; border-radius: 50%;
        background: ${theme.paper}dd;
        ${theme.glow ? `box-shadow: 0 0 24px ${theme.primary}2e;` : ""}
      }
      .intro-count {
        position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
        color: ${theme.accent}; font-size: ${aspect === "3:4" ? 82 : 102}px; font-weight: 950;
      }
      .intro-ready {
        position: absolute; z-index: 12; left: 12%; width: 62%;
        top: ${metrics.boardTop - (aspect === "3:4" ? 86 : 110)}px;
        text-align: center; color: ${theme.muted}; font-size: ${aspect === "3:4" ? 28 : 34}px;
        font-weight: 900; letter-spacing: 0.12em;
      }
      .intro-credit {
        position: absolute; z-index: 10; top: ${metrics.creditTop}px; left: 0; width: 100%;
        text-align: center; color: ${theme.muted}; font-size: ${metrics.creditFont}px; font-weight: 800;
      }
    </style>
  </head>
  <body>
    <main class="stage${introOverlay ? " fast-intro" : ""}">
      ${introOverlay ? `<div class="intro-series${introOverlay.day ? "" : " centered"}"><span>每日舒尔特训练</span>${introOverlay.day ? `<span class="intro-day">DAY ${introOverlay.day}</span>` : ""}</div><div class="intro-project">${introProjectLabel}</div><div class="intro-hook">${introHook}</div>` : `<div class="brand">${
        shuffleInterval > 0
          ? "动态刷新舒尔特挑战"
          : layout === "redblack"
          ? redBlackRule === "advanced"
            ? "红黑进阶舒尔特挑战"
            : "红黑交替舒尔特挑战"
          : layout === "missing"
            ? "缺失数字舒尔特挑战"
          : layout === "voronoi"
            ? "变形舒尔特挑战"
          : layout === "grid" && cellStyle === "checker-dark"
            ? "高难棋盘舒尔特挑战"
          : layout === "grid" && cellStyle === "checker"
            ? "棋盘舒尔特挑战"
          : layout === "alphabet"
            ? "字母舒尔特挑战"
          : layout === "radial" && rotation !== "none"
          ? "旋转圆盘舒尔特挑战"
          : layout === "radial"
            ? "圆盘舒尔特挑战"
            : layout === "hex"
              ? "蜂巢舒尔特挑战"
              : layout === "mosaic"
                ? "变形舒尔特挑战"
                : layout === "float"
                  ? "浮球舒尔特挑战"
                  : layout === "spiral"
                    ? rotation === "none"
                      ? "螺旋舒尔特挑战"
                      : "旋转螺旋舒尔特挑战"
                    : layout === "maze"
                      ? "迷宫舒尔特挑战"
                      : layout === "wave"
                        ? "波浪舒尔特挑战"
                        : layout === "dual"
                          ? "双区舒尔特挑战"
                          : layout === "breathe"
                            ? "呼吸舒尔特挑战"
                            : layout === "star"
                              ? "星轨舒尔特挑战"
                              : layout === "mixed"
                                ? "大小混排舒尔特挑战"
                : "舒尔特方格挑战"
      }</div><div class="title">${
        layout === "missing"
          ? "找出 <span>缺失的数字</span>"
          : layout === "redblack"
          ? redBlackRule === "advanced"
            ? "黑色升序，红色降序，<span>交替查找</span>"
            : "红黑交替，从 <span class=\"black-sequence\">1</span> 找到 <span class=\"black-sequence\">13</span>"
          : `请按顺序从 <span>${startLabel}</span> 找到 <span>${endLabel}</span>`
      }</div><div class="subtitle">${
        layout === "missing"
          ? `1 到 ${total} 中，少了哪一个？`
          : layout === "redblack"
          ? redBlackRule === "advanced"
            ? "黑 1 → 红 12 → 黑 2 → 红 11…最后找到黑 13"
            : "黑 1 → 红 1 → 黑 2 → 红 2…最后找到黑 13"
          : shuffleInterval > 0
            ? `第 ${shuffleRound + 1}/${shuffleRoundCount} 轮 · 每 ${formatCompactNumber(shuffleInterval)} 秒刷新后从 ${startLabel} 重新开始`
            : `从 ${startLabel} 到 ${endLabel}，看看你需要多久`
      }</div><div class="timer">${formatTime(elapsedMs)}</div>${milestoneText ? `<div class="milestone">${milestoneText}</div>` : ""}`}
      ${board}
      ${
        introOverlay
          ? introOverlay.voiceoverText
            ? '<div class="intro-focus-card">请听规则</div><div class="intro-credit">计时挑战@新加坡大小AI玩</div>'
            : `<div class="intro-count-ring"><div class="intro-count">${introOverlay.countdown}</div></div><div class="intro-ready">马上开始</div><div class="intro-credit">计时挑战@新加坡大小AI玩</div>`
          : `<div class="footer${timeUp ? " finish" : ""}">${
              timeUp ? "请记下自己的进度，明天继续哦" : "计时挑战@新加坡大小AI玩"
            }</div>`
      }
    </main>
  </body>
</html>`;
}

function renderMixedBoard({ grid, theme, colorCount, startNumber }) {
  const size = 6;
  const boardSize = canvas.challenge.boardSize;
  const cellSize = boardSize / size;
  const geometry = getMixedGeometry();

  return `<div class="mixed">${grid
    .map((number, index) => {
      const row = Math.floor(index / size);
      const col = index % size;
      const cellGeometry = geometry[index];
      const color = getNumberColor(theme, number, colorCount, startNumber);
      return `<div class="mixed-cell" style="left:${col * cellSize}px;top:${row * cellSize}px;width:${cellSize}px;height:${cellSize}px;color:${color};font-size:${cellGeometry.fontSize}px;font-weight:${cellGeometry.fontWeight}">${number}</div>`;
    })
    .join("")}</div>`;
}

function renderRadialBoard({ grid, theme, colorCount, startNumber, rotationDeg }) {
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
          const color = getNumberColor(theme, number, colorCount, startNumber);
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

function renderHexBoard({ grid, theme, colorCount, startNumber }) {
  const geometry = getHexGeometry();
  const cells = grid
    .map((number, index) => {
      const cellGeometry = geometry[index];
      const color = getNumberColor(theme, number, colorCount, startNumber);
      const fill = theme.glow
        ? [theme.surface, theme.checkerDark, theme.checker][index % 3]
        : theme.surface;
      return `<g>
        <polygon points="${cellGeometry.points}" fill="${fill}"></polygon>
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

function renderMosaicBoard({ grid, theme, colorCount, startNumber }) {
  const geometry = getMosaicGeometry();
  const cells = grid
    .map((number, index) => {
      const cellGeometry = geometry[index];
      const color = getNumberColor(theme, number, colorCount, startNumber);
      const fill = theme.glow
        ? [theme.surface, theme.checkerDark, theme.checker][index % 3]
        : theme.surface;
      return `<g>
        <polygon points="${cellGeometry.points}" fill="${fill}"></polygon>
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

function renderVoronoiBoard({ grid, theme, colorCount, startNumber, seed }) {
  const geometry = getVoronoiGeometry(grid.length, seed);
  const cells = grid
    .map((number, index) => {
      const cellGeometry = geometry[index];
      const color = getNumberColor(theme, number, colorCount, startNumber);
      const fill = theme.glow
        ? [theme.surface, theme.checkerDark, theme.checker][index % 3]
        : theme.surface;
      return `<g>
        <polygon points="${cellGeometry.points}" fill="${fill}"></polygon>
        <text x="${cellGeometry.labelX.toFixed(3)}" y="${(cellGeometry.labelY + 0.3).toFixed(3)}" fill="${color}">${number}</text>
      </g>`;
    })
    .join("");

  return `<div class="voronoi">
    <svg viewBox="0 0 100 100" aria-label="变形舒尔特数字盘">
      <defs>
        <clipPath id="voronoi-circle"><circle cx="50" cy="50" r="47"></circle></clipPath>
      </defs>
      <g clip-path="url(#voronoi-circle)">${cells}</g>
      <circle class="outline" cx="50" cy="50" r="47"></circle>
    </svg>
  </div>`;
}

function renderFloatBoard({ grid, theme, colorCount, startNumber, elapsedMs }) {
  const geometry = getFloatGeometry(elapsedMs);
  const gridLines = [
    ...Array.from(
      { length: 13 },
      (_, index) =>
        `<line class="grid-line" x1="${(4 + index * 7.7).toFixed(2)}" x2="${(4 + index * 7.7).toFixed(
          2,
        )}" y1="2" y2="84"></line>`,
    ),
    ...Array.from(
      { length: 10 },
      (_, index) =>
        `<line class="grid-line" x1="2" x2="98" y1="${(6 + index * 8.2).toFixed(2)}" y2="${(
          6 + index * 8.2
        ).toFixed(2)}"></line>`,
    ),
  ].join("");
  const cells = grid
    .map((number, index) => {
      const cellGeometry = geometry[index];
      const color = getNumberColor(theme, number, colorCount, startNumber);
      const fill = theme.glow
        ? [theme.surface, theme.checkerDark, theme.checker][index % 3]
        : theme.surface;
      const isHighlightedStart = colorCount === 1 && number === startNumber;
      const stroke = isHighlightedStart ? theme.accent : theme.primary;
      const strokeOpacity = isHighlightedStart ? 0.78 : 0.42;
      return `<g>
        <circle cx="${cellGeometry.x.toFixed(3)}" cy="${cellGeometry.y.toFixed(3)}" r="${cellGeometry.radius}" fill="${fill}" stroke="${stroke}" stroke-opacity="${strokeOpacity}"></circle>
        <text x="${cellGeometry.x.toFixed(3)}" y="${(cellGeometry.y + 0.25).toFixed(3)}" fill="${color}">${number}</text>
      </g>`;
    })
    .join("");

  return `<div class="float">
    <svg viewBox="0 0 100 86" aria-label="浮球舒尔特数字盘">
      <rect class="panel" x="1.5" y="1.5" width="97" height="83" rx="3.8"></rect>
      ${gridLines}
      ${cells}
    </svg>
  </div>`;
}

function renderSpiralBoard({ grid, theme, colorCount, startNumber, rotationDeg, seed }) {
  const geometry = rotateSpiralGeometry(getSpiralGeometry(grid.length, seed), rotationDeg);
  const guide = describeSpiralGuide(geometry, grid.length <= 25);
  const cells = grid
    .map((number, index) => {
      const cellGeometry = geometry[index];
      const color = getNumberColor(theme, number, colorCount, startNumber);
      return `<g>
        <circle cx="${cellGeometry.x.toFixed(3)}" cy="${cellGeometry.y.toFixed(3)}" r="${cellGeometry.radius}"></circle>
        <text x="${cellGeometry.x.toFixed(3)}" y="${(cellGeometry.y + 0.28).toFixed(3)}" fill="${color}">${number}</text>
      </g>`;
    })
    .join("");

  return `<div class="spiral">
    <svg viewBox="0 0 100 100" aria-label="螺旋舒尔特数字盘">
      <path class="guide" d="${guide}"></path>
      ${cells}
    </svg>
  </div>`;
}

function renderMazeBoard({ grid, theme, colorCount, startNumber }) {
  const geometry = getMazeGeometry();
  const guide = describeMazeGuide();
  const cells = grid
    .map((number, index) => {
      const cellGeometry = geometry[index];
      const color = getNumberColor(theme, number, colorCount, startNumber);
      return `<g>
        <circle cx="${cellGeometry.x.toFixed(3)}" cy="${cellGeometry.y.toFixed(3)}" r="${cellGeometry.radius}"></circle>
        <text x="${cellGeometry.x.toFixed(3)}" y="${(cellGeometry.y + 0.28).toFixed(3)}" fill="${color}">${number}</text>
      </g>`;
    })
    .join("");

  return `<div class="maze">
    <svg viewBox="0 0 100 100" aria-label="迷宫舒尔特数字盘">
      <rect class="panel" x="3" y="3" width="94" height="94" rx="5"></rect>
      <path class="corridor" d="${guide}"></path>
      <path class="guide" d="${guide}"></path>
      ${cells}
    </svg>
  </div>`;
}

function renderWaveBoard({ grid, theme, colorCount, startNumber }) {
  const geometry = getWaveGeometry();
  const guides = describeWaveGuides();
  const cells = grid
    .map((number, index) => {
      const cellGeometry = geometry[index];
      const color = getNumberColor(theme, number, colorCount, startNumber);
      return `<g>
        <circle cx="${cellGeometry.x.toFixed(3)}" cy="${cellGeometry.y.toFixed(3)}" r="${cellGeometry.radius}"></circle>
        <text x="${cellGeometry.x.toFixed(3)}" y="${(cellGeometry.y + 0.28).toFixed(3)}" fill="${color}">${number}</text>
      </g>`;
    })
    .join("");

  return `<div class="wave">
    <svg viewBox="0 0 100 100" aria-label="波浪舒尔特数字盘">
      <rect class="panel" x="3" y="3" width="94" height="94" rx="5"></rect>
      ${guides.map((guide) => `<path class="guide" d="${guide}"></path>`).join("")}
      ${cells}
    </svg>
  </div>`;
}

function renderDualBoard({ grid, theme, colorCount, startNumber }) {
  const geometry = getDualGeometry();
  const cells = grid
    .map((number, index) => {
      const cellGeometry = geometry[index];
      const color = getNumberColor(theme, number, colorCount, startNumber);
      return `<g>
        <rect class="dual-grid-cell" x="${cellGeometry.x.toFixed(3)}" y="${cellGeometry.y.toFixed(3)}" width="${cellGeometry.width}" height="${cellGeometry.height}"></rect>
        <text x="${cellGeometry.labelX.toFixed(3)}" y="${cellGeometry.labelY.toFixed(3)}" fill="${color}">${number}</text>
      </g>`;
    })
    .join("");

  return `<div class="dual">
    <svg viewBox="0 0 100 100" aria-label="双区舒尔特数字盘">
      <rect class="panel" x="4" y="6" width="42" height="88" rx="4"></rect>
      <rect class="panel" x="54" y="6" width="42" height="88" rx="4"></rect>
      <line class="divider" x1="50" x2="50" y1="8" y2="92"></line>
      ${cells}
    </svg>
  </div>`;
}

function renderBreatheBoard({ grid, theme, colorCount, startNumber, elapsedMs }) {
  const geometry = getBreatheGeometry(elapsedMs);
  const gridLines = [
    ...Array.from({ length: 5 }, (_, index) => {
      const x = 4 + (92 / 6) * (index + 1);
      return `<line class="grid-line" x1="${x.toFixed(3)}" x2="${x.toFixed(3)}" y1="7" y2="93"></line>`;
    }),
    ...Array.from({ length: 5 }, (_, index) => {
      const y = 6 + (88 / 6) * (index + 1);
      return `<line class="grid-line" x1="5" x2="95" y1="${y.toFixed(3)}" y2="${y.toFixed(3)}"></line>`;
    }),
  ].join("");
  const cells = grid
    .map((number, index) => {
      const cellGeometry = geometry[index];
      const color = getNumberColor(theme, number, colorCount, startNumber);
      return `<g>
        <circle cx="${cellGeometry.x.toFixed(3)}" cy="${cellGeometry.y.toFixed(3)}" r="${cellGeometry.radius.toFixed(3)}"></circle>
        <text x="${cellGeometry.x.toFixed(3)}" y="${(cellGeometry.y + 0.28).toFixed(3)}" fill="${color}">${number}</text>
      </g>`;
    })
    .join("");

  return `<div class="breathe">
    <svg viewBox="0 0 100 100" aria-label="呼吸舒尔特数字盘">
      <rect class="panel" x="4" y="6" width="92" height="88" rx="5"></rect>
      ${gridLines}
      ${cells}
    </svg>
  </div>`;
}

function renderStarBoard({ grid, theme, colorCount, startNumber }) {
  const geometry = getStarGeometry();
  const guides = describeStarGuides();
  const paths = describeStarPaths();
  const cells = grid
    .map((number, index) => {
      const cellGeometry = geometry[index];
      const color = getNumberColor(theme, number, colorCount, startNumber);
      return `<g>
        <circle cx="${cellGeometry.x.toFixed(3)}" cy="${cellGeometry.y.toFixed(3)}" r="${cellGeometry.radius}"></circle>
        <text x="${cellGeometry.x.toFixed(3)}" y="${(cellGeometry.y + 0.28).toFixed(3)}" fill="${color}">${number}</text>
      </g>`;
    })
    .join("");

  return `<div class="star">
    <svg viewBox="0 0 100 100" aria-label="星轨舒尔特数字盘">
      <rect class="panel" x="3" y="3" width="94" height="94" rx="5"></rect>
      ${guides
        .map(
          (guide) =>
            `<ellipse class="guide" cx="50" cy="50" rx="${guide.rx}" ry="${guide.ry}" transform="rotate(${guide.rotate} 50 50)"></ellipse>`,
        )
        .join("")}
      ${paths.map((path) => `<path class="path" d="${path}"></path>`).join("")}
      ${cells}
    </svg>
  </div>`;
}

function getRotationDegrees(rotation, elapsedMs, layout = "radial") {
  const slowSpeed = layout === "spiral" ? 4 : 6;
  const fastSpeed = layout === "spiral" ? 7 : 10;
  const direction = layout === "spiral" ? -1 : 1;
  if (rotation === "slow") return (elapsedMs / 1000) * slowSpeed * direction;
  if (rotation === "fast") return (elapsedMs / 1000) * fastSpeed * direction;
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

function getMixedGeometry() {
  const pattern = [
    58, 48, 70, 52, 62, 50,
    54, 66, 48, 58, 56, 72,
    68, 54, 62, 50, 76, 58,
    52, 72, 50, 66, 58, 48,
    62, 56, 70, 54, 58, 50,
    48, 62, 52, 76, 58, 68,
  ];

  return pattern.map((fontSize) => ({
    fontSize,
    fontWeight: fontSize >= 60 ? 950 : 900,
  }));
}

function getChallengeTotal(size, layout) {
  if (layout === "alphabet") return 25;
  if (layout === "redblack") return 25;
  if (layout === "mixed") return 36;
  if (layout === "star") return 36;
  if (layout === "breathe") return 36;
  if (layout === "dual") return 36;
  if (layout === "wave") return 36;
  if (layout === "maze") return 36;
  if (layout === "spiral") return size * size;
  if (layout === "float") return 36;
  if (layout === "voronoi") return 36;
  return layout === "hex" || layout === "mosaic" ? 30 : size * size;
}

function getProjectLabel({ layout, size, total }) {
  if (layout === "missing") return `缺失数字舒尔特 ${size}×${size}`;
  if (layout === "alphabet") return "字母舒尔特 A～Y";
  if (layout === "redblack") return "红黑交替舒尔特 5×5";
  if (layout === "radial") return `圆盘舒尔特 ${total}`;
  if (layout === "hex") return "蜂巢舒尔特 30";
  if (layout === "mosaic") return "变形舒尔特 30";
  if (layout === "voronoi") return "变形舒尔特 36";
  if (layout === "float") return "浮球舒尔特 36";
  if (layout === "spiral") return `螺旋舒尔特 ${total}`;
  if (layout === "maze") return "迷宫舒尔特 36";
  if (layout === "wave") return "波浪舒尔特 36";
  if (layout === "dual") return "双区舒尔特 36";
  if (layout === "breathe") return "呼吸舒尔特 36";
  if (layout === "star") return "星轨舒尔特 36";
  if (layout === "mixed") return "大小混排舒尔特 36";
  return `舒尔特方格 ${size}×${size}`;
}

function getProjectLabelHtml({
  layout,
  size,
  total,
  cellStyle,
  redBlackRule,
  rotation = "none",
  shuffleInterval = 0,
}) {
  if (shuffleInterval > 0) return `动态刷新舒尔特 <span>${size}×${size}</span>`;
  if (layout === "missing") return `缺失数字舒尔特 <span>${size}×${size}</span>`;
  if (layout === "grid" && cellStyle === "checker-dark") return `高难棋盘舒尔特 <span>${size}×${size}</span>`;
  if (layout === "grid" && cellStyle === "checker") return `棋盘舒尔特 <span>${size}×${size}</span>`;
  if (layout === "alphabet") return "字母舒尔特 <span>A～Y</span>";
  if (layout === "redblack") {
    return `${redBlackRule === "advanced" ? "红黑进阶" : "红黑交替"}舒尔特 <span>5×5</span>`;
  }
  if (layout === "radial") return `圆盘舒尔特 <span>${total}</span>`;
  if (layout === "hex") return "蜂巢舒尔特 <span>30</span>";
  if (layout === "mosaic") return "变形舒尔特 <span>30</span>";
  if (layout === "voronoi") return "变形舒尔特 <span>1 → 36</span>";
  if (layout === "float") return "浮球舒尔特 <span>36</span>";
  if (layout === "spiral") {
    return `${rotation === "none" ? "螺旋舒尔特" : "旋转螺旋舒尔特"} <span>${total}</span>`;
  }
  if (layout === "maze") return "迷宫舒尔特 <span>36</span>";
  if (layout === "wave") return "波浪舒尔特 <span>36</span>";
  if (layout === "dual") return "双区舒尔特 <span>36</span>";
  if (layout === "breathe") return "呼吸舒尔特 <span>36</span>";
  if (layout === "star") return "星轨舒尔特 <span>36</span>";
  if (layout === "mixed") return "大小混排舒尔特 <span>36</span>";
  return `舒尔特方格 <span>${size}×${size}</span>`;
}

function getNarrationText({
  day,
  layout,
  size,
  total,
  order,
  cellStyle,
  redBlackRule,
  rotation,
  shuffleInterval,
}) {
  const name = getNarrationChallengeName({ layout, size, cellStyle, redBlackRule, rotation, shuffleInterval });
  const range = getTargetRange(total, order);
  let rule;

  if (layout === "missing") {
    rule = `找出1到${total}中缺失的数字`;
  } else if (layout === "alphabet") {
    rule = `从${getTargetLabel(range.start, layout)}找到${getTargetLabel(range.end, layout)}`;
  } else if (layout === "redblack") {
    rule =
      redBlackRule === "advanced"
        ? "黑色升序、红色降序，交替查找"
        : "按照黑1、红1、黑2、红2的顺序交替查找";
  } else if (shuffleInterval > 0) {
    rule = `每${formatCompactNumber(shuffleInterval)}秒刷新一次，每轮从${range.start}重新开始`;
  } else {
    rule = `从${range.start}找到${range.end}`;
  }

  return `每日专注力训练，第${day}天。今天做${name}，${rule}。开始！`;
}

function getNarrationChallengeName({ layout, size, cellStyle, redBlackRule, rotation, shuffleInterval }) {
  if (shuffleInterval > 0) return "动态刷新舒尔特";
  if (layout === "missing") return "缺失数字舒尔特";
  if (layout === "alphabet") return "字母舒尔特";
  if (layout === "redblack") return redBlackRule === "advanced" ? "红黑进阶舒尔特" : "红黑交替舒尔特";
  if (layout === "voronoi") return "变形舒尔特";
  if (layout === "mosaic") return "变形舒尔特";
  if (layout === "hex") return "蜂巢舒尔特";
  if (layout === "float") return "浮球舒尔特";
  if (layout === "spiral") return rotation === "none" ? "螺旋舒尔特" : "旋转螺旋舒尔特";
  if (layout === "radial") return rotation === "none" ? "圆盘舒尔特" : "旋转圆盘舒尔特";
  if (layout === "maze") return "迷宫舒尔特";
  if (layout === "wave") return "波浪舒尔特";
  if (layout === "dual") return "双区舒尔特";
  if (layout === "breathe") return "呼吸舒尔特";
  if (layout === "star") return "星轨舒尔特";
  if (layout === "mixed") return "大小混排舒尔特";
  if (cellStyle === "checker-dark") return "高难棋盘舒尔特";
  if (cellStyle === "checker") return "棋盘舒尔特";
  return `${size}乘${size}舒尔特方格`;
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

function formatCompactNumber(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(1)));
}

function getTargetRange(total, order) {
  return order === "desc" ? { start: total, end: 1 } : { start: 1, end: total };
}

function getTargetLabel(value, layout) {
  return layout === "alphabet" ? String.fromCharCode(64 + value) : String(value);
}

function getSeededMissingNumber(seed, total) {
  const random = mulberry32(Math.trunc(seed) ^ 0x4d495353);
  return Math.floor(random() * total) + 1;
}

function getCellBackground(theme, cellStyle, row, col) {
  if ((row + col) % 2 !== 1) return theme.surface;
  if (cellStyle === "checker-dark") return theme.checkerDark;
  if (cellStyle === "checker") return theme.checker;
  return theme.surface;
}

function getGridCellTextColor(theme, cellStyle, row, col, number, colorCount, startNumber) {
  if (number === startNumber) {
    return cellStyle === "checker-dark" && (row + col) % 2 === 1 ? "#ff9b73" : theme.accent;
  }
  if (cellStyle === "checker-dark") return (row + col) % 2 === 1 ? "white" : theme.ink;
  return getNumberColor(theme, number, colorCount, startNumber);
}

function getNumberColor(theme, number, colorCount, startNumber) {
  if (colorCount === 1 && number === startNumber) return theme.accent;
  return theme.colors[number % colorCount];
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

function getVoronoiGeometry(total, seed) {
  const sites = getVoronoiSites(total, seed);
  const boundary = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];

  return sites.map((site, siteIndex) => {
    const polygon = sites.reduce(
      (currentPolygon, otherSite, otherIndex) =>
        otherIndex === siteIndex || currentPolygon.length === 0
          ? currentPolygon
          : clipPolygonToVoronoiHalfPlane(currentPolygon, site, otherSite),
      boundary,
    );

    return {
      points: polygon.map((point) => `${point.x.toFixed(3)},${point.y.toFixed(3)}`).join(" "),
      labelX: site.x,
      labelY: site.y,
    };
  });
}

function getVoronoiSites(total, seed) {
  const random = mulberry32(Math.trunc(seed) ^ 0x564f524f);
  const ringCounts = total === 36 ? [1, 7, 11, 17] : getRadialRingCounts(total);
  const radii = ringCounts.length === 4 ? [0, 14, 27, 40] : ringCounts.map((_, index) => 8 + index * 16);

  return ringCounts
    .flatMap((count, ringIndex) => {
      if (ringIndex === 0 && count === 1) {
        return [{ x: 50 + (random() - 0.5) * 3, y: 50 + (random() - 0.5) * 3 }];
      }

      const angleStep = (Math.PI * 2) / count;
      const ringOffset = random() * angleStep;
      const radiusJitter = ringIndex === ringCounts.length - 1 ? 2.1 : 3.2;
      return Array.from({ length: count }, (_, index) => {
        const angleJitter = (random() - 0.5) * angleStep * 0.42;
        const angle = ringOffset + index * angleStep + angleJitter;
        const radius = radii[ringIndex] + (random() - 0.5) * radiusJitter * 2;
        return {
          x: 50 + Math.cos(angle) * radius,
          y: 50 + Math.sin(angle) * radius,
        };
      });
    })
    .slice(0, total);
}

function clipPolygonToVoronoiHalfPlane(polygon, site, otherSite) {
  const normalX = otherSite.x - site.x;
  const normalY = otherSite.y - site.y;
  const threshold =
    (otherSite.x * otherSite.x + otherSite.y * otherSite.y - site.x * site.x - site.y * site.y) / 2;
  const signedDistance = (point) => normalX * point.x + normalY * point.y - threshold;
  const clipped = [];

  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];
    const startDistance = signedDistance(start);
    const endDistance = signedDistance(end);
    const startInside = startDistance <= 0.000001;
    const endInside = endDistance <= 0.000001;

    if (startInside && endInside) {
      clipped.push(end);
      continue;
    }

    if (startInside !== endInside) {
      const denominator = startDistance - endDistance;
      const ratio = Math.abs(denominator) < 0.000001 ? 0 : startDistance / denominator;
      clipped.push({
        x: start.x + (end.x - start.x) * ratio,
        y: start.y + (end.y - start.y) * ratio,
      });
    }

    if (!startInside && endInside) clipped.push(end);
  }

  return clipped;
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
    const x = 50 + (baseX - 50) * 0.9;
    const y = 43 + (baseY - 36) * 1.14;
    return {
      x: x + Math.sin(time * speed + phase) * amplitudeX,
      y: y + Math.cos(time * (speed * 0.9) + phase) * amplitudeY,
      radius: 4.15,
    };
  });
}

function getSpiralGeometry(total = 36, seed = 0) {
  const innerRadius = 8;
  const outerRadius = 45.8;
  const radiusStep = total > 1 ? (outerRadius - innerRadius) / (total - 1) : 0;
  const cellRadius = total <= 25 ? 3.3 : 3.95;
  const angleStep = total <= 25 ? 0.9 : 0.82;
  const isOrganic = total <= 25;
  const random = mulberry32(Math.trunc(seed) ^ 0x53504952);
  const geometry = [];

  for (let index = 0; index < total; index += 1) {
    const angleJitter = isOrganic ? Math.sin(index * 1.37) * 0.16 + (random() - 0.5) * 0.24 : 0;
    const radialJitter = isOrganic
      ? Math.sin(index * 2.03) * 1.7 + (random() - 0.5) * 3.6
      : Math.sin(index * 1.7) * 0.55;
    const baseAngle = -Math.PI / 2 + index * angleStep + angleJitter;
    const baseRadius = innerRadius + index * radiusStep + radialJitter;
    let point;

    for (let attempt = 0; attempt < 9; attempt += 1) {
      const direction = attempt % 2 === 0 ? 1 : -1;
      const angleOffset = attempt === 0 ? 0 : direction * Math.ceil(attempt / 2) * 0.075;
      const adjustedRadius = isOrganic ? clamp(baseRadius + attempt * 0.18, 6.8, 45.5) : baseRadius;
      const angle = baseAngle + angleOffset;
      const candidate = {
        x: 50 + Math.cos(angle) * adjustedRadius,
        y: 50 + Math.sin(angle) * adjustedRadius,
        radius: cellRadius,
      };
      const hasClearance =
        !isOrganic ||
        geometry.every(
          (existing) => Math.hypot(existing.x - candidate.x, existing.y - candidate.y) >= cellRadius * 2 + 0.7,
        );
      point = candidate;
      if (hasClearance) break;
    }

    geometry.push(point);
  }

  return geometry;
}

function rotateSpiralGeometry(geometry, degrees) {
  if (!degrees) return geometry;
  const radians = (degrees * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return geometry.map((point) => {
    const offsetX = point.x - 50;
    const offsetY = point.y - 50;
    return {
      ...point,
      x: 50 + offsetX * cosine - offsetY * sine,
      y: 50 + offsetX * sine + offsetY * cosine,
    };
  });
}

function describeSpiralGuide(geometry = getSpiralGeometry(), smooth = false) {
  if (!smooth) {
    return geometry
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(3)} ${point.y.toFixed(3)}`)
      .join(" ");
  }

  return geometry.slice(0, -1).reduce((path, point, index) => {
    const previous = geometry[Math.max(0, index - 1)];
    const next = geometry[index + 1];
    const following = geometry[Math.min(geometry.length - 1, index + 2)];
    const control1X = point.x + (next.x - previous.x) / 6;
    const control1Y = point.y + (next.y - previous.y) / 6;
    const control2X = next.x - (following.x - point.x) / 6;
    const control2Y = next.y - (following.y - point.y) / 6;
    return `${path} C ${control1X.toFixed(3)} ${control1Y.toFixed(3)} ${control2X.toFixed(
      3,
    )} ${control2Y.toFixed(3)} ${next.x.toFixed(3)} ${next.y.toFixed(3)}`;
  }, `M ${geometry[0].x.toFixed(3)} ${geometry[0].y.toFixed(3)}`);
}

function getMazeGeometry() {
  const columns = [10, 26, 42, 58, 74, 90];
  const rows = [12, 26, 40, 54, 68, 82];
  const points = rows.flatMap((y, row) => {
    const xs = row % 2 === 0 ? columns : [...columns].reverse();
    return xs.map((x) => [x, y]);
  });

  return points.map(([x, y]) => ({
    x,
    y,
    radius: 4.05,
  }));
}

function describeMazeGuide() {
  return getMazeGeometry()
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(3)} ${point.y.toFixed(3)}`)
    .join(" ");
}

function getWaveGeometry() {
  const columns = [10, 26, 42, 58, 74, 90];
  const rows = [14, 28, 42, 56, 70, 84];
  return rows.flatMap((baseY, row) =>
    columns.map((x, col) => ({
      x,
      y: baseY + Math.sin((col / (columns.length - 1)) * Math.PI * 2 + row * 0.72) * 3.8,
      radius: 4.05,
      row,
    })),
  );
}

function describeWaveGuides() {
  const geometry = getWaveGeometry();
  return Array.from({ length: 6 }, (_, row) =>
    geometry
      .filter((point) => point.row === row)
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(3)} ${point.y.toFixed(3)}`)
      .join(" "),
  );
}

function getDualGeometry() {
  const cellWidth = 14;
  const cellHeight = 14.67;
  const top = 6;
  const leftX = 4;
  const rightX = 54;
  const buildZone = (zone, offsetX, colOffset) =>
    Array.from({ length: 18 }, (_, index) => {
      const row = Math.floor(index / 3);
      const col = index % 3;
      const x = offsetX + col * cellWidth;
      const y = top + row * cellHeight;
      return {
        row,
        col: col + colOffset,
        x,
        y,
        width: cellWidth,
        height: cellHeight,
        labelX: x + cellWidth / 2,
        labelY: y + cellHeight / 2 + 0.4,
        zone,
      };
    });

  return [...buildZone("left", leftX, 0), ...buildZone("right", rightX, 3)];
}

function getBreatheGeometry(elapsedMs = 0) {
  const left = 4;
  const top = 6;
  const cellWidth = 92 / 6;
  const cellHeight = 88 / 6;
  const time = elapsedMs / 1000;

  return Array.from({ length: 36 }, (_, index) => {
    const row = Math.floor(index / 6);
    const col = index % 6;
    const speed = 1.75 + (index % 5) * 0.12;
    const phase = index * 0.56;
    const pulse = 1 + Math.sin(time * speed + phase) * 0.1;
    return {
      x: left + cellWidth * (col + 0.5),
      y: top + cellHeight * (row + 0.5),
      radius: 4.35 * pulse,
    };
  });
}

function getStarGeometry() {
  const radii = [10, 17, 24, 31, 38, 42];
  return Array.from({ length: 36 }, (_, index) => {
    const arm = Math.floor(index / 6);
    const step = index % 6;
    const angle = ((arm * 60 - 96 + step * 13.5 + Math.sin(arm * 1.7) * 5) * Math.PI) / 180;
    const radius = radii[step];
    return {
      x: 50 + Math.cos(angle) * radius,
      y: 50 + Math.sin(angle) * radius,
      radius: 3.35,
    };
  });
}

function describeStarPaths() {
  const radii = [9, 17, 24, 31, 38, 43];
  return Array.from({ length: 6 }, (_, arm) =>
    radii
      .map((radius, step) => {
        const angle = ((arm * 60 - 96 + step * 13.5 + Math.sin(arm * 1.7) * 5) * Math.PI) / 180;
        const x = 50 + Math.cos(angle) * radius;
        const y = 50 + Math.sin(angle) * radius;
        return `${step === 0 ? "M" : "L"} ${x.toFixed(3)} ${y.toFixed(3)}`;
      })
      .join(" "),
  );
}

function describeStarGuides() {
  return [
    { rx: 19, ry: 12, rotate: -18 },
    { rx: 32, ry: 22, rotate: 24 },
    { rx: 43, ry: 32, rotate: -28 },
  ];
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

function runCapture(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "inherit"] });
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.on("exit", (code) => {
      if (code === 0) resolve(output.trim());
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}
