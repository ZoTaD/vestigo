/**
 * Las piezas que comparten las pantallas de CS2 (2026-11-03), con la estética A "Mesa de mercado": el precio en
 * dólares, la rareza por color de texto, la barra de desgastes con el rango de float, la imagen y la hoja de
 * "cargando…".
 */
import type { ReactNode } from "react";
import { useLang } from "../i18n";
import type { Route } from "../route";
import { SettledImg } from "../SettledImg";
import { useCs2Copy, WEARS, type Cs2Rarity } from "../cs2Copy";
import type { SkinPrice, SkinRow } from "./data";

export type Nav = (r: Route) => void;

/** Un número con la coma o el punto del idioma y `d` decimales. */
export function useNum() {
  const { lang } = useLang();
  const loc = lang === "es" ? "es-AR" : "en-US";
  return (v: number, d = 2) => v.toLocaleString(loc, { minimumFractionDigits: d, maximumFractionDigits: d });
}

/**
 * Un precio en dólares, siempre con "US$" (ZoTaD, 3/11: un "0,73" suelto no se entiende), o "—" si no hay. `sug`: es
 * el sugerido (no hay publicaciones), con su marca tenue.
 */
export function Price({ v, sug = false }: { v: number | null | undefined; sug?: boolean }) {
  const t = useCs2Copy();
  const num = useNum();
  if (v == null) return <span className="c2-num is-none">—</span>;
  return (
    <span className="c2-num" title={sug ? t.t.suggestedHint : undefined}>
      US$ {num(v)}
      {sug && <small className="c2-sug"> {t.t.suggested}</small>}
    </span>
  );
}

/** Un porcentaje (0,0064 → "0,64 %"). */
export function Pct({ v, d = 2, className }: { v: number; d?: number; className?: string }) {
  const num = useNum();
  return <span className={className ? `c2-num ${className}` : "c2-num"}>{num(v * 100, d)}&#8201;%</span>;
}

/** Un float con dos decimales ("0,00–0,80"). */
export function FloatRange({ min, max }: { min: number | null; max: number | null }) {
  const num = useNum();
  if (min == null || max == null) return <span className="c2-num is-none">—</span>;
  return (
    <span className="c2-num">
      {num(min)}–{num(max)}
    </span>
  );
}

/** El nombre de una rareza, escrito en su color (texto, nunca un filo). */
export function Rarity({ r }: { r: Cs2Rarity }) {
  const t = useCs2Copy();
  return <span className={`c2-r is-${r}`}>{t.rarity[r]}</span>;
}

/** Los cinco tramos de desgaste en colores apagados, con el rango de float de la skin marcado encima. */
export function WearBar({ min, max }: { min: number | null; max: number | null }) {
  if (min == null || max == null) return null;
  return (
    <div className="c2-wearbar" role="img" aria-label={`${min}–${max}`}>
      {WEARS.map((w) => (
        <span key={w.ab} className={`c2-wb is-${w.ab.toLowerCase()}`} style={{ width: `${(w.to - w.from) * 100}%` }}>
          {w.ab}
        </span>
      ))}
      <i className="c2-wb-range" style={{ left: `${min * 100}%`, width: `${(max - min) * 100}%` }} />
    </div>
  );
}

/**
 * La imagen de una skin, caja o colección: `public/cs2/s/<img>.webp` (128 px) o, de la ficha, `l/` (360 px). Caja de
 * tamaño fijo, así no corre la página al llegar; `SettledImg` en las listas (baja al frenar el scroll).
 */
export function Img({ img, w, h, big = false, lazy = true }: { img: string | null | undefined; w: number; h: number; big?: boolean; lazy?: boolean }) {
  if (!img) return <span className="c2-img is-empty" style={{ width: w, height: h }} aria-hidden="true" />;
  const props = { className: "c2-img", src: `/cs2/${big ? "l" : "s"}/${img}.webp`, alt: "", width: w, height: h };
  return lazy ? <SettledImg {...props} /> : <img {...props} decoding="async" />;
}

/** La hoja de "cargando…" (o del error, con el botón para reintentar). Clase `c2-loading`: la busca el prerender. */
export function Cs2Loading({ onRetry }: { onRetry?: () => void }) {
  const t = useCs2Copy();
  return (
    <main className="c2-main c2-loading" aria-busy={!onRetry}>
      <section className="c2-panel">
        {onRetry ? (
          <p role="alert">
            {t.loadError}{" "}
            <button type="button" className="c2-btn" onClick={onRetry}>
              {t.retry}
            </button>
          </p>
        ) : (
          <p>{t.loading}</p>
        )}
      </section>
    </main>
  );
}

/** "AK-47 | Inheritance" → "Inheritance"; la fase va al lado ("Doppler · Ruby"). Un cuchillo sin pintura queda con su nombre. */
export function skinPart(s: { name: string; phase?: string }): string {
  const part = s.name.includes(" | ") ? s.name.split(" | ")[1] : s.name.replace(/^★ /, "");
  return s.phase ? `${part} · ${s.phase}` : part;
}

/** ¿El rango de float de la skin llega al desgaste `i`? */
export const reaches = (s: { min: number | null; max: number | null }, i: number): boolean =>
  s.min != null && s.max != null && s.min < WEARS[i].to && s.max > WEARS[i].from;

/**
 * La tabla de precios por desgaste: normal y, si la skin los tiene con algún precio, StatTrak y Souvenir. Sólo los
 * desgastes que alcanza. `short`: el desgaste abreviado (FN, MW…), para el costado angosto.
 */
export function WearPrices({ skin, price, short = false }: { skin: { min: number | null; max: number | null; st: boolean; sv: boolean }; price: SkinPrice | undefined; short?: boolean }) {
  const t = useCs2Copy();
  const any = (a: (number | null)[] | undefined) => !!a?.some((v) => v != null);
  const st = skin.st && any(price?.st);
  const sv = skin.sv && any(price?.sv);
  const rows = skin.min == null ? [-1] : WEARS.map((_, i) => i).filter((i) => reaches(skin, i));
  return (
    <table className="c2-wp">
      <thead>
        <tr>
          <th>{t.t.wearCol}</th>
          <th>{t.t.normal}</th>
          {st && <th>{t.t.stattrak}</th>}
          {sv && <th>{t.t.souvenir}</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((i) => {
          const k = Math.max(i, 0);
          return (
            <tr key={i}>
              <td>{i < 0 ? "—" : short ? <abbr title={t.wear[i]}>{WEARS[i].ab}</abbr> : t.wear[i]}</td>
              <td>
                <Price v={price?.n?.[k]} sug={!!((price?.sug ?? 0) & (1 << k))} />
              </td>
              {st && (
                <td>
                  <Price v={price?.st?.[k]} />
                </td>
              )}
              {sv && (
                <td>
                  <Price v={price?.sv?.[k]} />
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** El costado de la maqueta A: arma y rareza, nombre, imagen grande, barra de desgastes y precios. `children` va al pie. */
export function SkinSide({ skin, price, children }: { skin: SkinRow; price: SkinPrice | undefined; children?: ReactNode }) {
  const t = useCs2Copy();
  return (
    <aside className="c2-panel c2-side">
      <p className="c2-dim">
        {skin.weapon} · <Rarity r={skin.rarity} />
      </p>
      <h2>{skinPart(skin)}</h2>
      <Img img={skin.img} w={300} h={190} big />
      {skin.min != null && (
        <p className="c2-dim">
          {t.t.float} <FloatRange min={skin.min} max={skin.max} />
        </p>
      )}
      <WearBar min={skin.min} max={skin.max} />
      <WearPrices skin={skin} price={price} />
      {children}
    </aside>
  );
}
