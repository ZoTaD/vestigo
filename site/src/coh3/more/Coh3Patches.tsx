/**
 * Parches de CoH3 (2026-11-04): qué cambió entre dos versiones de los datos del juego, unidad por unidad y arma por
 * arma (campo, antes y después), con buscador y filtro por facción. Nadie más lo tiene: coh3stats sólo trae las notas.
 * Una página por parche (`/coh3/patches/<tag>`); sin detalle se abre el más nuevo.
 */
import { useEffect, useState } from "react";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useLang } from "../../i18n";
import { useCoh3Copy, type Faction } from "../../coh3Copy";
import { tr, type L10n } from "../data";
import { Coh3Loading, FactionTag, Icon, Panel, useNum, type Nav } from "../ui";
import { FactionFilter } from "../explorer/Coh3Units";
import { useMoreCopy } from "./copy";
import "./more.css";

export type PatchIndexRow = { slug: string; tag: string; prev: string; patch: string; name: L10n; date?: string | null; units: number; weapons: number };
type Change = { field: string; before: unknown; after: unknown };
type Item = { slug: string; name: L10n | null; faction: Faction | null; icon: string | null; status: "changed" | "new" | "removed"; changes?: Change[] };
export type Patch = Omit<PatchIndexRow, "units" | "weapons"> & { units: Item[]; weapons: Item[] };

type Mod<T> = { default: T };
let index: PatchIndexRow[] | null = null;
const patches = new Map<string, Patch>();
const files = import.meta.glob<Mod<Patch>>("@coh3/patches/v*.json");
const fileOf = (slug: string) => Object.entries(files).find(([p]) => p.endsWith(`/${slug}.json`))?.[1];

export const loadPatchIndex = (): Promise<PatchIndexRow[]> =>
  index ? Promise.resolve(index) : (import("@coh3/patches/index.json") as Promise<Mod<unknown>>).then((m) => (index = m.default as PatchIndexRow[]));
export const peekPatchIndex = () => index;
export async function loadPatch(slug: string): Promise<Patch | null> {
  const hit = patches.get(slug);
  if (hit) return hit;
  const f = fileOf(slug);
  if (!f) return null;
  const p = (await f()).default;
  patches.set(slug, p);
  return p;
}
export const peekPatch = (slug: string) => patches.get(slug);
/** Lo que pide el prerender: el índice y el parche de la dirección (o el más nuevo). */
export async function preloadPatches(route: Route): Promise<void> {
  const idx = await loadPatchIndex();
  const slug = route.detail ?? idx[0]?.slug;
  if (slug) await loadPatch(slug);
}

/** El nombre legible de un campo del diff. */
function useFieldLabel() {
  const { lang } = useLang();
  const es = lang === "es";
  const L: Record<string, [string, string]> = {
    hp: ["Health", "Vida"], armor: ["Armor (front/side/rear)", "Blindaje (frente/lateral/trasero)"], "cost.mp": ["Manpower", "Mano de obra"],
    "cost.mu": ["Munitions", "Munición"], "cost.fu": ["Fuel", "Combustible"], "cost.pop": ["Population", "Población"], "cost.t": ["Build time (s)", "Tiempo de producción (s)"],
    models: ["Models", "Modelos"], weapons: ["Weapons", "Armas"], sight: ["Sight", "Visión"], speed: ["Speed", "Velocidad"], targetSize: ["Target size", "Tamaño de blanco"],
    pen: ["Penetration (near/mid/far)", "Penetración (corta/media/larga)"], acc: ["Accuracy (near/mid/far)", "Precisión (corta/media/larga)"], dmg: ["Damage", "Daño"],
    dist: ["Distances (m)", "Distancias (m)"], range: ["Range (m)", "Alcance (m)"], reload: ["Reload (s)", "Recarga (s)"], reloadEvery: ["Shots per reload", "Disparos por recarga"],
    cooldown: ["Cooldown (s)", "Enfriamiento (s)"], "aim.fire": ["Aim time (s)", "Tiempo de apuntado (s)"], "aim.ready": ["Ready-aim time (s)", "Tiempo de preparación (s)"],
    windup: ["Wind-up (s)", "Preparación del disparo (s)"], winddown: ["Wind-down (s)", "Cierre del disparo (s)"], moving: ["Accuracy while moving", "Precisión en movimiento"],
    "aoe.radius": ["Area radius (m)", "Radio de área (m)"], "aoe.dmg": ["Area damage", "Daño de área"], "aoe.dist": ["Area distances", "Distancias de área"], "aoe.pen": ["Area penetration", "Penetración de área"],
    "burst.dur": ["Burst length (s)", "Duración de ráfaga (s)"], "burst.rate": ["Burst rate of fire", "Cadencia de ráfaga"],
  };
  return (f: string) => (L[f] ? L[f][es ? 1 : 0] : f);
}

function useVal() {
  const num = useNum();
  const fmt = (v: unknown): string => {
    if (v == null) return "—";
    if (typeof v === "number") return num(v, Number.isInteger(v) ? 0 : Math.abs(v) < 1 ? 3 : 2);
    if (Array.isArray(v)) return v.map((x) => (typeof x === "object" && x && "slug" in x ? String((x as { slug: string }).slug) : fmt(x))).join(" / ");
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  };
  return fmt;
}

/** ¿Subió o bajó? Sólo para números sueltos (en un costo o un tiempo, bajar es mejorar, pero acá se dice el sentido, no si es bueno). */
const dir = (a: unknown, b: unknown) => (typeof a === "number" && typeof b === "number" ? (b > a ? "is-upv" : b < a ? "is-downv" : "") : "");

export default function Coh3Patches({ route, navigate }: { route: Route; navigate: Nav }) {
  const t = useMoreCopy();
  const c = useCoh3Copy();
  const { lang } = useLang();
  const num = useNum();
  const label = useFieldLabel();
  const fmt = useVal();
  const [idx, setIdx] = useState(peekPatchIndex);
  const slug = route.detail ?? idx?.[0]?.slug;
  const [p, setP] = useState<Patch | null | undefined>(() => (slug ? peekPatch(slug) : undefined));
  const [fac, setFac] = useState<Faction | "">("");
  const [q, setQ] = useState("");
  useEffect(() => {
    if (idx) return;
    loadPatchIndex().then(setIdx, () => undefined);
  }, [idx]);
  useEffect(() => {
    if (!slug) return;
    if (peekPatch(slug)) return setP(peekPatch(slug));
    setP(undefined);
    let vivo = true;
    loadPatch(slug).then((x) => vivo && setP(x), () => vivo && setP(null));
    return () => {
      vivo = false;
    };
  }, [slug]);
  if (!idx || p === undefined) return <Coh3Loading />;
  if (!p)
    return (
      <main className="c3-main">
        <Panel>
          <p>{c.t.notFound}</p>
        </Panel>
      </main>
    );
  const needle = q.trim().toLowerCase();
  const keep = (x: Item) => (!fac || x.faction === fac) && (!needle || tr(x.name, lang).toLowerCase().includes(needle) || x.slug.includes(needle));
  const date = p.date ? new Date(p.date).toLocaleDateString(lang === "es" ? "es-AR" : "en-US", { day: "numeric", month: "long", year: "numeric" }) : null;
  const block = (k: "units" | "weapons", items: Item[]) => {
    const shown = items.filter(keep);
    if (!shown.length) return null;
    return (
      <Panel k={k === "units" ? t.patches.units : t.patches.weapons} h={num(shown.length)}>
        <ul className="c3-diff">
          {shown.map((x) => (
            <li key={x.slug}>
              <div className="c3-diff-h">
                <Icon path={x.icon} size={40} />
                {x.faction && <FactionTag f={x.faction} name={false} size={20} />}
                <RouteLink to={{ ...route, view: "coh3", c3Section: k, detail: x.slug }} onNavigate={navigate}>
                  <b>{tr(x.name, lang) || x.slug.replace(/_/g, " ")}</b>
                </RouteLink>
                {x.status !== "changed" && <span className="c3-tag">{x.status === "new" ? t.patches.added : t.patches.removed}</span>}
              </div>
              {x.changes && x.changes.length > 0 && (
                <table>
                  <tbody>
                    {x.changes.map((ch, i) => (
                      <tr key={i}>
                        <td>{label(ch.field)}</td>
                        <td className="c3-dim">{fmt(ch.before)}</td>
                        <td className={dir(ch.before, ch.after)}>→ {fmt(ch.after)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </li>
          ))}
        </ul>
      </Panel>
    );
  };
  return (
    <main className="c3-main c3-patches">
      <header className="c3-head">
        <div className="c3-k">{t.patches.k}</div>
        <h1 className="c3-h1">{t.patches.title(tr(p.name, lang))}</h1>
        <p className="c3-lede">{t.patches.lede}</p>
        <p className="c3-note">
          {t.patches.vs(p.prev, p.tag)}
          {date ? ` · ${date}` : ""} · {t.patches.count(num(p.units.length), num(p.weapons.length))}
        </p>
      </header>
      <div className="c3-filters">
        <label>
          {t.patches.pick}
          <select value={p.slug} onChange={(e) => navigate({ ...route, view: "coh3", c3Section: "patches", detail: e.target.value })}>
            {idx.map((r) => (
              <option key={r.slug} value={r.slug}>
                {tr(r.name, lang)}
              </option>
            ))}
          </select>
        </label>
        <FactionFilter value={fac} onChange={setFac} />
        <input type="search" value={q} placeholder={t.patches.search} aria-label={t.patches.search} onChange={(e) => setQ(e.target.value)} />
      </div>
      {!p.units.length && !p.weapons.length && (
        <Panel>
          <p>{t.patches.none}</p>
        </Panel>
      )}
      <div className="c3-grid2 is-even">
        {block("units", p.units)}
        {block("weapons", p.weapons)}
      </div>
    </main>
  );
}
