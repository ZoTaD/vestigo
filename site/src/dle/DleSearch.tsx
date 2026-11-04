import { useId, useMemo, useState, type KeyboardEvent } from "react";
import type { PoolEntry } from "./api";

/** El ícono chico del buscador: la versión `w96` que ya publica el sitio. */
const small = (img: string) => img.replace("/deadlock/game/", "/deadlock/game/w96/");
const MAX = 6;

/**
 * El buscador con autocompletar: sólo nombres del modo y ninguno ya probado. Los
 * que empiezan con lo escrito van primero; después, los que lo contienen.
 */
export default function DleSearch({
  entries,
  tried,
  placeholder,
  button,
  busy,
  onPick,
}: {
  entries: PoolEntry[];
  tried: Set<string>;
  placeholder: string;
  button: string;
  busy: boolean;
  onPick: (name: string) => void;
}) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const list = useId();
  const hits = useMemo(() => {
    const want = q.trim().toLowerCase();
    if (!want) return [];
    const open = entries.filter((e) => !tried.has(e.id));
    const starts = open.filter((e) => e.name.toLowerCase().startsWith(want));
    const has = open.filter((e) => !starts.includes(e) && e.name.toLowerCase().includes(want));
    return [...starts, ...has].slice(0, MAX);
  }, [q, entries, tried]);

  const pick = (name: string) => {
    if (busy) return;
    onPick(name);
    setQ("");
    setSel(0);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") setSel((s) => Math.min(s + 1, hits.length - 1));
    else if (e.key === "ArrowUp") setSel((s) => Math.max(s - 1, 0));
    else if (e.key === "Enter") {
      e.preventDefault();
      const hit = hits[sel] ?? hits[0];
      if (hit) pick(hit.name);
    } else return;
    e.preventDefault();
  };

  return (
    <div className="dle-search box">
      <input
        type="text"
        value={q}
        placeholder={placeholder}
        aria-label={placeholder}
        aria-autocomplete="list"
        aria-controls={list}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => {
          setQ(e.target.value);
          setSel(0);
        }}
        onKeyDown={onKey}
      />
      <button type="button" disabled={busy || !hits.length} onClick={() => hits[sel] && pick(hits[sel].name)}>
        {button}
      </button>
      {hits.length > 0 && (
        <ul className="dle-drop box" id={list} role="listbox">
          {hits.map((h, i) => (
            <li key={h.id} role="option" aria-selected={i === sel} className={i === sel ? "is-on" : undefined} onPointerDown={(e) => (e.preventDefault(), pick(h.name))}>
              <img src={small(h.img)} alt="" width={34} height={34} loading="lazy" decoding="async" />
              <span>{h.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
