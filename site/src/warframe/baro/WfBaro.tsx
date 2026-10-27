/**
 * La pestaña Baro Ki'Teer de Warframe (2026-10-27, etapa 2). Arriba, la visita de ahora desde la API (`baroLive.ts`),
 * pedida después de montar como en la portada: si llegó, el relé, cuánto le queda y lo que vende; si no, dónde y cuándo
 * llega. El prerender no la trae, y si la API cae el bloque no aparece. Abajo, el historial del repo
 * (`baro/history.json`, que escribe `tools/baro.py`), la visita más nueva primero y abierta.
 *
 * Un objeto en vivo enlaza a su ficha si su `uniqueName` aparece en el historial con `ref`.
 */
import { useEffect, useMemo, useState } from "react";
import { useLang, useLocale } from "../../i18n";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useLoad } from "../../useLoad";
import { useWfCopy } from "../../warframeCopy";
import { loadBaroHistory, peekBaroHistory, say, type BaroHistory, type BaroItem, type BaroVisit } from "../data";
import { Icon, Panel, WfLoading, type Nav } from "../ui";
import { countdown, useNow } from "../WarframeHome";
import { fetchBaro, type BaroLive } from "./baroLive";

/** Una fecha del historial, en UTC: el prerender y el navegador escriben lo mismo. */
const day = (iso: string, locale: string) => new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** La visita en vivo: `undefined` mientras se pide, `null` si la API no respondió (o no hay visita a la vista). */
function useBaro(lang: "en" | "es"): BaroLive | null | undefined {
  const [live, setLive] = useState<BaroLive | null | undefined>(undefined);
  useEffect(() => {
    const ctl = new AbortController();
    fetchBaro(lang, ctl.signal).then((b) => !ctl.signal.aborted && setLive(b));
    return () => ctl.abort();
  }, [lang]);
  return live;
}

export default function WfBaro({ route, navigate }: { route: Route; navigate: Nav }) {
  const data = useLoad("list", () => peekBaroHistory() ?? undefined, () => loadBaroHistory());
  if (data.failed) return <WfLoading onRetry={data.retry} />;
  if (!data.value) return <WfLoading />;
  return <BaroPage history={data.value} route={route} navigate={navigate} />;
}

function BaroPage({ history, route, navigate }: { history: BaroHistory; route: Route; navigate: Nav }) {
  const c = useWfCopy().baroPage;
  const { lang } = useLang();
  const locale = useLocale();
  const now = useNow();
  const live = useBaro(lang);
  // De `uniqueName` a su ficha, de todo lo que alguna vez vendió.
  const refs = useMemo(() => {
    const m = new Map<string, NonNullable<BaroItem["ref"]>>();
    for (const v of history.visits) for (const it of v.items) if (it.ref && !m.has(it.unique)) m.set(it.unique, it.ref);
    return m;
  }, [history]);
  // La visita más nueva sale abierta; las otras se abren a mano.
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(history.visits.slice(0, 1).map((v) => v.start)));
  const toggle = (key: string, on: boolean) =>
    setOpen((prev) => {
      if (prev.has(key) === on) return prev;
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  // Si ya se fue mientras la página estaba abierta, el bloque se apaga sin pedir de nuevo.
  const shown = live && now !== null && live.endsAt > now ? live : null;
  const when = (ms: number) => new Date(ms).toLocaleString(locale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <main className="wf-main wf-baro-page">
      <Panel>
        <h1 className="wf-h1">{c.h1}</h1>
        <p className="wf-lede">{c.lede}</p>
      </Panel>

      {shown && now !== null && (
        <Panel aria-labelledby="wf-baro-now">
          <h2 className="wf-h2" id="wf-baro-now">
            {c.now}
          </h2>
          {now >= shown.startsAt ? (
            <>
              <p className="wf-baro-where">{c.here(shown.location)}</p>
              <p className="wf-dim">{c.leaves(countdown(shown.endsAt - now), when(shown.endsAt))}</p>
              {shown.items.length ? (
                <ItemTable
                  rows={shown.items.map((it) => ({ key: it.unique || it.name, name: it.name, ducats: it.ducats, credits: it.credits, ref: refs.get(it.unique) ?? null }))}
                  route={route}
                  navigate={navigate}
                />
              ) : (
                <p className="wf-dim">{c.noItems}</p>
              )}
            </>
          ) : (
            <>
              <p className="wf-baro-where">{c.coming(shown.location)}</p>
              <p className="wf-dim">{c.arrives(countdown(shown.startsAt - now), when(shown.startsAt))}</p>
            </>
          )}
        </Panel>
      )}

      <Panel aria-labelledby="wf-baro-history">
        <h2 className="wf-h2" id="wf-baro-history">
          {c.history}
        </h2>
        {history.visits.length ? (
          <ul className="wf-baro-visits">
            {history.visits.map((v) => (
              <Visit key={v.start} v={v} open={open.has(v.start)} onToggle={(on) => toggle(v.start, on)} route={route} navigate={navigate} />
            ))}
          </ul>
        ) : (
          <p className="wf-dim">{c.noHistory}</p>
        )}
      </Panel>
    </main>
  );
}

/** Una visita del historial. Cerrada muestra el relé, las fechas y cuántos objetos: la tabla se dibuja al abrirla. */
function Visit({ v, open, onToggle, route, navigate }: { v: BaroVisit; open: boolean; onToggle: (on: boolean) => void; route: Route; navigate: Nav }) {
  const c = useWfCopy().baroPage;
  const { lang } = useLang();
  const locale = useLocale();
  return (
    <li>
      <details className="wf-baro-visit" open={open} onToggle={(e) => onToggle(e.currentTarget.open)}>
        <summary>
          <b>{say(v.location, lang)}</b>
          <span className="wf-dim">
            {c.visit(day(v.start, locale), day(v.end, locale))} · {c.items(v.items.length)}
          </span>
        </summary>
        {open && (
          <ItemTable rows={v.items.map((it) => ({ key: it.unique, name: say(it.name, lang), ducats: it.ducats, credits: it.credits, ref: it.ref }))} route={route} navigate={navigate} />
        )}
      </details>
    </li>
  );
}

type Row = { key: string; name: string; ducats: number; credits: number; ref: BaroItem["ref"] };

/** El inventario: ícono y nombre (enlazado si tiene ficha), ducados y créditos. */
function ItemTable({ rows, route, navigate }: { rows: Row[]; route: Route; navigate: Nav }) {
  const c = useWfCopy().baroPage;
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);
  return (
    <div className="wf-table-wrap">
      <table className="wf-table wf-baro-items">
        <thead>
          <tr>
            <th scope="col">{c.item}</th>
            <th scope="col" className="is-num">
              {c.ducats}
            </th>
            <th scope="col" className="is-num">
              {c.credits}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.key}-${i}`}>
              <td>
                <span className="wf-baro-item">
                  <Icon img={r.ref?.img} size={32} />
                  {r.ref ? (
                    <RouteLink to={{ ...route, view: "warframe", wfSection: r.ref.tab, detail: r.ref.slug }} onNavigate={navigate} prefetch="press">
                      {r.name}
                    </RouteLink>
                  ) : (
                    <span>{r.name}</span>
                  )}
                </span>
              </td>
              <td className="is-num">{num(r.ducats)}</td>
              <td className="is-num">{num(r.credits)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
