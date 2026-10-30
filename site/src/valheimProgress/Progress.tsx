/**
 * Mi partida (2026-10-30), maqueta B "Ruta de biomas": a la izquierda los biomas en orden con su jefe y su avance; a
 * la derecha las tareas del elegido en tres columnas (equipo, materiales, jefe). Lo tildado queda en este navegador;
 * "Leer mi personaje" tilda solo lo que el `.fch` dice que ya hiciste y guarda sus habilidades para la calculadora.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLang } from "../i18n";
import RouteLink from "../RouteLink";
import { useValheimCopy } from "../valheimCopy";
import { tx, type BiomeId } from "../valheimData";
import { Slot, type Nav, type To } from "../ValheimParts";
import { saveSkills } from "../valheimCalc/savedSkills";
import { readCharacter } from "../valheimMap/saves/character";
import { COLUMN, currentBiome, doneByCharacter, loadDone, saveDone, type BiomeTasks, type Task } from "./data";
import { useProgressCopy } from "./copy";
import progressData from "@valheim/progress.json";
import "../styles/valheim-progress.css";

const BIOMES = progressData as unknown as BiomeTasks[];

export default function Progress({ to, navigate }: { to: To; navigate: Nav }) {
  const t = useProgressCopy();
  const v = useValheimCopy();
  const { lang } = useLang();
  const [done, setDone] = useState<Set<string>>(() => new Set());
  // Lo guardado se lee después de montar: el prerender (y el primer dibujo) salen sin tildes.
  useEffect(() => setDone(loadDone()), []);
  const here = currentBiome(BIOMES, done);
  const [picked, setPicked] = useState<BiomeId | null>(null);
  const shown = BIOMES.find((b) => b.biome === (picked ?? here ?? BIOMES[0].biome))!;
  const [msg, setMsg] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const update = (next: Set<string>) => { setDone(next); saveDone(next); };
  const toggle = (id: string) => {
    const n = new Set(done);
    if (n.has(id)) n.delete(id); else n.add(id);
    update(n);
  };
  const read = async (f: File) => {
    setMsg(t.reading);
    try {
      const c = readCharacter({ name: f.name, path: f.name, data: new Uint8Array(await f.arrayBuffer()) });
      if (!c.progress) throw new Error("sin datos del jugador");
      const hits = doneByCharacter(BIOMES, c.progress);
      const n = new Set(done);
      let added = 0;
      for (const id of hits) if (!n.has(id)) { n.add(id); added++; }
      update(n);
      saveSkills(c.progress.skills);
      setPicked(null);
      setMsg(`${t.readOk(c.name, added)} ${Object.keys(c.progress.skills).length ? t.readSkills : ""}`);
    } catch {
      setMsg(t.readFail);
    }
  };

  const cols = useMemo(() => {
    const m: Record<string, Task[]> = { gear: [], materials: [], boss: [] };
    for (const task of shown.tasks) m[COLUMN[task.kind]].push(task);
    return m;
  }, [shown]);

  return (
    <div className="vg">
      <header className="vh-head">
        <h1>{t.title}</h1>
        <p>{here ? t.youAre(v.biomes[here]) : t.allDone} · {t.lede}</p>
        <div className="vg-actions">
          <button type="button" className="vh-plate vg-btn" onClick={() => file.current?.click()}>{t.read}</button>
          <input ref={file} type="file" accept=".fch,.old" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void read(f); e.target.value = ""; }} />
          <button type="button" className="vh-chip" onClick={() => { if (window.confirm(t.resetAsk)) update(new Set()); }}>{t.reset}</button>
        </div>
      </header>
      {msg ? (
        <p className="vg-msg">{msg} {msg.includes(t.readSkills) && <RouteLink to={to("calculators", "skills")} onNavigate={navigate}>{t.open} →</RouteLink>}</p>
      ) : (
        <p className="vg-msg vh-dim">{t.readHelp[0]} <code className="vg-path">{t.path}</code> {t.readHelp[1]}</p>
      )}
      <section className="vh-frame">
        <div className="vh-inset vg-route">
          <ol className="vg-stops">
            {BIOMES.map((b) => {
              const n = b.tasks.filter((x) => done.has(x.id)).length;
              const all = n === b.tasks.length;
              return (
                <li key={b.biome}>
                  <button type="button" className={`vg-stop${all ? " is-done" : ""}`} data-biome={b.biome} aria-pressed={b.biome === shown.biome} onClick={() => setPicked(b.biome)}>
                    <Slot icon={b.boss?.icon} size="sm" />
                    <span><b>{v.biomes[b.biome]}</b><small>{n}/{b.tasks.length}{b.boss ? ` · ${tx(b.boss.name, lang)}` : ""}</small></span>
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="vg-detail">
            <h2 className="vh-plate vg-plate">{v.biomes[shown.biome]}</h2>
            <div className="vg-cols">
              {(["gear", "materials", "boss"] as const).map((c) => (
                <div key={c}>
                  <h3>{t.cols[c]}</h3>
                  {cols[c].map((task) => (
                    <div key={task.id} className={`vg-task${done.has(task.id) ? " is-done" : ""}`}>
                      <label>
                        <input type="checkbox" checked={done.has(task.id)} onChange={() => toggle(task.id)} />
                        <Slot icon={task.ref.icon} size="sm" />
                        <span><small>{t.kind[task.kind]}</small>{tx(task.ref.name, lang)}</span>
                      </label>
                      {task.ref.slug && task.ref.tab && (
                        <RouteLink className="vg-go" to={to(task.ref.tab, task.ref.slug)} onNavigate={navigate} aria-label={tx(task.ref.name, lang)}>→</RouteLink>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
