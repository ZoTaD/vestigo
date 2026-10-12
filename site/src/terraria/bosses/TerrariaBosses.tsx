/**
 * La pestaña Jefes de Terraria (2026-10-12): la lista de progresión. Cada jefe con cómo aparece, sus estadísticas del
 * modo Clásico, qué destraba y qué suelta, y una marca de "vencido" que se guarda en el navegador. Los datos
 * (`bosses.json`) viajan con el chunk de la pestaña.
 */
import { useEffect, useState } from "react";
import data from "@terraria/bosses.json";
import { useLang, useLocale } from "../../i18n";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useTerrariaCopy } from "../../terrariaCopy";
import type { Ref } from "../data";
import { percent } from "../items/stats";
import { itemRoute, rare, Slot, Sprite, type Nav } from "../ui";
import "../../styles/terraria-world.css";

interface Boss {
  key: string;
  name: [string, string];
  hardmode: boolean;
  parts: [en: string, es: string, life: number, damage: number, defense: number][];
  summon: number;
  how: [string, string];
  unlocks: [string, string];
  drops: [item: number, min: number, max: number, rate: number, mode: string][];
}
const db = data as unknown as { bosses: Boss[]; refs: Record<string, Ref> };

const STORE = "vestigo.terraria.bosses";
/** Las marcas guardadas. Sin `localStorage` (modo privado, prerender) no hay ninguna y no se guarda nada. */
function readDone(): string[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORE) ?? "[]");
    return Array.isArray(raw) ? raw.filter((k) => typeof k === "string") : [];
  } catch {
    return [];
  }
}

export default function TerrariaBosses({ route, navigate }: { route: Route; navigate: Nav }) {
  const t = useTerrariaCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const li = lang === "es" ? 1 : 0;
  // Las marcas se leen después del primer dibujo: el HTML prerenderizado es la lista sin marcar.
  const [done, setDone] = useState<string[]>([]);
  useEffect(() => setDone(readDone()), []);
  const save = (next: string[]) => {
    setDone(next);
    try {
      window.localStorage.setItem(STORE, JSON.stringify(next));
    } catch {
      // Sin dónde guardar, las marcas duran lo que dure la página.
    }
  };
  const toggle = (key: string) => save(done.includes(key) ? done.filter((k) => k !== key) : [...done, key]);
  const beaten = db.bosses.filter((b) => done.includes(b.key)).length;

  const item = (id: number, extra?: string) => {
    const r = db.refs[String(id)];
    if (!r) return null;
    return (
      <RouteLink className="tr-ref" to={itemRoute(route, r[0])} onNavigate={navigate} prefetch="press">
        <Slot size={36}>
          <Sprite id={id} w={r[5]} h={r[6]} max={28} />
        </Slot>
        <span style={rare(r[4])}>{(li && r[3]) || r[2]}</span>
        {extra && <small>{extra}</small>}
      </RouteLink>
    );
  };

  const card = (b: Boss) => {
    const isDone = done.includes(b.key);
    return (
      <li className={`tr-dug tr-boss${isDone ? " is-done" : ""}`} id={b.key} key={b.key}>
        <header className="tr-boss-top">
          <img className="tr-sprite" src={`/terraria/bosses/${b.key}.png`} alt="" width={56} height={56} loading="lazy" decoding="async" />
          <h3 className="tr-h2 tr-andy">{b.name[li]}</h3>
          <label className="tr-check">
            <input type="checkbox" checked={isDone} onChange={() => toggle(b.key)} />
            <span>{t.bosses.defeated}</span>
          </label>
        </header>
        <div className="tr-boss-body">
          <div>
            <p className="tr-label">{t.bosses.summon}</p>
            {b.summon > 0 && item(b.summon)}
            <p>{b.how[li]}</p>
            <p className="tr-label tr-gap">{t.bosses.unlocks}</p>
            <p>{b.unlocks[li]}</p>
          </div>
          <table className="tr-table tr-boss-stats">
            <caption className="tr-label">{t.bosses.classic}</caption>
            <thead>
              <tr>
                <th scope="col" />
                <th scope="col">{t.bosses.stats.life}</th>
                <th scope="col">{t.bosses.stats.damage}</th>
                <th scope="col">{t.bosses.stats.defense}</th>
              </tr>
            </thead>
            <tbody>
              {b.parts.map((p, i) => (
                <tr key={i}>
                  <th scope="row">{p[li]}</th>
                  <td>{p[2].toLocaleString(locale)}</td>
                  <td>{p[3] || "—"}</td>
                  <td>{p[4]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {b.drops.length > 0 && (
          <>
            <p className="tr-label tr-gap">{t.bosses.drops}</p>
            <ul className="tr-rows">
              {b.drops.map(([id, min, max, rate, mode]) => (
                <li key={`${id}-${mode}`}>
                  {item(id, [percent(rate, locale), max > 1 ? (min === max ? `×${min}` : `×${min}–${max}`) : "", mode === "e" ? t.bosses.expertOnly : mode === "m" ? t.bosses.masterOnly : ""].filter(Boolean).join(" · "))}
                </li>
              ))}
            </ul>
          </>
        )}
      </li>
    );
  };

  return (
    <main className="tr-main tr-bosses">
      <div className="tr-wrap">
        <header className="tr-head">
          <h1 className="tr-h1 tr-andy">{t.bosses.h1}</h1>
          <p className="tr-lede">{t.bosses.lede}</p>
        </header>
        <div className="tr-dug tr-progress">
          <strong className="tr-andy">{t.bosses.progress(beaten, db.bosses.length)}</strong>
          <progress value={beaten} max={db.bosses.length} aria-label={t.bosses.progress(beaten, db.bosses.length)} />
          {beaten > 0 && (
            <button type="button" className="tr-link" onClick={() => save([])}>
              {t.bosses.reset}
            </button>
          )}
        </div>
        <h2 className="tr-tag tr-andy">{t.bosses.pre}</h2>
        <ul className="tr-boss-list">{db.bosses.filter((b) => !b.hardmode).map(card)}</ul>
        <h2 className="tr-tag tr-andy">{t.bosses.hard}</h2>
        <ul className="tr-boss-list">{db.bosses.filter((b) => b.hardmode).map(card)}</ul>
      </div>
    </main>
  );
}
