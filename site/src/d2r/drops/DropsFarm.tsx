/**
 * "¿Dónde lo farmeo?" (2026-09-29): el ítem, los mejores jefes y superúnicos
 * (chance por muerte), las mejores áreas (chance por monstruo, por tipo) y la
 * curva del hallazgo mágico. Cada fila se abre para ver qué más suelta ese
 * lugar y de dónde sale el número.
 */
import { useDeferredValue, useMemo, useState } from "react";
import { useLang, useLocale } from "../../i18n";
import { useD2rCopy } from "../../d2rCopy";
import { ItemIcon } from "../ui";
import { SEASON } from "../season";
import { tr } from "../wiki";
import { Busy } from "./Busy";
import { dropData } from "./data";
import { explainPath, type PathStep } from "./engine";
import { targetParam } from "./farm";
import { odds, tcLabel } from "./format";
import ItemPicker, { findItem, type PickItem } from "./ItemPicker";
import MfCurve from "./MfCurve";
import { bestPlaces, CATS, dropsAnywhere, type AreaRow, type BossRow } from "./places";
import { ladderOk } from "./rules";
import { toOpts, toSettings, type DropsState } from "./state";
import type { Diff, KillCtx, Settings, Target } from "./types";

type Set_ = (p: Partial<DropsState>) => void;

/** Lo que más se busca: el primer ítem que prueba quien entra. */
export const FARM_EXAMPLES: Target[] = [
  { k: "u", id: "harlequin-crest" },
  { k: "b", code: "r30" },
  { k: "u", id: "griffons-eye" },
  { k: "s", id: "tal-rashas-guardianship" },
  { k: "u", id: "the-stone-of-jordan" },
];

export default function DropsFarm({ st, set }: { st: DropsState; set: Set_ }) {
  const td = useD2rCopy().drops;
  const { lang } = useLang();
  // Los resultados van una vuelta atrás de los controles: `bestPlaces` tarda hasta ~120 ms con una Zona de Terror y,
  // calculado en el mismo render, cada tecla del hallazgo mágico esperaba a que terminara. Mientras van atrás, lo dicen.
  const shown = useDeferredValue(st);
  const busy = st !== shown;
  const item = findItem(shown.item);
  return (
    <div className="d2-dr-farm">
      <ItemPicker onPick={(i) => set({ item: i })} />
      {!item ? (
        <div className="d2-dr-examples">
          <span>{td.examples}</span>
          {FARM_EXAMPLES.map((ex) => {
            const x = findItem(ex);
            return (
              x && (
                <button type="button" className="d2-chip" key={targetParam(ex)} onClick={() => set({ item: ex })}>
                  <span className={`d2-tone-${x.tone}`}>{tr(x.name, lang)}</span>
                </button>
              )
            );
          })}
          <p className="d2-empty">{td.pick}</p>
          {/* El primer ítem elegido todavía se está calculando. */}
          {busy && st.item && <Busy busy />}
        </div>
      ) : (
        // La `key` hace que cada ítem arranque de cero: sin la fila abierta ni el camino desplegado del anterior.
        <FarmResults key={targetParam(item.target)} item={item} st={shown} set={set} busy={busy} />
      )}
    </div>
  );
}

/** Lo que se muestra de un ítem elegido: su encabezado, las dos listas y la curva. */
function FarmResults({ item, st, set, busy }: { item: PickItem; st: DropsState; set: Set_; busy: boolean }) {
  const td = useD2rCopy().drops;
  const { lang } = useLang();
  const res = useMemo(() => {
    const diffs: Diff[] = st.diff === -1 ? [0, 1, 2] : [st.diff];
    return bestPlaces(dropData(), item.target, toSettings(st), toOpts(st), diffs, 10);
    // Sólo los campos que cambian la cuenta, no todo `st`: la cantidad de runs o la semilla del cofre no la recalculan.
    // El ítem no está porque un ítem distinto es otra `key`, o sea otro componente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.mf, st.players, st.party, st.ladder, st.diff, st.tz, st.tier, st.quest]);
  const [open, setOpen] = useState<string | null>(null);
  const toggle = (key: string) => setOpen((o) => (o === key ? null : key));
  const top = res.bosses[0]?.kill ?? res.areas[0]?.best ?? null;
  return (
    <>
      <div className="d2-dr-item">
        {/* El nombre ya está en el título de al lado: el ícono es decoración. */}
        <ItemIcon asset={item.img} size="md" />
        <div>
          <h2 className={`d2-dr-item-h d2-tone-${item.tone}`}>{tr(item.name, lang)}</h2>
          <small>{td.kinds[item.kind]}</small>
        </div>
      </div>
      <Busy busy={busy}>
        {!res.bosses.length && !res.areas.length && <NoDrop target={item.target} st={st} set={set} />}
        {res.bosses.length > 0 && (
          <section className="d2-dr-list">
            <h2 className="d2-h3">{td.bosses}</h2>
            <p className="d2-dr-note">{td.bossesNote}</p>
            <ol className="d2-dr-rows">
              {res.bosses.map((row) => (
                <BossLine key={row.key} row={row} top={res.bosses[0].p} open={open === row.key} onToggle={() => toggle(row.key)} target={item.target} st={st} set={set} />
              ))}
            </ol>
          </section>
        )}
        {res.areas.length > 0 && (
          <section className="d2-dr-list">
            <h2 className="d2-h3">{td.areas}</h2>
            <p className="d2-dr-note">{td.areasNote}</p>
            <ol className="d2-dr-rows">
              {res.areas.map((row) => (
                <AreaLine key={row.key} row={row} open={open === row.key} onToggle={() => toggle(row.key)} target={item.target} st={st} set={set} />
              ))}
            </ol>
          </section>
        )}
        {top && <MfCurve target={item.target} kill={top} st={st} />}
      </Busy>
    </>
  );
}

/**
 * Por qué no lo suelta nadie, cuando se puede saber: esta temporada sólo cae en Clasificación (con el botón que la prende), o no
 * lo suelta ningún monstruo con ninguna opción (los de misión, la Antorcha del Infierno). Si no, es con estas opciones: otra
 * dificultad, la Zona de Terror o la misión pueden cambiarlo. Se exporta para probar el botón sin un DOM.
 */
export function NoDrop({ target, st, set }: { target: Target; st: DropsState; set: Set_ }) {
  const td = useD2rCopy().drops;
  const D = dropData();
  const item = target.k === "u" ? D.uniqueById.get(target.id) : target.k === "s" ? D.setById.get(target.id) : undefined;
  const ladderOnly = !st.ladder && !ladderOk(item?.lad, false, SEASON);
  // Probar todas las opciones cuesta de 5 a 160 ms: una vez por ítem (el componente vive dentro de su `key`).
  const anywhere = useMemo(() => ladderOnly || dropsAnywhere(D, target, SEASON), [D, target, ladderOnly]);
  if (ladderOnly) {
    return (
      <div className="d2-dr-none">
        <p className="d2-empty">{td.noneLadder}</p>
        <button type="button" className="d2-chip" onClick={() => set({ ladder: true })}>
          {td.ladderOn}
        </button>
      </div>
    );
  }
  return <p className="d2-empty">{anywhere ? td.none : td.noneEver}</p>;
}

function BossLine({ row, top, open, onToggle, target, st, set }: { row: BossRow; top: number; open: boolean; onToggle: () => void; target: Target; st: DropsState; set: Set_ }) {
  const td = useD2rCopy().drops;
  const { lang } = useLang();
  const locale = useLocale();
  return (
    <li className="d2-dr-row">
      <button type="button" className="d2-dr-row-main" aria-expanded={open} onClick={onToggle}>
        <span className="d2-dr-row-name">
          <b>{tr(row.src.n, lang)}</b>
          <small>
            {td.diffs[row.diff]} · {row.src.kind === "boss" ? td.kindBoss : td.kindSuper}
            {row.tz ? ` · ${td.tzBadge}` : ""}
          </small>
        </span>
        <span className="d2-dr-odds">{odds(row.p, locale, td)}</span>
        <span className="d2-dr-bar" aria-hidden="true">
          <i style={{ width: `${Math.max(3, (row.p / top) * 100)}%` }} />
        </span>
      </button>
      {open && (
        <div className="d2-dr-open">
          <button type="button" className="d2-chip" onClick={() => set({ m: "drops", place: { k: "s", id: row.src.id }, pdiff: row.diff })}>
            {td.whatElse}
          </button>
          <Why target={target} kill={row.kill} s={toSettings(st)} place={tr(row.src.n, lang)} />
        </div>
      )}
    </li>
  );
}

/** La fila de un área. Se exporta para probar a qué tipo de monstruo lleva su botón: abrir la fila necesita un clic. */
export function AreaLine({ row, open, onToggle, target, st, set }: { row: AreaRow; open: boolean; onToggle: () => void; target: Target; st: DropsState; set: Set_ }) {
  const td = useD2rCopy().drops;
  const { lang } = useLang();
  const locale = useLocale();
  // El tipo de monstruo que explica la fila (el primero que suelta el ítem): los ítems altos (la Corona de las Eras, el Poderío
  // de Tyrael) no caen de los comunes, y "¿Qué suelta?" abierto en los comunes no los traería.
  const cat = row.cat;
  return (
    <li className="d2-dr-row">
      <button type="button" className="d2-dr-row-main" aria-expanded={open} onClick={onToggle}>
        <span className="d2-dr-row-name">
          <b>{tr(row.area.n, lang)}</b>
          <small>
            {td.act(row.area.act)} · {td.diffs[row.diff]}
            {row.tz ? ` · ${td.tzBadge}` : ""}
          </small>
        </span>
        <span className="d2-dr-cats">
          {CATS.filter((c) => row.p[c] > 0).map((c) => (
            <span key={c}>
              <small>{td.cats[c]}</small>
              <b>{odds(row.p[c], locale, td)}</b>
            </span>
          ))}
        </span>
      </button>
      {open && row.best && (
        <div className="d2-dr-open">
          <button type="button" className="d2-chip" onClick={() => set({ m: "drops", place: { k: "a", id: row.area.id, cat }, pdiff: row.diff })}>
            {td.whatElse}
          </button>
          <Why target={target} kill={row.best} s={toSettings(st)} place={tr(row.area.n, lang)} />
        </div>
      )}
    </li>
  );
}

/** Hasta tantos pasos se muestran todos. Las cadenas de TC "Equip" son largas (10 pasos la Cresta desde Mefisto, unos 35 desde Baal hasta las bases normales): pasado esto se pliegan. */
const PATH_OPEN = 5;

/**
 * "¿De dónde sale este número?": el camino que más aporta, en palabras. El primer paso es el lugar de la fila (`place`, ya en
 * el idioma de la página) con su dificultad, y no el nombre del TC ("Mefisto · Infierno: 7 tiradas" y no "Mephisto (H)").
 * Se exporta para probarla: la fila que la muestra se abre con un clic.
 */
export function Why({ target, kill, s, place }: { target: Target; kill: KillCtx; s: Settings; place: string }) {
  const td = useD2rCopy().drops;
  const { lang } = useLang();
  const locale = useLocale();
  const [all, setAll] = useState(false);
  // Sin memo: quien la llama arma `s` en cada render, así que nunca acertaría, y el camino cuesta menos de medio milisegundo.
  const path = explainPath(dropData(), target, kill, s);
  if (!path) return null;
  const D = dropData();
  const endName = D.bases[path.end.code]?.n ?? D.uniqueByKey.get(path.end.code)?.n ?? D.setByKey.get(path.end.code)?.n;
  const root = [place, td.diffs[kill.diff], ...(kill.desec ? [td.tzBadge] : [])].join(" · ");
  // Un paso de un TC con tiradas negativas se hace siempre y lleva su propio texto; el resto va por `odds`
  // ("97,7%" si es casi seguro, "1 en N" si no).
  const line = (step: PathStep, i: number) =>
    i === 0 ? td.pathRoot(root, step.picks) : step.share >= 1 ? td.pathSure(tcLabel(step.tc, td)) : td.pathStep(tcLabel(step.tc, td), odds(step.share, locale, td));
  // Un camino largo deja el primer paso y los dos últimos; los del medio se despliegan con un botón.
  const hidden = all || path.steps.length <= PATH_OPEN ? 0 : path.steps.length - 3;
  return (
    <details className="d2-dr-why">
      <summary>{td.why}</summary>
      <ol>
        <li>{line(path.steps[0], 0)}</li>
        {hidden > 0 && (
          <li>
            <button type="button" className="d2-dr-more" onClick={() => setAll(true)}>
              {td.pathMore(hidden)}
            </button>
          </li>
        )}
        {path.steps.slice(1 + hidden).map((step, i) => (
          <li key={1 + hidden + i}>{line(step, 1 + hidden + i)}</li>
        ))}
        <li>{td.pathItem(endName ? tr(endName, lang) : path.end.code, odds(path.end.share, locale, td))}</li>
        {path.end.quality !== null && <li>{td.pathQuality(odds(path.end.quality, locale, td), target.k === "s")}</li>}
        {path.end.pick !== null && path.end.pick < 1 && <li>{td.pathPick(odds(path.end.pick, locale, td))}</li>}
      </ol>
    </details>
  );
}
