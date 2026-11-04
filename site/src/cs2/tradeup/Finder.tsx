/**
 * "Busco esta skin" (2026-11-03, el trade-up inverso): elegís la skin y el desgaste que querés; dice qué float
 * normalizado promedio necesitan las entradas, con qué probabilidad sale y qué entradas sirven, de la más barata a la
 * más cara (ordenable). "Usar" arma el contrato con 10 (o 5) de esa entrada al float máximo que sirve.
 */
import { useMemo } from "react";
import { useCs2Copy, WEARS } from "../../cs2Copy";
import type { SkinRow } from "../data";
import { sortRows, useSort } from "../sort";
import { FloatRange, Img, Price, Rarity, useNum } from "../ui";
import { inverse, needed, type TradeupCtx } from "./engine";
import SkinSearch from "./SkinSearch";

type Key = "name" | "fMax" | "price";

export default function Finder({
  ctx,
  rows,
  target,
  wear,
  onTarget,
  onWear,
  onUse,
}: {
  ctx: TradeupCtx;
  rows: SkinRow[];
  target: string;
  wear: number;
  onTarget: (slug: string) => void;
  onWear: (w: number) => void;
  onUse: (slug: string, float: number) => void;
}) {
  const t = useCs2Copy();
  const u = t.tu;
  const num = useNum();
  const colName = (c: string | undefined) => (c ? ctx.tradeup[c]?.name ?? "" : "");
  // Lo que puede salir de un contrato: lo que tiene algo abajo en su colección, o el especial de alguna caja.
  const outputs = useMemo(() => {
    const rare = new Set(Object.values(ctx.tradeup).flatMap((c) => c.rare));
    return rows.filter((s) => rare.has(s.slug) || (s.col && s.rarity !== "consumer" && s.rarity !== "extraordinary" && s.rarity !== "contraband"));
  }, [rows, ctx]);
  const s = ctx.skins.get(target);
  const r = useMemo(() => inverse(target, wear, ctx), [target, wear, ctx]);
  const { sort, th } = useSort<Key>({ key: "price", dir: 1 }, ["name"]);
  const shown = sortRows(r.inputs, { name: (x) => ctx.skins.get(x.slug)?.name ?? x.slug, fMax: (x) => x.fMax, price: (x) => x.price }, sort);
  const n4 = (v: number) => num(v, 4);
  return (
    <>
      <SkinSearch rows={outputs} placeholder={u.searchTarget} colName={colName} onPick={(p) => onTarget(p.slug)} />
      {s && (
        <section className={`c2-tu-target is-${s.rarity}`}>
          <Img img={s.img} w={240} h={170} big lazy={false} />
          <div>
            <p className="c2-crumb">
              {u.target} · <Rarity r={s.rarity} /> · {colName(s.col)}
            </p>
            <h2 className="c2-tu-name">{s.phase ? `${s.name} · ${s.phase}` : s.name}</h2>
            {s.min != null && (
              <div className="c2-seg" role="group" aria-label={u.inWear}>
                {WEARS.map((w, i) => (
                  <button type="button" key={w.ab} className={wear === i ? "is-on" : ""} aria-pressed={wear === i} onClick={() => onWear(i)} title={t.wear[i]}>
                    {w.ab}
                  </button>
                ))}
              </div>
            )}
            <p className="c2-tu-say">
              {!r.inputs.length && r.nMax != null
                ? u.noSource
                : r.nMax == null
                  ? u.noWear(`${num(s.min ?? 0)}–${num(s.max ?? 1)}`)
                  : r.nMin > 0
                    ? u.needBetween(n4(r.nMin), n4(r.nMax))
                    : u.needBelow(n4(r.nMax))}{" "}
              {r.inputs.length > 0 && r.nMax != null && u.chanceAll(`${num(r.chance * 100, 1)} %`)}
            </p>
          </div>
        </section>
      )}
      {r.inputs.length > 0 && r.nMax != null && (
        <section>
          <h2 className="c2-h2">{u.candidates}</h2>
          <div className="c2-tablewrap">
            <table className="c2-table">
              <thead>
                <tr>
                  {th("name", t.t.skin)}
                  {th("fMax", u.fMax)}
                  {th("price", t.t.price)}
                  <th>
                    <span>{u.tenOf}</span>
                  </th>
                  <th>
                    <span className="visually-hidden">{u.useThis}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((x) => {
                  const k = ctx.skins.get(x.slug)!;
                  const n = needed(k.rarity);
                  return (
                    <tr key={x.slug} className={`is-${k.rarity}`}>
                      <td>
                        <div className="c2-nm">
                          <Img img={k.img} w={72} h={49} />
                          <span className="c2-nm-t">
                            <strong>{k.name}</strong>
                            <span className="c2-nm-s">
                              {colName(x.col)} · <FloatRange min={k.min} max={k.max} />
                            </span>
                          </span>
                        </div>
                      </td>
                      <td data-l={u.fMax} className="c2-num">{x.fMax == null ? "—" : n4(x.fMax)}</td>
                      <td data-l={t.t.price}>
                        <Price v={x.price} />
                      </td>
                      <td data-l={u.tenOf}>
                        <Price v={x.price == null ? null : x.price * n} />
                      </td>
                      <td>
                        <button type="button" className="c2-btn" onClick={() => onUse(x.slug, Math.max(k.min ?? 0, (x.fMax ?? 0) - 0.0005))}>
                          {u.useThis}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
