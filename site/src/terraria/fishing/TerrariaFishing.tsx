/**
 * La pestaña Pesca de Terraria (2026-10-12): qué pica en cada lugar, las cañas y los cebos con su poder de pesca, las
 * cajas y los peces que pide el Pescador. Cada cosa enlaza a su ficha. Los datos (`fishing.json`) viajan con el chunk de la pestaña.
 */
import data from "@terraria/fishing.json";
import { useLang } from "../../i18n";
import { LazyRows, skipSprite } from "../../LazyRows";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useTerrariaCopy } from "../../terrariaCopy";
import type { Ref } from "../data";
import { itemRoute, rare, Slot, Sprite, type Nav } from "../ui";
import "../../styles/terraria-world.css";

type Row = [id: number, power?: number];
type Catch = [id: number, tier: "" | "common" | "uncommon" | "rare" | "veryrare" | "legendary", where: [en: string, es: string] | null];
const db = data as unknown as { poles: Row[]; baits: Row[]; crates: Row[]; cratesHard: Row[]; quest: Row[]; catches: Catch[]; refs: Record<string, Ref> };
/** El alto de una fila de "qué pica y dónde", en px, medido en el navegador (2026-10-12). */
const TR_CATCH_ROW = 44;

export default function TerrariaFishing({ route, navigate }: { route: Route; navigate: Nav }) {
  const t = useTerrariaCopy();
  const { lang } = useLang();
  const list = (rows: Row[]) => (
    <ul className="tr-rows">
      {rows.map(([id, power]) => {
        const r = db.refs[String(id)];
        return (
          <li key={id}>
            <RouteLink className="tr-ref" to={itemRoute(route, r[0])} onNavigate={navigate} prefetch="press">
              <Slot size={36}>
                <Sprite id={id} w={r[5]} h={r[6]} max={28} />
              </Slot>
              <span style={rare(r[4])}>{(lang === "es" && r[3]) || r[2]}</span>
              {power !== undefined && <small>{power}%</small>}
            </RouteLink>
          </li>
        );
      })}
    </ul>
  );
  return (
    <main className="tr-main tr-fishing">
      <div className="tr-wrap">
        <header className="tr-head">
          <h1 className="tr-h1 tr-andy">{t.fishing.h1}</h1>
          <p className="tr-lede">{t.fishing.lede}</p>
        </header>
        <section className="tr-dug">
          <h2 className="tr-h2 tr-andy">{t.fishing.catches(db.catches.length)}</h2>
          <p className="tr-hint">{t.fishing.catchesHint}</p>
          <ul className="tr-catches">
            <LazyRows
              items={db.catches}
              rowHeight={TR_CATCH_ROW}
              tag="li"
              chunk={24}
              eager
              render={([id, tier, where], i) => {
                const r = db.refs[String(id)];
                return (
                  <li className="tr-catch" key={`${id}-${i}`}>
                    <RouteLink className="tr-ref" to={itemRoute(route, r[0])} onNavigate={navigate} prefetch="press">
                      <Slot size={36}>{!skipSprite(i, 24) && <Sprite id={id} w={r[5]} h={r[6]} max={28} />}</Slot>
                      <span style={rare(r[4])}>{(lang === "es" && r[3]) || r[2]}</span>
                    </RouteLink>
                    <em>{where ? (lang === "es" && where[1]) || where[0] : t.fishing.anywhere}</em>
                    {tier && <small>{t.items.sources.tiers[tier]}</small>}
                  </li>
                );
              }}
            />
          </ul>
        </section>
        <section className="tr-dug">
          <h2 className="tr-h2 tr-andy">{t.fishing.poles}</h2>
          <p className="tr-hint">{t.fishing.polesHint}</p>
          {list(db.poles)}
        </section>
        <section className="tr-dug">
          <h2 className="tr-h2 tr-andy">{t.fishing.baits}</h2>
          <p className="tr-hint">{t.fishing.baitsHint}</p>
          {list(db.baits)}
        </section>
        <section className="tr-dug">
          <h2 className="tr-h2 tr-andy">{t.fishing.crates}</h2>
          <p className="tr-hint">{t.fishing.cratesHint}</p>
          <h3 className="tr-label tr-gap">{t.bosses.pre}</h3>
          {list(db.crates)}
          <h3 className="tr-label tr-gap">{t.bosses.hard}</h3>
          {list(db.cratesHard)}
        </section>
        <section className="tr-dug">
          <h2 className="tr-h2 tr-andy">{t.fishing.quest(db.quest.length)}</h2>
          <p className="tr-hint">{t.fishing.questHint}</p>
          {list(db.quest)}
        </section>
      </div>
    </main>
  );
}
