/**
 * Las guías de Valheim (2026-09-24): criatura, bioma y jefe, y las listas de
 * biomas y jefes. Pedido de ZoTaD: "qué tener en cuenta en cada bioma o jefe,
 * con imágenes". Las imágenes son las del juego —la ilustración de cada bioma y
 * el arte de logro de cada jefe—; los consejos, los de Hugin.
 */
import { useState } from "react";
import { useLang } from "./i18n";
import RouteLink from "./RouteLink";
import { useValheimCopy } from "./valheimCopy";
import { artUrl, BIOME_IDS, clean, tx, type BiomeId, type BiomeRow, type BossRow, type CreatureRow, type Place, type PlaceRow, type Ref, type Tip } from "./valheimData";
import { BiomeTags, Ing, pctChance, range, RefLink, Slot, WikiFigure, type Nav, type To } from "./ValheimParts";

function Tips({ tips }: { tips: Tip[] }) {
  const t = useValheimCopy();
  const { lang } = useLang();
  if (!tips.length) return null;
  return (
    <section className="vh-box">
      <p className="vh-h2">{t.guide.tips}</p>
      <div style={{ display: "grid", gap: 10 }}>
        {tips.map((tip, i) => (
          <div className="vh-tip" key={i}>
            <h4>{tx(tip.topic, lang)}</h4>
            <p>{clean(tx(tip.text, lang))}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Mods({ weak, resist, immune }: { weak: string[]; resist: string[]; immune: string[] }) {
  const t = useValheimCopy();
  const line = (label: string, list: string[]) =>
    list.length > 0 && <div><span>{label}</span><b>{list.map((d) => t.damage[d] ?? d).join(", ")}</b></div>;
  if (!weak.length && !resist.length && !immune.length) return null;
  return <div className="vh-kv">{line(t.guide.weak, weak)}{line(t.guide.resist, resist)}{line(t.guide.immune, immune)}</div>;
}

export function CreaturePage({ row, to, navigate }: { row: CreatureRow; to: To; navigate: Nav }) {
  const t = useValheimCopy();
  const { lang } = useLang();
  return (
    <>
      <RouteLink className="vh-back" to={to("creatures")} onNavigate={navigate}>{t.detail.back(t.tabs.creatures)}</RouteLink>
      <article className="vh-frame">
        <div className="vh-inset vh-detail">
          <header className="vh-dhead">
            <Slot icon={row.icon} size="lg" alt={tx(row.name, lang)} />
            <div>
              <h1>{tx(row.name, lang)}</h1>
              <div className="vh-alt">{lang === "es" ? row.name.en : row.name.es}</div>
              <div style={{ marginTop: 10 }}><BiomeTags ids={row.biomes} /></div>
            </div>
          </header>
          <hr className="vh-sep" />
          <div className="vh-cols">
            <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
              {row.photo && <WikiFigure photo={row.photo} alt={tx(row.name, lang)} className="is-creature" />}
              <div className="vh-kv"><div><span>{t.guide.health}</span><b>{row.health ?? "—"}</b></div></div>
              <Mods weak={row.weak} resist={row.resist} immune={row.immune} />
              <FoundIn places={row.places} to={to} navigate={navigate} />
              {row.bossRef && (
                <p className="vh-facts">{t.guide.boss}: <RefLink r={row.bossRef} to={to} navigate={navigate}><b>{tx(row.bossRef.name, lang)}</b></RefLink></p>
              )}
            </div>
            {row.drops.length > 0 && (
              <div>
                <p className="vh-h2">{t.guide.drops}</p>
                <div className="vh-ings">
                  {row.drops.map((d) => <Ing key={d.slug ?? d.name.en} r={d} qty={`${range(d.min, d.max)}${d.chance < 1 ? ` · ${pctChance(d.chance)}` : ""}`} to={to} navigate={navigate} />)}
                </div>
              </div>
            )}
          </div>
          {(row.variants ?? []).map((v, i) => (
            <div key={i} style={{ marginTop: 18 }}>
              <hr className="vh-sep" />
              <p className="vh-h2">{t.variant}</p>
              <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
                {v.biomes.length > 0 && <BiomeTags ids={v.biomes} />}
                <div className="vh-kv"><div><span>{t.guide.health}</span><b>{v.health ?? "—"}</b></div></div>
              </div>
              <div className="vh-ings">
                {v.drops.map((d) => <Ing key={d.slug ?? d.name.en} r={d} qty={`${range(d.min, d.max)}${d.chance < 1 ? ` · ${pctChance(d.chance)}` : ""}`} to={to} navigate={navigate} />)}
              </div>
            </div>
          ))}
        </div>
      </article>
    </>
  );
}

/** El orden en que se agrupan los recursos: lo más habitual primero. */
const HOW_ORDER = ["mine", "tree", "pickable", "destructible", "extract", "location", "fish"];

/**
 * Lo que se consigue en un bioma (rehecho el 2026-09-24 a pedido de ZoTaD):
 * los recursos de la zona agrupados por cómo se juntan, lo que sueltan sus
 * criaturas (pieles, carnes, trofeos), lo que se puede plantar y, aparte, el
 * botín al azar de cofres y vasijas.
 */
function BiomeResources({ row, to, navigate }: { row: BiomeRow; to: To; navigate: Nav }) {
  const t = useValheimCopy();
  const { lang } = useLang();
  const groups = new Map<string, BiomeRow["resources"]>();
  for (const r of row.resources) {
    const how = HOW_ORDER.find((h) => r.how.includes(h)) ?? r.how[0];
    groups.set(how, [...(groups.get(how) ?? []), r]);
  }
  const drops = row.creatureDrops ?? [];
  return (
    <>
      <section className="vh-box">
        <p className="vh-h2">{t.guide.resources} · {row.resources.length}</p>
        <div className="vh-resgroups">
          {HOW_ORDER.filter((h) => groups.has(h)).map((h) => (
            <div key={h}>
              <p className="vh-src-k">{t.how[h] ?? h}</p>
              <div className="vh-ings">
                {groups.get(h)!.map((r) => <Ing key={r.slug ?? r.name.en} r={r} qty={null} to={to} navigate={navigate} />)}
              </div>
            </div>
          ))}
        </div>
      </section>
      {drops.length > 0 && (
        <section className="vh-box">
          <p className="vh-h2">{t.guide.fromCreatures} · {drops.length}</p>
          <div className="vh-ings">
            {drops.map((d) => (
              <RefLink key={`${d.tab}/${d.slug}`} r={d} to={to} navigate={navigate} className="vh-ing">
                <Slot icon={d.icon} />
                <span>{tx(d.name, lang)}<small className="vh-ing-from">{t.guide.dropsFrom(d.from.map((c) => tx(c.name, lang)).join(", "))}</small></span>
              </RefLink>
            ))}
          </div>
        </section>
      )}
      {(row.plant ?? []).length > 0 && (
        <section className="vh-box">
          <p className="vh-h2">{t.guide.plant} · {row.plant!.length}</p>
          <div className="vh-ings">{row.plant!.map((r) => <Ing key={r.slug ?? r.name.en} r={r} qty={null} to={to} navigate={navigate} />)}</div>
        </section>
      )}
      {(row.loot ?? []).length > 0 && (
        <section className="vh-box">
          <p className="vh-h2">{t.guide.loot} · {row.loot!.length}</p>
          <p className="vh-dim" style={{ margin: "0 0 10px", fontSize: 13.5 }}>{t.guide.lootHint}</p>
          <div className="vh-mosaic">
            {row.loot!.map((r) => (
              <RefLink key={`${r.tab}/${r.slug}`} r={r} to={to} navigate={navigate} className="vh-slot is-sm">
                <span title={tx(r.name, lang)} style={{ display: "contents" }}>
                  {r.icon && <img src={`/valheim/icons/${r.icon}.webp`} alt={tx(r.name, lang)} loading="lazy" width={30} height={30} />}
                </span>
              </RefLink>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

export function BiomePage({ row, bosses, to, navigate }: { row: BiomeRow; bosses: BossRow[]; to: To; navigate: Nav }) {
  const t = useValheimCopy();
  const { lang } = useLang();
  const env = row.env;
  const warns = [
    env.freezing && t.guide.envFreezing,
    env.cold && !env.freezing && t.guide.envCold,
    env.coldAtNight && !env.cold && !env.freezing && t.guide.envColdNight,
    env.wet && t.guide.envWet,
  ].filter(Boolean) as string[];
  const boss = bosses.find((b) => b.biome === row.id);
  return (
    <>
      <RouteLink className="vh-back" to={to("biomes")} onNavigate={navigate}>{t.detail.back(t.tabs.biomes)}</RouteLink>
      <div className={`vh-hero${row.id === "deepnorth" ? " is-logo" : ""}`}>
        <img className="vh-hero-art" src={artUrl(row.art)} alt="" width={852} height={480} />
        <div className="vh-hero-cap">
          <h1>{tx(row.name, lang)}</h1>
          <p>{t.guide.gearCount(row.gear.weapons, row.gear.armor, row.gear.foods)}</p>
        </div>
      </div>
      <div className="vh-guide">
        <div style={{ display: "grid", gap: 20 }}>
          <section className="vh-box">
            <p className="vh-h2">{t.guide.env}</p>
            <div className="vh-warn">{(warns.length ? warns : [t.guide.envNone]).map((w, i) => <p key={i}>{w}</p>)}</div>
          </section>
          <section className="vh-box">
            <p className="vh-h2">{t.guide.creatures} · {row.creatures.length}</p>
            <div style={{ display: "grid", gap: 2 }}>
              {row.creatures.map((c) => (
                <RefLink key={c.slug ?? c.name.en} r={c} to={to} navigate={navigate} className="vh-cre">
                  <Slot icon={c.icon} size="sm" />
                  <span>{tx(c.name, lang)}<small>{c.weak.length ? `${t.guide.weak}: ${c.weak.map((d) => t.damage[d] ?? d).join(", ")}` : ""}</small></span>
                  <span className="vh-dim">{c.health ?? ""}</span>
                </RefLink>
              ))}
            </div>
          </section>
          <BiomeResources row={row} to={to} navigate={navigate} />
        </div>
        <div style={{ display: "grid", gap: 20 }}>
          {boss && (
            <RouteLink className="vh-box vh-hubcard" to={to("bosses", boss.slug)} onNavigate={navigate} style={{ alignItems: "center" }}>
              {boss.art && <img src={artUrl(boss.art)} alt="" width={96} height={96} style={{ width: 96, height: 96 }} />}
              <span>{tx(boss.name, lang)}<small>{t.guide.boss} · {t.guide.health} {boss.health}</small></span>
            </RouteLink>
          )}
          {row.foods.length > 0 && (
            <section className="vh-box">
              <p className="vh-h2">{t.guide.foods}</p>
              <div style={{ display: "grid", gap: 10 }}>
                {row.foods.slice(0, 5).map((f) => (
                  <RefLink key={f.slug ?? f.name.en} r={f} to={to} navigate={navigate} className="vh-cre">
                    <Slot icon={f.icon} size="sm" />
                    <span>{tx(f.name, lang)}<small>{t.minutes(f.food.min)}</small></span>
                    <span className="vh-dim"><span className="vh-num-hp">{f.food.hp}</span> · <span className="vh-num-st">{f.food.st}</span>{f.food.eitr ? <> · <span className="vh-num-ei">{f.food.eitr}</span></> : null}</span>
                  </RefLink>
                ))}
              </div>
            </section>
          )}
          <Tips tips={row.tips} />
        </div>
      </div>
      {(row.places ?? []).length > 0 && <Places places={row.places!} to={to} navigate={navigate} />}
    </>
  );
}

/** La tarjeta de un lugar: foto, nombre, tipo y quién vive ahí; lleva a su ficha. */
function PlaceCard({ p, to, navigate }: { p: Place; to: To; navigate: Nav }) {
  const t = useValheimCopy();
  const { lang } = useLang();
  return (
    <RouteLink className="vh-place" to={to("places", p.slug ?? undefined)} onNavigate={navigate}>
      {p.photo && <WikiFigure photo={p.photo} alt={tx(p.name, lang)} />}
      <h4>{tx(p.name, lang)}{tx(p.type, lang) && <small>{tx(p.type, lang)}</small>}</h4>
      {p.inhabitants.length > 0 && (
        <div className="vh-place-who" aria-label={t.inhabitants}>
          {p.inhabitants.map((c) => <span key={c.slug ?? c.name.en}>{tx(c.name, lang)}</span>)}
        </div>
      )}
    </RouteLink>
  );
}

/**
 * Mazmorras y lugares del bioma, con foto y quién vive ahí (pedido de ZoTaD,
 * 2026-09-24). Cada uno lleva a su ficha en la pestaña Lugares.
 */
function Places({ places, to, navigate }: { places: Place[]; to: To; navigate: Nav }) {
  const t = useValheimCopy();
  return (
    <section className="vh-box" style={{ marginTop: 20 }}>
      <p className="vh-h2">{t.places} · {places.length}</p>
      <div className="vh-places">
        {places.map((p) => <PlaceCard key={p.slug} p={p} to={to} navigate={navigate} />)}
      </div>
    </section>
  );
}

/** Las fichas enlazadas de una lista (habitantes, botín, recursos), con su ícono. */
function RefGrid({ title, refs, to, navigate }: { title: string; refs: Ref[]; to: To; navigate: Nav }) {
  if (!refs.length) return null;
  return (
    <div>
      <p className="vh-h2">{title} · {refs.length}</p>
      <div className="vh-ings">{refs.map((r) => <Ing key={`${r.tab}/${r.slug ?? r.name.en}`} r={r} qty={null} to={to} navigate={navigate} />)}</div>
    </div>
  );
}

/** "Dónde aparece": los lugares de una criatura o un jefe. */
export function FoundIn({ places, to, navigate }: { places: Ref[] | undefined; to: To; navigate: Nav }) {
  const t = useValheimCopy();
  const { lang } = useLang();
  if (!places?.length) return null;
  return (
    <p className="vh-facts">
      {t.foundIn}:{" "}
      {places.map((p, i) => (
        <span key={p.slug ?? p.name.en}>{i > 0 && ", "}<RefLink r={p} to={to} navigate={navigate}><b>{tx(p.name, lang)}</b></RefLink></span>
      ))}
    </p>
  );
}

export function PlaceList({ places, to, navigate }: { places: PlaceRow[]; to: To; navigate: Nav }) {
  const t = useValheimCopy();
  const [biome, setBiome] = useState<BiomeId | null>(null);
  const shown = places.filter((p) => !biome || p.biomes.includes(biome)).sort((a, b) => a.order - b.order || a.name.en.localeCompare(b.name.en));
  const present = BIOME_IDS.filter((b) => places.some((p) => p.biomes.includes(b)));
  return (
    <>
      <header className="vh-head"><h1>{t.tabs.places}</h1><p>{t.tabLede.places}</p></header>
      <div className="vh-opts" style={{ margin: "0 0 16px" }}>
        <button type="button" className="vh-chip" aria-pressed={biome === null} onClick={() => setBiome(null)}>{t.allBiomes}</button>
        {present.map((b) => (
          <button key={b} type="button" className="vh-chip" aria-pressed={biome === b} onClick={() => setBiome(b)}>{t.biomes[b]}</button>
        ))}
      </div>
      <div className="vh-places">
        {shown.map((p) => <PlaceCard key={p.slug} p={p} to={to} navigate={navigate} />)}
      </div>
    </>
  );
}

export function PlacePage({ row, to, navigate }: { row: PlaceRow; to: To; navigate: Nav }) {
  const t = useValheimCopy();
  const { lang } = useLang();
  return (
    <>
      <RouteLink className="vh-back" to={to("places")} onNavigate={navigate}>{t.detail.back(t.tabs.places)}</RouteLink>
      <article className="vh-frame">
        <div className="vh-inset vh-detail">
          <div className="vh-guide" style={{ marginTop: 0 }}>
            <div style={{ display: "grid", gap: 18, alignContent: "start" }}>
              <header>
                <h1 style={{ margin: 0, font: "700 clamp(30px, 4vw, 44px)/1 var(--vh-serif)", color: "var(--vh-brass-lt)" }}>{tx(row.name, lang)}</h1>
                <div className="vh-alt" style={{ marginTop: 6, color: "var(--vh-faint)" }}>{tx(row.type, lang)} · {lang === "es" ? row.name.en : row.name.es}</div>
                <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {row.biomes.map((b) => (
                    <RouteLink key={b} to={to("biomes", b)} onNavigate={navigate} style={{ textDecoration: "none" }}><BiomeTags ids={[b]} /></RouteLink>
                  ))}
                </div>
              </header>
              <RefGrid title={t.inhabitants} refs={row.inhabitants} to={to} navigate={navigate} />
              <RefGrid title={t.placeResources} refs={row.resources} to={to} navigate={navigate} />
              <RefGrid title={t.placeLoot} refs={row.loot} to={to} navigate={navigate} />
            </div>
            <div style={{ display: "grid", gap: 18, alignContent: "start" }}>
              {row.photo && <WikiFigure photo={row.photo} alt={tx(row.name, lang)} />}
            </div>
          </div>
        </div>
      </article>
    </>
  );
}

export function BossPage({ row, to, navigate }: { row: BossRow; to: To; navigate: Nav }) {
  const t = useValheimCopy();
  const { lang } = useLang();
  const item = row.summon.item;
  return (
    <>
      <RouteLink className="vh-back" to={to("bosses")} onNavigate={navigate}>{t.detail.back(t.tabs.bosses)}</RouteLink>
      <article className="vh-frame">
        <div className="vh-inset vh-detail">
          <div className="vh-guide" style={{ marginTop: 0 }}>
            <div style={{ display: "grid", gap: 18, alignContent: "start" }}>
              <header>
                <h1 style={{ margin: 0, font: "700 clamp(30px, 4vw, 44px)/1 var(--vh-serif)", color: "var(--vh-brass-lt)" }}>{tx(row.name, lang)}</h1>
                <div className="vh-alt" style={{ marginTop: 6, color: "var(--vh-faint)" }}>{lang === "es" ? row.name.en : row.name.es}</div>
                {row.biome && (
                  <div style={{ marginTop: 10 }}>
                    <RouteLink to={to("biomes", row.biome)} onNavigate={navigate} style={{ textDecoration: "none" }}><BiomeTags ids={[row.biome]} /></RouteLink>
                  </div>
                )}
              </header>
              <div className="vh-kv"><div><span>{t.guide.health}</span><b>{row.health}</b></div></div>
              <Mods weak={row.weak} resist={row.resist} immune={row.immune} />
              <FoundIn places={row.places} to={to} navigate={navigate} />
              {item && (
                <div>
                  <p className="vh-h2">{t.guide.summon}</p>
                  <div className="vh-flow">
                    <Ing r={item} qty={row.summon.amount} to={to} navigate={navigate} />
                    <span>{t.guide.summonAt(row.summon.amount, tx(item.name, lang))}{row.summon.altar ? ` · ${tx(row.summon.altar, lang)}` : ""}</span>
                  </div>
                </div>
              )}
              {row.power && (
                <div className="vh-power">
                  <h4>{t.guide.power}: {tx(row.power.name, lang)}</h4>
                  <p>{clean(tx(row.power.tooltip, lang))}</p>
                  {row.power.cooldown ? <p className="vh-dim" style={{ marginTop: 6 }}>{t.guide.cooldown(row.power.cooldown)}</p> : null}
                </div>
              )}
              {row.drops.length > 0 && (
                <div>
                  <p className="vh-h2">{t.guide.drops}</p>
                  <div className="vh-ings">
                    {row.drops.map((d) => <Ing key={d.slug ?? d.name.en} r={d} qty={`${range(d.min, d.max)}${d.chance < 1 ? ` · ${pctChance(d.chance)}` : ""}`} to={to} navigate={navigate} />)}
                  </div>
                </div>
              )}
            </div>
            <div style={{ display: "grid", gap: 18, alignContent: "start" }}>
              {row.art && <img className="vh-bossart" src={artUrl(row.art)} alt={tx(row.name, lang)} width={256} height={256} />}
              {row.photo && <WikiFigure photo={row.photo} alt={tx(row.name, lang)} />}
              <Tips tips={row.tips} />
            </div>
          </div>
        </div>
      </article>
    </>
  );
}

export function BiomeList({ biomes, bosses, to, navigate }: { biomes: BiomeRow[]; bosses: BossRow[]; to: To; navigate: Nav }) {
  const t = useValheimCopy();
  const { lang } = useLang();
  return (
    <>
      <header className="vh-head"><h1>{t.tabs.biomes}</h1><p>{t.tabLede.biomes}</p></header>
      <div className="vh-biomes">
        {biomes.map((b, i) => {
          const boss = bosses.find((x) => x.biome === b.id);
          return (
            <RouteLink key={b.id} className={`vh-bcard${b.id === "deepnorth" ? " is-logo" : ""}`} to={to("biomes", b.slug)} onNavigate={navigate}>
              <img src={artUrl(b.art)} alt="" loading="lazy" width={852} height={480} />
              <em>{i + 1}{boss ? ` · ${tx(boss.name, lang)}` : ""}</em>
              <span>{tx(b.name, lang)}</span>
            </RouteLink>
          );
        })}
      </div>
    </>
  );
}

export function BossList({ bosses, to, navigate }: { bosses: BossRow[]; to: To; navigate: Nav }) {
  const t = useValheimCopy();
  const { lang } = useLang();
  return (
    <>
      <header className="vh-head"><h1>{t.tabs.bosses}</h1><p>{t.tabLede.bosses}</p></header>
      <div className="vh-hub" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
        {bosses.map((b, i) => (
          <RouteLink key={b.slug} className="vh-box vh-hubcard" to={to("bosses", b.slug)} onNavigate={navigate}>
            {b.art && <img src={artUrl(b.art)} alt="" width={88} height={88} style={{ width: 88, height: 88 }} loading="lazy" />}
            <span>
              {i + 1}. {tx(b.name, lang)}
              <small>{b.biome ? t.biomes[b.biome] : ""}{b.summon.item ? ` · ${b.summon.amount} × ${tx(b.summon.item.name, lang)}` : ""}</small>
            </span>
          </RouteLink>
        ))}
      </div>
    </>
  );
}

