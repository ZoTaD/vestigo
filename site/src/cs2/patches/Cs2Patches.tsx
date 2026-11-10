/**
 * La pestaña Parches de CS2 (2026-11-03, etapa 5), maqueta A "Bitácora" elegida por ZoTaD: a la izquierda el archivo de
 * ediciones por año, y al centro la edición abierta (sin slug, la más nueva).
 *
 * Un parche va por secciones (Jugabilidad, Mapas…) con cada línea marcada en palabras como nuevo, cambio o arreglo; en
 * Mapas, cada mapa encabeza sus cambios. Las cajas y colecciones que nombra llevan a su ficha con su imagen; los mapas y
 * armas van marcados. Un lanzamiento (Rush Hour, una operación) va como Valve lo escribió: imágenes, títulos y texto.
 * Las notas salen sólo en inglés (son las de Valve); la interfaz, en los dos idiomas.
 *
 * El archivo dibuja sólo el año de la edición abierta (los otros, plegados): con los 312 anuncios abiertos, la página
 * pasaba el presupuesto de nodos.
 */
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { useLang } from "../../i18n";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useCs2Copy } from "../../cs2Copy";
import { useLoad } from "../../useLoad";
import { Cs2Loading, Img, type Nav } from "../ui";
import { loadPatch, loadPatchIndex, peekPatch, peekPatchIndex, type Block, type Line, type Patch, type PatchMeta, type Ref } from "./data";
import { fmtDate, patchName, sectionName } from "./names";

/** Las viñetas seguidas de un lanzamiento van juntas en una lista. */
function groupBody(body: Block[]): (Block | { list: string[] })[] {
  const out: (Block | { list: string[] })[] = [];
  for (const b of body) {
    const last = out[out.length - 1];
    if ("li" in b) {
      if (last && "list" in last) last.list.push(b.li);
      else out.push({ list: [b.li] });
    } else out.push(b);
  }
  return out;
}

export default function Cs2Patches({ route, navigate }: { route: Route; navigate: Nav }) {
  const t = useCs2Copy();
  const index = useLoad("index", () => peekPatchIndex() ?? undefined, loadPatchIndex);
  const slug = route.detail ?? index.value?.[0]?.slug ?? null;
  const patch = useLoad(slug, () => (slug ? peekPatch(slug) : undefined), () => loadPatch(slug!));
  if (index.failed || patch.failed) return <Cs2Loading onRetry={index.failed ? index.retry : patch.retry} />;
  if (!index.value || patch.value === undefined) return <Cs2Loading />;
  const list = index.value;
  const at = list.findIndex((e) => e.slug === slug);
  return (
    <main className="c2-main">
      <header className="c2-head">
        <h1 className="c2-h1">{t.tabH1.patches}</h1>
        <p className="c2-lede">{t.pt.lede}</p>
      </header>
      <div className="c2-pt">
        {/* Con `key`, pasar a una edición de otro año abre ese año en el archivo. */}
        <Archive key={(list[at] ?? list[0]).date.slice(0, 4)} list={list} open={list[at] ?? list[0]} route={route} navigate={navigate} />
        {patch.value ? (
          <Edition key={patch.value.slug} patch={patch.value} newer={list[at - 1]} older={list[at + 1]} route={route} navigate={navigate} />
        ) : (
          <p className="c2-panel">{t.pt.none}</p>
        )}
      </div>
    </main>
  );
}

/** El archivo: un botón por año y, del año abierto, una fila por edición. */
function Archive({ list, open, route, navigate }: { list: PatchMeta[]; open: PatchMeta; route: Route; navigate: Nav }) {
  const t = useCs2Copy();
  const { lang } = useLang();
  const years = [...new Set(list.map((e) => e.date.slice(0, 4)))];
  const [year, setYear] = useState(open.date.slice(0, 4));
  // La edición abierta, a la vista dentro del archivo (se mueve sólo la lista, no la página).
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = ref.current;
    const on = nav?.querySelector<HTMLElement>(".c2-pt-item.is-on");
    if (nav && on) nav.scrollTop = on.offsetTop - nav.clientHeight / 3;
  }, [open.slug]);
  return (
    <nav className="c2-pt-arch" aria-label={t.pt.archive} ref={ref}>
      {years.map((y) => (
        <Fragment key={y}>
          <button type="button" className={`c2-pt-year${y === year ? " is-on" : ""}`} aria-expanded={y === year} onClick={() => setYear(y)}>
            {y}
            <span>{list.filter((e) => e.date.startsWith(y)).length}</span>
          </button>
          {y === year && (
            <ul>
              {list
                .filter((e) => e.date.startsWith(y))
                .map((e) => {
                  const n = e.counts ? e.counts.new + e.counts.mid + e.counts.fix : 0;
                  return (
                    <li key={e.slug}>
                      <RouteLink
                        className={`c2-pt-item${e.slug === open.slug ? " is-on" : ""}`}
                        to={{ ...route, view: "cs2", c2Section: "patches", detail: e.slug }}
                        onNavigate={navigate}
                        active={e.slug === open.slug}
                      >
                        <b>{e.kind === "patch" ? fmtDate(e.date, lang, { day: "numeric", month: "long" }) : e.title}</b>
                        <small>
                          {e.kind === "patch"
                            ? [t.pt.lines(n), ...(e.secs ?? []).slice(0, 2).map((s) => sectionName(s, lang))].join(" · ")
                            : `${fmtDate(e.date, lang, { day: "numeric", month: "long" })} · ${t.pt.launch}`}
                        </small>
                      </RouteLink>
                    </li>
                  );
                })}
            </ul>
          )}
        </Fragment>
      ))}
    </nav>
  );
}

/** Lo que nombra una línea: caja o colección con su ficha, mapa o arma marcados. */
function Chips({ refs, skip, route, navigate }: { refs?: Ref[]; skip?: string; route: Route; navigate: Nav }) {
  const shown = (refs ?? []).filter((r) => r.name !== skip);
  if (!shown.length) return null;
  return (
    <>
      {shown.map((r) =>
        (r.kind === "case" || r.kind === "coll") && r.slug ? (
          <RouteLink key={r.name} className="c2-pt-ref" to={{ ...route, view: "cs2", c2Section: r.kind === "case" ? "cases" : "collections", detail: r.slug }} onNavigate={navigate}>
            <Img img={r.img} w={40} h={30} />
            {r.name}
          </RouteLink>
        ) : (
          <span key={r.name} className={`c2-pt-tag is-${r.kind}`}>
            {r.name}
          </span>
        ),
      )}
    </>
  );
}

function NoteLine({ line, route, navigate }: { line: Line; route: Route; navigate: Nav }) {
  const t = useCs2Copy();
  if (line.head)
    return (
      <li className="c2-pt-mh">
        <span className="c2-pt-tag is-map is-head">{line.text}</span>
      </li>
    );
  const dir = line.dir ?? "mid";
  return (
    <li className={`c2-pt-ln is-${dir}${line.sub ? " is-sub" : ""}`}>
      <span className="c2-pt-dir">{t.pt.dir[dir]}</span>
      <span className="c2-pt-tx">
        {line.text} <Chips refs={line.refs} skip={line.map} route={route} navigate={navigate} />
      </span>
    </li>
  );
}

function Edition({ patch, newer, older, route, navigate }: { patch: Patch; newer?: PatchMeta; older?: PatchMeta; route: Route; navigate: Nav }) {
  const t = useCs2Copy();
  const { lang } = useLang();
  const to = (e: PatchMeta): Route => ({ ...route, view: "cs2", c2Section: "patches", detail: e.slug });
  const c = { new: 0, mid: 0, fix: 0 };
  for (const s of patch.sections ?? []) for (const l of s.lines) if (!l.head) c[l.dir ?? "mid"]++;
  const body = patch.body ? groupBody(patch.body) : null;
  const firstImg = body?.findIndex((b) => "img" in b) ?? -1;
  const pager = (where: string): ReactNode => (
    <nav className={`c2-pt-pager is-${where}`}>
      {newer ? (
        <RouteLink className="c2-btn" to={to(newer)} onNavigate={navigate}>
          ← {t.pt.newer}: {patchName(newer, lang)}
        </RouteLink>
      ) : (
        <span />
      )}
      {older && (
        <RouteLink className="c2-btn" to={to(older)} onNavigate={navigate}>
          {t.pt.older}: {patchName(older, lang)} →
        </RouteLink>
      )}
    </nav>
  );
  return (
    <article className="c2-pt-ed">
      <header className="c2-pt-edh">
        <p className="c2-dim">
          {fmtDate(patch.date, lang)} · {patch.kind === "patch" ? t.pt.patch : t.pt.launch}
        </p>
        <h2 className="c2-pt-title">{patchName(patch, lang)}</h2>
        {patch.kind === "patch" && (
          <p className="c2-pt-tally">
            <span className="is-new">{t.pt.tally.new(c.new)}</span>
            <span className="is-mid">{t.pt.tally.mid(c.mid)}</span>
            <span className="is-fix">{t.pt.tally.fix(c.fix)}</span>
          </p>
        )}
      </header>
      {patch.sections?.map((s, i) => (
        <section className="c2-pt-sec" key={i}>
          <h3>{sectionName(s.title, lang)}</h3>
          <ul>
            {s.lines.map((l, k) => (
              <NoteLine key={k} line={l} route={route} navigate={navigate} />
            ))}
          </ul>
        </section>
      ))}
      {body && (
        <div className="c2-pt-body">
          {body.map((b, i) => {
            if ("img" in b)
              return (
                <span className="c2-pt-img" key={i}>
                  {/* Sólo la primera imagen, la de arriba, va sin `lazy`. */}
                  <img src={b.img} alt="" width={960} height={540} loading={i === firstImg ? undefined : "lazy"} decoding="async" />
                </span>
              );
            if ("h" in b) return <h3 key={i}>{b.h}</h3>;
            if ("p" in b) return <p key={i}>{b.p}</p>;
            if ("list" in b)
              return (
                <ul key={i}>
                  {b.list.map((x, k) => (
                    <li key={k}>{x}</li>
                  ))}
                </ul>
              );
            return null;
          })}
          {patch.refs?.some((r) => r.kind === "case" || r.kind === "coll") && (
            <div className="c2-where">
              <p className="c2-dim">{t.pt.named}</p>
              <div className="c2-links">
                <Chips refs={patch.refs.filter((r) => r.kind === "case" || r.kind === "coll")} route={route} navigate={navigate} />
              </div>
            </div>
          )}
        </div>
      )}
      <p className="c2-note">
        {t.pt.official}{" "}
        <a href={patch.url} target="_blank" rel="noopener noreferrer">
          {t.pt.steam}
        </a>
      </p>
      {pager("bottom")}
    </article>
  );
}
