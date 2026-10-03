/**
 * La ficha de una habilidad de Project Zomboid (2026-09-30), como una página de la libreta: la cabecera con el sello de
 * su categoría, su nombre y cuánta XP pide de 0 a 10; la calculadora a lo ancho, que es para lo que se viene; y debajo,
 * a la izquierda la XP por nivel y los rasgos y profesiones que la suben, y a la derecha los libros por tramo
 * (enlazados a Objetos) con su multiplicador, las revistas, los VHS y los programas de TV.
 *
 * La calculadora arranca con "de 0 (o 5) a 10, sin bonificación y leyendo los libros", que es lo que sale en el HTML
 * prerenderizado; lo que se elige vive en el componente (no en la dirección: no hay nada que compartir que no se arme en
 * dos clics). Las cuentas son de `calc.ts`.
 */
import { useId, useState, type ReactNode } from "react";
import meta from "@zomboid/meta.json";
import RouteLink from "../../RouteLink";
import { useLang, useLocale, type Lang } from "../../i18n";
import type { PzTab, Route } from "../../route";
import { findTrait, signed, TRAITS, type Trait } from "../traits/data";
import { Collapse, ItemIcon, Stamp, wordFit } from "../ui";
import { bookFor, ceilXp, charMult, MAX_LEVEL, roundEarn, withBooks, xpNeeded } from "./calc";
import { useSkillsCopy } from "./copy";
import { catStamp, startLevel, type SkillData, type SkillLink, type SkillMedia } from "./data";
import { ChangesSlot } from "../patches/changes";

type Nav = (r: Route) => void;

/** Los rasgos que multiplican la XP de una habilidad (Aprendiz rápido y lento en casi todas, Pacifista, Ingenioso). */
const multTraits = (skill: SkillData): Trait[] => TRAITS.filter((t) => t.xpMult?.some((m) => m.skills.includes(skill.id)));
const multOf = (t: Trait, skill: SkillData): number =>
  (t.xpMult ?? []).filter((m) => m.skills.includes(skill.id)).reduce((p, m) => p * m.mult, 1);

export default function SkillFicha({ skill, route, navigate }: { skill: SkillData; route: Route; navigate: Nav }) {
  const t = useSkillsCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);
  const name = skill[lang];
  const other = skill[lang === "es" ? "en" : "es"];
  const toList: Route = { ...route, view: "zomboid", pzSection: "skills", detail: undefined };
  const to = (sec: PzTab, id: string): Route => ({ ...route, view: "zomboid", pzSection: sec, detail: id });
  const start = startLevel(skill);
  const vhs = skill.media.filter((m) => m.kind === "vhs");
  const tv = skill.media.filter((m) => m.kind === "tv");

  return (
    <main className="pz-main pzi pzi-ficha pzs">
      <nav className="pzi-crumb">
        <RouteLink to={toList} onNavigate={navigate}>
          ← {t.back}
        </RouteLink>
      </nav>

      <section className="pz-page pzi-head pzs-head">
        <span className="pz-clip" />
        <div className="pzi-headmain">
          <span className="pzs-seal" aria-hidden="true">
            <Stamp name={catStamp(skill.cat.id)} />
          </span>
          <div className="pzi-titles">
            <p className="pzi-kick">{t.kicker(meta.version)}</p>
            <h1 className="pzi-h1" style={wordFit(name)}>
              {name}
            </h1>
            <p className="pzi-hand">{t.otherName(other)}</p>
          </div>
        </div>
        <p className="pzs-meta">
          <span>{skill.cat[lang]}</span>
          <span>{t.zeroToTen(num(xpNeeded(skill, 0, MAX_LEVEL)))}</span>
          {start > 0 && <span>{t.startsAt(start)}</span>}
        </p>
      </section>

      <Calculator skill={skill} />

      <div className="pzi-sheets">
        <div className="pzi-relcol">
          <Sheet cls="pzs-xp" stamp="arrownorth" title={t.xpTitle}>
            <XpTable skill={skill} />
          </Sheet>
          {/* Acá y no al final de la otra columna: la tabla es corta y los libros, revistas y VHS, largos. */}
          <Who skill={skill} to={to} navigate={navigate} lang={lang} />
        </div>
        <div className="pzi-relcol">
          <Sheet cls="pzs-books" stamp="book" title={t.booksTitle} n={skill.books.length || undefined}>
            {skill.books.length ? (
              <>
                <ul className="pzi-links pzs-booklist">
                  {skill.books.map((b) => (
                    <li key={b.item.id}>
                      <RouteLink to={to("items", b.item.id)} onNavigate={navigate}>
                        <ItemIcon icon={b.item.icon} />
                        <span>{b.item[lang]}</span>
                      </RouteLink>
                      <span className="pzi-meta">
                        {t.levels(b.from, b.to)} · ×{num(b.mult)}
                      </span>
                      <span className="pzs-note">{t.readFrom(b.from - 1)}</span>
                    </li>
                  ))}
                </ul>
                <p className="pzs-note">{t.booksNote}</p>
              </>
            ) : (
              <p className="pzs-note">{t.noBooks}</p>
            )}
          </Sheet>

          {skill.magazines.length > 0 && (
            <Sheet cls="pzs-mags" stamp="star" title={t.magazinesTitle} n={skill.magazines.length}>
              <p className="pzs-note">{t.magazinesNote}</p>
              <Collapse
                items={skill.magazines}
                more={t.more}
                shown={8}
                render={(m) => (
                  <li key={m.id}>
                    <RouteLink to={to("items", m.id)} onNavigate={navigate}>
                      <ItemIcon icon={m.icon} />
                      <span>{m[lang]}</span>
                    </RouteLink>
                  </li>
                )}
              />
            </Sheet>
          )}

          {vhs.length > 0 && (
            <Sheet cls="pzs-media" stamp="vhs" title={t.mediaTitle} n={vhs.length}>
              <ul className="pzs-medialist">
                {vhs.map((m) => (
                  <li key={m.id}>
                    <span>{m[lang]}</span>
                    <b>{m.shared ? t.mediaUpTo(num(m.xp)) : t.mediaXp(num(m.xp))}</b>
                  </li>
                ))}
              </ul>
              <p className="pzs-note">{t.mediaNote(meta.mediaXpCutoff)}</p>
            </Sheet>
          )}

          {tv.length > 0 && <TvSheet shows={tv} />}
        </div>
      </div>
      <ChangesSlot kind="skills" changes={skill.changes} route={route} navigate={navigate} />
    </main>
  );
}

/** Una hoja de la ficha con su sello y, si es una lista, cuántos tiene. */
function Sheet({ cls, stamp, title, n, children }: { cls: string; stamp: string; title: string; n?: number; children: ReactNode }) {
  return (
    <section className={`pz-page pzi-rel ${cls}`}>
      <h2 className="pzi-h2">
        <Stamp name={stamp} />
        {title}
        {n !== undefined && <small>{n}</small>}
      </h2>
      {children}
    </section>
  );
}

/** "12:00", "0:00": la hora de un programa, en el reloj de 24 horas (minutos desde la medianoche; 1440 es 0:00). */
const clock = (min: number): string => `${Math.floor(min / 60) % 24}:${String(min % 60).padStart(2, "0")}`;

/**
 * Los programas de TV que dan XP de la habilidad, agrupados por canal (en la 42.21, sólo Life and Living TV): cada
 * emisión con su día y su horario, y el total del canal con "hasta", porque cada programa sale una sola vez y hay que
 * agarrarlos todos. El del día 1 que termina antes de la hora de arranque por defecto va con su aviso y no suma al
 * total: en una partida normal no se ve (Pesca: 550, no 850).
 */
function TvSheet({ shows }: { shows: SkillMedia[] }) {
  const t = useSkillsCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);
  const channels = [...new Set(shows.map((m) => m.en))];
  const startMin = meta.gameStartMinute as number | null;
  return (
    <Sheet cls="pzs-tv" stamp="satellite" title={t.tvTitle} n={shows.length}>
      {channels.map((ch) => {
        const mine = shows.filter((m) => m.en === ch);
        return (
          <div key={ch}>
            <h3 className="pzs-h3">{mine[0][lang]}</h3>
            <ul className="pzs-medialist">
              {mine.map((m) => (
                <li key={m.id}>
                  <span>
                    {t.tvWhen(m.day ?? 1, clock(m.start ?? 0), clock(m.end ?? 0))}
                    {m.beforeStart && startMin !== null && <small className="pzs-before"> {t.tvBeforeStart(clock(startMin))}</small>}
                  </span>
                  <b>{t.mediaXp(num(m.xp))}</b>
                </li>
              ))}
              <li className="pzs-tvtotal">
                <span>{t.tvTotal}</span>
                <b>{t.mediaUpTo(num(mine.reduce((sum, m) => (m.beforeStart && startMin !== null ? sum : sum + m.xp), 0)))}</b>
              </li>
            </ul>
          </div>
        );
      })}
      <p className="pzs-note">{t.tvNote(meta.mediaXpCutoff)}</p>
    </Sheet>
  );
}

/** La XP de cada nivel, la total desde 0 y el libro que multiplica esa subida. */
function XpTable({ skill }: { skill: SkillData }) {
  const t = useSkillsCopy();
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);
  const hasBooks = skill.books.length > 0;
  return (
    <div className="pzi-tablebox">
      <table className="pzi-table pzs-table">
        <thead>
          <tr>
            <th scope="col">{t.colLevel}</th>
            <th scope="col">{t.colXp}</th>
            <th scope="col">{t.colTotal}</th>
            {hasBooks && <th scope="col">{t.colBook}</th>}
          </tr>
        </thead>
        <tbody>
          {skill.xp.map((xp, i) => {
            const book = bookFor(skill, i + 1);
            return (
              <tr key={i}>
                <th scope="row">{i + 1}</th>
                <td>{num(xp)}</td>
                <td>{num(xpNeeded(skill, 0, i + 1))}</td>
                {hasBooks && <td>{book ? `×${num(book.mult)}` : "—"}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Los rasgos y profesiones que la arrancan más arriba (o más abajo), y los rasgos que multiplican su XP. */
function Who({ skill, to, navigate, lang }: { skill: SkillData; to: (sec: PzTab, id: string) => Route; navigate: Nav; lang: Lang }) {
  const t = useSkillsCopy();
  const locale = useLocale();
  // Más niveles primero; los que empatan, en el orden de los datos.
  const byLvl = (a: SkillLink, b: SkillLink) => b.lvl - a.lvl;
  const profs = [...skill.professions].sort(byLvl);
  const traits = [...skill.traits].sort(byLvl);
  const mults = multTraits(skill);
  const link = (sec: "traits" | "professions", r: SkillLink | Trait, tag: string) => (
    <li key={`${sec}-${r.id}`}>
      <RouteLink to={to(sec, r.id)} onNavigate={navigate}>
        <ItemIcon icon={r.icon} dir={sec} size={36} />
        <span>{r[lang]}</span>
      </RouteLink>
      <span className="pzi-meta">{tag}</span>
    </li>
  );
  const empty = !profs.length && !traits.length && !mults.length;
  return (
    <Sheet cls="pzs-who" stamp="heart" title={t.whoTitle}>
      {empty && <p className="pzs-note">{t.whoNone}</p>}
      {(profs.length > 0 || traits.length > 0) && (
        <>
          <h3 className="pzs-h3">{t.whoStart}</h3>
          <ul className="pzi-links">
            {profs.map((p) => link("professions", p, signed(p.lvl)))}
            {traits.map((r) => link("traits", r, signed(r.lvl)))}
          </ul>
        </>
      )}
      {mults.length > 0 && (
        <>
          <h3 className="pzs-h3">{t.whoMult}</h3>
          <ul className="pzi-links">{mults.map((r) => link("traits", r, `×${multOf(r, skill).toLocaleString(locale)}`))}</ul>
        </>
      )}
    </Sheet>
  );
}

/** Las opciones de bonificación de inicio: 0, 1, 2 y 3 o más (el juego guarda `min(3, nivel)`). */
const BOOSTS = Array.from({ length: (meta.boostCap as number) + 1 }, (_, i) => i);

/**
 * La calculadora: de un nivel a otro, con la bonificación de inicio, los rasgos que multiplican esta habilidad y los
 * libros. Dice la XP de la barra, la que hay que ganar haciendo cosas y, con libros, qué leer en cada tramo.
 */
function Calculator({ skill }: { skill: SkillData }) {
  const t = useSkillsCopy();
  const c = t.calc;
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);
  // Hasta tres decimales y sin ceros de más: ×0,325 (sin bonificación y con Aprendiz rápido) no es ×0,33.
  const x = (n: number) => n.toLocaleString(locale, { maximumFractionDigits: 3 });
  const id = useId();
  const start = startLevel(skill);
  const [from, setFrom] = useState(start);
  const [toLvl, setTo] = useState(MAX_LEVEL);
  const [boost, setBoost] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [useBooks, setUseBooks] = useState(true);

  const options = multTraits(skill);
  const traits = picked.map((p) => findTrait(p)).filter((p): p is Trait => !!p);
  // Fuerza y Estado físico tienen la tabla plana: la bonificación no cambia nada y no se pregunta.
  const flat = new Set(Object.values(skill.boost)).size === 1;
  const mult = charMult(skill, boost, traits);
  const plan = withBooks(skill, from, toLvl, mult, useBooks);
  const plain = withBooks(skill, from, toLvl, mult, false);
  // La XP a ganar va en enteros redondeados hacia arriba (con una menos no llegás), y los tramos suman el total: roundEarn.
  const shown = roundEarn(plan);

  const pickFrom = (n: number) => {
    setFrom(n);
    if (toLvl <= n) setTo(Math.min(MAX_LEVEL, n + 1));
  };
  const pickTo = (n: number) => {
    setTo(n);
    if (from >= n) setFrom(Math.max(0, n - 1));
  };
  // Los que el juego no deja combinar (Aprendiz rápido con lento, e Ingenioso con los dos): marcar uno desmarca al otro.
  const toggle = (tr: Trait) =>
    setPicked((cur) =>
      cur.includes(tr.id)
        ? cur.filter((p) => p !== tr.id)
        : [...cur.filter((p) => !tr.exclusive.some((e) => e.id === p) && !findTrait(p)?.exclusive.some((e) => e.id === tr.id)), tr.id],
    );

  return (
    <section className="pz-page pzs-calc" aria-labelledby={`${id}-h`}>
      <h2 className="pzi-h2" id={`${id}-h`}>
        <Stamp name="target" />
        {c.title}
        <span className="pzi-hand">{c.hand}</span>
      </h2>
      <div className="pzs-form">
        <label className="pzs-field">
          <span>{c.from}</span>
          <select value={from} onChange={(e) => pickFrom(Number(e.target.value))}>
            {Array.from({ length: MAX_LEVEL }, (_, n) => (
              <option value={n} key={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="pzs-field">
          <span>{c.to}</span>
          <select value={toLvl} onChange={(e) => pickTo(Number(e.target.value))}>
            {Array.from({ length: MAX_LEVEL }, (_, n) => (
              <option value={n + 1} key={n}>
                {n + 1}
              </option>
            ))}
          </select>
        </label>
        {!flat && (
          <label className="pzs-field pzs-boost">
            <span>{c.boost}</span>
            <select value={boost} onChange={(e) => setBoost(Number(e.target.value))} aria-describedby={`${id}-bh`}>
              {BOOSTS.map((n) => (
                <option value={n} key={n}>
                  {c.boostOption(n, x(skill.boost[String(n)] ?? 1))}
                </option>
              ))}
            </select>
            <small id={`${id}-bh`}>{c.boostHint}</small>
          </label>
        )}
        {options.length > 0 && (
          <fieldset className="pzs-field pzs-checks">
            <legend>{c.traits}</legend>
            {options.map((tr) => (
              <label key={tr.id}>
                <input type="checkbox" checked={picked.includes(tr.id)} onChange={() => toggle(tr)} />
                {tr[lang]} <small>×{x(multOf(tr, skill))}</small>
              </label>
            ))}
          </fieldset>
        )}
        {skill.books.length > 0 && (
          <label className="pzs-field pzs-checks pzs-usebooks">
            <input type="checkbox" checked={useBooks} onChange={(e) => setUseBooks(e.target.checked)} />
            {c.books}
          </label>
        )}
      </div>

      <div className="pzs-result" aria-live="polite">
        <p className="pzs-bar">{c.bar(num(plan.bar), from, toLvl)}</p>
        <p className="pzs-earn">
          <b>{c.earn(num(shown.total))}</b> {c.multNote(x(mult))}
        </p>
        {useBooks && plan.stretches.some((s) => s.book) && (
          <>
            <div className="pzi-tablebox">
              <table className="pzi-table pzs-plan">
                <thead>
                  <tr>
                    <th scope="col">{c.colLevels}</th>
                    <th scope="col">{c.colRead}</th>
                    <th scope="col">{c.colBar}</th>
                    <th scope="col">{c.colEarn}</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.stretches.map((s, i) => (
                    <tr key={s.from}>
                      <th scope="row">
                        {s.from} → {s.to}
                      </th>
                      <td>{s.book ? `${s.book.item[lang]} ×${x(s.book.mult)}` : c.noBook}</td>
                      <td>{num(s.bar)}</td>
                      <td>{num(shown.stretches[i])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="pzs-note">
              {c.withoutBooks(num(ceilXp(plain.earn)))} {c.readHint}
            </p>
          </>
        )}
        <p className="pzs-note">{c.serverNote}</p>
      </div>
    </section>
  );
}
