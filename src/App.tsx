import { useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_MODE,
  COLOR_COUNTS,
  MODES,
  THEMES,
  createGrid,
  formatTime,
  getAccentClass,
  getBestTime,
  saveBestTime,
  type FinishedRun,
  type GameMode,
  type TapRecord,
  type ColorCount,
  type ThemeOption,
} from "./game";
import { createPromoVideo } from "./promoVideo";

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
  const [colorCount, setColorCount] = useState<ColorCount>(4);
  const [theme, setTheme] = useState<ThemeOption["id"]>("fresh");
  const [promoStatus, setPromoStatus] = useState<"idle" | "recording" | "done" | "error">("idle");
  const [promoUrl, setPromoUrl] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);

  const total = mode.size * mode.size;
  const titleParts = useMemo(
    () => ({
      before: "请按顺序从",
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
      if (promoUrl) URL.revokeObjectURL(promoUrl);
    };
  }, [promoUrl]);

  function resetGame(nextMode = mode) {
    setMode(nextMode);
    setGrid(createGrid(nextMode.size));
    setTarget(1);
    setStartedAt(null);
    setElapsedMs(0);
    setTaps([]);
    setFinishedRun(null);
    setScreen("ready");
  }

  function startGame() {
    setGrid(createGrid(mode.size));
    setTarget(1);
    setStartedAt(performance.now());
    setElapsedMs(0);
    setTaps([]);
    setFinishedRun(null);
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

  function copyShareText() {
    if (!finishedRun) return;
    const text = `我完成了 GridFox ${mode.label} 专注力挑战，用时 ${formatTime(
      finishedRun.elapsedMs,
      true,
    )}。来测测你的眼力和反应。`;
    void navigator.clipboard?.writeText(text);
  }

  async function handleCreatePromoVideo() {
    setPromoStatus("recording");
    try {
      const blob = await createPromoVideo({ size: mode.size, colorCount, theme });
      if (promoUrl) URL.revokeObjectURL(promoUrl);
      setPromoUrl(URL.createObjectURL(blob));
      setPromoStatus("done");
    } catch (error) {
      console.error(error);
      setPromoStatus("error");
    }
  }

  return (
    <main className={`app-shell theme-${theme}`}>
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

        <div className="settings-row" aria-label="挑战参数">
          <div className="setting-group">
            <span>颜色数量</span>
            <div className="option-switch" aria-label="选择数字颜色数量">
              {COLOR_COUNTS.map((count) => (
                <button
                  className={count === colorCount ? "option-button active" : "option-button"}
                  key={count}
                  type="button"
                  onClick={() => setColorCount(count)}
                  disabled={screen === "playing"}
                >
                  {count}
                </button>
              ))}
            </div>
          </div>
          <div className="setting-group">
            <span>主题</span>
            <div className="option-switch" aria-label="选择主题">
              {THEMES.map((item) => (
                <button
                  className={item.id === theme ? "option-button active" : "option-button"}
                  key={item.id}
                  type="button"
                  onClick={() => setTheme(item.id)}
                  disabled={screen === "playing"}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

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
                className={`grid-cell ${getAccentClass(number, colorCount)} ${completed ? "completed" : ""}`}
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
              <span>准备开始</span>
              {bestMs !== null && <span>历史最佳 {formatTime(bestMs, true)}</span>}
            </>
          )}
          {screen === "playing" && (
            <>
              <span>下一个数字 {target}</span>
              <span>保持节奏</span>
            </>
          )}
          {screen === "finished" && finishedRun && (
            <>
              <span>本次 {formatTime(finishedRun.elapsedMs, true)}</span>
              <span>最佳 {bestMs !== null ? formatTime(bestMs, true) : "--:--.--"}</span>
            </>
          )}
        </div>

        <div className="actions">
          {screen === "ready" && (
            <button className="primary-action" type="button" onClick={startGame}>
              开始计时
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
            </>
          )}
        </div>

        {screen === "finished" && finishedRun && (
          <section className="result-panel" aria-label="挑战结果">
            <div>
              <p>专注成绩</p>
              <strong>{formatTime(finishedRun.elapsedMs, true)}</strong>
            </div>
            <button type="button" onClick={copyShareText}>
              复制分享语
            </button>
          </section>
        )}

        <section className="promo-panel" aria-label="小红书发布素材">
          <div>
            <p>发布素材</p>
            <strong>两分钟竖屏自动演示</strong>
            <span>生成约需 2 分钟</span>
          </div>
          <button
            className="secondary-action"
            type="button"
            onClick={handleCreatePromoVideo}
            disabled={promoStatus === "recording"}
          >
            {promoStatus === "recording" ? "录制中..." : "生成视频"}
          </button>
          {promoStatus === "done" && promoUrl && (
            <a href={promoUrl} download={`gridfox-xiaohongshu-${theme}-${colorCount}color.webm`}>
              下载 WebM
            </a>
          )}
          {promoStatus === "error" && <span className="error-text">当前浏览器不支持录制</span>}
        </section>

        <footer className="share-caption">留下年龄和成绩，看看谁更快</footer>
      </section>
    </main>
  );
}
