/**
 * La pestaña Inventario de CS2 (2026-11-03, etapa 3), maqueta B "Vitrina". Plan: docs/superpowers/plans/2026-11-03-cs2-etapa-3.md.
 *
 * El jugador pega su perfil (SteamID64, nombre o URL); la página le pide el inventario al intermediario
 * (`/api/cs2/inventory`, una Netlify Function con caché de 15 minutos) y lo valúa con todos los precios de Skinport. Si
 * Steam no responde o el inventario es privado, puede pegarlo a mano: se lee acá mismo, sin servidor. El perfil queda
 * en la dirección (`?id=`) para compartir. Sin perfil, el prerender dibuja sólo el formulario.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { LazyRows } from "../../LazyRows";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { SettledImg } from "../../SettledImg";
import { useCs2Copy } from "../../cs2Copy";
import { loadAllPrices, loadList } from "../data";
import { Price, useNum, type Nav } from "../ui";
import { compact, inventoryUrl, parseProfile, skinSlugOf, type InvError, type InvItem } from "./steam";
import { rarityKey, valuate, type Valued } from "./value";

type State =
  | { s: "idle" }
  | { s: "loading" }
  | { s: "error"; error: InvError | "paste"; steamid?: string }
  | { s: "ok"; items: InvItem[]; partial: boolean };
type Sort = "total" | "price" | "name";
/** El alto de una tarjeta (imagen de 120 px, nombre en dos líneas y precio), medido en el navegador. */
const CARD = 252;

const steamImg = (icon: string) => `https://community.akamai.steamstatic.com/economy/image/${icon}/256fx192f`;

export default function Cs2Inventory({ route, navigate }: { route: Route; navigate: Nav }) {
  const t = useCs2Copy();
  const v = t.inv;
  const num = useNum();
  const [input, setInput] = useState("");
  const [st, setSt] = useState<State>({ s: "idle" });
  const [prices, setPrices] = useState<Record<string, number> | null>(null);
  const [links, setLinks] = useState<Set<string> | null>(null);
  const [type, setType] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("total");
  const [paste, setPaste] = useState("");
  const pasteRef = useRef<HTMLDetailsElement>(null);

  const run = async (raw: string) => {
    const p = parseProfile(raw);
    if (!p) return setSt({ s: "error", error: "bad" });
    const id = p.kind === "vanity" ? p.value.toLowerCase() : p.value;
    window.history.replaceState(window.history.state, "", `${window.location.pathname}?id=${encodeURIComponent(id)}`);
    setSt({ s: "loading" });
    loadAllPrices().then(setPrices, () => undefined);
    try {
      const r = await fetch(`/api/cs2/inventory?id=${encodeURIComponent(id)}`);
      const body = await r.json();
      if (body.error) setSt({ s: "error", error: body.error, steamid: body.steamid });
      else setSt({ s: "ok", items: body.items, partial: !!body.partial });
    } catch {
      setSt({ s: "error", error: "busy" });
    }
  };
  // Con un perfil en la dirección, se valúa al abrir.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (id) {
      setInput(id);
      void run(id);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Las skins y cajas que tienen ficha, para enlazarlas (después de que llegó el inventario).
  useEffect(() => {
    if (st.s !== "ok" || links) return;
    Promise.all([loadList("skins"), loadList("cases")]).then(([sk, cs]) => setLinks(new Set([...sk.map((x) => x.slug), ...cs.map((x) => x.slug)])), () => undefined);
  }, [st, links]);

  const readPaste = () => {
    let json: unknown = null;
    try {
      json = JSON.parse(paste);
    } catch {
      /* lo dice abajo */
    }
    const r = compact(json);
    // El enlace a Steam se queda: es lo que hace falta para volver a intentarlo.
    if ("error" in r) return setSt((prev) => ({ s: "error", error: "paste", steamid: prev.s === "error" ? prev.steamid : undefined }));
    loadAllPrices().then(setPrices, () => undefined);
    setSt({ s: "ok", items: r.items, partial: r.more });
  };

  const val = useMemo(() => (st.s === "ok" && prices ? valuate(st.items, prices) : null), [st, prices]);
  const shown = useMemo(() => {
    if (!val) return [];
    const rows = val.items.filter((x) => !type || x.type === type);
    const by: Record<Sort, (a: Valued, b: Valued) => number> = {
      total: (a, b) => (b.total ?? -1) - (a.total ?? -1),
      price: (a, b) => (b.price ?? -1) - (a.price ?? -1),
      name: (a, b) => a.name.localeCompare(b.name),
    };
    return [...rows].sort(by[sort]);
  }, [val, type, sort]);
  const typeName = (k: string) => v.types[k] ?? k;
  const steamid = st.s === "error" ? st.steamid : undefined;
  const showPaste = st.s === "error" && st.error !== "bad" && st.error !== "notfound";

  return (
    <main className="c2-main c2-inv">
      <section className="c2-inv-hero">
        <div className="c2-head">
          <h1 className="c2-h1">{t.tabs.inventory}</h1>
          <p className="c2-lede">{t.seo.inventory.description}</p>
          <form
            className="c2-inv-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run(input);
            }}
          >
            <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder={v.placeholder} aria-label={v.placeholder} autoComplete="off" spellCheck={false} />
            <button type="submit" className="c2-btn" disabled={st.s === "loading"}>
              {v.go}
            </button>
          </form>
        </div>
        {val && (
          <div className="c2-inv-tag">
            <small>{v.worth(num(val.count, 0))}</small>
            <strong className="c2-num">US$ {num(val.total)}</strong>
          </div>
        )}
      </section>

      {st.s === "loading" && <p className="c2-dim" role="status">{v.loading}</p>}
      {st.s === "error" && (
        <p className="c2-tu-problem" role="alert">
          {v.error[st.error]}
        </p>
      )}

      <details className="c2-inv-paste" ref={pasteRef} open={showPaste || undefined}>
        <summary>{v.paste}</summary>
        <p>{v.pasteHow(!!steamid)}</p>
        {steamid && (
          <p>
            <a className="c2-btn" href={inventoryUrl(steamid)} target="_blank" rel="noreferrer noopener">
              {v.pasteLink}
            </a>
          </p>
        )}
        <textarea value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={v.pasteBox} aria-label={v.pasteBox} rows={4} spellCheck={false} />
        <button type="button" className="c2-btn" onClick={readPaste} disabled={!paste.trim()}>
          {v.pasteGo}
        </button>
      </details>

      {val && val.items.length === 0 && <p className="c2-dim">{v.empty}</p>}
      {val && val.items.length > 0 && (
        <>
          <div className="c2-filters">
            <div className="c2-seg" role="group">
              <button type="button" className={type === null ? "is-on" : ""} aria-pressed={type === null} onClick={() => setType(null)}>
                {v.all} · {num(val.total)}
              </button>
              {val.byType.map(([k, total]) => (
                <button type="button" key={k} className={type === k ? "is-on" : ""} aria-pressed={type === k} onClick={() => setType(k)}>
                  {typeName(k)} · {num(total)}
                </button>
              ))}
            </div>
            <label>
              {v.sortBy}
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="total">{v.byTotal}</option>
                <option value="price">{v.byPrice}</option>
                <option value="name">{v.byName}</option>
              </select>
            </label>
          </div>
          {(val.unpriced > 0 || (st.s === "ok" && st.partial)) && (
            <p className="c2-note">
              {val.unpriced > 0 && v.noPrice(val.unpriced)} {st.s === "ok" && st.partial && v.partial}
            </p>
          )}
          <div className="c2-inv-grid">
            <LazyRows
              items={shown}
              rowHeight={CARD}
              chunk={48}
              margin={300}
              eager
              render={(x) => {
                const slug = skinSlugOf(x.name);
                const linked = links?.has(slug);
                const tab = x.type === "Container" ? "cases" : "skins";
                const body = (
                  <>
                    {x.n > 1 && <span className="c2-inv-qty">×{x.n}</span>}
                    <SettledImg className="c2-img" src={steamImg(x.icon)} alt="" width={160} height={120} />
                    <strong>{x.name}</strong>
                    <small className="c2-r">
                      {typeName(x.type)}
                      {!x.tradable && ` · ${v.untradable}`}
                    </small>
                    <span className="c2-inv-p">
                      <span className="c2-dim">
                        <Price v={x.price} /> {x.n > 1 && v.each}
                      </span>
                      <b className="c2-num">{x.total == null ? "—" : num(x.total)}</b>
                    </span>
                  </>
                );
                return linked ? (
                  <RouteLink key={x.name} className={`c2-inv-card is-${rarityKey(x.rarity)}`} to={{ ...route, view: "cs2", c2Section: tab, detail: slug }} onNavigate={navigate}>
                    {body}
                  </RouteLink>
                ) : (
                  <div key={x.name} className={`c2-inv-card is-${rarityKey(x.rarity)}`}>
                    {body}
                  </div>
                );
              }}
            />
          </div>
        </>
      )}
    </main>
  );
}
