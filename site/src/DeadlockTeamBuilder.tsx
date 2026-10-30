// `DeadlockTeamBuilder` y no `DeadlockDraft`: la cuenta vive en `deadlockDraft.ts`, y en
// Windows dos archivos que sólo difieren en mayúsculas son el mismo.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import SectionHead from "./SectionHead";
import GameImg from "./GameImg";
import { useLocale } from "./i18n";
import { useCopy } from "./deadlockCopy";
import { useHeroes, type BandId, type Hero } from "./deadlockData";
import { useInsights } from "./deadlockHeroKitData";
import {
  TEAM_SIZE,
  bestPicks,
  decodeTeam,
  encodeTeam,
  parts,
  reasons,
  sigma,
  tablesOf,
  useDraftModel,
  type Team,
} from "./deadlockDraft";
import "./styles/deadlock-draft.css";

/**
 * Armador de equipo (2026-10-30): elegís los dos equipos y dice a cuál favorece
 * el draft, con las razones y el mejor próximo héroe de cada lado. La cuenta
 * está en `deadlockDraft.ts`; la escala de cada banda la ajusta el pipeline
 * (`npm run build:draft`) con partidas reales.
 *
 * Los equipos viajan en la URL (`?a=…&b=…`) para compartir un draft. En el
 * prerender no hay URL que leer: la página sale vacía, que es lo que ve quien
 * entra de Google.
 */

type Side = "a" | "b";

const leerURL = (k: Side): string | null =>
  typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get(k);

export default function DeadlockTeamBuilder({ band, picker }: { band: BandId; picker: ReactNode }) {
  const copy = useCopy();
  const locale = useLocale();
  const c = copy.deadlock.draft;
  const meta = useHeroes(band);
  const insights = useInsights(band);
  const modelo = useDraftModel();

  const heroes = useMemo(() => [...(meta?.heroes ?? [])].sort((x, y) => x.name.localeCompare(y.name, locale)), [meta, locale]);
  const porId = useMemo(() => new Map(heroes.map((h) => [h.heroId, h])), [heroes]);

  const [a, setA] = useState<Team>(() => Array(TEAM_SIZE).fill(null));
  const [b, setB] = useState<Team>(() => Array(TEAM_SIZE).fill(null));
  const [activo, setActivo] = useState<Side>("a");
  const [copiado, setCopiado] = useState(false);

  // Los equipos del enlace se leen cuando ya se sabe qué héroes existen.
  const [leido, setLeido] = useState(false);
  useEffect(() => {
    if (leido || !heroes.length) return;
    const validos = new Set(heroes.map((h) => h.heroId));
    const ta = decodeTeam(leerURL("a"), validos);
    const tb = decodeTeam(leerURL("b"), validos).map((h) => (h !== null && ta.includes(h) ? null : h));
    setA(ta);
    setB(tb);
    if (!ta.includes(null) && tb.includes(null)) setActivo("b");
    setLeido(true);
  }, [heroes, leido]);

  // Y se escriben al cambiar, sin sumar una entrada al historial por cada héroe.
  useEffect(() => {
    if (!leido) return;
    const q = new URLSearchParams(window.location.search);
    const ea = encodeTeam(a);
    const eb = encodeTeam(b);
    if (ea) q.set("a", ea);
    else q.delete("a");
    if (eb) q.set("b", eb);
    else q.delete("b");
    // Las comas sin escapar: el enlace se lee y se pega a mano.
    const s = q.toString().replace(/%2C/g, ",");
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${s ? `?${s}` : ""}${window.location.hash}`);
  }, [a, b, leido]);

  const tablas = useMemo(() => (meta && insights ? tablesOf(meta.heroes, insights) : null), [meta, insights]);
  const banda = modelo?.bands[band];
  const A = a.filter((h): h is number => h !== null);
  const B = b.filter((h): h is number => h !== null);
  const hayAlgo = A.length + B.length > 0;

  const piezas = tablas && modelo && banda ? parts(tablas, A, B, modelo.cv, modelo.ca) : [];
  const margen = piezas.reduce((n, p) => n + p.value, 0);
  const pA = banda && hayAlgo ? sigma(banda.scale * margen) : 0.5;
  const razones = banda ? reasons(piezas, banda.scale) : [];

  const usados = new Set([...A, ...B]);
  const nombre = (id: number) => porId.get(id)?.name ?? `#${id}`;
  const pct = (p: number) => `${Math.round(p * 100)} %`;
  const pp = (x: number) => `${x > 0 ? "+" : "−"}${Math.abs(x).toLocaleString(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 })}`;
  const equipo = (s: Side) => (s === "a" ? c.amber : c.sapphire);

  const sumar = (id: number) => {
    if (usados.has(id)) return;
    const [team, set, otro] = activo === "a" ? [a, setA, "b" as Side] : [b, setB, "a" as Side];
    const i = team.indexOf(null);
    if (i < 0) return;
    const nuevo = [...team];
    nuevo[i] = id;
    set(nuevo);
    // Con un equipo lleno, el próximo héroe va al otro.
    if (!nuevo.includes(null) && (otro === "a" ? a : b).includes(null)) setActivo(otro);
  };
  const sacar = (s: Side, i: number) => {
    const [team, set] = s === "a" ? [a, setA] : [b, setB];
    const nuevo = [...team];
    nuevo[i] = null;
    set(nuevo);
    setActivo(s);
  };

  const sugeridos = (s: Side) => {
    if (!tablas || !banda || !modelo) return [];
    const [own, enemy] = s === "a" ? [A, B] : [B, A];
    if (own.length >= TEAM_SIZE) return [];
    // `bestPicks` mide desde el equipo propio: la probabilidad que da es la de ese lado.
    return bestPicks(tablas, heroes.map((h) => h.heroId), own, enemy, banda.scale, modelo.cv, modelo.ca);
  };

  const columna = (s: Side) => {
    const team = s === "a" ? a : b;
    const p = s === "a" ? pA : 1 - pA;
    return (
      <section className="box dl-dr-team" data-side={s} data-active={activo === s || undefined}>
        <button type="button" className="dl-dr-team-head" onClick={() => setActivo(s)} aria-pressed={activo === s}>
          <span className="dl-dr-team-name">{equipo(s)}</span>
          <span className="dl-dr-team-pct">{hayAlgo && banda ? pct(p) : "—"}</span>
        </button>
        <ol className="dl-dr-slots">
          {team.map((id, i) => {
            const h = id === null ? undefined : porId.get(id);
            return (
              <li key={i} className="dl-dr-slot">
                {h ? (
                  <button type="button" className="dl-dr-picked" onClick={() => sacar(s, i)} aria-label={c.remove(h.name)} title={c.remove(h.name)}>
                    <GameImg src={h.img} alt="" width={40} height={40} decoding="async" />
                    <span>{h.name}</span>
                    <span className="dl-dr-x" aria-hidden="true">×</span>
                  </button>
                ) : (
                  <button type="button" className="dl-dr-empty" onClick={() => setActivo(s)}>
                    {c.empty}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      </section>
    );
  };

  const textoRazon = (r: ReturnType<typeof reasons>[number]) => {
    const [x, y] = r.heroes;
    if (r.kind === "hero") return c.hero(nombre(x), pct(porId.get(x)?.winRate ?? 0.5));
    if (r.kind === "counter") return c.counter(nombre(x), nombre(y));
    // Una sinergia buena ayuda al lado que la tiene; una mala, al otro.
    const lado = A.includes(x) ? 1 : -1;
    return r.side === lado ? c.synergy(nombre(x), nombre(y)) : c.clash(nombre(x), nombre(y));
  };

  const copiar = () => {
    navigator.clipboard?.writeText(window.location.href).then(
      () => {
        setCopiado(true);
        window.setTimeout(() => setCopiado(false), 1600);
      },
      () => undefined
    );
  };

  return (
    <main className="deadlock dl-draft">
      <SectionHead
        eyebrow={c.kicker}
        title={c.title}
        accent={c.titleBreak}
        lead={c.lead}
        controls={picker}
        meta={
          banda ? (
            <span className="dl-meta-line">
              {c.accuracy(pct(banda.accuracy), banda.matches.toLocaleString(locale))}
            </span>
          ) : modelo === null ? (
            <span className="dl-meta-line">{c.noModel}</span>
          ) : undefined
        }
      />

      <div className="page dl-dr-page">
        <div className="dl-dr-board">
          {columna("a")}
          <div className="cartel-papel dl-dr-odds" aria-live="polite">
            <span className="dl-dr-odds-label">{c.chance}</span>
            {hayAlgo && banda ? (
              <>
                <div className="dl-dr-bar" role="img" aria-label={`${c.amber} ${pct(pA)} · ${c.sapphire} ${pct(1 - pA)}`}>
                  <span className="dl-dr-bar-a" style={{ width: `${pA * 100}%` }} />
                </div>
                <div className="dl-dr-odds-nums">
                  <strong>{pct(pA)}</strong>
                  <strong>{pct(1 - pA)}</strong>
                </div>
              </>
            ) : (
              <p className="dl-dr-odds-empty">{c.even}</p>
            )}
            <div className="dl-dr-actions">
              <button type="button" onClick={() => { setA(b); setB(a); }}>{c.swap}</button>
              <button type="button" onClick={() => { setA(Array(TEAM_SIZE).fill(null)); setB(Array(TEAM_SIZE).fill(null)); setActivo("a"); }}>
                {c.clear}
              </button>
              {hayAlgo && (
                <button type="button" onClick={copiar}>
                  {copiado ? c.copied : c.share}
                </button>
              )}
            </div>
          </div>
          {columna("b")}
        </div>

        <section className="box dl-dr-picker">
          <div className="box-head">
            <h2 className="box-title">{c.pickFor(equipo(activo))}</h2>
          </div>
          <div className="dl-dr-grid" role="group" aria-label={c.pick}>
            {heroes.map((h: Hero) => (
              <button
                key={h.heroId}
                type="button"
                className="dl-dr-hero"
                disabled={usados.has(h.heroId)}
                onClick={() => sumar(h.heroId)}
                title={h.name}
              >
                <GameImg src={h.img} alt="" width={48} height={48} loading="lazy" decoding="async" />
                <span>{h.name}</span>
              </button>
            ))}
          </div>
        </section>

        {hayAlgo && banda && (
          <div className="dl-dr-why">
            <section className="box">
              <div className="box-head">
                <h2 className="box-title">{c.why}</h2>
              </div>
              {razones.length ? (
                <ul className="dl-dr-reasons">
                  {razones.map((r, i) => (
                    <li key={i} data-side={r.pp > 0 ? "a" : "b"}>
                      <span className="dl-dr-reason-faces">
                        {r.heroes.map((id) => (
                          <GameImg key={id} src={porId.get(id)?.img ?? ""} alt="" width={28} height={28} loading="lazy" decoding="async" />
                        ))}
                      </span>
                      <span className="dl-dr-reason-text">{textoRazon(r)}</span>
                      <span className="dl-dr-reason-pp">
                        {pp(Math.abs(r.pp))} <small>{equipo(r.pp > 0 ? "a" : "b")}</small>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="box-empty">{c.none}</p>
              )}
            </section>

            {(["a", "b"] as Side[]).map((s) => {
              const lista = sugeridos(s);
              if (!lista.length) return null;
              return (
                <section className="box" key={s}>
                  <div className="box-head">
                    <h2 className="box-title">{c.best(equipo(s))}</h2>
                  </div>
                  <ul className="dl-dr-best">
                    {lista.map((x) => {
                      const h = porId.get(x.hero);
                      if (!h) return null;
                      return (
                        <li key={x.hero}>
                          <button
                            type="button"
                            onClick={() => {
                              setActivo(s);
                              const [team, set] = s === "a" ? [a, setA] : [b, setB];
                              const i = team.indexOf(null);
                              if (i < 0 || usados.has(x.hero)) return;
                              const nuevo = [...team];
                              nuevo[i] = x.hero;
                              set(nuevo);
                            }}
                          >
                            <GameImg src={h.img} alt="" width={36} height={36} loading="lazy" decoding="async" />
                            <span>{h.name}</span>
                            <strong>{pct(x.p)}</strong>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
