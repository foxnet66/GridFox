import { useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_MODE,
  CHALLENGE_ORDERS,
  COLOR_COUNTS,
  MODES,
  ROTATION_SPEEDS,
  THEMES,
  createGrid,
  createNumbers,
  formatTime,
  getAccentClass,
  getBestTime,
  getChallengeTotal,
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
  type RadialCellGeometry,
  type RotationSpeed,
  type ThemeOption,
} from "./game";
import { createPromoVideo } from "./promoVideo";
import { getDailyChallenge } from "./dailyChallenge";

type Screen = "ready" | "playing" | "finished";
type PlayStyleId = "grid" | "radial" | "radial-rotate" | "hex" | "mosaic";
type HexCellGeometry = {
  row: number;
  col: number;
  points: string;
  labelX: number;
  labelY: number;
};
type MosaicCellGeometry = HexCellGeometry;

type PlayStyleOption = {
  id: PlayStyleId;
  label: string;
  name: string;
  description: string;
  layout: ChallengeLayout;
  rotation: RotationSpeed;
};

const PLAY_STYLES: PlayStyleOption[] = [
  {
    id: "grid",
    label: "方格",
    name: "标准方格",
    description: "经典舒尔特训练",
    layout: "grid",
    rotation: "none",
  },
  {
    id: "radial",
    label: "圆盘",
    name: "圆盘舒尔特",
    description: "环形视觉搜索",
    layout: "radial",
    rotation: "none",
  },
  {
    id: "radial-rotate",
    label: "旋转圆盘",
    name: "旋转圆盘",
    description: "进阶节奏挑战",
    layout: "radial",
    rotation: "slow",
  },
  {
    id: "hex",
    label: "蜂巢",
    name: "蜂巢舒尔特",
    description: "从 1 找到 30",
    layout: "hex",
    rotation: "none",
  },
  {
    id: "mosaic",
    label: "变形",
    name: "变形舒尔特",
    description: "从 1 找到 30",
    layout: "mosaic",
    rotation: "none",
  },
];

const INITIAL_SETTINGS = getInitialSettings();
const DAILY_CHALLENGE = getDailyChallenge();

export default function App() {
  const [mode, setMode] = useState<GameMode>(INITIAL_SETTINGS.mode);
  const [order, setOrder] = useState<ChallengeOrder>(INITIAL_SETTINGS.order);
  const [layout, setLayout] = useState<ChallengeLayout>(INITIAL_SETTINGS.layout);
  const [rotation, setRotation] = useState<RotationSpeed>(INITIAL_SETTINGS.rotation);
  const [screen, setScreen] = useState<Screen>("ready");
  const [grid, setGrid] = useState(() => createChallengeNumbers(INITIAL_SETTINGS.mode, INITIAL_SETTINGS.layout));
  const [target, setTarget] = useState(() =>
    getInitialTarget(INITIAL_SETTINGS.mode, INITIAL_SETTINGS.order, INITIAL_SETTINGS.layout),
  );
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [taps, setTaps] = useState<TapRecord[]>([]);
  const [finishedRun, setFinishedRun] = useState<FinishedRun | null>(null);
  const [bestMs, setBestMs] = useState<number | null>(() =>
    getBestTime(INITIAL_SETTINGS.mode, INITIAL_SETTINGS.order, INITIAL_SETTINGS.layout, INITIAL_SETTINGS.rotation),
  );
  const [colorCount, setColorCount] = useState<ColorCount>(INITIAL_SETTINGS.colorCount);
  const [theme, setTheme] = useState<ThemeOption["id"]>(INITIAL_SETTINGS.theme);
  const [promoStatus, setPromoStatus] = useState<"idle" | "recording" | "done" | "error">("idle");
  const [promoUrl, setPromoUrl] = useState<string | null>(null);
  const [publishCopied, setPublishCopied] = useState(false);
  const [showPublishAssistant, setShowPublishAssistant] = useState(false);
  const boardRef = useRef<HTMLDivElement | null>(null);

  const total = getChallengeTotal(mode, layout);
  const range = useMemo(() => getTargetRange(mode, order, layout), [layout, mode, order]);
  const activeOrder = CHALLENGE_ORDERS.find((item) => item.id === order) ?? CHALLENGE_ORDERS[0];
  const activePlayStyle = getActivePlayStyle(layout, rotation);
  const radialGeometry = useMemo(() => getRadialGeometry(total), [total]);
  const hexGeometry = useMemo(() => getHexGeometry(), []);
  const mosaicGeometry = useMemo(() => getMosaicGeometry(), []);
  const publishText = useMemo(
    () =>
      buildXiaohongshuPost({
        mode,
        order,
        layout,
        range,
        rotation,
        dailyDay: isDailyChallengeActive(mode, order, layout, rotation, colorCount, theme) ? DAILY_CHALLENGE.day : null,
      }),
    [colorCount, layout, mode, order, range, rotation, theme],
  );
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
    setBestMs(getBestTime(mode, order, layout, rotation));
  }, [layout, mode, order, rotation]);

  useEffect(() => {
    return () => {
      if (promoUrl) URL.revokeObjectURL(promoUrl);
    };
  }, [promoUrl]);

  function resetGame(nextMode = mode, nextOrder = order, nextLayout = layout) {
    setMode(nextMode);
    setOrder(nextOrder);
    setLayout(nextLayout);
    if (nextLayout === "grid") setRotation("none");
    if (nextLayout === "hex" || nextLayout === "mosaic") setRotation("none");
    setGrid(createChallengeNumbers(nextMode, nextLayout));
    setTarget(getInitialTarget(nextMode, nextOrder, nextLayout));
    setStartedAt(null);
    setElapsedMs(0);
    setTaps([]);
    setFinishedRun(null);
    setScreen("ready");
  }

  function applyPlayStyle(style: PlayStyleOption) {
    resetGame(mode, style.layout === "hex" || style.layout === "mosaic" ? "asc" : order, style.layout);
    setRotation(style.rotation);
  }

  function startGame() {
    setGrid(createChallengeNumbers(mode, layout));
    setTarget(getInitialTarget(mode, order, layout));
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
    const { row, col } = getTapPosition(index, mode, layout);
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
        rotation: layout === "radial" ? rotation : "none",
        grid,
        taps: nextTaps,
        elapsedMs: currentElapsed,
        completedAt: new Date().toISOString(),
      };
      setFinishedRun(run);
      setBestMs(saveBestTime(mode, order, layout, run.rotation, currentElapsed));
      setScreen("finished");
      return;
    }

    setTarget(getNextTarget(target, order));
  }

  function copyShareText() {
    if (!finishedRun) return;
    const finishedOrder = CHALLENGE_ORDERS.find((item) => item.id === finishedRun.order) ?? CHALLENGE_ORDERS[0];
    const finishedStyle = getActivePlayStyle(finishedRun.layout, finishedRun.rotation);
    const text = `我完成了 GridFox ${finishedRun.mode.label} ${finishedStyle.name}${finishedOrder.name}专注力挑战，用时 ${formatTime(
      finishedRun.elapsedMs,
    true,
    )}。来测测你的眼力和反应。`;
    void navigator.clipboard?.writeText(text);
  }

  function copyPublishText() {
    void navigator.clipboard?.writeText(publishText);
    setPublishCopied(true);
    window.setTimeout(() => setPublishCopied(false), 1600);
  }

  function applyDailyChallenge() {
    const nextMode = MODES.find((item) => item.size === DAILY_CHALLENGE.size) ?? DEFAULT_MODE;
    resetGame(nextMode, DAILY_CHALLENGE.order as ChallengeOrder, DAILY_CHALLENGE.layout as ChallengeLayout);
    setRotation("none");
    setColorCount(DAILY_CHALLENGE.colors as ColorCount);
    setTheme(DAILY_CHALLENGE.theme as ThemeOption["id"]);
    setShowPublishAssistant(true);
  }

  function isDailyChallengeActive(
    currentMode: GameMode,
    currentOrder: ChallengeOrder,
    currentLayout: ChallengeLayout,
    currentRotation: RotationSpeed,
    currentColorCount: ColorCount,
    currentTheme: ThemeOption["id"],
  ) {
    return (
      currentMode.size === DAILY_CHALLENGE.size &&
      currentOrder === DAILY_CHALLENGE.order &&
      currentLayout === DAILY_CHALLENGE.layout &&
      currentRotation === "none" &&
      currentColorCount === DAILY_CHALLENGE.colors &&
      currentTheme === DAILY_CHALLENGE.theme
    );
  }

  async function handleCreatePromoVideo() {
    setPromoStatus("recording");
    try {
      const blob = await createPromoVideo({ size: mode.size, colorCount, theme, order, layout, rotation });
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

        <section className="quick-setup" aria-label="挑战设置">
          <div className="play-tabs" aria-label="选择玩法">
            {PLAY_STYLES.map((item) => (
              <button
                className={item.id === activePlayStyle.id ? "play-tab active" : "play-tab"}
                key={item.id}
                type="button"
                onClick={() => applyPlayStyle(item)}
                disabled={screen === "playing"}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="quick-settings-grid">
            <div className="quick-setting">
              <span>顺序</span>
              <div className="option-switch" aria-label="选择查找顺序">
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
            </div>
            <div className="quick-setting">
              <span>尺寸</span>
              <div className="option-switch" aria-label="选择方格尺寸">
                {MODES.map((item) => (
                  <button
                    className={item.size === mode.size ? "option-button active" : "option-button"}
                    key={item.size}
                    type="button"
                    onClick={() => resetGame(item, order, layout)}
                    disabled={screen === "playing" || layout === "hex" || layout === "mosaic"}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="quick-setting">
              <span>颜色</span>
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
            <div className="quick-setting">
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

          <div className="play-summary">
            <strong>{activePlayStyle.name}</strong>
            <span>
              {activeOrder.name} · {getSizeLabel(mode, layout)} · {colorCount} 色
            </span>
          </div>
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
        ) : layout === "radial" ? (
          <div
            className={`radial-board ${rotation !== "none" ? "is-rotating" : ""}`}
            ref={boardRef}
          >
            <svg viewBox="0 0 100 100" role="group" aria-label="圆盘舒尔特数字盘">
              <circle className="radial-center" cx="50" cy="50" r="8" />
              {getRadialRings(radialGeometry).map((ring) => (
                <g className={`radial-ring ${getRingDirectionClass(ring)}`} key={ring}>
                  {grid.map((number, index) => {
                    const geometry = radialGeometry[index];
                    if (geometry.ring !== ring) return null;
                    const rotatedGeometry = rotateRadialGeometry(
                      geometry,
                      getRingRotationDegrees(rotation, screen === "playing" ? elapsedMs : 0, geometry.ring),
                    );
                    const labelPoint = polarToCartesian(50, rotatedGeometry.labelRadius, rotatedGeometry.labelAngle);
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
                        <path d={describeRadialSegment(rotatedGeometry)} />
                        <text x={labelPoint.x} y={labelPoint.y}>
                          {number}
                        </text>
                      </g>
                    );
                  })}
                </g>
              ))}
            </svg>
          </div>
        ) : layout === "hex" ? (
          <div className="hex-board" ref={boardRef}>
            <svg viewBox="0 0 100 104" role="group" aria-label="蜂巢舒尔特数字盘">
              {grid.map((number, index) => {
                const geometry = hexGeometry[index];
                const completed = screen === "playing" && (order === "desc" ? number > target : number < target);
                return (
                  <g
                    className={`hex-cell ${getAccentClass(number, colorCount)} ${completed ? "completed" : ""}`}
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
                    <polygon points={geometry.points} />
                    <text x={geometry.labelX} y={geometry.labelY}>
                      {number}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        ) : (
          <div className="mosaic-board" ref={boardRef}>
            <svg viewBox="0 0 100 104" role="group" aria-label="变形舒尔特数字盘">
              {grid.map((number, index) => {
                const geometry = mosaicGeometry[index];
                const completed = screen === "playing" && (order === "desc" ? number > target : number < target);
                return (
                  <g
                    className={`mosaic-cell ${getAccentClass(number, colorCount)} ${completed ? "completed" : ""}`}
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
                    <polygon points={geometry.points} />
                    <text x={geometry.labelX} y={geometry.labelY}>
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

        <footer className="share-caption">留下年龄和成绩，看看谁更快</footer>

        <section className="publish-assistant" aria-label="运营发布助手">
          <button
            className="publish-assistant-toggle"
            type="button"
            onClick={() => setShowPublishAssistant((visible) => !visible)}
            aria-expanded={showPublishAssistant}
          >
            <span>发布助手</span>
            <strong>{showPublishAssistant ? "收起" : "展开"}</strong>
          </button>

          {showPublishAssistant && (
            <div className="publish-assistant-body">
              <section className="daily-panel" aria-label="今日发布建议">
                <div>
                  <p>今日发布建议</p>
                  <strong>DAY {DAILY_CHALLENGE.day}</strong>
                  <span>
                    {DAILY_CHALLENGE.layout === "radial" ? "圆盘" : "方格"} ·{" "}
                    {DAILY_CHALLENGE.order === "desc" ? "倒序" : "顺序"} · {DAILY_CHALLENGE.size}x
                    {DAILY_CHALLENGE.size} · 静态 · {DAILY_CHALLENGE.colors} 色
                  </span>
                </div>
                <button className="secondary-action" type="button" onClick={applyDailyChallenge}>
                  应用今日挑战
                </button>
              </section>

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
                  disabled={promoStatus === "recording" || layout === "hex" || layout === "mosaic"}
                >
                  {layout === "hex" || layout === "mosaic"
                    ? "当前玩法暂不支持"
                    : promoStatus === "recording"
                    ? "录制中..."
                    : "生成视频"}
                </button>
                {promoStatus === "done" && promoUrl && (
                  <a
                    href={promoUrl}
                    download={`gridfox-xiaohongshu-${layout}-${order}-${rotation}-${theme}-${colorCount}color.webm`}
                  >
                    下载 WebM
                  </a>
                )}
                {promoStatus === "error" && <span className="error-text">当前浏览器不支持录制</span>}
              </section>

              <section className="publish-panel" aria-label="小红书发布文案">
                <div className="publish-panel-header">
                  <div>
                    <p>运营发布文案</p>
                    <strong>小红书标题 + 正文 + 话题</strong>
                  </div>
                  <button type="button" onClick={copyPublishText}>
                    {publishCopied ? "已复制" : "复制文案"}
                  </button>
                </div>
                <pre>{publishText}</pre>
              </section>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function buildXiaohongshuPost({
  mode,
  order,
  layout,
  range,
  rotation,
  dailyDay,
}: {
  mode: GameMode;
  order: ChallengeOrder;
  layout: ChallengeLayout;
  range: { start: number; end: number };
  rotation: RotationSpeed;
  dailyDay: number | null;
}): string {
  const isRotating = layout === "radial" && rotation !== "none";
  const layoutName =
    layout === "mosaic"
      ? "变形舒尔特"
      : layout === "hex"
      ? "蜂巢舒尔特"
      : isRotating
      ? "旋转圆盘舒尔特"
      : layout === "radial"
      ? "圆盘舒尔特"
      : "舒尔特方格";
  const orderName = order === "desc" ? "倒序挑战" : "计时挑战";
  const rangeText = `${range.start} 找到 ${range.end}`;
  const title = dailyDay
    ? `每日专注力训练 DAY ${dailyDay} | ${layoutName}从 ${rangeText}`
    : `每日专注力训练 | ${layoutName}从 ${rangeText}`;
  const prompt =
    order === "desc"
      ? `今天做一个倒序版：从 ${range.start} 开始，按顺序一路找到 ${range.end}。`
      : `今天做一个计时版：从 ${range.start} 开始，按顺序一路找到 ${range.end}。`;
  const modeLine =
    isRotating
      ? `${getRotationLabel(rotation)}圆盘会增加视觉追踪难度，适合进阶挑战。`
      : layout === "mosaic"
      ? "不规则格子会打乱横竖扫描习惯，更考验视觉搜索稳定性。"
      : layout === "hex"
      ? "蜂巢排列会改变横竖扫描习惯，倒序查找更容易打乱节奏。"
      : layout === "radial"
      ? "圆盘排列会更考验视觉搜索和注意力稳定性。"
      : `${mode.label} 方格适合每天花两分钟练一轮。`;
  const hashtags = [
    "#专注力训练",
    "#注意力训练",
    "#舒尔特方格",
    "#视觉注意力",
    "#专注力游戏",
    "#提升注意力",
    "#计时挑战",
    layout === "mosaic"
      ? "#变形舒尔特"
      : layout === "hex"
      ? "#蜂巢舒尔特"
      : isRotating
      ? "#旋转舒尔特"
      : layout === "radial"
      ? "#圆盘舒尔特"
      : "#舒尔特训练",
  ].join(" ");

  return `${title}

${prompt}
${modeLine}

你能用多少秒完成？
评论区留下年龄和成绩，我看看大家的速度。

${hashtags}`;
}

function getInitialSettings(): {
  mode: GameMode;
  order: ChallengeOrder;
  layout: ChallengeLayout;
  rotation: RotationSpeed;
  colorCount: ColorCount;
  theme: ThemeOption["id"];
} {
  const params = new URLSearchParams(window.location.search);
  const mode = MODES.find((item) => item.size === Number(params.get("size"))) ?? DEFAULT_MODE;
  const layoutParam = params.get("layout");
  const layout =
    layoutParam === "mosaic" ? "mosaic" : layoutParam === "hex" ? "hex" : layoutParam === "radial" ? "radial" : "grid";
  const order = params.get("order") === "desc" ? "desc" : "asc";
  const rotationParam = params.get("rotation");
  const rotation =
    layout === "radial" && ROTATION_SPEEDS.some((item) => item.id === rotationParam)
      ? (rotationParam as RotationSpeed)
      : "none";
  const colorCountValue = Number(params.get("colors"));
  const colorCount = COLOR_COUNTS.includes(colorCountValue as ColorCount) ? (colorCountValue as ColorCount) : 4;
  const themeParam = params.get("theme");
  const theme = THEMES.some((item) => item.id === themeParam) ? (themeParam as ThemeOption["id"]) : "fresh";

  return { mode, order, layout, rotation, colorCount, theme };
}

function getRotationLabel(rotation: RotationSpeed): string {
  return ROTATION_SPEEDS.find((item) => item.id === rotation)?.name ?? "静态圆盘";
}

function getActivePlayStyle(layout: ChallengeLayout, rotation: RotationSpeed): PlayStyleOption {
  if (layout === "grid") return PLAY_STYLES[0];
  if (layout === "hex") return PLAY_STYLES[3];
  if (layout === "mosaic") return PLAY_STYLES[4];
  if (rotation !== "none") return PLAY_STYLES[2];
  return PLAY_STYLES[1];
}

function createChallengeNumbers(mode: GameMode, layout: ChallengeLayout): number[] {
  return layout === "hex" || layout === "mosaic" ? createNumbers(getChallengeTotal(mode, layout)) : createGrid(mode.size);
}

function getSizeLabel(mode: GameMode, layout: ChallengeLayout): string {
  return layout === "hex" || layout === "mosaic" ? "30格" : mode.label;
}

function getTapPosition(
  index: number,
  mode: GameMode,
  layout: ChallengeLayout,
): { row: number; col: number } {
  if (layout === "hex" || layout === "mosaic") return { row: Math.floor(index / 5), col: index % 5 };
  return { row: Math.floor(index / mode.size), col: index % mode.size };
}

function getHexGeometry(): HexCellGeometry[] {
  const rows = 6;
  const cols = 5;
  const radius = 8.9;
  const xStep = Math.sqrt(3) * radius;
  const yStep = 1.5 * radius;
  const rawCells = Array.from({ length: rows * cols }, (_, index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    return {
      row,
      col,
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
      row: cell.row,
      col: cell.col,
      points: points.map((point) => `${point.x.toFixed(3)},${point.y.toFixed(3)}`).join(" "),
      labelX: offsetX + (cell.centerX - minX) * scale,
      labelY: offsetY + (cell.centerY - minY) * scale + 0.45,
    };
  });
}

function getHexPoints(centerX: number, centerY: number, radius: number): Array<{ x: number; y: number }> {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = (Math.PI / 180) * (60 * index - 90);
    return {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    };
  });
}

function getMosaicGeometry(): MosaicCellGeometry[] {
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
      const baseX = 3 + (94 / cols) * col;
      const baseY = 4 + (96 / rows) * row;
      const isEdge = row === 0 || row === rows || col === 0 || col === cols;
      const [dx, dy] = isEdge ? [0, 0] : jitter[row * (cols + 1) + col] ?? [0, 0];
      return { x: baseX + dx, y: baseY + dy };
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
      row,
      col,
      points: corners.map((point) => `${point.x.toFixed(3)},${point.y.toFixed(3)}`).join(" "),
      labelX,
      labelY,
    };
  });
}

function getRadialRings(geometry: RadialCellGeometry[]): number[] {
  return Array.from(new Set(geometry.map((cell) => cell.ring)));
}

function getRingDirectionClass(ring: number): string {
  return "clockwise";
}

function getRotationDegrees(rotation: RotationSpeed, elapsedMs: number): number {
  if (rotation === "slow") return (elapsedMs / 1000) * 6;
  if (rotation === "fast") return (elapsedMs / 1000) * 10;
  return 0;
}

function getRingRotationDegrees(rotation: RotationSpeed, elapsedMs: number, ring: number): number {
  return getRotationDegrees(rotation, elapsedMs);
}

function rotateRadialGeometry(geometry: RadialCellGeometry, degrees: number): RadialCellGeometry {
  return {
    ...geometry,
    startAngle: geometry.startAngle + degrees,
    endAngle: geometry.endAngle + degrees,
    labelAngle: geometry.labelAngle + degrees,
  };
}
