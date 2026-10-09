/**
 * La paleta (2026-10-09): los componentes por categoría, con buscador (nombre en/es o shortname). Clic agrega uno en
 * el medio del lienzo; también se arrastran.
 */
import { useMemo, useState } from "react";
import type { Category, ComponentDef } from "../engine/types";
import { iconOf, nameOf, useEditor } from "./ctx";

export const DRAG_TYPE = "application/x-vestigo-rust-part";

const fold = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function Palette({ onAdd }: { onAdd: (type: string) => void }) {
  const { store, lang, t } = useEditor();
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const f = fold(q.trim());
    const out = new Map<Category, ComponentDef[]>();
    for (const cat of store.cat.data.categories) out.set(cat, []);
    for (const c of store.cat.data.components) {
      if (c.hidden) continue;
      if (f && !fold(`${c.name.en} ${c.name.es ?? ""} ${c.id}`).includes(f)) continue;
      out.get(c.cat)?.push(c);
    }
    for (const list of out.values()) list.sort((a, b) => nameOf(a.name, lang).localeCompare(nameOf(b.name, lang), lang));
    return [...out].filter(([, l]) => l.length);
  }, [q, store, lang]);
  return (
    <aside className="el-pal" aria-label={t.palette}>
      <h2 className="rs-hd">{t.palette}</h2>
      <input className="el-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.search} aria-label={t.search} />
      <div className="el-pal-list">
        {groups.map(([cat, list]) => (
          <section key={cat}>
            <h3>{t.cats[cat]}</h3>
            <ul>
              {list.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="el-pal-item"
                    title={nameOf(c.name, lang)}
                    onClick={() => onAdd(c.id)}
                    draggable
                    onDragStart={(ev) => {
                      ev.dataTransfer.setData(DRAG_TYPE, c.id);
                      ev.dataTransfer.effectAllowed = "copy";
                    }}
                  >
                    <img src={iconOf(c.id)} alt="" width={32} height={32} loading="lazy" decoding="async" />
                    <span>{nameOf(c.name, lang)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </aside>
  );
}
