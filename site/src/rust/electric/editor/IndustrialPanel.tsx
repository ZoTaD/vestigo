/**
 * Lo industrial del inspector (2026-10-09): el contenido de una caja, horno o crafteador (con su ranura) y los filtros
 * de una cinta. Se editan en la parte (lo que viaja en el link) y el mundo se rearma con eso.
 */
import { useMemo, useState } from "react";
import type { IOEntity } from "../engine";
import { isStorage, type IndustrialConveyor } from "../engine/behaviors/industrial";
import type { Part } from "../engine/types";
import { iconOf, useEditor } from "./ctx";

const fold = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Un buscador de objetos por nombre (en/es) o shortname. */
function ItemPicker({ onPick, label }: { onPick: (id: string) => void; label: string }) {
  const { store, lang } = useEditor();
  const [q, setQ] = useState("");
  const hits = useMemo(() => {
    const f = fold(q.trim());
    if (f.length < 2) return [];
    return Object.entries(store.world.items)
      .filter(([id, it]) => fold(`${it.name.en} ${it.name.es ?? ""} ${id}`).includes(f))
      .slice(0, 8);
  }, [q, store]);
  return (
    <div className="el-picker">
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={label} aria-label={label} />
      {hits.length ? (
        <ul>
          {hits.map(([id, it]) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => {
                  onPick(id);
                  setQ("");
                }}
              >
                <img src={iconOf(id)} alt="" width={20} height={20} loading="lazy" decoding="async" />
                {lang === "es" ? it.name.es ?? it.name.en : it.name.en}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function Contents({ e }: { e: IOEntity }) {
  const { store, t, lang, readOnly } = useEditor();
  if (!isStorage(e)) return null;
  const part = store.circuit.parts.find((p) => p.id === e.id);
  const name = (id: string) => {
    const n = store.world.items[id]?.name;
    return n ? (lang === "es" ? n.es ?? n.en : n.en) : id;
  };
  const stacks = [...e.container.items].sort((a, b) => a.slot - b.slot);
  const add = (id: string, bp: boolean) => {
    const inv = [...(part?.inv ?? [])];
    let slot = 0;
    while (inv.some((x) => x.slot === slot) && slot < e.container.capacity) slot++;
    if (slot >= e.container.capacity) return;
    inv.push({ id: bp ? `bp:${id}` : id, slot, n: bp ? 1 : Math.min(1000, store.world.items[id]?.stack ?? 1) });
    store.setInventory(e.id, inv);
  };
  return (
    <>
      <h3 className="el-sub">{t.contents}</h3>
      {stacks.length ? (
        <ul className="el-bom">
          {stacks.map((s) => (
            <li key={`${s.slot}`}>
              <img src={iconOf(s.id)} alt="" width={24} height={24} loading="lazy" decoding="async" />
              <span>
                {s.bp ? `${t.blueprint}: ` : ""}
                {name(s.id)} <small className="el-slotno">#{s.slot}</small>
              </span>
              <b>{s.amount}</b>
            </li>
          ))}
        </ul>
      ) : (
        <p className="el-note">{t.empty}</p>
      )}
      {!readOnly ? (
        <>
          <ItemPicker label={t.addItem} onPick={(id) => add(id, false)} />
          {e.def.cls === "IndustrialCrafter" ? <ItemPicker label={t.addBlueprint} onPick={(id) => add(id, true)} /> : null}
          {part?.inv?.length ? (
            <div className="el-row">
              <button type="button" className="rs-btn" onClick={() => store.setInventory(e.id, [])}>
                {t.emptyIt}
              </button>
              <button type="button" className="rs-btn" onClick={() => store.setInventory(e.id, part.inv ?? [])}>
                {t.refill}
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );
}

export function Filters({ e }: { e: IOEntity }) {
  const { store, t, lang, readOnly } = useEditor();
  if (e.def.cls !== "IndustrialConveyor") return null;
  const k = e as IndustrialConveyor;
  const part = store.circuit.parts.find((p) => p.id === e.id);
  const filters = part?.filters ?? [];
  const name = (f: NonNullable<Part["filters"]>[number]) => {
    if (f.cat) return t.categories[f.cat] ?? f.cat;
    const n = f.item ? store.world.items[f.item]?.name : undefined;
    return n ? (lang === "es" ? n.es ?? n.en : n.en) : f.item ?? "";
  };
  const set = (next: NonNullable<Part["filters"]>, mode = k.mode) => store.setFilters(e.id, next, mode);
  const cats = [...new Set(Object.values(store.world.items).map((i) => i.cat))].sort();
  return (
    <>
      <h3 className="el-sub">{t.filters}</h3>
      <label className="el-num">
        <span>{t.mode}</span>
        <select value={k.mode} disabled={readOnly} onChange={(ev) => set(filters, Number(ev.target.value))}>
          {t.modes.map((m, i) => (
            <option key={m} value={i}>
              {m}
            </option>
          ))}
        </select>
      </label>
      {filters.length ? (
        <table className="el-filters">
          <thead>
            <tr>
              <th scope="col">{t.filterItem}</th>
              <th scope="col">{t.filterMax}</th>
              <th scope="col">{t.filterMin}</th>
              <th scope="col">{t.filterBuffer}</th>
              <th scope="col" aria-label={t.remove} />
            </tr>
          </thead>
          <tbody>
            {filters.map((f, i) => (
              <tr key={i}>
                <th scope="row">{name(f)}</th>
                {(["max", "min", "buffer"] as const).map((key) => (
                  <td key={key}>
                    <input
                      type="text"
                      inputMode="numeric"
                      disabled={readOnly}
                      defaultValue={f[key] ?? 0}
                      onBlur={(ev) => {
                        const v = Math.max(0, Math.round(Number(ev.target.value) || 0));
                        set(filters.map((x, j) => (j === i ? { ...x, [key]: v || undefined } : x)));
                      }}
                    />
                  </td>
                ))}
                <td>
                  {!readOnly ? (
                    <button type="button" className="rs-btn" aria-label={t.remove} onClick={() => set(filters.filter((_, j) => j !== i))}>
                      ×
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="el-note">{t.noFilter}</p>
      )}
      {!readOnly ? (
        <>
          <ItemPicker label={t.addFilter} onPick={(id) => set([...filters, { item: id }])} />
          <label className="el-num">
            <span>{t.addCategory}</span>
            <select value="" onChange={(ev) => ev.target.value && set([...filters, { cat: ev.target.value }])}>
              <option value="">—</option>
              {cats.map((c) => (
                <option key={c} value={c}>
                  {t.categories[c] ?? c}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : null}
    </>
  );
}
