import { useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_MODE,
  CHALLENGE_LAYOUTS,
  CHALLENGE_ORDERS,
  COLOR_COUNTS,
  MODES,
  THEMES,
  createGrid,
  formatTime,
  getAccentClass,
  getBestTime,
  getInitialTarget,
  getNextTarget,
  describeRadialSegment,
  polarToCartesian,
  getRadialGeometry,
  getTargetRange,
  isFinalTarget,
  saveBestTime,
  type ChallengeLayout,
  type ChallengeOrder,
  type FinishedRun,
  type GameMode,
  type TapRecord,
  type ColorCount,
  type ThemeOption,
} from "./game";
import { createPromoVideo } from "./promoVideo";

type Screen = "ready" | "playing" | "finished";

const INITIAL_SETTINGS = getInitialSettings();

export default function App() {
  const [mode, setMode] = useState<GameMode>(INITIAL_SETTINGS.mode);
  const [order, setOrder] = useState<ChallengeOrder>(INITIAL_SETTINGS.order);
  const [layout, setLayout] = useState<ChallengeLayout>(INITIAL_SETTINGS.layout);
  const [screen, setScreen] = useState<Screen>("ready");
  const [grid, setGrid] = useState(() => createGrid(INITIAL_SETTINGS.mode.size));
  const [target, setTarget] = useState(() => getInitialTarget(INITIAL_SETTINGS.mode, INITIAL_SETTINGS.order));
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [taps, setTaps] = useState<TapRecord[]>([]);
  const [finishedRun, setFinishedRun] = useState<FinishedRun | null>(null);
  const [bestMs, setBestMs] = useState<number | null>(() =>
    getBestTime(INITIAL_SETTINGS.mode, INITIAL_SETTINGS.order, INITIAL_SETTINGS.layout),
  );
  const [colorCount, setColorCount] = useState<ColorCount>(INITIAL_SETTINGS.colorCount);
  const [theme, setTheme] = useState<ThemeOption["id"]>(INITIAL_SETTINGS.theme);
  const [promoStatus, setPromoStatus] = useState<"idle" | "recording" | "done" | "error">("idle");
  const [promoUrl, setPromoUrl] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);

  const total = mode.size * mode.size;
  const range = useMemo(() => getTargetRange(mode, order), [mode, order]);
  const activeOrder = CHALLENGE_ORDERS.find((item) => item.id === order) ?? CHALLENGE_ORDERS[0];
  const activeLayout = CHALLENGE_LAYOUTS.find((item) => item.id === layout) ?? CHALLENGE_LAYOUTS[0];
  const radialGeometry = useMemo(() => getRadialGeometry(total), [total]);
  const titleParts = useMemo(
    () => ({
      before: "请按顺序从",
      start: String(range.start),
      middle: "找到",
      end: String(range.end),
    }),
    [range.end, range.start],
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
    setBestMs(getBestTime(mode, order, layout));
  }, [layout, mode, order]);

  useEffect(() => {
    return () => {
      if (promoUrl) URL.revokeObjectURL(promoUrl);
    };
  }, [promoUrl]);

  function resetGame(nextMode = mode, nextOrder = order, nextLayout = layout) {
    setMode(nextMode);
    setOrder(nextOrder);
    setLayout(nextLayout);
    setGrid(createGrid(nextMode.size));
    setTarget(getInitialTarget(nextMode, nextOrder));
    setStartedAt(null);
    setElapsedMs(0);
    setTaps([]);
    setFinishedRun(null);
    setScreen("ready");
  }

  function startGame() {
    setGrid(createGrid(mode.size));
    setTarget(getInitialTarget(mode, order));
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

    if (isFinalTarget(target, order, total)) {
      const run: FinishedRun = {
        mode,
        order,
        layout,
        grid,
        taps: nextTaps,
        elapsedMs: currentElapsed,
        completedAt: new Date().toISOString(),
      };
      setFinishedRun(run);
      setBestMs(saveBestTime(mode, order, layout, currentElapsed));
      setScreen("finished");
      return;
    }

    setTarget(getNextTarget(target, order));
  }

  function copyShareText() {
    if (!finishedRun) return;
    const finishedOrder = CHALLENGE_ORDERS.find((item) => item.id === finishedRun.order) ?? CHALLENGE_ORDERS[0];
    const finishedLayout =
      CHALLENGE_LAYOUTS.find((item) => item.id === finishedRun.layout) ?? CHALLENGE_LAYOUTS[0];
    const text = `我完成了 GridFox ${finishedRun.mode.label} ${finishedLayout.name}${finishedOrder.name}专注力挑战，用时 ${formatTime(
      finishedRun.elapsedMs,
      true,
    )}。来测测你的眼力和反应。`;
    void navigator.clipboard?.writeText(text);
  }

  async function handleCreatePromoVideo() {
    setPromoStatus("recording");
    try {
      const blob = await createPromoVideo({ size: mode.size, colorCount, theme, order, layout });
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
          <button className="brand-button" type="button" onClick={() => resetGame(mode, order, layout)}>
            GridFox
          </button>
        </header>

        <section className="settings-stack" aria-label="挑战设置">
          <section className="settings-panel compact" aria-label="玩法">
            <div className="settings-heading">
              <h2>玩法</h2>
              <span>选择查找顺序</span>
            </div>
            <div className="play-mode-grid">
              <div className="option-switch" aria-label="选择玩法">
                {CHALLENGE_ORDERS.map((item) => (
                  <button
                    className={item.id === order ? "option-button active" : "option-button"}
                    key={item.id}
                    type="button"
                    onClick={() => resetGame(mode, item.id, layout)}
                    disabled={screen === "playing"}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="play-mode-row">
                <div>
                  <strong>{activeOrder.name}</strong>
                  <span>
                    {activeLayout.name}，请从 {range.start} 找到 {range.end}
                  </span>
                </div>
                <span className="mode-badge">{mode.label}</span>
              </div>
            </div>
          </section>

          <section className="settings-panel" aria-label="基本设置">
            <div className="settings-heading">
              <h2>基本设置</h2>
              <span>尺寸、颜色和主题</span>
            </div>
            <div className="settings-grid">
              <div className="setting-group wide">
                <span>版式</span>
                <div className="option-switch" aria-label="选择版式">
                  {CHALLENGE_LAYOUTS.map((item) => (
                    <button
                      className={item.id === layout ? "option-button active" : "option-button"}
                      key={item.id}
                      type="button"
                      onClick={() => resetGame(mode, order, item.id)}
                      disabled={screen === "playing"}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="setting-group">
                <span>方格尺寸</span>
                <div className="option-switch" aria-label="选择方格尺寸">
                  {MODES.map((item) => (
                    <button
                      className={item.size === mode.size ? "option-button active" : "option-button"}
                      key={item.size}
                      type="button"
                      onClick={() => resetGame(item, order, layout)}
                      disabled={screen === "playing"}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
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
              <div className="setting-group wide">
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
          </section>
        </section>

        <div className="title-block">
          <h1>
            {titleParts.before} <span>{titleParts.start}</span> {titleParts.middle} <span>{titleParts.end}</span>
          </h1>
          <div className="timer-line" aria-live="polite">
            <strong>用时</strong>
            <time>{formatTime(screen === "finished" && finishedRun ? finishedRun.elapsedMs : elapsedMs)}</time>
          </div>
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
            <button className="secondary-action" type="button" onClick={() => resetGame(mode, order, layout)}>
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

        {layout === "grid" ? (
          <div
            className="grid-board"
            ref={boardRef}
            style={{ gridTemplateColumns: `repeat(${mode.size}, minmax(0, 1fr))` }}
          >
            {grid.map((number, index) => {
              const completed = screen === "playing" && (order === "desc" ? number > target : number < target);
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
        ) : (
          <div className="radial-board" ref={boardRef}>
            <svg viewBox="0 0 100 100" role="group" aria-label="圆盘舒尔特数字盘">
              <circle className="radial-center" cx="50" cy="50" r="8" />
              {grid.map((number, index) => {
                const geometry = radialGeometry[index];
                const labelPoint = polarToCartesian(50, geometry.labelRadius, geometry.labelAngle);
                const completed = screen === "playing" && (order === "desc" ? number > target : number < target);
                return (
                  <g
                    className={`radial-cell ${getAccentClass(number, colorCount)} ${completed ? "completed" : ""}`}
                    key={`${number}-${index}`}
                    role="button"
                    tabIndex={screen === "playing" ? 0 : -1}
                    aria-label={`数字 ${number}`}
                    onClick={() => handleCellClick(number, index)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        handleCellClick(number, index);
                      }
                    }}
                    aria-disabled={screen !== "playing"}
                  >
                    <path d={describeRadialSegment(geometry)} />
                    <text x={labelPoint.x} y={labelPoint.y}>
                      {number}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        )}

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

        <section className="promo-panel" aria-label="发布导出">
          <div>
            <p>发布导出</p>
            <strong>竖屏自动演示 WebM</strong>
            <span>MP4 建议使用离线预设命令</span>
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
            <a href={promoUrl} download={`gridfox-xiaohongshu-${layout}-${order}-${theme}-${colorCount}color.webm`}>
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

function getInitialSettings(): {
  mode: GameMode;
  order: ChallengeOrder;
  layout: ChallengeLayout;
  colorCount: ColorCount;
  theme: ThemeOption["id"];
} {
  const params = new URLSearchParams(window.location.search);
  const mode = MODES.find((item) => item.size === Number(params.get("size"))) ?? DEFAULT_MODE;
  const order = params.get("order") === "desc" ? "desc" : "asc";
  const layout = params.get("layout") === "radial" ? "radial" : "grid";
  const colorCountValue = Number(params.get("colors"));
  const colorCount = COLOR_COUNTS.includes(colorCountValue as ColorCount) ? (colorCountValue as ColorCount) : 4;
  const themeParam = params.get("theme");
  const theme = THEMES.some((item) => item.id === themeParam) ? (themeParam as ThemeOption["id"]) : "fresh";

  return { mode, order, layout, colorCount, theme };
}
