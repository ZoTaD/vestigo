/** La barra del editor (2026-10-09): play/pausa, velocidad, hora del día, viento, deshacer y compartir. */
import { useState } from "react";
import { useEditor, useSim } from "./ctx";

const SPEEDS = [1, 5, 20];

export default function Toolbar({ onShare }: { onShare: () => Promise<boolean> }) {
  const { store, t, lang, readOnly } = useEditor();
  useSim();
  const [shared, setShared] = useState<"ok" | "fail" | null>(null);
  const env = store.world.env;
  const hasWind = store.circuit.parts.some((p) => p.type === "generator.wind.scrap");
  const day = env.hour >= 6 && env.hour < 18;
  const h = Math.floor(env.hour);
  const clock = `${String(h).padStart(2, "0")}:${String(Math.round((env.hour - h) * 60)).padStart(2, "0")}`;
  return (
    <div className="el-bar" role="toolbar" aria-label={t.canvas}>
      <button type="button" className={`rs-btn el-play${store.running ? " is-on" : ""}`} onClick={() => store.setRunning(!store.running)} aria-pressed={store.running}>
        {store.running ? `❚❚ ${t.pause}` : `▶ ${t.play}`}
      </button>
      <span className="el-group" role="group" aria-label={t.speed}>
        {SPEEDS.map((s) => (
          <button type="button" key={s} className={`rs-btn${store.speed === s ? " is-on" : ""}`} aria-pressed={store.speed === s} onClick={() => store.setSpeed(s)}>
            ×{s}
          </button>
        ))}
      </span>
      <label className="el-range">
        <span>
          {t.hour}: <b>{clock}</b> {day ? "☀" : "☾"}
        </span>
        <input type="range" min={0} max={23.75} step={0.25} value={env.hour} onChange={(e) => store.setEnv({ hour: Number(e.target.value) })} />
      </label>
      {hasWind ? (
        <>
          <label className="el-range">
            <span>
              {t.wind}: <b>{Math.round(env.gust * 100)} %</b>
            </span>
            <input type="range" min={0} max={1} step={0.05} value={env.gust} onChange={(e) => store.setEnv({ gust: Number(e.target.value) })} />
          </label>
          <label className="el-range">
            <span>
              {t.height}: <b>{env.height} m</b>
            </span>
            <input type="range" min={0} max={60} step={1} value={env.height} onChange={(e) => store.setEnv({ height: Number(e.target.value) })} />
          </label>
        </>
      ) : null}
      <span className="el-group">
        {!readOnly ? (
          <>
            <button type="button" className="rs-btn" onClick={() => store.undo()} disabled={!store.canUndo()} title="Ctrl+Z">
              {t.undo}
            </button>
            <button type="button" className="rs-btn" onClick={() => store.redo()} disabled={!store.canRedo()} title="Ctrl+Y">
              {t.redo}
            </button>
          </>
        ) : null}
        <button type="button" className="rs-btn" onClick={() => store.restart()}>
          {t.reset}
        </button>
        {!readOnly ? (
          <button
            type="button"
            className="rs-btn"
            onClick={() => {
              if (window.confirm(t.clearConfirm)) store.clear();
            }}
          >
            {t.clear}
          </button>
        ) : null}
        <button
          type="button"
          className="rs-btn el-share"
          onClick={async () => {
            setShared((await onShare()) ? "ok" : "fail");
            window.setTimeout(() => setShared(null), 2500);
          }}
        >
          {shared === "ok" ? t.copied : t.share}
        </button>
      </span>
      {shared === "fail" ? (
        <span className="el-note" role="status">
          {t.copyFailed}
        </span>
      ) : null}
      <span className="el-time" aria-live="off">
        {lang === "es" ? "Tiempo" : "Time"} {Math.floor(store.world.time)} s
      </span>
    </div>
  );
}
