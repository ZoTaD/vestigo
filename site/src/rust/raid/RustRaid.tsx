/**
 * La calculadora de raideo de Rust (2026-10-05). Diseño: docs/design/2026-10-05-rust.md, "3. Raideo".
 *
 * Arriba, el selector: cada objetivo con su vida y un contador. Al lado, lo que cuesta la selección con cada explosivo
 * y la mezcla más barata. Abajo, la tabla completa. La selección vive en la URL (`?o=building.stone:2`): el link se
 * comparte tal cual. Se lee al montar (el prerender sale con la selección vacía) y se escribe con `replaceState`, sin
 * llenar el historial.
 */
import { useEffect, useState } from "react";
import slugsEs from "@rust/site/slugs-es.json";
import { useLang, useLocale } from "../../i18n";
import { registerRustSlugs, type Route } from "../../route";
import { useRustCopy } from "../../rustCopy";
import { say } from "../items/data";
import RaidTable from "./RaidTable";
import {
  EXPLOSIVES,
  formatSelection,
  KINDS,
  MAX_QTY,
  parseSelection,
  selectionCost,
  selectionMix,
  TARGETS,
  type Selection,
} from "./model";
import "../../styles/rust-raid.css";

// Los objetivos que son objetos enlazan su ficha con el slug en español: se anotan al cargar el módulo, como en Objetos.
registerRustSlugs(slugsEs);

type Nav = (r: Route) => void;

export default function RustRaid({
  route,
  navigate,
}: {
  route: Route;
  navigate: Nav;
}) {
  const c = useRustCopy();
  const t = c.raid;
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number) => Math.round(n).toLocaleString(locale);
  const [sel, setSel] = useState<Selection>({});
  // Hasta leer la URL no se escribe nada: si no, el primer render (vacío, igual al prerender) borraba el `?o=` del link
  // compartido antes de leerlo.
  const [ready, setReady] = useState(false);
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);

  useEffect(() => {
    setSel(parseSelection(window.location.search));
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    // Cambia sólo `o`: los demás parámetros del link (utm, etc.) se conservan.
    const params = new URLSearchParams(window.location.search);
    params.delete("o");
    const o = formatSelection(sel).slice(3); // sin "?o="
    const rest = params.toString();
    const search = [rest, o ? `o=${o}` : ""].filter(Boolean).join("&");
    const url =
      window.location.pathname +
      (search ? `?${search}` : "") +
      window.location.hash;
    if (
      url !==
      window.location.pathname + window.location.search + window.location.hash
    )
      window.history.replaceState(window.history.state, "", url);
  }, [sel, ready]);

  const bump = (id: string, d: number) =>
    setSel((s) => {
      const n = Math.max(0, Math.min(MAX_QTY, (s[id] ?? 0) + d));
      const next = { ...s };
      if (n) next[id] = n;
      else delete next[id];
      return next;
    });
  // Si el navegador no deja copiar (sin permiso o sin HTTPS), se avisa en el mismo botón en vez de callarlo.
  const copyLink = () => {
    const done = (r: "ok" | "fail") => {
      setCopied(r);
      window.setTimeout(() => setCopied(null), 2000);
    };
    if (!navigator.clipboard) return done("fail");
    navigator.clipboard.writeText(window.location.href).then(
      () => done("ok"),
      () => done("fail"),
    );
  };
  const picked = Object.keys(sel).length > 0;
  const mix = picked ? selectionMix(sel) : null;

  return (
    <main className="rs-main rs-raid">
      <section className="rs-pnl">
        <div className="rs-title">
          <h1 className="rs-h1">{t.h1}</h1>
        </div>
        <p className="rs-lede">{t.lede}</p>
      </section>

      <div className="rs-raid-grid">
        <section className="rs-pnl">
          <h2 className="rs-hd">{t.pick}</h2>
          {KINDS.map((k) => (
            <div key={k} className="rs-raid-kind">
              <h3>{t.kinds[k]}</h3>
              {k === "building" && <p className="rs-note">{t.buildingNote}</p>}
              <ul className="rs-raid-targets">
                {TARGETS.filter((x) => x.kind === k).map((x) => {
                  const name = say(x.name, lang);
                  const qty = sel[x.id] ?? 0;
                  return (
                    <li key={x.id} className={qty ? "is-on" : undefined}>
                      <img
                        src={`/rust/items/${x.icon}.webp`}
                        alt=""
                        width={32}
                        height={32}
                      />
                      <span className="rs-raid-name">
                        {name}
                        <small>{t.hp(num(x.hp))}</small>
                      </span>
                      <span className="rs-stepper">
                        <button
                          type="button"
                          onClick={() => bump(x.id, -1)}
                          disabled={!qty}
                          aria-label={`${t.remove}: ${name}`}
                        >
                          −
                        </button>
                        <b>{qty}</b>
                        <button
                          type="button"
                          onClick={() => bump(x.id, 1)}
                          aria-label={`${t.add}: ${name}`}
                        >
                          +
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </section>

        <section className="rs-pnl rs-raid-result" aria-live="polite">
          <h2 className="rs-hd">{t.result}</h2>
          {!picked ? (
            <p className="rs-note">{t.empty}</p>
          ) : (
            <>
              {mix && (
                <div className="rs-raid-mix">
                  <b>{t.cheapest}</b>
                  <ul className="rs-raid-mixlist">
                    {EXPLOSIVES.filter((e) => mix.counts[e.id]).map((e) => (
                      <li key={e.id}>
                        <img
                          src={`/rust/items/${e.id}.webp`}
                          alt=""
                          width={28}
                          height={28}
                        />
                        <span className="rs-raid-mixname">
                          {say(e.name, lang)}
                        </span>
                        <b>× {num(mix.counts[e.id])}</b>
                      </li>
                    ))}
                  </ul>
                  <span className="rs-raid-sulfur">
                    {num(mix.sulfur)} {t.sulfur.toLowerCase()}
                  </span>
                </div>
              )}
              <div className="rs-scroll">
                <table className="rs-table">
                  <thead>
                    <tr>
                      <th scope="col">{t.explosive}</th>
                      <th scope="col">{t.amount}</th>
                      <th scope="col">{t.sulfur}</th>
                      <th scope="col">{t.gunpowder}</th>
                      <th scope="col">{t.time}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {EXPLOSIVES.map((e) => {
                      const r = selectionCost(sel, e.id);
                      if (!r) return null;
                      return (
                        <tr key={e.id}>
                          <th scope="row">
                            <img
                              src={`/rust/items/${e.id}.webp`}
                              alt=""
                              width={28}
                              height={28}
                            />{" "}
                            {say(e.name, lang)}
                            {e.dud > 0 && (
                              <small className="rs-dud">
                                {t.dud(Math.round(e.dud * 100))}
                              </small>
                            )}
                          </th>
                          <td>{num(r.count)}</td>
                          {r.sulfur === null ? (
                            <td colSpan={3} className="rs-note">
                              {t.notCraftable}
                            </td>
                          ) : (
                            <>
                              <td>{num(r.sulfur)}</td>
                              <td>{num(r.gunpowder!)}</td>
                              <td>
                                {t.minutes(
                                  (r.time! / 60).toLocaleString(locale, {
                                    maximumFractionDigits: 1,
                                  }),
                                )}
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="rs-raid-actions">
                <button type="button" className="rs-btn" onClick={copyLink}>
                  {copied === "ok"
                    ? t.copied
                    : copied === "fail"
                      ? t.copyFailed
                      : t.share}
                </button>
                <button
                  type="button"
                  className="rs-btn"
                  onClick={() => setSel({})}
                >
                  {t.clear}
                </button>
              </p>
            </>
          )}
        </section>
      </div>

      <RaidTable route={route} navigate={navigate} />
    </main>
  );
}
