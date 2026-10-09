/**
 * El inspector (2026-10-09): lo que hace la parte o el cable elegido, con sus cifras, lo que se puede tocar y el
 * porqué. Sin nada elegido: los avisos del circuito y la lista de materiales.
 */
import { useState } from "react";
import { useLocale } from "../../../i18n";
import RouteLink from "../../../RouteLink";
import type { Route } from "../../../route";
import type { Action, Readout } from "../engine";
import { duration, explainPart, explainWire, issues } from "../engine/explain";
import { waterName } from "../engine/explainWater";
import { Contents, Filters } from "./IndustrialPanel";
import { iconOf, nameOf, useEditor, useSim } from "./ctx";
import { wireKey } from "./store";

type Nav = (r: Route) => void;

export default function Inspector({ route, navigate }: { route: Route; navigate: Nav }) {
  const { store, t, lang, readOnly } = useEditor();
  useSim();
  const sel = store.selection;
  const id = sel?.kind === "part" && sel.ids.length === 1 ? sel.ids[0] : null;
  const wire = sel?.kind === "wire" ? store.circuit.wires.find((w) => wireKey(w) === sel.key) : undefined;
  return (
    <aside className="el-insp" aria-label={t.inspector}>
      {id ? <PartPanel id={id} route={route} navigate={navigate} /> : wire ? <WirePanel wireK={wireKey(wire)} /> : sel?.kind === "part" && sel.ids.length > 1 ? <Many ids={sel.ids} /> : <Summary />}
      {readOnly ? <p className="el-note">{t.readonly}</p> : null}
    </aside>
  );
}

function PartPanel({ id, route, navigate }: { id: string; route: Route; navigate: Nav }) {
  const { store, t, lang, readOnly } = useEditor();
  const locale = useLocale();
  const e = store.world.get(id);
  if (!e) return null;
  const def = e.def;
  const num = (v: number) => v.toLocaleString(locale, { maximumFractionDigits: 2 });
  const fmt = (r: Readout): string => {
    if (typeof r.v === "boolean") return r.v ? t.yes : t.no;
    if (r.k === "lasts" && typeof r.v === "number") return duration(r.v, lang);
    if (r.k === "kind") return r.v ? waterName(String(r.v), lang) : "—";
    if (r.k === "crafting") {
      const n = r.v ? store.world.items[String(r.v)]?.name : undefined;
      return n ? (lang === "es" ? n.es ?? n.en : n.en) : "—";
    }
    const v = typeof r.v === "number" ? num(r.v) : r.v;
    return r.of !== undefined ? `${v} / ${num(r.of)}` : String(v);
  };
  return (
    <>
      <div className="el-insp-hd">
        <span className="el-slot el-slot-sm">
          <img src={iconOf(def.id)} alt="" width={36} height={36} />
        </span>
        <h2>{nameOf(def.name, lang)}</h2>
      </div>
      <dl className="el-kv">
        {def.gen !== undefined ? (
          <div>
            <dt>{t.makes}</dt>
            <dd>{def.gen}</dd>
          </div>
        ) : (
          <div>
            <dt>{t.uses}</dt>
            <dd>{def.use === 0 ? t.noUse : def.use}</dd>
          </div>
        )}
        {e.readouts().map((r) => (
          <div key={r.k}>
            <dt>{t.readouts[r.k] ?? r.k}</dt>
            <dd>{fmt(r)}</dd>
          </div>
        ))}
      </dl>
      <Actions id={id} actions={e.actions()} />
      {!readOnly ? (
        <div className="el-actions">
          <NumField
            key={`${id}:height`}
            label={t.actions.height}
            action={{ k: "height", kind: "number", value: e.height, min: -100, max: 100, step: 0.5 }}
            onSet={(v) => store.setHeight(id, v)}
          />
        </div>
      ) : null}
      <Contents e={e} />
      <Filters e={e} />
      <h3 className="el-sub">{t.explain}</h3>
      <div className="el-why">
        {explainPart(store.world, id, lang).map((s, i) => (
          <p key={i}>{s}</p>
        ))}
      </div>
      <h3 className="el-sub">{t.sockets}</h3>
      <table className="el-sockets">
        <tbody>
          {e.inputs.map((s, i) => (
            <tr key={`i${i}`}>
              <th scope="row">← {s.niceName || "—"}</th>
              <td>{s.connectedTo ? e.received[i] : "—"}</td>
            </tr>
          ))}
          {def.out.map((d, i) => {
            const [pe, k] = e.port(i);
            return (
              <tr key={`o${i}`}>
                <th scope="row">{d.n || "—"} →</th>
                <td>{pe.outputs[k]?.connectedTo ? pe.sent[k] : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="el-row">
        {def.slug ? (
          <RouteLink className="rs-btn" to={{ ...route, view: "rust", rsSection: "items", detail: def.slug }} onNavigate={navigate}>
            {t.openItem}
          </RouteLink>
        ) : null}
        {!readOnly ? (
          <>
            <button type="button" className="rs-btn" onClick={() => store.duplicate([id])}>
              {t.duplicate}
            </button>
            <button type="button" className="rs-btn" onClick={() => store.removeParts([id])}>
              {t.remove}
            </button>
          </>
        ) : null}
      </div>
    </>
  );
}

function Actions({ id, actions }: { id: string; actions: Action[] }) {
  const { store, t } = useEditor();
  if (!actions.length) return null;
  return (
    <div className="el-actions">
      {actions.map((a) =>
        a.kind === "press" ? (
          <button type="button" className="rs-btn el-act" key={a.k} onClick={() => store.act(id, a.k)}>
            {t.actions[a.k] ?? a.k}
          </button>
        ) : a.kind === "toggle" ? (
          <label className="el-toggle" key={a.k}>
            <input type="checkbox" checked={a.value === 1} onChange={() => store.act(id, a.k)} />
            <span>{t.actions[a.k] ?? a.k}</span>
          </label>
        ) : (
          <NumField key={`${id}:${a.k}`} label={t.actions[a.k] ?? a.k} action={a} onSet={(v) => store.act(id, a.k, v)} />
        ),
      )}
    </div>
  );
}

/**
 * Un número del inspector. Mientras se escribe no lo pisa la simulación (la carga de una batería cambia cada segundo):
 * muestra el valor vivo sólo sin el foco, y lo aplica al salir o con Enter.
 */
function NumField({ label, action: a, onSet }: { label: string; action: Action; onSet: (v: number) => void }) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? String(a.value ?? "");
  const commit = () => {
    if (text === null) return;
    const v = Number(text.replace(",", "."));
    setText(null);
    if (Number.isFinite(v) && v !== a.value) onSet(Math.min(Math.max(v, a.min ?? -Infinity), a.max ?? Infinity));
  };
  return (
    <label className="el-num">
      <span>{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={shown}
        onFocus={() => setText(String(a.value ?? ""))}
        onChange={(ev) => setText(ev.target.value)}
        onBlur={commit}
        onKeyDown={(ev) => {
          if (ev.key === "Enter") (ev.target as HTMLInputElement).blur();
        }}
      />
    </label>
  );
}

function WirePanel({ wireK }: { wireK: string }) {
  const { store, t, lang, readOnly } = useEditor();
  const w = store.circuit.wires.find((x) => wireKey(x) === wireK);
  if (!w) return null;
  return (
    <>
      <div className="el-insp-hd">
        <h2>{t.wire}</h2>
      </div>
      <div className="el-why">
        {explainWire(store.world, w, lang).map((s, i) => (
          <p key={i}>{s}</p>
        ))}
      </div>
      {!readOnly ? (
        <div className="el-row">
          <button type="button" className="rs-btn" onClick={() => store.disconnect(wireK)}>
            {t.remove}
          </button>
        </div>
      ) : null}
    </>
  );
}

function Many({ ids }: { ids: string[] }) {
  const { store, t, readOnly } = useEditor();
  if (readOnly) return null;
  return (
    <div className="el-row">
      <button type="button" className="rs-btn" onClick={() => store.duplicate(ids)}>
        {t.duplicate} ({ids.length})
      </button>
      <button type="button" className="rs-btn" onClick={() => store.removeParts(ids)}>
        {t.remove} ({ids.length})
      </button>
    </div>
  );
}

/** Sin nada elegido: avisos y materiales. */
function Summary() {
  const { store, t, lang } = useEditor();
  const locale = useLocale();
  const list = issues(store.world, store.circuit);
  const counts = new Map<string, number>();
  for (const p of store.circuit.parts) counts.set(p.type, (counts.get(p.type) ?? 0) + 1);
  const total = new Map<string, number>();
  const uncraftable: string[] = [];
  for (const [type, n] of counts) {
    const def = store.cat.get(type);
    if (!def) continue;
    if (!def.craft.length) uncraftable.push(nameOf(def.name, lang));
    for (const g of def.craft) total.set(g.id, (total.get(g.id) ?? 0) + g.amount * n);
  }
  const partName = (id: string) => {
    const p = store.circuit.parts.find((x) => x.id === id);
    const def = p && store.cat.get(p.type);
    return def ? nameOf(def.name, lang) : id;
  };
  return (
    <>
      <p className="el-note">{t.nothing}</p>
      {list.length ? (
        <>
          <h3 className="el-sub">{t.issuesTitle}</h3>
          <ul className="el-issues">
            {list.map((i, k) => (
              <li key={k}>
                {i.id === null ? (
                  t.issues.overload
                ) : (
                  <button type="button" className="el-link" onClick={() => store.select({ kind: "part", ids: [i.id!] })}>
                    {partName(i.id)}
                  </button>
                )}
                {i.id !== null ? ` ${t.issues[i.kind as "unpowered" | "short" | "unwired" | "uphill"]}` : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {counts.size ? (
        <>
          <h3 className="el-sub">{t.materials}</h3>
          <ul className="el-bom">
            {[...counts].map(([type, n]) => {
              const def = store.cat.get(type);
              return def ? (
                <li key={type}>
                  <img src={iconOf(type)} alt="" width={24} height={24} loading="lazy" decoding="async" />
                  <span>{nameOf(def.name, lang)}</span>
                  <b>× {n}</b>
                </li>
              ) : null;
            })}
          </ul>
          <ul className="el-bom el-bom-total">
            {[...total].map(([id, n]) => (
              <li key={id}>
                <img src={iconOf(id)} alt="" width={24} height={24} loading="lazy" decoding="async" />
                <span>{nameOf(store.cat.data.names[id] ?? { en: id, es: null }, lang)}</span>
                <b>{n.toLocaleString(locale)}</b>
              </li>
            ))}
            <li>
              <img src={iconOf("wiretool")} alt="" width={24} height={24} loading="lazy" decoding="async" />
              <span>{t.wireTool}</span>
              <b>1</b>
            </li>
          </ul>
          {uncraftable.length ? <p className="el-note">{uncraftable.join(", ")}: {t.notCraftable}</p> : null}
          <p className="el-note">{t.materialsNote}</p>
        </>
      ) : null}
    </>
  );
}
