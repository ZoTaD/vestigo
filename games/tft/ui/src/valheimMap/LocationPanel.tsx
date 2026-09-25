/**
 * El panel de lugares a la derecha del mapa (pedido de ZoTaD, 2026-09-25):
 * cuántos hay, un buscador, mostrar u ocultar todo, la distancia desde el
 * inicio a cada jefe y comerciante, y cada grupo (mazmorras, aldeas, piedras
 * rúnicas…) con sus tipos, su cantidad y un botón para ir al más cercano.
 */
import { useMemo, useState, type ReactNode } from "react";
import { useLang } from "../i18n";
import { useMapCopy } from "./copy";
import type { LocationsState, MapLocation } from "./locations";

interface Props {
  loc: LocationsState;
  hidden: Set<string>;
  setHidden: (s: Set<string>) => void;
  /** Ir a un punto del mapa. */
  goTo: (x: number, z: number) => void;
  /** El centro de la vista, para "ir al más cercano". */
  center: () => { x: number; z: number };
  select: (key: string) => void;
  /** "Tu partida" y el panel del mapa: van debajo de los grupos, a la izquierda,
      en el hueco que deja el grupo más largo (pedido de ZoTaD, 2026-09-25). */
  extra?: ReactNode;
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function LocationPanel({ loc, hidden, setHidden, goTo, center, select, extra }: Props) {
  const t = useMapCopy();
  const { lang } = useLang();
  const [q, setQ] = useState("");
  const items = loc.items ?? [];

  // Por tipo, las ubicaciones (para "ir al más cercano").
  const byType = useMemo(() => {
    const m = new Map<string, MapLocation[]>();
    for (const l of items) m.set(l.type, [...(m.get(l.type) ?? []), l]);
    return m;
  }, [items]);

  // Desde el inicio: el más cercano de cada jefe y de cada comerciante.
  const distances = useMemo(() => {
    const s = loc.spawn;
    if (!s) return [];
    const out: { l: MapLocation; d: number }[] = [];
    for (const [, list] of byType) {
      if (list[0].category !== "boss" && list[0].category !== "trader") continue;
      let best = list[0], bd = Infinity;
      for (const l of list) {
        const d = Math.hypot(l.x - s.x, l.z - s.z);
        if (d < bd) { bd = d; best = l; }
      }
      out.push({ l: best, d: bd });
    }
    return out.sort((a, b) => (a.l.category === b.l.category ? a.d - b.d : a.l.category === "boss" ? -1 : 1));
  }, [byType, loc.spawn]);

  const nearest = (type: string) => {
    const list = byType.get(type);
    if (!list?.length) return;
    const c = center();
    let best = list[0], bd = Infinity;
    for (const l of list) {
      const d = Math.hypot(l.x - c.x, l.z - c.z);
      if (d < bd) { bd = d; best = l; }
    }
    // Que se vea aunque su tipo esté oculto.
    if (hidden.has(type)) {
      const n = new Set(hidden);
      n.delete(type);
      setHidden(n);
    }
    goTo(best.x, best.z);
    select(best.key);
  };

  const toggle = (ids: string[], show: boolean) => {
    const n = new Set(hidden);
    for (const id of ids) {
      if (show) n.delete(id);
      else n.add(id);
    }
    setHidden(n);
  };

  const f = fold(q.trim());
  const cats = loc.categories
    .map((c) => ({ ...c, types: c.types.filter((ty) => !f || fold(ty.name[lang]).includes(f) || fold(ty.name.en).includes(f)) }))
    .filter((c) => c.types.length);
  const allIds = loc.categories.flatMap((c) => c.types.map((ty) => ty.id));

  // Sin lugares todavía (se están ubicando) igual se ven "Tu partida" y el mapa.
  if (!loc.items) return extra ? <div className="vm-locs-extra is-alone">{extra}</div> : null;

  // El grupo más largo va último, en la última columna y ocupando dos filas; en
  // el hueco que deja a su izquierda entran "Tu partida" y el mapa.
  const tallest = cats.reduce<(typeof cats)[number] | null>((m, c) => (!m || c.types.length > m.types.length ? c : m), null);
  const group = (c: (typeof cats)[number], tall = false) => {
    const ids = c.types.map((ty) => ty.id);
    const anyShown = ids.some((id) => !hidden.has(id));
    return (
      <div className={`vm-group${tall ? " is-tall" : ""}`} key={c.id}>
        <h4>
          <span>{c.name[lang]}</span>
          <button type="button" className="vm-link" onClick={() => toggle(ids, !anyShown)}>{anyShown ? t.hideAll : t.showAll}</button>
        </h4>
        <ul className="vm-types">
          {c.types.map((ty) => (
            <li key={ty.id} className={hidden.has(ty.id) ? "is-off" : undefined}>
              <label>
                <input type="checkbox" checked={!hidden.has(ty.id)} onChange={() => toggle([ty.id], hidden.has(ty.id))} />
                {ty.iconUrl ? <img src={ty.iconUrl} alt="" width={18} height={18} /> : <i style={{ background: ty.color }} />}
                <span>{ty.name[lang]}</span>
              </label>
              <button type="button" className="vm-go" onClick={() => nearest(ty.id)} title={t.goNearest} aria-label={`${t.goNearest}: ${ty.name[lang]}`}>
                {ty.count}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  };
  return (
    <section className="vh-box vm-panel vm-locs">
      <h3>{t.count(items.length)}</h3>
      <input className="vh-input vm-search" type="search" value={q} placeholder={t.search} aria-label={t.search} onChange={(e) => setQ(e.target.value)} />
      <div className="vm-cats">
        <button type="button" className="vm-link" onClick={() => toggle(allIds, true)}>{t.showAll}</button>
        <span className="vh-dim">|</span>
        <button type="button" className="vm-link" onClick={() => toggle(allIds, false)}>{t.hideAll}</button>
      </div>

      <div className="vm-locs-body">
          {distances.length > 0 && !f && (
            <div className="vm-group">
              <h4>{t.fromSpawn}</h4>
              <ul className="vm-dist">
                {distances.map(({ l, d }) => (
                  <li key={l.type}>
                    <button type="button" className="vm-link" onClick={() => { goTo(l.x, l.z); select(l.key); }}>
                      <span>{l.name[lang]}</span><b>{t.km(d)}</b>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {cats.filter((c) => c !== tallest).map((c) => group(c))}
          {tallest && group(tallest, true)}
          {extra && <div className="vm-locs-extra">{extra}</div>}
      </div>
    </section>
  );
}
