/**
 * El buscador de skins del Trade-up (2026-11-03): un campo y, mientras se escribe, hasta 8 resultados con imagen,
 * nombre y colección. Tocar uno lo elige (`onPick`) y vacía el campo.
 */
import { useMemo, useState } from "react";
import type { SkinRow } from "../data";
import { Img } from "../ui";

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function SkinSearch({
  rows,
  placeholder,
  colName,
  onPick,
}: {
  rows: SkinRow[];
  placeholder: string;
  colName: (slug: string | undefined) => string;
  onPick: (s: SkinRow) => void;
}) {
  const [q, setQ] = useState("");
  const hits = useMemo(() => {
    const words = fold(q).split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return rows.filter((r) => words.every((w) => fold(`${r.name} ${r.phase ?? ""} ${colName(r.col)}`).includes(w))).slice(0, 8);
  }, [rows, q, colName]);
  return (
    <div className="c2-tu-search">
      <input type="search" value={q} placeholder={placeholder} aria-label={placeholder} onChange={(e) => setQ(e.target.value)} />
      {hits.length > 0 && (
        <ul className="c2-tu-hits">
          {hits.map((s) => (
            <li key={s.slug}>
              <button
                type="button"
                className={`is-${s.rarity}`}
                onClick={() => {
                  onPick(s);
                  setQ("");
                }}
              >
                <Img img={s.img} w={64} h={44} lazy={false} />
                <span>
                  <strong>{s.phase ? `${s.name} · ${s.phase}` : s.name}</strong>
                  <small>{colName(s.col)}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
