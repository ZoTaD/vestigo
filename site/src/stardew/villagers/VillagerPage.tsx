/**
 * La ficha de un aldeano de Stardew Valley (2026-10-22), en dos cajas del menú como la de Objetos: la cabecera (retrato
 * grande, nombre, cumpleaños, dónde vive y si se puede cortejar) y los regalos. Los regalos van por subsecciones sin
 * barras de color: primero "Regalos fáciles" (lo que le encanta y se cultiva o se compra), y después una fila de
 * casilleros por gusto (le encanta, le gusta, no le gusta, lo odia), cada casillero enlazado a su ficha de Objetos.
 *
 * Los gustos de un aldeano pueden pasar de 300 objetos: cada fila se dibuja de a tandas con `LazyRows`, y sólo la
 * primera con `eager` (regla 2 de CLAUDE.md).
 */
import type { CSSProperties } from "react";
import { useLang, useLocale } from "../../i18n";
import { LazyRows, skipSprite } from "../../LazyRows";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useStardewCopy, type Taste } from "../../stardewCopy";
import { giftIdeas, say, tasteRows, type Row, type Villager } from "../data";
import { Box, Slot, Sprite, type Nav } from "../ui";

const TASTES: Exclude<Taste, "neutral">[] = ["love", "like", "dislike", "hate"];
/** El alto de un casillero con su nombre (64 de casillero y hasta dos líneas), en px, medido en el navegador a 1.400 px (2026-10-22). */
const SD_GIFT = 99;
/** Cuántos objetos lleva una tanda: unas 4 filas. */
const SD_CHUNK = 40;

/** Las letras de la palabra más larga del nombre: el título se achica para que entre entera, sin cortarla. */
const longestWord = (name: string): number => Math.max(...name.split(/\s+/).map((w) => w.length), 1);

export default function VillagerPage({ villager, rows, route, navigate }: { villager: Villager; rows: Row[]; route: Route; navigate: Nav }) {
  const t = useStardewCopy();
  const c = t.villagers;
  const { lang } = useLang();
  const locale = useLocale();
  const name = say(villager.name, lang);
  const region = c.regions[villager.region];
  const easy = giftIdeas(villager, rows);
  const lists = TASTES.map((g) => ({ taste: g, rows: tasteRows(villager, g, rows) })).filter((l) => l.rows.length > 0);

  /** Un objeto como casillero con su nombre, enlazado a su ficha. `index` es la posición en su fila (para el prerender). */
  const gift = (r: Row, index: number) => (
    <li key={r.id}>
      <RouteLink className="sd-cell sd-gift" to={{ ...route, view: "stardew", sdSection: "items", detail: r.slug }} onNavigate={navigate} prefetch="press" title={r.name}>
        <Slot>{!skipSprite(index, SD_CHUNK) && <Sprite id={r.id} w={r.w} h={r.h} size={48} />}</Slot>
        <span>{r.name}</span>
      </RouteLink>
    </li>
  );

  return (
    <main className="sd-main sd-ficha sd-vficha">
      <RouteLink className="sd-back" to={{ ...route, view: "stardew", sdSection: "villagers", detail: undefined }} onNavigate={navigate}>
        ← {c.back}
      </RouteLink>

      <Box className="sd-top">
        <div className="sd-head">
          <span className="sd-slot sd-slot-big">
            <img className="sd-portrait-big" src={`/stardew/portraits/${villager.key.toLowerCase()}.png`} alt="" width={96} height={96} decoding="async" />
          </span>
          <div className="sd-title">
            <h1 className="sd-h1 sd-name" style={{ "--sd-word": longestWord(name) } as CSSProperties}>
              {name}
            </h1>
            <ul className="sd-tags">
              <li>
                {c.birthdayLabel}: {c.birthday(t.seasons[villager.birthday[0]], villager.birthday[1])}
              </li>
              {region && (
                <li>
                  {c.region}: {region}
                </li>
              )}
              {villager.romance && <li className="sd-tag-food">{c.romanceable}</li>}
            </ul>
          </div>
        </div>
      </Box>

      {(easy.length > 0 || lists.length > 0) && (
        <Box className="sd-cross">
          {easy.length > 0 && (
            <section className="sd-sec sd-easy" aria-labelledby="sd-easy-h">
              <h2 className="sd-h2" id="sd-easy-h">
                {c.easyTitle}
              </h2>
              <p className="sd-muted">{c.easyHint}</p>
              <ul className="sd-gifts-grid">{easy.map((r, i) => gift(r, i))}</ul>
            </section>
          )}
          {lists.map((l, n) => (
            <section className="sd-sec sd-taste" data-taste={l.taste} key={l.taste}>
              <h2 className="sd-h2">{c.tasteHeads[l.taste]}</h2>
              <p className="sd-muted">{c.tasteCount(l.rows.length.toLocaleString(locale))}</p>
              <ul className="sd-gifts-grid">
                <LazyRows items={l.rows} rowHeight={SD_GIFT} chunk={SD_CHUNK} tag="li" eager={n === 0} margin={400} render={gift} />
              </ul>
            </section>
          ))}
        </Box>
      )}
    </main>
  );
}
