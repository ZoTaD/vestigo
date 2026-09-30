/**
 * Runas (2026-09-29): las 33, con lo que da cada una engarzada en un arma, en
 * un yelmo o armadura y en un escudo; y la ficha de cada runa con las palabras
 * rúnicas que la usan (`/d2r/runes/ber`).
 */
import runesJson from "@d2r/wiki/runes.json";
import runewordsJson from "@d2r/wiki/runewords.json";
import { useLang } from "../i18n";
import RouteLink from "../RouteLink";
import type { Route } from "../route";
import { useD2rCopy } from "../d2rCopy";
import { describeProps, type Prop } from "./stats";
import { E, gameStr, tr, type Rune, type Runeword } from "./wiki";
import { runeShort } from "./runes";
import { BackLink, D2Head, ItemBox, ItemIcon } from "./ui";
import farmR from "@d2r/drops/computed/farm-r.json";
import FarmBlock from "./drops/FarmBlock";
import type { FarmFile } from "./drops/farm";

const RUNES = runesJson as unknown as Rune[];
const RUNEWORDS = runewordsJson as unknown as Runeword[];
/** Dónde farmear cada runa (por su código, "r24"), ya calculado: la ficha no carga el motor. */
const FARM = farmR as unknown as FarmFile;
const SLOTS = ["weapon", "helm", "shield"] as const;
type Nav = (r: Route) => void;

export default function D2rRunes({ route, navigate }: { route: Route; navigate: Nav }) {
  const rune = route.detail ? RUNES.find((r) => r.id === route.detail) : undefined;
  if (route.detail && rune) return <RuneDetail rune={rune} route={route} navigate={navigate} />;
  return <RuneList route={route} navigate={navigate} missing={!!route.detail} />;
}

function RuneList({ route, navigate, missing }: { route: Route; navigate: Nav; missing: boolean }) {
  const t = useD2rCopy();
  const { lang } = useLang();
  return (
    <>
      <D2Head as="h1" title={t.tabs.runes} lede={t.runesTab.lede} />
      {missing && <p className="d2-empty">{t.wiki.notFound}</p>}
      <div className="d2-rune-table" role="table">
        <div className="d2-rune-row is-head" role="row">
          <span role="columnheader">{t.tabs.runes}</span>
          {t.wiki.slotsLong.map((s) => (
            <span role="columnheader" key={s}>
              {s}
            </span>
          ))}
        </div>
        {RUNES.map((r, i) => (
          <RouteLink className="d2-rune-row" role="row" to={{ ...route, detail: r.id }} onNavigate={navigate} key={r.id}>
            <span className="d2-rune-who" role="cell">
              <ItemIcon asset={r.img} size="sm" />
              <span>
                <b className="d2-tone-rune">{tr(r.name, lang)}</b>
                <small>
                  #{i + 1} · {t.wiki.reqLevel} {r.lvl}
                </small>
              </span>
            </span>
            {SLOTS.map((slot, k) => (
              <span className="d2-rune-mods" role="cell" key={slot}>
                <i className="d2-rune-slot">{t.wiki.slotsShort[k]}</i>
                {describeProps(r.mods[slot] as Prop[], E, lang).join(" · ")}
              </span>
            ))}
          </RouteLink>
        ))}
      </div>
    </>
  );
}

function RuneDetail({ rune, route, navigate }: { rune: Rune; route: Route; navigate: Nav }) {
  const t = useD2rCopy();
  const { lang } = useLang();
  const uses = RUNEWORDS.filter((rw) => rw.runes.includes(rune.code)).sort((a, b) => a.lvl - b.lvl);
  const byCode = new Map(RUNES.map((r) => [r.code, r]));
  const idx = RUNES.indexOf(rune);
  return (
    <article className="d2-detail">
      <BackLink to={{ ...route, detail: undefined }} navigate={navigate} label={t.tabs.runes} />
      <div className="d2-detail-top">
        <ItemIcon asset={rune.img} size="lg" alt={tr(rune.name, lang)} />
        <div>
          <h1 className="d2-detail-h d2-tone-rune">{tr(rune.name, lang)}</h1>
          <p className="d2-detail-sub">
            #{idx + 1} · {gameStr("ItemStats1p", lang).replace("%d", String(rune.lvl))}
          </p>
        </div>
      </div>
      <ItemBox
        name={tr(rune.name, lang)}
        tone="rune"
        base={[gameStr("ItemStats1p", lang).replace("%d", String(rune.lvl))]}
        groups={SLOTS.map((slot, k) => ({ title: t.wiki.slotsLong[k], lines: describeProps(rune.mods[slot] as Prop[], E, lang) }))}
      />
      <FarmBlock entry={FARM[rune.code]} target={{ k: "b", code: rune.code }} route={route} />
      <nav className="d2-prevnext">
        {idx > 0 && (
          <RouteLink to={{ ...route, detail: RUNES[idx - 1].id }} onNavigate={navigate}>
            ← {tr(RUNES[idx - 1].name, lang)}
          </RouteLink>
        )}
        {idx < RUNES.length - 1 && (
          <RouteLink to={{ ...route, detail: RUNES[idx + 1].id }} onNavigate={navigate}>
            {tr(RUNES[idx + 1].name, lang)} →
          </RouteLink>
        )}
      </nav>
      <D2Head title={t.runesTab.usedIn} />
      {uses.length === 0 ? (
        <p className="d2-empty">{t.runesTab.none}</p>
      ) : (
        <ul className="d2-cards">
          {uses.map((rw) => (
            <li key={rw.id}>
              <RouteLink className="d2-card" to={{ ...route, d2Section: "runewords", detail: rw.id }} onNavigate={navigate}>
                <span className="d2-card-txt">
                  <b className="d2-tone-unique">{tr(rw.name, lang)}</b>
                  <small className="d2-rw-runes">
                    {rw.runes.map((c, i) => (
                      <span key={i} className={c === rune.code ? "is-this" : ""}>
                        {byCode.get(c) ? runeShort(byCode.get(c)!) : c}
                      </span>
                    ))}
                  </small>
                </span>
                <small className="d2-card-lvl">{rw.lvl}</small>
              </RouteLink>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
