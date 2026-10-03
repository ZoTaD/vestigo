/**
 * La ficha de un objeto de Project Zomboid (2026-09-30), como una página de la libreta: la cabecera con el ícono, el
 * nombre y los IDs para copiar; las variantes si hay más de una; los números en renglones; y una hoja por cada relación
 * (dónde aparece, recetas que lo fabrican, lo usan o lo piden de herramienta, con qué se repara, qué repara, qué
 * enseña), cada una con su sello.
 *
 * "Enseña" muestra todas las recetas que el libro o la revista nombra, aunque unas pocas (10, en 5 revistas de herrería
 * y de moda) se sepan desde el principio. No se marcan: saberlo pide el archivo de cada receta, una descarga más por
 * enlace (hasta 19 en una revista), y la ficha de la receta ya lo dice. Si hace falta, site.py puede anotarlo en el
 * enlace (`known`) y acá sería un renglón.
 */
import meta from "@zomboid/meta.json";
import RouteLink from "../../RouteLink";
import { useLang, useLocale } from "../../i18n";
import type { Route } from "../../route";
import { tidyTitleName, useZomboidCopy, type PzItemsCopy } from "../../zomboidCopy";
import type { FixedWith, ItemFicha as Ficha, Ref } from "./data";
import { statRows, variantDiffs, weightText, type StatRow } from "./stats";
import { Collapse, CopyButton, gameLines, ItemIcon, Stamp, wordFit } from "../ui";
import WhereFound from "./WhereFound";
import CraftLink from "../crafting/link";
import { ChangesSlot } from "../patches/changes";

type Nav = (r: Route) => void;
type Lang = "en" | "es";

export default function ItemFicha({ ficha, route, navigate }: { ficha: Ficha; route: Route; navigate: Nav }) {
  const t = useZomboidCopy().items;
  const { lang } = useLang();
  const locale = useLocale();
  // El peso como en la lista (tres decimales): con dos, una gema decía "0" acá y "0,001" allá.
  const weight = (w: number) => weightText(w, locale);
  const first = ficha.variants[0];
  // Sin los espacios de más que traen algunos nombres del juego (Puntería IV: " Tácticas…"), como en el <head>.
  const name = tidyTitleName(ficha[lang]);
  const other = ficha[lang === "es" ? "en" : "es"];
  const command = `/additem "${t.user}" ${first.gameId}`;
  const extra = { book: ficha.skillBook, ammo: ficha.ammo, magazine: ficha.magazine };
  const perVariant = ficha.variants.map((v) => statRows(v, t, lang, locale, extra));
  const diffs = variantDiffs(perVariant);
  const hasStats = perVariant.some((rows) => rows.length > 0);
  const toList: Route = { ...route, view: "zomboid", pzSection: "items", detail: undefined };
  const toRecipe = (id: string): Route => ({ ...route, view: "zomboid", pzSection: "recipes", detail: id });
  const toItem = (id: string): Route => ({ ...route, view: "zomboid", pzSection: "items", detail: id });
  // Los datos vienen ordenados por slug (el inglés): en español eso se lee desordenado. Se ordenan por el nombre que se
  // ve, salvo "Enseña", que sigue el orden del libro.
  const collator = new Intl.Collator(locale);
  const byName = (refs: Ref[]) => [...refs].sort((a, b) => collator.compare(a[lang], b[lang]));
  const recipes = (refs: Ref[], keepOrder = false) => (
    <Links refs={keepOrder ? refs : byName(refs)} to={toRecipe} navigate={navigate} lang={lang} t={t} />
  );
  const items = (refs: Ref[]) => <Links refs={byName(refs)} to={toItem} navigate={navigate} lang={lang} t={t} icons />;

  return (
    <main className="pz-main pzi pzi-ficha">
      <nav className="pzi-crumb">
        <RouteLink to={toList} onNavigate={navigate}>
          ← {t.back}
        </RouteLink>
      </nav>

      <section className="pz-page pzi-head">
        <span className="pz-clip" />
        <div className="pzi-headmain">
          <ItemIcon icon={first.icon} size={64} lazy={false} />
          <div className="pzi-titles">
            <p className="pzi-kick">
              {ficha.catName[lang]} · Build {meta.version}
            </p>
            {/* El tamaño sale de su palabra más larga: "Telecomunicaciones" entra entera en un celular. */}
            <h1 className="pzi-h1" style={wordFit(name)}>
              {name}
            </h1>
            {other !== name && <p className="pzi-hand">{t.otherName(other)}</p>}
          </div>
        </div>
        {/* 58 notas del juego traen `<br>` literales: van como saltos de línea, no como texto. */}
        {first.tip && <p className="pzi-tip">{gameLines(first.tip[lang])}</p>}
        <dl className="pzi-ids">
          <div>
            <dt>{t.idTitle}</dt>
            <dd>
              <code>{first.gameId}</code>
              <CopyButton text={first.gameId} label={t.copy} done={t.copied} what={`${t.cols.id} ${first.gameId}`} />
            </dd>
          </div>
          <div>
            <dt>{t.command}</dt>
            <dd>
              <code>{command}</code>
              <CopyButton text={command} label={t.copy} done={t.copied} what={`${t.command.toLowerCase()} ${command}`} />
            </dd>
          </div>
          {first.w !== null && (
            <div>
              <dt>{t.weight}</dt>
              <dd className="pzi-num">{weight(first.w)}</dd>
            </div>
          )}
        </dl>
      </section>

      {ficha.variants.length > 1 && (
        <section className="pz-page pzi-variants">
          <h2 className="pzi-h2">
            <Stamp name="columns" />
            {t.variantsTitle} <small>{ficha.variants.length}</small>
            {/* "Mismos números" sólo si hay números: sin ninguno (un mueble) no hay nada que comparar. */}
            {hasStats && !diffs.length && <span className="pzi-hand">{t.sameStats}</span>}
          </h2>
          <div className="pzi-tablebox">
            <table className="pzi-table">
              <thead>
                <tr>
                  <th scope="col">{t.cols.name}</th>
                  <th scope="col">{t.cols.id}</th>
                  <th scope="col">{t.cols.weight}</th>
                  {diffs.length > 0 && <th scope="col">{t.cols.diff}</th>}
                </tr>
              </thead>
              <tbody>
                {ficha.variants.map((v, i) => (
                  <tr key={v.gameId}>
                    <td>
                      <span className="pzi-cellname">
                        <ItemIcon icon={v.icon} />
                        {v[lang]}
                      </span>
                    </td>
                    <td>
                      <span className="pzi-cellid">
                        <code>{v.gameId}</code>
                        <CopyButton text={v.gameId} label={t.copy} done={t.copied} what={`${t.cols.id} ${v.gameId}`} />
                      </span>
                    </td>
                    <td className="pzi-num">{v.w === null ? "—" : weight(v.w)}</td>
                    {diffs.length > 0 && (
                      <td>
                        {perVariant[i]
                          .filter((r) => diffs.includes(r.id))
                          .map((r) => `${r.label} ${r.value}`)
                          .join(" · ") || "—"}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Los números a la izquierda y las relaciones apiladas a la derecha: se leen en orden (qué es, de dónde sale, para
          qué sirve). Sin números (un mueble), las relaciones ocupan todo el ancho. */}
      <div className={`pzi-sheets${perVariant[0].length ? "" : " is-wide"}`}>
        {perVariant[0].length > 0 && (
          <section className="pz-page pzi-stats">
            <h2 className="pzi-h2">
              <Stamp name="target" />
              {t.statsTitle}
            </h2>
            {diffs.length > 0 && <p className="pzi-hand">{t.firstVariant}</p>}
            <StatLines rows={perVariant[0]} to={toItem} navigate={navigate} />
          </section>
        )}
        <div className="pzi-relcol">
          {/* Primero de dónde sale (lo que más se busca de un objeto), después cómo se fabrica y para qué sirve. */}
          <WhereFound slug={ficha.id} route={route} navigate={navigate} />
          <Rel title={t.rel.makes} stamp="hammer" n={ficha.makes.length}>
            {recipes(ficha.makes)}
            {/* Lo que sigue a "cómo se fabrica": el árbol entero y qué juntar, con este objeto ya pedido. */}
            <CraftLink className="pzi-craftlink" route={route} navigate={navigate} st={{ q: [{ id: ficha.id, qty: 1 }] }}>
              {t.craftLink}
            </CraftLink>
          </Rel>
          <Rel title={t.rel.uses} stamp="gears" n={ficha.uses.length}>{recipes(ficha.uses)}</Rel>
          <Rel title={t.rel.tools} stamp="wrench" n={ficha.tools.length}>{recipes(ficha.tools)}</Rel>
          <Rel title={t.rel.fixedWith} stamp="medcross" n={ficha.fixedWith.length}>
            <FixList fixes={ficha.fixedWith} to={toItem} navigate={navigate} lang={lang} t={t} />
          </Rel>
          <Rel title={t.rel.fixes} stamp="checkmark" n={ficha.fixes.length}>{items(ficha.fixes)}</Rel>
          <Rel title={t.rel.teaches} stamp="book" n={ficha.teaches.length}>{recipes(ficha.teaches, true)}</Rel>
          <Rel title={t.rel.research} stamp="lightbulb" n={ficha.research.length}>{recipes(ficha.research)}</Rel>
        </div>
      </div>
      <ChangesSlot
        kind="items"
        changes={ficha.changes}
        route={route}
        navigate={navigate}
        variants={ficha.variants.map((v) => ({ gameId: v.gameId, name: { en: v.en, es: v.es } }))}
      />
    </main>
  );
}

/**
 * Los números en renglones de libreta: la etiqueta a la izquierda, la cifra a la derecha. Un renglón que es otro objeto
 * (la bala de un arma, su cargador) va como enlace a su ficha, sin ícono: uno de 32 px rompería los renglones de 28.
 */
function StatLines({ rows, to, navigate }: { rows: StatRow[]; to: (id: string) => Route; navigate: Nav }) {
  return (
    <dl className="pzi-lines">
      {rows.map((r) => (
        <div key={r.id}>
          <dt>{r.label}</dt>
          <dd>
            {r.ref ? (
              <RouteLink className="pzi-statlink" to={to(r.ref.id)} onNavigate={navigate}>
                {r.value}
              </RouteLink>
            ) : (
              r.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Una hoja de relación con su sello; no se dibuja si no hay nada que anotar. */
function Rel({ title, stamp, n, children }: { title: string; stamp: string; n: number; children: React.ReactNode }) {
  if (!n) return null;
  return (
    <section className="pz-page pzi-rel">
      <h2 className="pzi-h2">
        <Stamp name={stamp} />
        {title} <small>{n}</small>
      </h2>
      {children}
    </section>
  );
}

type LinkProps = { to: (id: string) => Route; navigate: Nav; lang: Lang; t: PzItemsCopy };

/**
 * Los enlaces de una relación: los primeros a la vista, el resto en un desplegable. Precargan al apretar y no al pasar
 * el mouse, como las filas de la lista (ver `prefetch` en RouteLink): una relación puede tener decenas de recetas.
 */
function Links({ refs, icons, ...p }: LinkProps & { refs: Ref[]; icons?: boolean }) {
  const li = (r: Ref) => (
    <li key={r.id}>
      <RouteLink to={p.to(r.id)} onNavigate={p.navigate} prefetch="press">
        {icons && <ItemIcon icon={r.icon} />}
        <span>{r[p.lang]}</span>
      </RouteLink>
    </li>
  );
  return <Collapse items={refs} render={li} more={p.t.more} />;
}

/** Con qué se repara: el objeto, cuánto se gasta de él y la habilidad que pide. */
function FixList({ fixes, ...p }: LinkProps & { fixes: FixedWith[] }) {
  const li = (f: FixedWith, i: number) => (
    <li key={`${f.fixer.id}-${i}`}>
      <RouteLink to={p.to(f.fixer.id)} onNavigate={p.navigate} prefetch="press">
        <ItemIcon icon={f.fixer.icon} />
        <span>{f.fixer[p.lang]}</span>
      </RouteLink>
      <span className="pzi-meta">
        {[p.t.fixUses(String(f.uses)), ...f.skills.map((s) => `${s.skill[p.lang]} ${s.lvl}`)].join(" · ")}
      </span>
    </li>
  );
  return <Collapse items={fixes} render={li} more={p.t.more} />;
}
