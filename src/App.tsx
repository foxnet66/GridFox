import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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
  getBestTime,
  getChallengeTotal,
  getInitialTarget,
  getNextTarget,
  getNumberAccentClass,
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
type PlayStyleId =
  | "grid"
  | "radial"
  | "radial-rotate"
  | "hex"
  | "mosaic"
  | "float"
  | "spiral"
  | "maze"
  | "wave"
  | "dual"
  | "breathe"
  | "star";
type HexCellGeometry = {
  row: number;
  col: number;
  points: string;
  labelX: number;
  labelY: number;
};
type MosaicCellGeometry = HexCellGeometry;
type FloatBallGeometry = {
  row: number;
  col: number;
  x: number;
  y: number;
  radius: number;
  driftX: number;
  driftY: number;
  duration: number;
  delay: number;
};
type SpiralCellGeometry = {
  row: number;
  col: number;
  x: number;
  y: number;
  radius: number;
};
type MazeCellGeometry = SpiralCellGeometry;
type WaveCellGeometry = SpiralCellGeometry;
type StarCellGeometry = SpiralCellGeometry & {
  orbit: number;
};
type BreatheCellGeometry = SpiralCellGeometry & {
  duration: number;
  delay: number;
};
type DualCellGeometry = {
  row: number;
  col: number;
  x: number;
  y: number;
  width: number;
  height: number;
  labelX: number;
  labelY: number;
  zone: "left" | "right";
};

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
  {
    id: "float",
    label: "浮球",
    name: "浮球舒尔特",
    description: "小球动态漂浮",
    layout: "float",
    rotation: "none",
  },
  {
    id: "spiral",
    label: "螺旋",
    name: "螺旋舒尔特",
    description: "中心向外搜索",
    layout: "spiral",
    rotation: "none",
  },
  {
    id: "maze",
    label: "迷宫",
    name: "迷宫舒尔特",
    description: "路径视觉搜索",
    layout: "maze",
    rotation: "none",
  },
  {
    id: "wave",
    label: "波浪",
    name: "波浪舒尔特",
    description: "波浪轨道搜索",
    layout: "wave",
    rotation: "none",
  },
  {
    id: "dual",
    label: "双区",
    name: "双区舒尔特",
    description: "左右切换搜索",
    layout: "dual",
    rotation: "none",
  },
  {
    id: "breathe",
    label: "呼吸",
    name: "呼吸舒尔特",
    description: "圆点节奏缩放",
    layout: "breathe",
    rotation: "none",
  },
  {
    id: "star",
    label: "星轨",
    name: "星轨舒尔特",
    description: "轨道视觉搜索",
    layout: "star",
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
  const floatGeometry = useMemo(() => getFloatGeometry(), []);
  const spiralGeometry = useMemo(() => getSpiralGeometry(), []);
  const mazeGeometry = useMemo(() => getMazeGeometry(), []);
  const waveGeometry = useMemo(() => getWaveGeometry(), []);
  const dualGeometry = useMemo(() => getDualGeometry(), []);
  const breatheGeometry = useMemo(() => getBreatheGeometry(), []);
  const starGeometry = useMemo(() => getStarGeometry(), []);
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
    if (
      nextLayout === "hex" ||
      nextLayout === "mosaic" ||
      nextLayout === "float" ||
      nextLayout === "spiral" ||
      nextLayout === "maze" ||
      nextLayout === "wave" ||
      nextLayout === "dual" ||
      nextLayout === "breathe" ||
      nextLayout === "star"
    ) {
      setRotation("none");
    }
    setGrid(createChallengeNumbers(nextMode, nextLayout));
    setTarget(getInitialTarget(nextMode, nextOrder, nextLayout));
    setStartedAt(null);
    setElapsedMs(0);
    setTaps([]);
    setFinishedRun(null);
    setScreen("ready");
  }

  function applyPlayStyle(style: PlayStyleOption) {
    resetGame(mode, isFixedLayout(style.layout) ? "asc" : order, style.layout);
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
                    disabled={screen === "playing" || isFixedLayout(layout)}
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
                  className={`grid-cell ${getNumberAccentClass(number, colorCount, range.start)} ${
                    completed ? "completed" : ""
                  }`}
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
                        className={`radial-cell ${getNumberAccentClass(number, colorCount, range.start)} ${
                          completed ? "completed" : ""
                        }`}
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
                    className={`hex-cell ${getNumberAccentClass(number, colorCount, range.start)} ${
                      completed ? "completed" : ""
                    }`}
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
        ) : layout === "mosaic" ? (
          <div className="mosaic-board" ref={boardRef}>
            <svg viewBox="0 0 100 104" role="group" aria-label="变形舒尔特数字盘">
              {grid.map((number, index) => {
                const geometry = mosaicGeometry[index];
                const completed = screen === "playing" && (order === "desc" ? number > target : number < target);
                return (
                  <g
                    className={`mosaic-cell ${getNumberAccentClass(number, colorCount, range.start)} ${
                      completed ? "completed" : ""
                    }`}
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
        ) : layout === "float" ? (
          <div className="float-board" ref={boardRef}>
            <svg viewBox="0 0 100 86" role="group" aria-label="浮球舒尔特数字盘">
              <rect className="float-panel" x="1.5" y="1.5" width="97" height="83" rx="3.8" />
              {Array.from({ length: 13 }, (_, index) => (
                <line className="float-grid-line" key={`v-${index}`} x1={4 + index * 7.7} x2={4 + index * 7.7} y1="2" y2="84" />
              ))}
              {Array.from({ length: 10 }, (_, index) => (
                <line className="float-grid-line" key={`h-${index}`} x1="2" x2="98" y1={6 + index * 8.2} y2={6 + index * 8.2} />
              ))}
              {grid.map((number, index) => {
                const geometry = floatGeometry[index];
                const completed = screen === "playing" && (order === "desc" ? number > target : number < target);
                return (
                  <g
                    className={`float-ball ${getNumberAccentClass(number, colorCount, range.start)} ${
                      completed ? "completed" : ""
                    }`}
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
                    <animateTransform
                      attributeName="transform"
                      type="translate"
                      values={`0 0; ${geometry.driftX} ${geometry.driftY}; ${-geometry.driftX} ${geometry.driftY * 0.7}; 0 0`}
                      dur={`${geometry.duration}s`}
                      begin={`${geometry.delay}s`}
                      calcMode="spline"
                      keyTimes="0; 0.34; 0.68; 1"
                      keySplines="0.42 0 0.58 1; 0.42 0 0.58 1; 0.42 0 0.58 1"
                      repeatCount="indefinite"
                    />
                    <circle cx={geometry.x} cy={geometry.y} r={geometry.radius} />
                    <text x={geometry.x} y={geometry.y + 0.25}>
                      {number}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        ) : layout === "spiral" ? (
          <div className="spiral-board" ref={boardRef}>
            <svg viewBox="0 0 100 100" role="group" aria-label="螺旋舒尔特数字盘">
              <path className="spiral-guide" d={describeSpiralGuide()} />
              {grid.map((number, index) => {
                const geometry = spiralGeometry[index];
                const completed = screen === "playing" && (order === "desc" ? number > target : number < target);
                return (
                  <g
                    className={`spiral-cell ${getNumberAccentClass(number, colorCount, range.start)} ${
                      completed ? "completed" : ""
                    }`}
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
                    <circle cx={geometry.x} cy={geometry.y} r={geometry.radius} />
                    <text x={geometry.x} y={geometry.y + 0.28}>
                      {number}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        ) : layout === "maze" ? (
          <div className="maze-board" ref={boardRef}>
            <svg viewBox="0 0 100 100" role="group" aria-label="迷宫舒尔特数字盘">
              <rect className="maze-panel" x="3" y="3" width="94" height="94" rx="5" />
              <path className="maze-corridor" d={describeMazeGuide()} />
              <path className="maze-guide" d={describeMazeGuide()} />
              {mazeGeometry.map((geometry, index) => {
                const number = grid[index];
                const completed = screen === "playing" && (order === "desc" ? number > target : number < target);
                return (
                  <g
                    className={`maze-cell ${getNumberAccentClass(number, colorCount, range.start)} ${
                      completed ? "completed" : ""
                    }`}
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
                    <circle cx={geometry.x} cy={geometry.y} r={geometry.radius} />
                    <text x={geometry.x} y={geometry.y + 0.28}>
                      {number}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        ) : layout === "wave" ? (
          <div className="wave-board" ref={boardRef}>
            <svg viewBox="0 0 100 100" role="group" aria-label="波浪舒尔特数字盘">
              <rect className="wave-panel" x="3" y="3" width="94" height="94" rx="5" />
              {describeWaveGuides().map((guide, index) => (
                <path className="wave-guide" d={guide} key={`wave-${index}`} />
              ))}
              {waveGeometry.map((geometry, index) => {
                const number = grid[index];
                const completed = screen === "playing" && (order === "desc" ? number > target : number < target);
                return (
                  <g
                    className={`wave-cell ${getNumberAccentClass(number, colorCount, range.start)} ${
                      completed ? "completed" : ""
                    }`}
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
                    <circle cx={geometry.x} cy={geometry.y} r={geometry.radius} />
                    <text x={geometry.x} y={geometry.y + 0.28}>
                      {number}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        ) : layout === "dual" ? (
          <div className="dual-board" ref={boardRef}>
            <svg viewBox="0 0 100 100" role="group" aria-label="双区舒尔特数字盘">
              <rect className="dual-panel" x="4" y="6" width="42" height="88" rx="4" />
              <rect className="dual-panel" x="54" y="6" width="42" height="88" rx="4" />
              <line className="dual-divider" x1="50" x2="50" y1="8" y2="92" />
              {dualGeometry.map((geometry, index) => {
                const number = grid[index];
                const completed = screen === "playing" && (order === "desc" ? number > target : number < target);
                return (
                  <g
                    className={`dual-cell ${getNumberAccentClass(number, colorCount, range.start)} ${
                      completed ? "completed" : ""
                    }`}
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
                    <rect x={geometry.x} y={geometry.y} width={geometry.width} height={geometry.height} />
                    <text x={geometry.labelX} y={geometry.labelY}>
                      {number}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        ) : layout === "breathe" ? (
          <div className="breathe-board" ref={boardRef}>
            <svg viewBox="0 0 100 100" role="group" aria-label="呼吸舒尔特数字盘">
              <rect className="breathe-panel" x="4" y="6" width="92" height="88" rx="5" />
              {Array.from({ length: 5 }, (_, index) => {
                const x = 4 + (92 / 6) * (index + 1);
                return <line className="breathe-grid-line" x1={x} x2={x} y1="7" y2="93" key={`breathe-x-${index}`} />;
              })}
              {Array.from({ length: 5 }, (_, index) => {
                const y = 6 + (88 / 6) * (index + 1);
                return <line className="breathe-grid-line" x1="5" x2="95" y1={y} y2={y} key={`breathe-y-${index}`} />;
              })}
              {breatheGeometry.map((geometry, index) => {
                const number = grid[index];
                const completed = screen === "playing" && (order === "desc" ? number > target : number < target);
                return (
                  <g
                    className={`breathe-cell ${getNumberAccentClass(number, colorCount, range.start)} ${
                      completed ? "completed" : ""
                    }`}
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
                    style={
                      {
                        "--breath-duration": `${geometry.duration}s`,
                        "--breath-delay": `${geometry.delay}s`,
                    } as CSSProperties
                    }
                  >
                    <circle cx={geometry.x} cy={geometry.y} r={geometry.radius} />
                    <text x={geometry.x} y={geometry.y + 0.28}>
                      {number}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        ) : (
          <div className="star-board" ref={boardRef}>
            <svg viewBox="0 0 100 100" role="group" aria-label="星轨舒尔特数字盘">
              <rect className="star-panel" x="3" y="3" width="94" height="94" rx="5" />
              {describeStarGuides().map((guide, index) => (
                <ellipse
                  className="star-guide"
                  cx="50"
                  cy="50"
                  rx={guide.rx}
                  ry={guide.ry}
                  transform={`rotate(${guide.rotate} 50 50)`}
                  key={`star-guide-${index}`}
                />
              ))}
              {describeStarPaths().map((path, index) => (
                <path className="star-path" d={path} key={`star-path-${index}`} />
              ))}
              {starGeometry.map((geometry, index) => {
                const number = grid[index];
                const completed = screen === "playing" && (order === "desc" ? number > target : number < target);
                return (
                  <g
                    className={`star-cell orbit-${geometry.orbit} ${getNumberAccentClass(number, colorCount, range.start)} ${
                      completed ? "completed" : ""
                    }`}
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
                    <circle cx={geometry.x} cy={geometry.y} r={geometry.radius} />
                    <text x={geometry.x} y={geometry.y + 0.28}>
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
                  disabled={
                    promoStatus === "recording" ||
                    layout === "hex" ||
                    layout === "mosaic" ||
                    layout === "float" ||
                    layout === "spiral" ||
                    layout === "maze" ||
                    layout === "wave" ||
                    layout === "dual" ||
                    layout === "breathe" ||
                    layout === "star"
                  }
                >
                  {layout === "hex" ||
                  layout === "mosaic" ||
                  layout === "float" ||
                  layout === "spiral" ||
                  layout === "maze" ||
                  layout === "wave" ||
                  layout === "dual" ||
                  layout === "breathe" ||
                  layout === "star"
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
    layout === "star"
      ? "星轨舒尔特"
      : layout === "breathe"
      ? "呼吸舒尔特"
      : layout === "dual"
      ? "双区舒尔特"
      : layout === "wave"
      ? "波浪舒尔特"
      : layout === "maze"
      ? "迷宫舒尔特"
      : layout === "spiral"
      ? "螺旋舒尔特"
      : layout === "float"
      ? "浮球舒尔特"
      : layout === "mosaic"
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
      : layout === "star"
      ? "多条轨道会打乱常规扫描路线，更考验弧线视觉搜索和节奏稳定性。"
      : layout === "breathe"
      ? "圆点会轻微呼吸缩放，画面稳定但节奏干扰更强。"
      : layout === "dual"
      ? "左右双区会迫使视线来回切换，更考验搜索切换和注意力稳定性。"
      : layout === "wave"
      ? "波浪轨道会打破直线扫描节奏，更考验连续视觉追踪。"
      : layout === "maze"
      ? "迷宫路径会迫使视线不断转向，更考验搜索路线感和注意力稳定性。"
      : layout === "spiral"
      ? "螺旋路径会打破横竖扫描习惯，更考验连续视觉搜索。"
      : layout === "float"
      ? "小球会持续轻微漂浮，更考验动态视觉追踪和注意力稳定性。"
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
    layout === "dual"
      ? "#双区舒尔特"
      : layout === "star"
      ? "#星轨舒尔特"
      : layout === "breathe"
      ? "#呼吸舒尔特"
      : layout === "wave"
      ? "#波浪舒尔特"
      : layout === "maze"
      ? "#迷宫舒尔特"
      : layout === "spiral"
      ? "#螺旋舒尔特"
      : layout === "float"
      ? "#浮球舒尔特"
      : layout === "mosaic"
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
试试看你能不能更快完成。

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
    layoutParam === "star"
      ? "star"
      : layoutParam === "breathe"
      ? "breathe"
      : layoutParam === "dual"
      ? "dual"
      : layoutParam === "wave"
      ? "wave"
      : layoutParam === "maze"
      ? "maze"
      : layoutParam === "spiral"
      ? "spiral"
      : layoutParam === "float"
      ? "float"
      : layoutParam === "mosaic"
      ? "mosaic"
      : layoutParam === "hex"
      ? "hex"
      : layoutParam === "radial"
      ? "radial"
      : "grid";
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
  if (layout === "float") return PLAY_STYLES[5];
  if (layout === "spiral") return PLAY_STYLES[6];
  if (layout === "maze") return PLAY_STYLES[7];
  if (layout === "wave") return PLAY_STYLES[8];
  if (layout === "dual") return PLAY_STYLES[9];
  if (layout === "breathe") return PLAY_STYLES[10];
  if (layout === "star") return PLAY_STYLES[11];
  if (rotation !== "none") return PLAY_STYLES[2];
  return PLAY_STYLES[1];
}

function createChallengeNumbers(mode: GameMode, layout: ChallengeLayout): number[] {
  return isFixedLayout(layout) ? createNumbers(getChallengeTotal(mode, layout)) : createGrid(mode.size);
}

function getSizeLabel(mode: GameMode, layout: ChallengeLayout): string {
  if (layout === "star") return "36点";
  if (layout === "breathe") return "36点";
  if (layout === "dual") return "36点";
  if (layout === "wave") return "36点";
  if (layout === "maze") return "36点";
  if (layout === "spiral") return "36点";
  if (layout === "float") return "36球";
  return layout === "hex" || layout === "mosaic" ? "30格" : mode.label;
}

function isFixedLayout(layout: ChallengeLayout): boolean {
  return (
    layout === "hex" ||
    layout === "mosaic" ||
    layout === "float" ||
    layout === "spiral" ||
    layout === "maze" ||
    layout === "wave" ||
    layout === "dual" ||
    layout === "breathe" ||
    layout === "star"
  );
}

function getTapPosition(
  index: number,
  mode: GameMode,
  layout: ChallengeLayout,
): { row: number; col: number } {
  if (layout === "float") return { row: Math.floor(index / 6), col: index % 6 };
  if (layout === "spiral") return { row: Math.floor(index / 6), col: index % 6 };
  if (layout === "maze") return { row: Math.floor(index / 6), col: index % 6 };
  if (layout === "wave") return { row: Math.floor(index / 6), col: index % 6 };
  if (layout === "dual") return { row: Math.floor(index / 6), col: index % 6 };
  if (layout === "breathe") return { row: Math.floor(index / 6), col: index % 6 };
  if (layout === "star") return { row: Math.floor(index / 6), col: index % 6 };
  if (layout === "hex" || layout === "mosaic") return { row: Math.floor(index / 5), col: index % 5 };
  return { row: Math.floor(index / mode.size), col: index % mode.size };
}

function getFloatGeometry(): FloatBallGeometry[] {
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

  return positions.map(([baseX, baseY], index) => ({
    row: Math.floor(index / 6),
    col: index % 6,
    x: 50 + (baseX - 50) * 0.9,
    y: 43 + (baseY - 36) * 1.14,
    radius: 4.15,
    driftX: ((index % 5) - 2) * 0.28 + (index % 2 === 0 ? 0.35 : -0.35),
    driftY: ((index % 4) - 1.5) * 0.22 + (index % 3 === 0 ? 0.28 : -0.18),
    duration: 4.8 + (index % 6) * 0.45,
    delay: -(index % 7) * 0.35,
  }));
}

function getSpiralGeometry(): SpiralCellGeometry[] {
  const total = 36;
  return Array.from({ length: total }, (_, index) => {
    const angle = -Math.PI / 2 + index * 0.82;
    const radius = 8 + index * 1.08;
    const wobble = Math.sin(index * 1.7) * 0.55;
    return {
      row: Math.floor(index / 6),
      col: index % 6,
      x: 50 + Math.cos(angle) * (radius + wobble),
      y: 50 + Math.sin(angle) * (radius + wobble),
      radius: 3.95,
    };
  });
}

function describeSpiralGuide(): string {
  return getSpiralGeometry()
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(3)} ${point.y.toFixed(3)}`)
    .join(" ");
}

function getMazeGeometry(): MazeCellGeometry[] {
  const columns = [10, 26, 42, 58, 74, 90];
  const rows = [12, 26, 40, 54, 68, 82];
  const points = rows.flatMap((y, row) => {
    const xs = row % 2 === 0 ? columns : [...columns].reverse();
    return xs.map((x) => [x, y]);
  });

  return points.map(([x, y], index) => ({
    row: Math.floor(index / 6),
    col: index % 6,
    x,
    y,
    radius: 4.05,
  }));
}

function describeMazeGuide(): string {
  return getMazeGeometry()
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(3)} ${point.y.toFixed(3)}`)
    .join(" ");
}

function getWaveGeometry(): WaveCellGeometry[] {
  const columns = [10, 26, 42, 58, 74, 90];
  const rows = [14, 28, 42, 56, 70, 84];
  return rows.flatMap((baseY, row) =>
    columns.map((x, col) => ({
      row,
      col,
      x,
      y: baseY + Math.sin((col / (columns.length - 1)) * Math.PI * 2 + row * 0.72) * 3.8,
      radius: 4.05,
    })),
  );
}

function describeWaveGuides(): string[] {
  const geometry = getWaveGeometry();
  return Array.from({ length: 6 }, (_, row) =>
    geometry
      .filter((point) => point.row === row)
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(3)} ${point.y.toFixed(3)}`)
      .join(" "),
  );
}

function getBreatheGeometry(): BreatheCellGeometry[] {
  const left = 4;
  const top = 6;
  const cellWidth = 92 / 6;
  const cellHeight = 88 / 6;

  return Array.from({ length: 36 }, (_, index) => {
    const row = Math.floor(index / 6);
    const col = index % 6;
    return {
      row,
      col,
      x: left + cellWidth * (col + 0.5),
      y: top + cellHeight * (row + 0.5),
      radius: 4.35,
      duration: 3.1 + (index % 5) * 0.24,
      delay: -(index % 7) * 0.22,
    };
  });
}

function getStarGeometry(): StarCellGeometry[] {
  const radii = [10, 17, 24, 31, 38, 42];
  return Array.from({ length: 36 }, (_, index) => {
    const arm = Math.floor(index / 6);
    const step = index % 6;
    const angle = ((arm * 60 - 96 + step * 13.5 + Math.sin(arm * 1.7) * 5) * Math.PI) / 180;
    const radius = radii[step];
    return {
      row: step,
      col: arm,
      x: 50 + Math.cos(angle) * radius,
      y: 50 + Math.sin(angle) * radius,
      radius: 3.35,
      orbit: arm,
    };
  });
}

function describeStarPaths(): string[] {
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

function describeStarGuides(): Array<{ rx: number; ry: number; rotate: number }> {
  return [
    { rx: 19, ry: 12, rotate: -18 },
    { rx: 32, ry: 22, rotate: 24 },
    { rx: 43, ry: 32, rotate: -28 },
  ];
}

function getDualGeometry(): DualCellGeometry[] {
  const cellWidth = 14;
  const cellHeight = 14.67;
  const top = 6;
  const leftX = 4;
  const rightX = 54;
  const buildZone = (zone: "left" | "right", offsetX: number, colOffset: number) =>
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
