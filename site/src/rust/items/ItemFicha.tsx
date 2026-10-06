/**
 * La ficha de un objeto de Rust (2026-10-05). Arriba, el ícono en su casillero, el nombre y la descripción oficiales y
 * los datos para copiar (shortname, itemid, comando de admin). Después, cada sección sólo si tiene algo: crafteo, se usa
 * en, reciclaje (en las cuatro recicladoras), dónde aparece y dónde comprarlo.
 */
import { useState, type CSSProperties, type ReactNode } from "react";
import { useLang, useLocale } from "../../i18n";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useRustCopy } from "../../rustCopy";
import { say, type Ficha, type Ref } from "./data";
import { ContentsSection, LootSection } from "./FichaLoot";
import { BuildingSection, DetectedSection, ObtainSection, RepairSection, SkinsSection, TurnsSection, UseSection } from "./FichaMore";
import RaidBlocks from "./RaidBlocks";
import RecycleSection, { RecycledFrom } from "./FichaRecycle";
import { ShopsSection } from "./FichaShops";
import { craftTimes, formatDuration, longestWord } from "./format";

type Nav = (r: Route) => void;

export default function ItemFicha({ ficha, route, navigate }: { ficha: Ficha; route: Route; navigate: Nav }) {
  const t = useRustCopy().items;
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);
  const name = say(ficha.name, lang);
  const desc = say(ficha.desc, lang);
  const link = (r: Ref, children: ReactNode) =>
    r.slug ? (
      <RouteLink className="rs-ref" to={{ ...route, view: "rust", rsSection: "items", detail: r.slug }} onNavigate={navigate}>
        {children}
      </RouteLink>
    ) : (
      <span className="rs-ref">{children}</span>
    );
  const icon = (id: string, size = 40) => <img src={`/rust/items/${id}.webp`} alt="" width={size} height={size} />;
  const command = `inventory.give ${ficha.id} 1`;
  const c = ficha.craft;
  return (
    <main className="rs-main rs-ficha">
      <RouteLink className="rs-back" to={{ ...route, view: "rust", rsSection: "items", detail: undefined }} onNavigate={navigate}>
        ← {t.back}
      </RouteLink>
      <section className="rs-pnl rs-ficha-top">
        <span className="rs-slot rs-slot-big">{icon(ficha.id, 128)}</span>
        <div className="rs-title">
          <p className="rs-hd">{t.cats[ficha.cat] ?? ficha.cat}</p>
          <h1 className="rs-h1" style={{ "--rs-word": longestWord(name) } as CSSProperties}>
            {name}
          </h1>
          {desc && <p className="rs-lede">{desc}</p>}
        </div>
        <dl className="rs-facts">
          <Copyable label={t.shortname} value={ficha.id} />
          <Copyable label={t.itemid} value={String(ficha.itemid)} />
          <Copyable label={t.command} value={command} />
          <div>
            <dt>{t.stack}</dt>
            <dd>{num(ficha.stack)}</dd>
          </div>
          <div>
            <dt>{t.despawn}</dt>
            <dd>{formatDuration(ficha.despawn)}</dd>
          </div>
          {ficha.condition && (
            <div>
              <dt>{t.condition}</dt>
              <dd>
                {num(ficha.condition.max)} · {ficha.condition.repairable ? t.repairable : t.notRepairable}
              </dd>
            </div>
          )}
        </dl>
      </section>

      <UseSection ficha={ficha} route={route} navigate={navigate} />

      {c && (
        <section className="rs-pnl">
          <h2 className="rs-hd">{t.craft}</h2>
          <ul className="rs-ings">
            {c.ingredients.map((g) => (
              <li key={g.id}>
                {link(g, <>
                  <span className="rs-slot">{icon(g.id)}<b className="rs-qty">{num(g.amount)}</b></span>
                  <span>{say(g.name, lang)}</span>
                </>)}
              </li>
            ))}
          </ul>
          <p className="rs-meta">
            <span>{t.gives(c.amount)}</span>
            {craftTimes(c.time, c.workbench).map(({ bench, seconds }) => (
              <span key={bench}>
                {bench ? t.workbench(bench) : t.noWorkbench}: {t.seconds(num(seconds))}
              </span>
            ))}
            {c.researchScrap !== null && <span>{t.research(num(c.researchScrap))}</span>}
            {c.default && <span>{t.defaultBp}</span>}
          </p>
        </section>
      )}

      {ficha.usedIn.length > 0 && (
        <section className="rs-pnl">
          <h2 className="rs-hd">{t.usedIn}</h2>
          <ul className="rs-refs">
            {ficha.usedIn.map((u) => (
              <li key={u.id}>{link(u, <>{icon(u.id, 32)}<span>{say(u.name, lang)}</span></>)}</li>
            ))}
          </ul>
        </section>
      )}

      <RecycleSection ficha={ficha} route={route} navigate={navigate} />
      <RecycledFrom ficha={ficha} route={route} navigate={navigate} />

      <LootSection ficha={ficha} route={route} navigate={navigate} />
      <ContentsSection ficha={ficha} route={route} navigate={navigate} />
      <ObtainSection ficha={ficha} route={route} navigate={navigate} />
      <TurnsSection ficha={ficha} route={route} navigate={navigate} />

      <ShopsSection ficha={ficha} route={route} navigate={navigate} />
      <BuildingSection ficha={ficha} route={route} navigate={navigate} />
      <RaidBlocks itemId={ficha.id} route={route} />
      <DetectedSection ficha={ficha} route={route} navigate={navigate} />
      <RepairSection ficha={ficha} route={route} navigate={navigate} />
      <SkinsSection ficha={ficha} />
    </main>
  );
}

/** Un dato con botón de copiar. Sin JS (el prerender) se ve el texto, que se puede seleccionar igual. */
function Copyable({ label, value }: { label: string; value: string }) {
  const t = useRustCopy().items;
  const [done, setDone] = useState(false);
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        <code>{value}</code>
        <button
          type="button"
          className="rs-copy"
          aria-label={`${t.copy}: ${label}`}
          onClick={() => {
            navigator.clipboard?.writeText(value).then(() => {
              setDone(true);
              window.setTimeout(() => setDone(false), 1500);
            }, () => undefined);
          }}
        >
          {done ? t.copied : t.copy}
        </button>
        {/* El botón cambia de texto pero conserva su `aria-label`: el aviso de "Copiado" va aparte, para el lector. */}
        <span className="rs-sr" aria-live="polite">
          {done ? t.copied : ""}
        </span>
      </dd>
    </div>
  );
}
