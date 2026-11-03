/**
 * "Armar contrato" (2026-11-03, maqueta B "Planilla"): tipo, rareza de entrada y comisión arriba; el buscador para sumar
 * skins; la tabla de entradas (float editable) y la de resultados, las dos ordenadas por precio de mayor a menor (pedido
 * de ZoTaD) y ordenables por columna; y el recuadro con costo, valor esperado, probabilidad de ganar y ganancia.
 */
import { useMemo } from "react";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useCs2Copy, WEARS, type Cs2Rarity } from "../../cs2Copy";
import type { SkinRow } from "../data";
import { sortRows, useSort } from "../sort";
import { Img, Pct, Price, useNum, type Nav } from "../ui";
import { contract, needed, nextRarity, priceAt, TRADEUP_RARITIES, type Kind, type TradeupCtx } from "./engine";
import type { ContractState } from "./query";
import SkinSearch from "./SkinSearch";

const KINDS: Kind[] = ["n", "st", "sv"];
/** El float con que entra una skin nueva: el principio de Algo desgastado, acotado a su rango. */
export const startFloat = (s: SkinRow): number => (s.min == null || s.max == null ? 0 : Math.min(Math.max(0.15, s.min), s.max));

type InKey = "name" | "float" | "price";
type OutKey = "name" | "float" | "chance" | "price";

export default function Builder({
  ctx,
  rows,
  state,
  rarity,
  onChange,
  onRarity,
  route,
  navigate,
}: {
  ctx: TradeupCtx;
  rows: SkinRow[];
  state: ContractState;
  rarity: Cs2Rarity;
  onChange: (s: ContractState) => void;
  onRarity: (r: Cs2Rarity) => void;
  route: Route;
  navigate: Nav;
}) {
  const t = useCs2Copy();
  const u = t.tu;
  const num = useNum();
  const r = useMemo(() => contract(state.inputs, state.kind, { ...ctx, fee: state.fee }), [state, ctx]);
  const colName = (c: string | undefined) => (c ? ctx.tradeup[c]?.name ?? "" : "");
  // Lo que se puede sumar: la rareza elegida, con algo arriba en su colección, y que exista en el tipo de contrato.
  const candidates = useMemo(() => {
    const nx = nextRarity(rarity);
    return rows.filter((s) => {
      if (s.rarity !== rarity || !s.col || !nx) return false;
      const c = ctx.tradeup[s.col];
      const outs = nx === "special" ? c?.rare : c?.tiers[nx];
      if (!outs?.length) return false;
      return state.kind === "st" ? s.st : state.kind === "sv" ? s.sv : true;
    });
  }, [rows, rarity, state.kind, ctx]);
  const need = needed(rarity);
  const add = (s: SkinRow) => state.inputs.length < 10 && onChange({ ...state, inputs: [...state.inputs, { slug: s.slug, float: startFloat(s) }] });
  const fill = () => {
    const last = state.inputs[state.inputs.length - 1];
    if (last) onChange({ ...state, inputs: [...state.inputs, ...Array.from({ length: Math.max(0, need - state.inputs.length) }, () => ({ ...last }))] });
  };

  const inRows = state.inputs.map((i, idx) => {
    const s = ctx.skins.get(i.slug)!;
    return { idx, s, float: i.float, price: priceAt(ctx.prices[i.slug], s, i.float, state.kind).price };
  });
  const inSort = useSort<InKey>({ key: "price", dir: -1 }, ["name"]);
  const inShown = sortRows(inRows, { name: (x) => x.s.name, float: (x) => x.float, price: (x) => x.price }, inSort.sort);
  const outSort = useSort<OutKey>({ key: "price", dir: -1 }, ["name"]);
  const outShown = sortRows(r.outcomes, { name: (o) => ctx.skins.get(o.slug)?.name ?? o.slug, float: (o) => o.float, chance: (o) => o.chance, price: (o) => o.price }, outSort.sort);
  const setFloat = (idx: number, v: number) => onChange({ ...state, inputs: state.inputs.map((x, k) => (k === idx ? { ...x, float: v } : x)) });
  const skinTo = (slug: string): Route => ({ ...route, view: "cs2", c2Section: "skins", detail: slug });

  return (
    <>
      <div className="c2-filters">
        <div className="c2-seg" role="group" aria-label={u.kind.n}>
          {KINDS.map((k) => (
            <button type="button" key={k} className={state.kind === k ? "is-on" : ""} aria-pressed={state.kind === k} onClick={() => onChange({ ...state, kind: k })}>
              {u.kind[k]}
            </button>
          ))}
        </div>
        <div className="c2-seg" role="group" aria-label={u.rarityIn}>
          {TRADEUP_RARITIES.map((rr) => (
            <button type="button" key={rr} className={`${rarity === rr ? "is-on " : ""}is-${rr}`} aria-pressed={rarity === rr} onClick={() => onRarity(rr)}>
              {t.rarity[rr]}
            </button>
          ))}
        </div>
        <label>
          {u.fee}
          <input
            type="number"
            min={0}
            max={50}
            step={0.5}
            value={Math.round(state.fee * 1000) / 10}
            onChange={(e) => onChange({ ...state, fee: Math.min(Math.max(Number(e.target.value) || 0, 0), 50) / 100 })}
            className="c2-tu-fee"
          />
          %
        </label>
      </div>

      <div className="c2-facts">
        <div className="c2-fact">
          <small>{u.cost}</small>
          <Price v={r.cost} />
        </div>
        <div className="c2-fact" title={u.netOf(`${num(state.fee * 100, 1)} %`)}>
          <small>{u.ev}</small>
          <Price v={r.net} />
        </div>
        <div className="c2-fact">
          <small>{u.win}</small>
          <Pct v={r.win} d={0} />
        </div>
        <div className="c2-fact is-key">
          <small>{u.profit}</small>
          <span className={`c2-num ${r.profit >= 0 ? "is-up" : "is-down"}`}>
            {r.profit >= 0 ? "+" : "−"}US$ {num(Math.abs(r.profit))}
          </span>
        </div>
      </div>
      {r.valid && (
        <p className="c2-tu-problem" role="status">
          {r.valid.code === "missing" || r.valid.code === "extra" ? u.problem[r.valid.code](r.valid.n) : u.problem[r.valid.code]}
        </p>
      )}

      <div className="c2-tu-cols">
        <section>
          <div className="c2-tu-head">
            <h2 className="c2-h2">{u.inputs(state.inputs.length, need)}</h2>
            <div className="c2-tu-actions">
              {state.inputs.length > 0 && state.inputs.length < need && (
                <button type="button" className="c2-btn" onClick={fill}>
                  {u.fill(need - state.inputs.length)}
                </button>
              )}
              {state.inputs.length > 0 && (
                <button type="button" className="c2-btn is-ghost" onClick={() => onChange({ ...state, inputs: [] })}>
                  {u.clear}
                </button>
              )}
            </div>
          </div>
          {state.inputs.length < 10 && <SkinSearch rows={candidates} placeholder={u.searchAdd} colName={colName} onPick={add} />}
          <div className="c2-tablewrap">
            <table className="c2-table">
              <thead>
                <tr>
                  {inSort.th("name", t.t.skin)}
                  {inSort.th("float", t.t.float)}
                  {inSort.th("price", t.t.price)}
                  <th>
                    <span className="visually-hidden">{u.remove}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {inShown.length === 0 && (
                  <tr>
                    <td colSpan={4} className="c2-dim">
                      {u.empty}
                    </td>
                  </tr>
                )}
                {inShown.map((x) => (
                  <tr key={x.idx} className={`is-${x.s.rarity}`}>
                    <td>
                      <div className="c2-nm">
                        <Img img={x.s.img} w={72} h={49} lazy={false} />
                        <span className="c2-nm-t">
                          <RouteLink to={skinTo(x.s.slug)} onNavigate={navigate}>
                            <strong>{x.s.name}</strong>
                          </RouteLink>
                          <span className="c2-nm-s">{colName(x.s.col)}</span>
                        </span>
                      </div>
                    </td>
                    <td data-l={t.t.float}>
                      <input
                        className="c2-tu-float"
                        type="number"
                        step={0.001}
                        min={x.s.min ?? 0}
                        max={x.s.max ?? 1}
                        defaultValue={x.float}
                        key={`${x.idx}-${x.float}`}
                        aria-label={`${t.t.float} ${x.s.name}`}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (Number.isFinite(v)) setFloat(x.idx, Math.min(Math.max(v, x.s.min ?? 0), x.s.max ?? 1));
                        }}
                        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                      />
                    </td>
                    <td data-l={t.t.price}>
                      <Price v={x.price} />
                    </td>
                    <td>
                      <button type="button" className="c2-tu-x" aria-label={`${u.remove} ${x.s.name}`} onClick={() => onChange({ ...state, inputs: state.inputs.filter((_, k) => k !== x.idx) })}>
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <div className="c2-tu-head">
            <h2 className="c2-h2">{u.results}</h2>
          </div>
          <div className="c2-tablewrap">
            <table className="c2-table">
              <thead>
                <tr>
                  {outSort.th("name", t.t.skin)}
                  {outSort.th("float", t.t.float)}
                  {outSort.th("chance", u.chance)}
                  {outSort.th("price", t.t.price)}
                  <th>
                    <span>{u.ifWins}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {outShown.map((o) => {
                  const s = ctx.skins.get(o.slug)!;
                  const neto = o.price == null ? null : o.price * (1 - state.fee) - r.cost;
                  return (
                    <tr key={o.slug} className={`is-${s.rarity}`}>
                      <td>
                        <div className="c2-nm">
                          <Img img={s.img} w={72} h={49} lazy={false} />
                          <span className="c2-nm-t">
                            <RouteLink to={skinTo(s.slug)} onNavigate={navigate}>
                              <strong>{s.phase ? `${s.name} · ${s.phase}` : s.name}</strong>
                            </RouteLink>
                            <span className="c2-nm-s">
                              <span className="c2-r">{t.rarity[s.rarity]}</span>
                              {o.wear != null && <> · {t.wear[o.wear]}</>}
                            </span>
                          </span>
                        </div>
                      </td>
                      <td data-l={t.t.float} className="c2-num">{o.float == null ? "—" : num(o.float, 4)}</td>
                      <td data-l={u.chance}>
                        <Pct v={o.chance} d={1} />
                      </td>
                      <td data-l={t.t.price}>
                        <Price v={o.price} sug={o.sug} />
                      </td>
                      <td data-l={u.ifWins}>{neto == null ? <span className="c2-num is-none">—</span> : <span className={`c2-num ${neto >= 0 ? "is-up" : "is-down"}`}>{neto >= 0 ? "+" : "−"}US$ {num(Math.abs(neto))}</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
