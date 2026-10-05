/**
 * El raideo en la ficha de un objeto (2026-10-05): si es un objetivo (puerta, ventana, TC…), cuánto cuesta romperlo con
 * cada explosivo; si es un explosivo, qué rompe (los grados de construcción y las puertas). Los datos salen del mismo
 * `model.ts` de la calculadora, así los números nunca se contradicen.
 */
import { useLang, useLocale } from "../../i18n";
import { routePath, type Route } from "../../route";
import { useRustCopy } from "../../rustCopy";
import { say } from "./data";
import { EXPLOSIVES, explosiveById, formatSelection, hitsFor, targetForItem, TARGETS } from "../raid/model";

export default function RaidBlocks({ itemId, route }: { itemId: string; route: Route }) {
  const c = useRustCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);
  const target = targetForItem(itemId);
  const explosive = explosiveById(itemId);
  if (!target && !explosive) return null;
  const raidPath = routePath({ ...route, view: "rust", rsSection: "raid", detail: undefined });
  return (
    <>
      {target && (
        <section className="rs-pnl">
          <h2 className="rs-hd">{c.raidBlocks.toBreak}</h2>
          <table className="rs-table">
            <tbody>
              {EXPLOSIVES.map((e) => {
                const n = hitsFor(target, e.id);
                if (n === null) return null;
                return (
                  <tr key={e.id}>
                    <th scope="row">
                      <img src={`/rust/items/${e.id}.webp`} alt="" width={28} height={28} /> {say(e.name, lang)}
                    </th>
                    <td data-cell={`${target.id}|${e.id}`}>{num(n)}</td>
                    <td>
                      {e.cost ? `${num(n * e.cost.sulfur)} ${c.raid.sulfur.toLowerCase()}` : c.raid.notCraftable}
                      {e.dud > 0 && <small className="rs-dud">{c.raid.dud(Math.round(e.dud * 100))}</small>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="rs-raid-actions">
            <a className="rs-btn" href={raidPath + formatSelection({ [target.id]: 1 })}>
              {c.raidBlocks.open}
            </a>
          </p>
        </section>
      )}
      {explosive && (
        <section className="rs-pnl">
          <h2 className="rs-hd">{c.raidBlocks.breaks}</h2>
          <table className="rs-table">
            <tbody>
              {TARGETS.filter((x) => x.kind === "building" || x.kind === "door").map((x) => {
                const n = hitsFor(x, explosive.id);
                if (n === null) return null;
                return (
                  <tr key={x.id}>
                    <th scope="row">{say(x.name, lang)}</th>
                    <td data-cell={`${x.id}|${explosive.id}`}>{num(n)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="rs-raid-actions">
            <a className="rs-btn" href={raidPath}>
              {c.raidBlocks.open}
            </a>
          </p>
        </section>
      )}
    </>
  );
}
