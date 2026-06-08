import { useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_MODE,
  MODES,
  createGrid,
  formatTime,
  getAccentClass,
  getBestTime,
  saveBestTime,
  type FinishedRun,
  type GameMode,
  type TapRecord,
} from "./game";
import { createChallengeVideo } from "./video";

type Screen = "ready" | "playing" | "finished";

export default function App() {
  const [mode, setMode] = useState<GameMode>(DEFAULT_MODE);
  const [screen, setScreen] = useState<Screen>("ready");
  const [grid, setGrid] = useState(() => createGrid(DEFAULT_MODE.size));
  const [target, setTarget] = useState(1);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [taps, setTaps] = useState<TapRecord[]>([]);
  const [finishedRun, setFinishedRun] = useState<FinishedRun | null>(null);
  const [bestMs, setBestMs] = useState<number | null>(() => getBestTime(DEFAULT_MODE));
  const [videoStatus, setVideoStatus] = useState<"idle" | "rendering" | "done" | "error">("idle");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);

  const total = mode.size * mode.size;
  const titleParts = useMemo(
    () => ({
      before: "按顺序从",
      start: "1",
      middle: "找到",
      end: String(total),
    }),
    [total],
  );

  useEffect(() => {
    if (screen !== "playing" || startedAt === null) return;

    let frameId = 0;
    const tick = () => {
      setElapsedMs(performance.now() - startedAt);
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [screen, startedAt]);

  useEffect(() => {
    setBestMs(getBestTime(mode));
  }, [mode]);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  function resetGame(nextMode = mode) {
    setMode(nextMode);
    setGrid(createGrid(nextMode.size));
    setTarget(1);
    setStartedAt(null);
    setElapsedMs(0);
    setTaps([]);
    setFinishedRun(null);
    setVideoStatus("idle");
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null);
    setScreen("ready");
  }

  function startGame() {
    setGrid(createGrid(mode.size));
    setTarget(1);
    setStartedAt(performance.now());
    setElapsedMs(0);
    setTaps([]);
    setFinishedRun(null);
    setVideoStatus("idle");
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null);
    setScreen("playing");
  }

  function handleCellClick(number: number, index: number) {
    if (screen !== "playing" || startedAt === null) return;

    const now = performance.now();
    const currentElapsed = now - startedAt;
    const row = Math.floor(index / mode.size);
    const col = index % mode.size;
    const correct = number === target;
    const nextTap: TapRecord = { number, target, elapsedMs: currentElapsed, row, col, correct };
    const nextTaps = [...taps, nextTap];
    setTaps(nextTaps);
    setElapsedMs(currentElapsed);

    if (!correct) {
      boardRef.current?.classList.remove("shake");
      requestAnimationFrame(() => boardRef.current?.classList.add("shake"));
      return;
    }

    if (target === total) {
      const run: FinishedRun = {
        mode,
        grid,
        taps: nextTaps,
        elapsedMs: currentElapsed,
        completedAt: new Date().toISOString(),
      };
      setFinishedRun(run);
      setBestMs(saveBestTime(mode, currentElapsed));
      setScreen("finished");
      return;
    }

    setTarget(target + 1);
  }

  async function handleCreateVideo() {
    if (!finishedRun) return;

    setVideoStatus("rendering");
    try {
      const blob = await createChallengeVideo(finishedRun);
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      setVideoUrl(URL.createObjectURL(blob));
      setVideoStatus("done");
    } catch (error) {
      console.error(error);
      setVideoStatus("error");
    }
  }

  function copyShareText() {
    if (!finishedRun) return;
    const text = `我完成了 ${mode.label} 舒尔特方格挑战，用时 ${formatTime(
      finishedRun.elapsedMs,
      true,
    )}。你能超过我吗？`;
    void navigator.clipboard?.writeText(text);
  }

  return (
    <main className="app-shell">
      <section className="challenge-card" aria-label="GridFox 舒尔特方格挑战">
        <header className="topbar">
          <button className="brand-button" type="button" onClick={() => resetGame(mode)}>
            GridFox
          </button>
          <div className="mode-switch" aria-label="选择难度">
            {MODES.map((item) => (
              <button
                className={item.size === mode.size ? "mode-button active" : "mode-button"}
                key={item.size}
                type="button"
                onClick={() => resetGame(item)}
                disabled={screen === "playing"}
              >
                {item.label}
              </button>
            ))}
          </div>
        </header>

        <div className="title-block">
          <h1>
            {titleParts.before} <span>{titleParts.start}</span> {titleParts.middle} <span>{titleParts.end}</span>
          </h1>
          <div className="timer-line" aria-live="polite">
            <strong>用时</strong>
            <time>{formatTime(screen === "finished" && finishedRun ? finishedRun.elapsedMs : elapsedMs)}</time>
          </div>
        </div>

        <div
          className="grid-board"
          ref={boardRef}
          style={{ gridTemplateColumns: `repeat(${mode.size}, minmax(0, 1fr))` }}
        >
          {grid.map((number, index) => {
            const completed = screen === "playing" && number < target;
            return (
              <button
                className={`grid-cell ${getAccentClass(number)} ${completed ? "completed" : ""}`}
                key={`${number}-${index}`}
                type="button"
                onClick={() => handleCellClick(number, index)}
                disabled={screen !== "playing"}
                aria-label={`数字 ${number}`}
              >
                {number}
              </button>
            );
          })}
        </div>

        <div className="status-row">
          {screen === "ready" && (
            <>
              <span>准备挑战</span>
              {bestMs !== null && <span>最佳 {formatTime(bestMs, true)}</span>}
            </>
          )}
          {screen === "playing" && (
            <>
              <span>当前目标 {target}</span>
              <span>{mode.label}</span>
            </>
          )}
          {screen === "finished" && finishedRun && (
            <>
              <span>完成 {formatTime(finishedRun.elapsedMs, true)}</span>
              <span>最佳 {bestMs !== null ? formatTime(bestMs, true) : "--:--.--"}</span>
            </>
          )}
        </div>

        <div className="actions">
          {screen === "ready" && (
            <button className="primary-action" type="button" onClick={startGame}>
              开始挑战
            </button>
          )}
          {screen === "playing" && (
            <button className="secondary-action" type="button" onClick={() => resetGame(mode)}>
              重新开始
            </button>
          )}
          {screen === "finished" && (
            <>
              <button className="secondary-action" type="button" onClick={startGame}>
                再来一次
              </button>
              <button className="primary-action" type="button" onClick={handleCreateVideo}>
                {videoStatus === "rendering" ? "生成中..." : "生成视频"}
              </button>
            </>
          )}
        </div>

        {screen === "finished" && finishedRun && (
          <section className="result-panel" aria-label="挑战结果">
            <div>
              <p>完成用时</p>
              <strong>{formatTime(finishedRun.elapsedMs, true)}</strong>
            </div>
            <button type="button" onClick={copyShareText}>
              复制文案
            </button>
            {videoStatus === "done" && videoUrl && (
              <a href={videoUrl} download={`gridfox-${mode.label}-${Math.round(finishedRun.elapsedMs)}.webm`}>
                下载视频
              </a>
            )}
            {videoStatus === "error" && <span className="error-text">当前浏览器不支持视频生成</span>}
          </section>
        )}

        <footer className="share-caption">评论区留下年龄 + 用时</footer>
      </section>
    </main>
  );
}
