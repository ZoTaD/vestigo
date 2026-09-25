/**
 * "Tu partida": subir la carpeta del mundo (o un zip) para ver lo compartido en
 * la mesa de cartografía, portales, tumbas, camas y bases, y/o el personaje de
 * cada jugador para sumar lo que exploró y sus pines. Con un tutorial corto de
 * dónde está cada archivo (pedido de ZoTaD, 2026-09-25).
 *
 * Nada sale del navegador: los archivos se leen en un Web Worker.
 */
import { useRef, useState } from "react";
import { useLang } from "../i18n";
import { useSaveCopy } from "./saveCopy";
import type { InputFile, WorldSaveData } from "./saves/contract";
import { PLAYER_COLORS, type SavesState } from "./useSaves";

/** Lo que se soltó en la zona: carpetas incluidas (recorre las entradas). */
async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  const out: File[] = [];
  type Entry = { isFile: boolean; isDirectory: boolean; fullPath: string; file?: (cb: (f: File) => void, err: (e: unknown) => void) => void; createReader?: () => { readEntries: (cb: (es: Entry[]) => void, err: (e: unknown) => void) => void } };
  const walk = async (e: Entry): Promise<void> => {
    if (e.isFile && e.file) {
      const f = await new Promise<File>((res, rej) => e.file!(res, rej));
      Object.defineProperty(f, "vmPath", { value: e.fullPath });
      out.push(f);
    } else if (e.isDirectory && e.createReader) {
      const r = e.createReader();
      // readEntries devuelve de a tandas: se pide hasta que venga vacío.
      for (;;) {
        const batch = await new Promise<Entry[]>((res, rej) => r.readEntries(res, rej));
        if (!batch.length) break;
        for (const x of batch) await walk(x);
      }
    }
  };
  const entries = [...dt.items].map((i) => (i as DataTransferItem & { webkitGetAsEntry?: () => Entry | null }).webkitGetAsEntry?.()).filter(Boolean) as Entry[];
  if (entries.length) for (const e of entries) await walk(e);
  else out.push(...dt.files);
  return out;
}

async function toInput(files: File[]): Promise<InputFile[]> {
  return Promise.all(files.map(async (f) => ({
    name: f.name,
    path: (f as File & { vmPath?: string }).vmPath ?? (f as File & { webkitRelativePath?: string }).webkitRelativePath ?? f.name,
    data: new Uint8Array(await f.arrayBuffer()),
  })));
}

function Drop({ label, hint, accept, folder, onFiles, busy }: { label: string; hint: string; accept?: string; folder?: boolean; onFiles: (f: File[]) => void; busy: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div className={`vm-drop${over ? " is-over" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={async (e) => { e.preventDefault(); setOver(false); onFiles(await filesFromDrop(e.dataTransfer)); }}>
      <button type="button" className="vm-btn" disabled={busy} onClick={() => input.current?.click()}>{label}</button>
      <small>{hint}</small>
      <input ref={input} type="file" hidden multiple accept={accept}
        {...(folder ? { webkitdirectory: "", directory: "" } as Record<string, string> : {})}
        onChange={(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ""; if (fs.length) onFiles(fs); }} />
    </div>
  );
}

export default function SaveLoader({ saves, onWorld }: { saves: SavesState; onWorld: (w: WorldSaveData) => void }) {
  const t = useSaveCopy();
  const { lang } = useLang();
  const [help, setHelp] = useState(false);
  const w = saves.world;

  const pickWorld = async (fs: File[]) => {
    // De una carpeta vienen muchos archivos: alcanza con los del mundo.
    const keep = fs.filter((f) => /\.(fwl2?|db2?|chunks?|ok|zip)$/i.test(f.name));
    const world = await saves.loadWorld(await toInput(keep.length ? keep : fs));
    if (world) onWorld(world);
  };
  const pickChars = async (fs: File[]) => {
    const keep = fs.filter((f) => /\.fch$/i.test(f.name));
    if (keep.length) await saves.loadCharacters(await toInput(keep));
  };

  return (
    <section className="vh-box vm-panel vm-save">
      <h3>{t.title}</h3>
      <p className="vm-save-note">{t.private}</p>

      <div className="vm-save-opt">
        <h4>{t.tableTitle} <span className="vm-tag">{t.recommended}</span></h4>
        <p>{t.tableText}</p>
        <Drop label={t.pickWorld} hint={t.worldHint} folder onFiles={pickWorld} busy={saves.busy} />
        <Drop label={t.pickZip} hint={t.zipHint} accept=".zip" onFiles={pickWorld} busy={saves.busy} />
      </div>

      <div className="vm-save-opt">
        <h4>{t.playersTitle}</h4>
        <p>{t.playersText}</p>
        <Drop label={t.pickChars} hint={t.charsHint} accept=".fch" onFiles={pickChars} busy={saves.busy} />
      </div>

      {saves.busy && <p className="vm-note">{t.reading}</p>}
      {saves.error && <p className="vm-err">{t.error(saves.error)}</p>}

      {w && (
        <div className="vm-save-sum">
          <p><b>{w.name}</b> · {t.seed} <code>{w.seedName}</code></p>
          <ul>
            <li>{t.portals(w.portals.length)}</li>
            <li>{t.tables(w.cartography.length, w.cartography.reduce((n, c) => n + c.pins.length, 0))}</li>
            <li>{t.points(w.points.filter((p) => p.kind === "tombstone").length, w.points.filter((p) => p.kind === "bed").length, w.points.filter((p) => p.kind === "ship").length)}</li>
          </ul>
          {w.warnings.length > 0 && <details><summary>{t.warnings(w.warnings.length)}</summary><ul>{w.warnings.map((x, i) => <li key={i}>{x}</li>)}</ul></details>}
        </div>
      )}

      {(w || saves.characters.length > 0) && (
        <div className="vm-save-layers">
          <label><input type="checkbox" checked={saves.showFog} onChange={(e) => saves.setShowFog(e.target.checked)} /> {t.fog}</label>
          {w && <label><input type="checkbox" checked={saves.useTable} onChange={(e) => saves.setUseTable(e.target.checked)} /> {t.useTable}</label>}
          {saves.playerWorlds.map((p, i) => (
            <label key={i}>
              <input type="checkbox" checked={saves.shownPlayers.has(i)} onChange={() => {
                const n = new Set(saves.shownPlayers);
                if (n.has(i)) n.delete(i); else n.add(i);
                saves.setShownPlayers(n);
              }} />
              <i style={{ background: PLAYER_COLORS[i % PLAYER_COLORS.length] }} /> {p.name}
              <small>{p.found ? t.playerPins(p.pins.length) : t.notInWorld}</small>
            </label>
          ))}
          <button type="button" className="vm-link" onClick={saves.clear}>{t.clear}</button>
        </div>
      )}

      <button type="button" className="vm-link vm-help-btn" onClick={() => setHelp(!help)} aria-expanded={help}>{help ? "▾" : "▸"} {t.whereTitle}</button>
      {help && (
        <div className="vm-help">
          {t.where.map((sec) => (
            <div key={sec.title[lang]}>
              <h5>{sec.title[lang]}</h5>
              {sec.steps[lang].map((s, i) => <p key={i} dangerouslySetInnerHTML={{ __html: s }} />)}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
