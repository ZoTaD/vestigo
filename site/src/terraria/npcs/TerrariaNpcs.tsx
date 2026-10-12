/**
 * La pestaña NPC de Terraria (2026-10-12): la calculadora de felicidad. Se elige un bioma y quiénes viven juntos, y
 * sale el precio de la tienda de cada uno y si vende el pilón. Abajo, la tabla de qué prefiere cada NPC. Los datos
 * (`npcs.json`, 6 KB) viajan con el chunk de la pestaña; la cuenta vive en `happiness.ts`.
 */
import { useState } from "react";
import data from "@terraria/npcs.json";
import { useLang } from "../../i18n";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useTerrariaCopy } from "../../terrariaCopy";
import { itemRoute, type Nav } from "../ui";
import { moodOf, type Factor, type Level, type NpcData } from "./happiness";
import "../../styles/terraria-world.css";

const db = data as unknown as NpcData;
const LEVELS: Level[] = ["love", "like", "dislike", "hate"];

export default function TerrariaNpcs({ route, navigate }: { route: Route; navigate: Nav }) {
  const t = useTerrariaCopy();
  const { lang } = useLang();
  const li = lang === "es" ? 1 : 0;
  const [biome, setBiome] = useState("Forest");
  const [house, setHouse] = useState<number[]>([]);
  const toggle = (id: number) => setHouse((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id]));
  const name = (id: number) => db.npcs.find((n) => n.id === id)?.name[li] ?? "";
  const biomeName = (key: string) => db.biomes[key]?.name[li] ?? key;
  const pylon = db.biomes[biome]?.pylon ? db.refs[String(db.biomes[biome].pylon)] : undefined;

  const say = (f: Factor): string =>
    f.kind === "solitude"
      ? t.npcs.factors.solitude
      : f.kind === "crowd"
        ? t.npcs.factors.crowd(f.neighbors)
        : f.kind === "biome"
          ? t.npcs.factors.biome(t.npcs.levels[f.level], biomeName(biome))
          : t.npcs.factors.npc(t.npcs.levels[f.level], name(f.npc));
  const tone = (f: Factor): string => (f.kind === "solitude" ? "good" : f.kind === "crowd" ? "bad" : f.level === "love" || f.level === "like" ? "good" : "bad");

  return (
    <main className="tr-main tr-npcs">
      <div className="tr-wrap">
        <header className="tr-head">
          <h1 className="tr-h1 tr-andy">{t.npcs.h1}</h1>
          <p className="tr-lede">{t.npcs.lede}</p>
        </header>

        <section className="tr-dug">
          <h2 className="tr-label">{t.npcs.biome}</h2>
          <div className="tr-chips" role="group" aria-label={t.npcs.biome}>
            {Object.keys(db.biomes).map((key) => (
              <button type="button" className={`tr-chip${biome === key ? " is-on" : ""}`} aria-pressed={biome === key} onClick={() => setBiome(key)} key={key}>
                {biomeName(key)}
              </button>
            ))}
          </div>
          <h2 className="tr-label tr-gap">
            {t.npcs.who}
            {house.length > 0 && (
              <button type="button" className="tr-link" onClick={() => setHouse([])}>
                {t.npcs.clear}
              </button>
            )}
          </h2>
          <div className="tr-heads" role="group" aria-label={t.npcs.who}>
            {db.npcs.map((n) => (
              <button type="button" className={`tr-head-btn${house.includes(n.id) ? " is-on" : ""}`} aria-pressed={house.includes(n.id)} onClick={() => toggle(n.id)} key={n.id}>
                <img className="tr-sprite" src={`/terraria/npcs/${n.id}.png`} alt="" width={28} height={28} loading="lazy" decoding="async" />
                <span>{n.name[li]}</span>
              </button>
            ))}
          </div>
          <p className="tr-hint">{t.npcs.whoHint}</p>
        </section>

        <section className="tr-dug" aria-live="polite">
          <h2 className="tr-h2 tr-andy">{t.npcs.result}</h2>
          {house.length === 0 ? (
            <p>{t.npcs.empty}</p>
          ) : (
            <ul className="tr-moods">
              {house.map((id) => {
                const mood = moodOf(db, id, biome, house);
                return (
                  <li key={id} data-tone={mood.price < 1 ? "good" : mood.price > 1 ? "bad" : "flat"}>
                    <img className="tr-sprite" src={`/terraria/npcs/${id}.png`} alt="" width={28} height={28} loading="lazy" decoding="async" />
                    <b>{name(id)}</b>
                    <strong className="tr-andy">{Math.round(mood.price * 100)}%</strong>
                    <span className="tr-factors">
                      {mood.factors.map((f, i) => (
                        <em data-tone={tone(f)} key={i}>
                          {say(f)}
                        </em>
                      ))}
                    </span>
                    <span className="tr-pylon">{mood.pylon && pylon ? t.npcs.pylonYes(pylon[li ? 3 : 2]) : t.npcs.pylonNo}</span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="tr-hint">
            {t.npcs.pylonRule}{" "}
            {pylon && (
              <RouteLink className="tr-link" to={itemRoute(route, pylon[0])} onNavigate={navigate}>
                {pylon[li ? 3 : 2]}
              </RouteLink>
            )}
          </p>
        </section>

        <section className="tr-dug">
          <h2 className="tr-h2 tr-andy">{t.npcs.table}</h2>
          <div className="tr-table-wrap">
            <table className="tr-table">
              <thead>
                <tr>
                  <th scope="col">NPC</th>
                  <th scope="col">{t.npcs.tableBiomes}</th>
                  <th scope="col">{t.npcs.tableNpcs}</th>
                </tr>
              </thead>
              <tbody>
                {db.npcs.map((n) => (
                  <tr key={n.id}>
                    <th scope="row">
                      <img className="tr-sprite" src={`/terraria/npcs/${n.id}.png`} alt="" width={28} height={28} loading="lazy" decoding="async" />
                      {n.name[li]}
                    </th>
                    <td>
                      {LEVELS.flatMap((level) =>
                        Object.entries(n.biomes)
                          .filter(([, l]) => l === level)
                          .map(([key]) => (
                            <em data-tone={level === "love" || level === "like" ? "good" : "bad"} key={key}>
                              {t.npcs.factors.biome(t.npcs.levels[level], biomeName(key))}
                            </em>
                          )),
                      )}
                    </td>
                    <td>
                      {LEVELS.flatMap((level) =>
                        Object.entries(n.likes)
                          .filter(([, l]) => l === level)
                          .map(([other]) => (
                            <em data-tone={level === "love" || level === "like" ? "good" : "bad"} key={other}>
                              {t.npcs.factors.npc(t.npcs.levels[level], name(Number(other)))}
                            </em>
                          )),
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
