/**
 * El Cubo horádrico (2026-09-29): todas las recetas del juego (`cubemain.txt`),
 * por grupo, con los nombres oficiales de cada ingrediente, sus calidades y, en
 * los objetos creados, las stats que agrega la receta (con el mismo motor que
 * las fichas).
 */
import { useMemo, useState } from "react";
import cubeJson from "@d2r/wiki/cube.json";
import { useLang, useLocale } from "../i18n";
import type { Route } from "../route";
import { useD2rCopy } from "../d2rCopy";
import { describeProps, type Loc, type Prop } from "./stats";
import { E, tr } from "./wiki";
import { Chips, D2Head, ItemIcon, SearchBox, fold } from "./ui";

interface Token {
  code: string;
  qty: number;
  quals: string[];
  kind: "item" | "type" | "unique" | "special" | "useitem" | "usetype";
  name?: Loc;
  img?: string | null;
}
interface Recipe {
  id: number;
  group: string;
  in: Token[];
  out: Token;
  desc: string;
  family: string | null;
  mods: Prop[];
  hell: boolean;
}

const RECIPES = cubeJson as unknown as Recipe[];
const GROUPS = ["runes", "gems", "crafted", "sockets", "upgrade", "reroll", "repair", "portals", "potions", "misc"];

export default function D2rCube(_: { route: Route; navigate: (r: Route) => void }) {
  const t = useD2rCopy();
  const tc = t.cube;
  const { lang } = useLang();
  const locale = useLocale();
  const [group, setGroup] = useState("all");
  const [q, setQ] = useState("");

  // Las calidades de un ingrediente o del resultado, en palabras ("mágico, sin engarces").
  const quals = (tok: Token) =>
    tok.quals
      .map((x) => {
        const [k, v] = x.split("=");
        if (k === "sock" && v) return tc.sockets(Number(v));
        if (k === "lvl") return "";
        return tc.quals[k] ?? "";
      })
      .filter(Boolean)
      .join(", ");
  const name = (tok: Token) => {
    if (tok.kind === "useitem") return tc.useitem;
    if (tok.kind === "usetype") return tc.usetype;
    if (tok.kind === "special") return tc.special[tok.code] ?? tok.code;
    return tr(tok.name, lang) || tok.code;
  };
  const line = (tok: Token) => {
    const qs = quals(tok);
    return `${tok.qty > 1 ? `${tok.qty} × ` : ""}${name(tok)}${qs ? ` (${qs})` : ""}`;
  };

  const shown = useMemo(() => {
    const needle = fold(q.trim());
    return RECIPES.filter(
      (r) => (group === "all" || r.group === group) && (!needle || [...r.in, r.out].some((tok) => fold(line(tok)).includes(needle)) || fold(r.desc).includes(needle)),
    );
    // `line` depende del idioma, que ya está en las dependencias por `lang`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group, q, lang]);

  return (
    <>
      <D2Head as="h1" title={t.tabs.cube} lede={tc.lede(RECIPES.length.toLocaleString(locale))} />
      <div className="d2-filters">
        <SearchBox value={q} onChange={setQ} placeholder={t.wiki.search} />
        <Chips<string> label={t.tabs.cube} value={group} onChange={setGroup} options={[{ value: "all", label: t.wiki.all }, ...GROUPS.map((g) => ({ value: g, label: tc.groups[g] }))]} />
      </div>
      {GROUPS.map((g) => {
        const inGroup = shown.filter((r) => r.group === g);
        if (!inGroup.length) return null;
        return (
          <section className="d2-cat" key={g}>
            <h2 className="d2-cat-h">
              {tc.groups[g]} <small>{inGroup.length}</small>
            </h2>
            <ul className="d2-cube">
              {inGroup.map((r) => (
                <li className="d2-recipe" key={r.id}>
                  <div className="d2-recipe-in">
                    {r.in.map((tok, i) => (
                      <span className="d2-recipe-tok" key={i}>
                        {tok.img && <ItemIcon asset={tok.img} size="sm" />}
                        <span>{line(tok)}</span>
                      </span>
                    ))}
                  </div>
                  <span className="d2-recipe-arrow" aria-hidden="true">
                    →
                  </span>
                  <div className="d2-recipe-out">
                    <span className="d2-recipe-tok is-out">
                      {r.out.img && <ItemIcon asset={r.out.img} size="sm" />}
                      <b>
                        {r.family ? `${line(r.out)} · ${tc.families[r.family]}` : line(r.out)}
                      </b>
                    </span>
                    {r.hell && <em className="d2-badge">{tc.hell}</em>}
                    {r.mods.length > 0 && (
                      <ul className="d2-box-lines d2-tone-magic d2-recipe-mods">
                        {describeProps(r.mods, E, lang).map((l, i) => (
                          <li key={i}>{l}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {shown.length === 0 && <p className="d2-empty">{t.wiki.noResults}</p>}
    </>
  );
}
