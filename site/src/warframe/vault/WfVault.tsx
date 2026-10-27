/**
 * La pestaña Prime Vault de Warframe (2026-10-27, etapa 2): cada Prime con su estado (disponible, en el Vault, parcial o
 * sin reliquias), en una grilla de íconos con el nombre enlazado a su ficha del Arsenal y chips de estado y de tipo. Al
 * pie, los cambios de estado que anota `site_data.py` (`prime-vault/history.json`), el más nuevo primero.
 *
 * El estado se escribe en su color de texto (nunca un filo), como la rareza de los mods.
 */
import { useMemo, useState } from "react";
import { useLang, useLocale } from "../../i18n";
import { LazyRows, skipSprite } from "../../LazyRows";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useLoad } from "../../useLoad";
import { useWfCopy, WF_KINDS, type WfKind } from "../../warframeCopy";
import { loadVault, peekVault, say, sortArsenal, VAULT_STATUSES, type VaultEvent, type VaultRow, type VaultStatus } from "../data";
import { Icon, Panel, WfLoading, type Nav } from "../ui";

/** El alto de un casillero (ícono de 96 px, nombre en dos líneas y estado), en px: el más alto mide 153 en el navegador a 1.100 px (2026-10-27). */
const VAULT_CELL = 160;
/** Cuántos casilleros lleva una tanda: con 6 a 7 columnas, unas 8 filas. */
const VAULT_CHUNK = 48;
/** El alto de una fila de "Cambios del Vault", en px, medido en el navegador (2026-10-27). */
const CHANGE_ROW = 38;

/** Una fecha `AAAA-MM-DD` del historial, escrita en el idioma. En UTC: el prerender y el navegador escriben lo mismo. */
const day = (iso: string, locale: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default function WfVault({ route, navigate }: { route: Route; navigate: Nav }) {
  const data = useLoad("list", () => peekVault() ?? undefined, () => loadVault());
  if (data.failed) return <WfLoading onRetry={data.retry} />;
  if (!data.value) return <WfLoading />;
  return <VaultPage rows={data.value.list} history={data.value.history} route={route} navigate={navigate} />;
}

function VaultPage({ rows, history, route, navigate }: { rows: VaultRow[]; history: VaultEvent[]; route: Route; navigate: Nav }) {
  const t = useWfCopy();
  const c = t.vaultList;
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [kind, setKind] = useState<WfKind | null>(null);

  const sorted = useMemo(() => sortArsenal(rows, lang), [rows, lang]);
  const shown = useMemo(() => sorted.filter((r) => (!status || r.status === status) && (!kind || r.kind === kind)), [sorted, status, kind]);
  const kinds = useMemo(() => WF_KINDS.filter((k) => rows.some((r) => r.kind === k)), [rows]);
  const perStatus = (s: VaultStatus) => rows.filter((r) => r.status === s && (!kind || r.kind === kind)).length;
  const bySlug = useMemo(() => new Map(rows.map((r) => [r.slug, r])), [rows]);
  const link = (slug: string) => ({ ...route, view: "warframe" as const, wfSection: "arsenal" as const, detail: slug });

  return (
    <main className="wf-main wf-vault">
      <Panel>
        <h1 className="wf-h1">{c.h1}</h1>
        <p className="wf-lede">{c.lede(num(rows.length))}</p>
        <div className="wf-filters">
          <div className="wf-chips" role="group" aria-label={c.status}>
            <span className="wf-label">{c.status}</span>
            <button type="button" className={`wf-pill${status === null ? " is-on" : ""}`} aria-pressed={status === null} onClick={() => setStatus(null)}>
              {c.all}
            </button>
            {VAULT_STATUSES.map((s) => (
              <button type="button" className={`wf-pill${status === s ? " is-on" : ""}`} aria-pressed={status === s} onClick={() => setStatus(s)} key={s}>
                {c.statuses[s]} <span className="wf-pill-n">{num(perStatus(s))}</span>
              </button>
            ))}
          </div>
          <div className="wf-chips" role="group" aria-label={c.kind}>
            <span className="wf-label">{c.kind}</span>
            <button type="button" className={`wf-pill${kind === null ? " is-on" : ""}`} aria-pressed={kind === null} onClick={() => setKind(null)}>
              {c.all}
            </button>
            {kinds.map((k) => (
              <button type="button" className={`wf-pill${kind === k ? " is-on" : ""}`} aria-pressed={kind === k} onClick={() => setKind(k)} key={k}>
                {t.arsenal.kinds[k]}
              </button>
            ))}
          </div>
          <p className="wf-count" aria-live="polite">
            {shown.length ? c.count(num(shown.length)) : c.none}
          </p>
        </div>
      </Panel>

      <Panel>
        <div className="wf-grid wf-vault-grid">
          <LazyRows
            items={shown}
            rowHeight={VAULT_CELL}
            chunk={VAULT_CHUNK}
            tag="div"
            eager
            margin={300}
            render={(r, i) => (
              <RouteLink key={r.slug} className="wf-cell wf-vault-cell" to={link(r.slug)} onNavigate={navigate} prefetch="press">
                {skipSprite(i, VAULT_CHUNK) ? <Icon img={null} size={96} /> : <Icon img={r.img} size={96} />}
                <span className="wf-vault-name">{say(r.name, lang)}</span>
                <small className={`wf-vault-status is-${r.status}`}>{c.statusLong[r.status]}</small>
              </RouteLink>
            )}
          />
        </div>
        <p className="wf-dim wf-vault-note">{c.note}</p>
      </Panel>

      <Panel aria-labelledby="wf-vault-changes">
        <h2 className="wf-h2" id="wf-vault-changes">
          {c.changes}
        </h2>
        {history.length ? (
          <div className="wf-table-wrap">
            <table className="wf-table wf-vault-changes">
              <thead>
                <tr>
                  <th scope="col">{c.date}</th>
                  <th scope="col">{c.item}</th>
                  <th scope="col">{c.change}</th>
                </tr>
              </thead>
              <tbody>
                <LazyRows
                  items={history}
                  rowHeight={CHANGE_ROW}
                  chunk={60}
                  tag="tr"
                  render={(e, i) => {
                    const row = bySlug.get(e.slug);
                    return (
                      <tr key={`${e.date}-${e.slug}-${i}`}>
                        <td className="is-num">{day(e.date, locale)}</td>
                        <td>
                          {row ? (
                            <RouteLink to={link(e.slug)} onNavigate={navigate} prefetch="press">
                              {say(row.name, lang)}
                            </RouteLink>
                          ) : (
                            e.slug
                          )}
                        </td>
                        <td>
                          <span className={e.from ? `wf-vault-status is-${e.from}` : "wf-dim"}>{e.from ? c.statusLong[e.from] : c.added}</span>
                          {" → "}
                          <span className={`wf-vault-status is-${e.to}`}>{c.statusLong[e.to]}</span>
                        </td>
                      </tr>
                    );
                  }}
                />
              </tbody>
            </table>
          </div>
        ) : (
          <p className="wf-dim">{c.noChanges}</p>
        )}
      </Panel>
    </main>
  );
}
