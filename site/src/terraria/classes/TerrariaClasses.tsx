/**
 * La pestaña Clases de Terraria (2026-10-12): qué armas, armadura y accesorios conviene llevar con cada clase en cada
 * tramo del juego. La selección está hecha a mano (`games/terraria/tools/classes_data.py`); cada objeto enlaza a su
 * ficha. Se dibuja una clase por vez: la elegida va en el `#hash`, así un enlace abre la que corresponde.
 */
import data from "@terraria/classes.json";
import { useEffect, useState } from "react";
import { useLang } from "../../i18n";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useTerrariaCopy } from "../../terrariaCopy";
import type { Ref } from "../data";
import { itemRoute, rare, Slot, Sprite, type Nav } from "../ui";
import "../../styles/terraria-world.css";

type ClassKey = "melee" | "ranged" | "magic" | "summon";
type Stage = { weapons: number[]; armor: number[]; accessories: number[] };
const db = data as unknown as {
  stages: { key: string; boss: [en: string, es: string] | null }[];
  classes: { key: ClassKey; stages: Stage[] }[];
  refs: Record<string, Ref>;
};

const fromHash = (): ClassKey | null => {
  const key = typeof window === "undefined" ? "" : window.location.hash.slice(1);
  return db.classes.some((c) => c.key === key) ? (key as ClassKey) : null;
};

export default function TerrariaClasses({ route, navigate }: { route: Route; navigate: Nav }) {
  const t = useTerrariaCopy();
  const { lang } = useLang();
  const [picked, setPicked] = useState<ClassKey>("melee");
  // El `#hash` se lee después de hidratar: el HTML prerenderizado trae siempre la primera clase.
  useEffect(() => {
    const sync = () => setPicked(fromHash() ?? "melee");
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  const pick = (key: ClassKey) => {
    setPicked(key);
    window.history.replaceState(window.history.state, "", `${window.location.pathname}#${key}`);
  };
  const cls = db.classes.find((c) => c.key === picked) ?? db.classes[0];

  const list = (ids: number[]) => (
    <ul className="tr-loadout">
      {ids.map((id) => {
        const r = db.refs[String(id)];
        return (
          <li key={id}>
            <RouteLink className="tr-ref" to={itemRoute(route, r[0])} onNavigate={navigate} prefetch="press">
              <Slot size={36}>
                <Sprite id={id} w={r[5]} h={r[6]} max={28} />
              </Slot>
              <span style={rare(r[4])}>{(lang === "es" && r[3]) || r[2]}</span>
            </RouteLink>
          </li>
        );
      })}
    </ul>
  );

  return (
    <main className="tr-main tr-classes">
      <div className="tr-wrap">
        <header className="tr-head">
          <h1 className="tr-h1 tr-andy">{t.classes.h1}</h1>
          <p className="tr-lede">{t.classes.lede}</p>
          <div className="tr-chips" role="group" aria-label={t.classes.pick}>
            {db.classes.map((c) => (
              <button type="button" className={`tr-chip${c.key === cls.key ? " is-on" : ""}`} aria-pressed={c.key === cls.key} onClick={() => pick(c.key)} key={c.key}>
                {t.classes.names[c.key]}
              </button>
            ))}
          </div>
          <p className="tr-hint">{t.classes.about[cls.key]}</p>
        </header>
        {cls.stages.map((stage, i) => {
          const { key, boss } = db.stages[i];
          return (
            <section className="tr-dug" key={key}>
              <h2 className="tr-h2 tr-andy">{t.classes.stage(key, boss ? (lang === "es" && boss[1]) || boss[0] : "")}</h2>
              <div className="tr-loadouts">
                <div>
                  <h3 className="tr-label">{t.classes.weapons}</h3>
                  {list(stage.weapons)}
                </div>
                <div>
                  <h3 className="tr-label">{t.classes.armor}</h3>
                  {list(stage.armor)}
                </div>
                <div>
                  <h3 className="tr-label">{t.classes.accessories}</h3>
                  {list(stage.accessories)}
                </div>
              </div>
            </section>
          );
        })}
        <p className="tr-hint">{t.classes.note}</p>
      </div>
    </main>
  );
}
