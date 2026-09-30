/**
 * El buscador de ítems (2026-09-29): únicos, piezas, runas y bases, en español
 * o en inglés. Un único también se encuentra por su base ("shako" da la Cresta
 * del arlequín) y por las siglas de siempre ("soj"). Los resultados van en la
 * página y no en un desplegable flotante: en el celular se leen y tocan mejor.
 */
import { useMemo, useState } from "react";
import { useLang } from "../../i18n";
import { useD2rCopy } from "../../d2rCopy";
import type { Loc } from "../stats";
import { ItemIcon, fold, type Tone } from "../ui";
import { tr } from "../wiki";
import { dropData } from "./data";
import { targetParam } from "./farm";
import type { Target } from "./types";

export interface PickItem {
  target: Target;
  name: Loc;
  img: string | null;
  kind: "u" | "s" | "r" | "b";
  tone: Tone;
  /** Más palabras por las que se encuentra (la base de un único). */
  words: string[];
}

/** Las siglas de la comunidad. Cada id tiene que existir (lo revisa el test). */
export const ALIASES: Record<string, string> = {
  shako: "harlequin-crest",
  soj: "the-stone-of-jordan",
  coa: "crown-of-ages",
  hoz: "herald-of-zakarum",
  mara: "maras-kaleidoscope",
  wf: "windforce",
  tgods: "thundergods-vigor",
};

let items: PickItem[] | null = null;
export function pickItems(): PickItem[] {
  if (items) return items;
  const D = dropData();
  const baseWords = (code: string) => (D.bases[code] ? [D.bases[code].n.en, D.bases[code].n.es] : []);
  const out: PickItem[] = [];
  for (const u of D.uniques) out.push({ target: { k: "u", id: u.id }, name: u.n, img: u.img, kind: "u", tone: "unique", words: baseWords(u.code) });
  for (const x of D.sets) out.push({ target: { k: "s", id: x.id }, name: x.n, img: x.img, kind: "s", tone: "set", words: [] });
  for (const [code, b] of Object.entries(D.bases)) {
    const rune = /^r\d\d$/.test(code);
    if (rune || b.k !== "m") out.push({ target: { k: "b", code }, name: b.n, img: b.img, kind: rune ? "r" : "b", tone: rune ? "rune" : "white", words: [] });
  }
  return (items = out);
}

const KIND_ORDER = { u: 0, s: 1, r: 2, b: 3 } as const;

/**
 * Cómo se compara todo en el buscador: sin tildes, en minúsculas y sin apóstrofes.
 * "Griswold's Edge" se encuentra escribiendo "griswolds", y el teclado del celular
 * pone la comilla curva (’) en vez de la recta. Lo escrito, los nombres, las siglas
 * y las bases pasan por acá; `fold` de la wiki queda como está (la usan las listas).
 */
const norm = (s: string): string => fold(s).replace(/['‘’ʼ`´]/g, "");

/** Lo escrito, listo para comparar. */
const query = (q: string): string => norm(q).trim();

/** Con menos letras no se busca: casi todo lo contiene. */
const MIN_QUERY = 2;

/** Una runa se busca por su nombre solo: "ber" es la Runa Ber. */
const bare = (s: string) => norm(s).replace(/^runa |rune$/g, "").trim();

/** Primero la sigla y el nombre exacto, después lo que empieza con lo escrito, lo que lo contiene y lo que lo tiene en su base. */
export function searchItems(q: string, limit = 12): PickItem[] {
  const n = query(q);
  if (n.length < MIN_QUERY) return [];
  const alias = ALIASES[n];
  const score = (x: PickItem): number => {
    if (alias && x.target.k === "u" && x.target.id === alias) return 0;
    const names = [norm(x.name.en), norm(x.name.es)];
    if (names.includes(n) || (x.kind === "r" && (bare(x.name.en) === n || bare(x.name.es) === n))) return 0.5;
    if (names.some((w) => w.startsWith(n))) return 1;
    if (names.some((w) => w.includes(n))) return 2;
    if (x.words.some((w) => norm(w).includes(n))) return 3;
    return 9;
  };
  return pickItems()
    .map((x) => [score(x), x] as const)
    .filter(([s]) => s < 9)
    .sort((a, b) => a[0] - b[0] || KIND_ORDER[a[1].kind] - KIND_ORDER[b[1].kind])
    .slice(0, limit)
    .map(([, x]) => x);
}

export const findItem = (t: Target | null): PickItem | undefined =>
  t ? pickItems().find((x) => targetParam(x.target) === targetParam(t)) : undefined;

/**
 * Los resultados de lo escrito, o el aviso de que no hay. Van en una región viva
 * que ya está en la página antes de escribir: así el lector de pantalla anuncia
 * lo que aparece (un lector no avisa de una región que nace con el contenido).
 */
export function PickerResults({ q, onPick }: { q: string; onPick: (t: Target) => void }) {
  const td = useD2rCopy().drops;
  const { lang } = useLang();
  const hits = useMemo(() => searchItems(q), [q]);
  return (
    <div className="d2-dr-results" aria-live="polite">
      {hits.length > 0 ? (
        <ul className="d2-dr-hits" aria-label={td.search}>
          {hits.map((x) => (
            <li key={targetParam(x.target)}>
              <button type="button" className="d2-dr-hit" onClick={() => onPick(x.target)}>
                <ItemIcon asset={x.img} size="sm" />
                <span className="d2-card-txt">
                  <b className={`d2-tone-${x.tone}`}>{tr(x.name, lang)}</b>
                  <small>{td.kinds[x.kind]}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        query(q).length >= MIN_QUERY && <p className="d2-dr-nohits">{td.noHits}</p>
      )}
    </div>
  );
}

export default function ItemPicker({ onPick }: { onPick: (t: Target) => void }) {
  const td = useD2rCopy().drops;
  const [q, setQ] = useState("");
  const pick = (t: Target) => {
    onPick(t);
    setQ("");
  };
  return (
    <div className="d2-dr-picker">
      <input
        className="d2-search d2-dr-search"
        type="search"
        value={q}
        placeholder={td.search}
        aria-label={td.search}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          // Enter elige el primero, que es el que mejor coincide.
          if (e.key !== "Enter") return;
          const first = searchItems(q)[0];
          if (first) {
            e.preventDefault();
            pick(first.target);
          }
        }}
      />
      <PickerResults q={q} onPick={pick} />
    </div>
  );
}
