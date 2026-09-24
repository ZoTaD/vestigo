/**
 * La ficha de un objeto o una pieza de construcción (maqueta A: el marco de
 * madera del panel de crafteo del juego).
 */
import { useLang, type Lang } from "./i18n";
import RouteLink from "./RouteLink";
import { useValheimCopy, type ValheimCopy } from "./valheimCopy";
import type { ListTab } from "./valheimTabs";
import { clean, tx, type ItemRow, type PieceRow, type Req, type Source, type Use } from "./valheimData";
import { BiomeTags, FoodBars, Ing, pctChance, range, RefLink, Slot, type Nav, type To } from "./ValheimParts";

function Upgrades({ req, max, t }: { req: Req[]; max: number; t: ValheimCopy }) {
  const { lang } = useLang();
  const per = req.filter((q) => q.perLevel > 0);
  if (max <= 1 || per.length === 0) return null;
  const levels = Array.from({ length: max - 1 }, (_, i) => i + 2);
  return (
    <div>
      <p className="vh-h2">{t.detail.upgrades}</p>
      <table className="vh-up">
        <tbody>
          {levels.map((q) => (
            <tr key={q}>
              <th>{t.detail.upgradeTo(q)}</th>
              <td>{per.map((r) => <span key={r.slug ?? r.name.en} style={{ marginRight: 14 }}><b>{r.perLevel * (q - 1)}</b> × {tx(r.name, lang)}</span>)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SourceLine({ s, to, navigate, t, lang }: { s: Source; to: To; navigate: Nav; t: ValheimCopy; lang: Lang }) {
  const where = s.biomes && s.biomes.length ? <BiomeTags ids={s.biomes} /> : s.kind === "gather" && (s.how === "chest" || s.how === "location") ? <span>{t.detail.noBiome}</span> : null;
  let body: React.ReactNode = null;
  switch (s.kind) {
    case "craft":
      body = <><RefLink r={s.station} to={to} navigate={navigate}>{tx(s.station?.name, lang)}</RefLink>{s.level && s.level > 1 ? ` · ${t.level(s.level)}` : ""}</>;
      break;
    case "convert":
      body = <><RefLink r={s.ref} to={to} navigate={navigate}>{tx(s.ref?.name, lang)}</RefLink> → <RefLink r={s.station} to={to} navigate={navigate}>{tx(s.station?.name, lang)}</RefLink>{s.time ? ` · ${t.minutes(Math.round(s.time / 60))}` : ""}</>;
      break;
    case "drop":
      body = <><RefLink r={s.ref} to={to} navigate={navigate}>{tx(s.ref?.name, lang)}</RefLink> <span>{range(s.min ?? 1, s.max ?? 1)}{s.chance != null && s.chance < 1 ? ` · ${pctChance(s.chance)}` : ""}</span></>;
      break;
    case "gather":
      body = <b>{t.how[s.how ?? ""] ?? s.how}</b>;
      break;
    case "farm":
      body = <b>{tx(s.name, lang) || t.how.farm}</b>;
      break;
    case "trader":
      body = <><b>{tx(s.name, lang)}</b> · {t.detail.price(s.price ?? 0)}{s.stack && s.stack > 1 ? ` (×${s.stack})` : ""}</>;
      break;
  }
  return (
    <div className="vh-src">
      <span className="vh-src-k">{t.detail.from[s.kind]}</span>
      {body}
      {where}
    </div>
  );
}

/** Las fuentes, sin repetir la misma línea (el juego pone la misma veta varias veces). */
function Sources({ sources, to, navigate }: { sources: Source[]; to: To; navigate: Nav }) {
  const t = useValheimCopy();
  const { lang } = useLang();
  const seen = new Set<string>();
  const uniq = sources.filter((s) => {
    const k = [s.kind, s.how, s.ref?.slug, s.station?.name.en, tx(s.name, "en"), (s.biomes ?? []).join()].join("|");
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const order = ["craft", "convert", "drop", "gather", "farm", "trader"];
  uniq.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  return (
    <div>
      <p className="vh-h2">{t.detail.sources}</p>
      {uniq.length === 0 ? <p className="vh-dim">{t.detail.noSources}</p> : <div className="vh-srcs">{uniq.slice(0, 24).map((s, i) => <SourceLine key={i} s={s} to={to} navigate={navigate} t={t} lang={lang} />)}</div>}
    </div>
  );
}

function UsedIn({ uses, to, navigate }: { uses: Use[]; to: To; navigate: Nav }) {
  const t = useValheimCopy();
  const { lang } = useLang();
  if (uses.length === 0) return null;
  const seen = new Set<string>();
  const uniq = uses.filter((u) => (seen.has(`${u.tab}/${u.slug}`) ? false : (seen.add(`${u.tab}/${u.slug}`), true)));
  return (
    <div>
      <p className="vh-h2">{t.detail.usedIn} · {uniq.length}</p>
      <div className="vh-mosaic">
        {uniq.map((u) => (
          <RefLink key={`${u.tab}/${u.slug}`} r={u} to={to} navigate={navigate} className="vh-slot" >
            <span title={tx(u.name, lang)} style={{ display: "contents" }}>
              {u.icon && <img src={`/valheim/icons/${u.icon}.webp`} alt={tx(u.name, lang)} loading="lazy" width={42} height={42} />}
            </span>
          </RefLink>
        ))}
      </div>
    </div>
  );
}

export default function ValheimDetail({ tab, row, rows, to, navigate }: { tab: ListTab; row: ItemRow | PieceRow; rows: (ItemRow | PieceRow)[]; to: To; navigate: Nav }) {
  const t = useValheimCopy();
  const { lang } = useLang();
  const item = tab !== "building" ? (row as ItemRow) : null;
  const piece = tab === "building" ? (row as PieceRow) : null;
  const idx = rows.findIndex((r) => r.slug === row.slug);
  const prev = idx > 0 ? rows[idx - 1] : null;
  const next = idx >= 0 && idx < rows.length - 1 ? rows[idx + 1] : null;
  const recipe = item?.recipe;
  const req = recipe?.req ?? piece?.req ?? [];
  const stationRef = recipe?.station ?? piece?.station ?? null;

  return (
    <>
      <RouteLink className="vh-back" to={to(tab)} onNavigate={navigate}>{t.detail.back(t.tabs[tab])}</RouteLink>
      <article className="vh-frame">
        <div className="vh-inset vh-detail">
          <header className="vh-dhead">
            <Slot icon={row.icon} size="lg" alt={tx(row.name, lang)} />
            <div>
              <h1>{tx(row.name, lang)}</h1>
              <div className="vh-alt">{lang === "es" ? row.name.en : row.name.es}</div>
              <div className="vh-tags" style={{ marginTop: 10 }}>
                {row.tier && <BiomeTags ids={[row.tier]} />}
                {item?.cls && <span className="vh-chip">{t.weaponCls[item.cls]}</span>}
                {item?.slot && <span className="vh-chip">{t.slot[item.slot]}</span>}
                {item?.effect && <span className="vh-chip">{t.effect[item.effect]}</span>}
                {piece?.tool && <span className="vh-chip">{t.tool[piece.tool] ?? piece.tool}</span>}
                {piece?.categoryName && <span className="vh-chip">{tx(piece.categoryName, lang)}</span>}
              </div>
            </div>
          </header>
          {row.desc && <p className="vh-desc">{clean(tx(row.desc, lang))}</p>}
          <hr className="vh-sep" />

          <div className="vh-cols">
            <div style={{ display: "grid", gap: 18, alignContent: "start" }}>
              {item?.food && (
                <div>
                  <p className="vh-h2">{t.detail.food}</p>
                  <FoodBars food={item.food} />
                  <div className="vh-facts" style={{ marginTop: 10 }}>
                    <span>{t.detail.duration} <b>{t.minutes(item.food.min)}</b></span>
                    <span>{t.detail.regen} <b>{t.detail.perSecond(item.food.regen)}</b></span>
                  </div>
                </div>
              )}
              {item?.damage && (
                <div>
                  <p className="vh-h2">{t.detail.damage}</p>
                  <div className="vh-kv">
                    {Object.entries(item.damage).map(([k, v]) => (
                      <div key={k}><span>{t.damage[k] ?? k}</span><b>{Math.round(v * 10) / 10}{item.damagePerLevel?.[k] ? <span className="vh-dim"> +{item.damagePerLevel[k]}</span> : null}</b></div>
                    ))}
                  </div>
                  {item.damagePerLevel && <p className="vh-dim" style={{ margin: "6px 0 0", fontSize: 12.5 }}>+ {t.detail.perLevel}</p>}
                </div>
              )}
              {(item?.armor || item?.blockPower || item?.maxQuality) && (
                <div className="vh-kv">
                  {item?.armor ? <div><span>{t.detail.armor}</span><b>{item.armor}{item.armorPerLevel ? <span className="vh-dim"> +{item.armorPerLevel}</span> : null}</b></div> : null}
                  {item?.blockPower ? <div><span>{t.detail.block}</span><b>{item.blockPower}</b></div> : null}
                  {item?.maxQuality && item.maxQuality > 1 ? <div><span>{t.cols.quality}</span><b>{item.maxQuality}</b></div> : null}
                  {item ? <div><span>{t.detail.weight}</span><b>{item.weight}</b></div> : null}
                  {item && item.stack > 1 ? <div><span>{t.detail.stack}</span><b>{item.stack}</b></div> : null}
                </div>
              )}
              {piece?.comfort ? <div className="vh-kv"><div><span>{t.detail.comfort}</span><b>+{piece.comfort}</b></div></div> : null}

              {item?.chain && (
                <div>
                  <p className="vh-h2">{t.detail.chain}</p>
                  <div className="vh-flow">
                    {item.chain.req.map((q) => <Ing key={q.slug ?? q.name.en} r={q} qty={q.amount} to={to} navigate={navigate} />)}
                    <span className="vh-arrow">→</span>
                    <Ing r={item.chain.base} to={to} navigate={navigate} />
                    <span className="vh-dim">{tx(item.chain.station?.name, lang)}</span>
                    <span className="vh-arrow">→</span>
                    <Ing r={{ ...(item.chain.ferment ?? item.chain.base), name: item.chain.ferment?.name ?? item.chain.base.name }} qty={item.chain.time ? t.detail.ferment(Math.round(item.chain.time / 60)) : null} to={to} navigate={navigate} />
                    <span className="vh-arrow">→</span>
                    <Ing r={{ slug: row.slug, tab, name: row.name, icon: row.icon }} qty={t.detail.yields(item.chain.yield ?? 1)} to={to} navigate={navigate} />
                  </div>
                </div>
              )}

              {req.length > 0 && !item?.chain && (
                <div>
                  <p className="vh-h2">{t.detail.recipe}{recipe && recipe.amount > 1 ? ` · ${t.detail.makes(recipe.amount)}` : ""}</p>
                  <div className="vh-ings">
                    {req.map((q) => <Ing key={q.slug ?? q.name.en} r={q} qty={q.amount} to={to} navigate={navigate} />)}
                  </div>
                  {stationRef && (
                    <div className="vh-facts" style={{ marginTop: 10 }}>
                      <span>{t.detail.madeAt} <b><RefLink r={stationRef} to={to} navigate={navigate}>{tx(stationRef.name, lang)}</RefLink></b>{recipe && recipe.level > 1 ? ` · ${t.level(recipe.level)}` : ""}</span>
                    </div>
                  )}
                </div>
              )}
              {item && recipe && <Upgrades req={recipe.req} max={item.maxQuality ?? 1} t={t} />}
            </div>

            <div style={{ display: "grid", gap: 18, alignContent: "start" }}>
              {item && <Sources sources={item.sources} to={to} navigate={navigate} />}
              {item && <UsedIn uses={item.usedIn} to={to} navigate={navigate} />}
            </div>
          </div>
        </div>
      </article>
      <nav className="vh-pager">
        {prev ? <RouteLink to={to(tab, prev.slug)} onNavigate={navigate}>← {tx(prev.name, lang)}</RouteLink> : <span />}
        {next ? <RouteLink to={to(tab, next.slug)} onNavigate={navigate}>{tx(next.name, lang)} →</RouteLink> : <span />}
      </nav>
    </>
  );
}
