/**
 * Combate (2026-10-30): tu daño real según habilidad y calidad contra una criatura, y cuántos golpes aguantas con tu
 * armadura contra cada ataque de las criaturas de un bioma. Estado en la dirección: `w q s c st` (tu daño) y
 * `h ch l cp aq sh bs b d st2 hp` (lo que aguantas).
 */
import { useMemo } from "react";
import { useLang } from "../i18n";
import { LazyRows } from "../LazyRows";
import RouteLink from "../RouteLink";
import { useValheimCopy } from "../valheimCopy";
import { BIOME_IDS, tx, type BiomeId, type BossRow, type CreatureRow, type ItemRow, type Txt } from "../valheimData";
import { Slot, useTab, type Nav, type To } from "../ValheimParts";
import { useCalcCopy } from "./copy";
import { applyArmor, applyMods, armorAt, bestCombo, blockAt, comboAt, levelDamage, skillRange, total, weaponDamage } from "./math";
import { intParam, num, Picker, useQueryState } from "./parts";

/** Daño enemigo según la dificultad del mundo (modificador "Combat" de la wiki). */
const DIFF: Record<string, number> = { veryeasy: 0.5, easy: 0.75, normal: 1, hard: 1.5, veryhard: 2 };
const STRUCTURE = new Set(["chop", "pickaxe"]);

/** Una criatura o un jefe, para el selector y la tabla. */
interface Foe { id: string; slug: string; tab: "creatures" | "bosses"; name: Txt; icon: string | null; tier: BiomeId | null; health: number | null; mods: Record<string, string>; boss: boolean; attacks: { name: Txt; damage: Record<string, number> }[]; biomes: BiomeId[] }

function foesOf(creatures: CreatureRow[] | null, bosses: BossRow[] | null): Foe[] {
  const out: Foe[] = [];
  for (const b of bosses ?? []) {
    out.push({ id: b.id, slug: b.slug, tab: "bosses", name: b.name, icon: b.icon, tier: b.biome, health: b.health, mods: b.mods ?? {}, boss: true, attacks: b.attacks ?? [], biomes: b.biome ? [b.biome] : [] });
  }
  const bossIds = new Set(out.map((f) => f.id));
  for (const c of creatures ?? []) {
    if (bossIds.has(c.id)) continue;
    out.push({ id: c.id, slug: c.slug, tab: "creatures", name: c.name, icon: c.icon, tier: c.biomes[0] ?? null, health: c.health, mods: c.mods ?? {}, boss: c.boss, attacks: c.attacks ?? [], biomes: c.biomes });
  }
  return out;
}

const fighting = (d: Record<string, number>) => Object.fromEntries(Object.entries(d).filter(([k, v]) => !STRUCTURE.has(k) && v > 0));

export default function CombatCalc({ to, navigate }: { to: To; navigate: Nav }) {
  const v = useValheimCopy();
  const weapons = useTab("weapons");
  const armor = useTab("armor");
  const creatures = useTab("creatures");
  const bosses = useTab("bosses");
  const foods = useTab("foods");
  if (!weapons || !armor || !creatures || !bosses || !foods) return <p className="vh-loading">{v.loading}</p>;
  return <Combat weapons={weapons} armor={armor} creatures={creatures} bosses={bosses} foods={foods} to={to} navigate={navigate} />;
}

function Combat({ weapons, armor, creatures, bosses, foods, to, navigate }: { weapons: ItemRow[]; armor: ItemRow[]; creatures: CreatureRow[]; bosses: BossRow[]; foods: ItemRow[]; to: To; navigate: Nav }) {
  const t = useCalcCopy();
  const v = useValheimCopy();
  const { lang } = useLang();
  const [q, setQ] = useQueryState();
  const foes = useMemo(() => foesOf(creatures, bosses), [creatures, bosses]);
  const armed = useMemo(() => weapons.filter((w) => w.damage && total(fighting(w.damage)) > 0), [weapons]);
  const bySlot = useMemo(() => {
    const m: Record<string, ItemRow[]> = {};
    for (const a of armor) (m[a.slot ?? ""] ??= []).push(a);
    return m;
  }, [armor]);

  // --- Tu daño
  const weapon = armed.find((w) => w.id === q.get("w")) ?? null;
  const wq = intParam(q, "q", 1, 1, weapon?.maxQuality ?? 1);
  const skill = intParam(q, "s", 0, 0, 100);
  const target = foes.find((f) => f.id === q.get("c")) ?? null;
  const stars = target?.boss ? 0 : intParam(q, "st", 0, 0, 2);
  const [lo, hi] = skillRange(skill);
  const base = weapon ? fighting(weaponDamage(weapon, wq)) : {};
  const vsMods = target ? applyMods(base, target.mods) : base;
  const hit = total(vsMods);
  const foeHp = target?.health ? target.health * (stars + 1) : null;

  // --- Lo que aguantas
  const slots = ["helmet", "chest", "legs", "cape"] as const;
  const keys = { helmet: "h", chest: "ch", legs: "l", cape: "cp" } as const;
  const worn = slots.map((s) => (bySlot[s] ?? []).find((a) => a.id === q.get(keys[s])) ?? null);
  const aq = intParam(q, "aq", 1, 1, 4);
  const ac = worn.reduce((s, a) => s + (a ? armorAt(a, Math.min(aq, a.maxQuality ?? 1)) : 0), 0);
  const shield = (bySlot.shield ?? []).find((a) => a.id === q.get("sh")) ?? null;
  const bskill = intParam(q, "bs", 0, 0, 100);
  const block = shield ? blockAt(shield, Math.min(aq, shield.maxQuality ?? 1), bskill) : 0;
  const biome = (BIOME_IDS as string[]).includes(q.get("b") ?? "") ? (q.get("b") as BiomeId) : "meadows";
  const diff = DIFF[q.get("d") ?? ""] ? (q.get("d") as string) : "normal";
  const fstars = intParam(q, "st2", 0, 0, 2);
  const defaultHp = useMemo(() => Math.round(comboAt(bestCombo(foods, "hpst", biome === "ocean" ? "plains" : biome).map((f) => f.food!), 0).hp), [foods, biome]);
  const hp = intParam(q, "hp", defaultHp, 1, 2000);
  const rows = useMemo(() => {
    const out: { foe: Foe; name: Txt; raw: number; taken: number; blocked: number | null; parried: number | null }[] = [];
    for (const f of foes) {
      if (!(f.boss ? f.tier === biome : f.biomes.includes(biome))) continue;
      for (const a of f.attacks) {
        const dmg0 = fighting(a.damage);
        if (!total(dmg0)) continue;
        const k = (f.boss ? 1 : levelDamage(fstars)) * DIFF[diff];
        const dmg = Object.fromEntries(Object.entries(dmg0).map(([x, y]) => [x, y * k]));
        const taken = total(applyArmor(dmg, ac));
        const blocked = shield ? total(applyArmor(applyArmor(dmg, block), ac)) : null;
        const parried = shield && shield.parry ? total(applyArmor(applyArmor(dmg, block * shield.parry), ac)) : null;
        out.push({ foe: f, name: a.name, raw: total(dmg), taken, blocked, parried });
      }
    }
    return out.sort((x, y) => y.taken - x.taken);
  }, [foes, biome, fstars, diff, ac, shield, block]);
  const hits = (dmg: number) => (dmg <= 0 ? "∞" : dmg >= hp ? t.combat.dies : String(Math.ceil(hp / dmg)));

  const chips = (key: string, opts: (string | number)[], cur: string | number, text: (o: string | number) => string) => (
    <div className="vh-opts">
      {opts.map((o) => (
        <button key={o} type="button" className="vh-chip" aria-pressed={cur === o} onClick={() => setQ({ [key]: o })}>{text(o)}</button>
      ))}
    </div>
  );
  const dmgCell = (k: string, val: number) => (
    <li key={k}><span>{v.damage[k] ?? k}</span><b>{num(val * lo, lang)} – {num(val * hi, lang)}</b></li>
  );

  return (
    <div className="vc-combat">
      <section className="vc-half">
        <h2 className="vh-plate vc-plate">{t.combat.yourDamage}</h2>
        <Picker rows={armed} value={weapon} onPick={(r) => setQ({ w: r?.id, q: null })} label={t.combat.weapon} placeholder={t.combat.weapon} />
        {weapon && (weapon.maxQuality ?? 1) > 1 && (
          <><span className="vc-label">{t.combat.quality}</span>{chips("q", Array.from({ length: weapon.maxQuality ?? 1 }, (_, i) => i + 1), wq, (o) => `★${o}`)}</>
        )}
        <label className="vc-range">
          <span className="vc-label">{t.combat.skill(skill)}</span>
          <input type="range" min={0} max={100} value={skill} onChange={(e) => setQ({ s: e.target.value })} />
        </label>
        <Picker rows={foes} value={target} onPick={(r) => setQ({ c: r?.id, st: null })} label={t.combat.target} placeholder={t.combat.noTarget} allowNone noneText={t.combat.noTarget} />
        {target && !target.boss && (<><span className="vc-label">{t.combat.stars}</span>{chips("st", [0, 1, 2], stars, (o) => (o ? "★".repeat(Number(o)) : "—"))}</>)}
        {weapon && (
          <div className="vc-result">
            <ul className="vc-dmg">{Object.entries(vsMods).map(([k, val]) => dmgCell(k, val))}</ul>
            <div className="vc-big">
              <span>{t.combat.perHit}</span>
              <b>{num(hit * lo, lang)} – {num(hit * hi, lang)}</b>
              {foeHp != null && hit > 0 && (
                <>
                  <span>{t.combat.hitsToKill}</span>
                  <b>{Math.ceil(foeHp / (hit * hi))} – {Math.ceil(foeHp / (hit * lo))}</b>
                  <small className="vh-dim">{num(foeHp, lang)} {v.cols.hp.toLowerCase()} · {t.combat.staggered} ×2</small>
                </>
              )}
            </div>
            {target && <RouteLink className="vc-link" to={to(target.tab, target.slug)} onNavigate={navigate}>{tx(target.name, lang)} →</RouteLink>}
          </div>
        )}
      </section>

      <section className="vc-half">
        <h2 className="vh-plate vc-plate">{t.combat.takeTitle}</h2>
        <div className="vc-armor">
          {slots.map((s, i) => (
            <Picker key={s} rows={bySlot[s] ?? []} value={worn[i]} onPick={(r) => setQ({ [keys[s]]: r?.id })}
              label={t.combat[s === "helmet" ? "head" : s]} placeholder={t.combat.none} allowNone noneText={t.combat.none}
              extra={(r) => <span className="vh-dim">{r.armor ?? 0}</span>} />
          ))}
        </div>
        <span className="vc-label">{t.combat.quality}</span>
        {chips("aq", [1, 2, 3, 4], aq, (o) => `★${o}`)}
        <Picker rows={bySlot.shield ?? []} value={shield} onPick={(r) => setQ({ sh: r?.id })} label={t.combat.shield} placeholder={t.combat.none} allowNone noneText={t.combat.none}
          extra={(r) => <span className="vh-dim">{r.blockPower ?? 0}</span>} />
        {shield && (
          <label className="vc-range">
            <span className="vc-label">{t.combat.blockSkill(bskill)}</span>
            <input type="range" min={0} max={100} value={bskill} onChange={(e) => setQ({ bs: e.target.value })} />
          </label>
        )}
        <label className="vc-range">
          <span className="vc-label">{t.combat.health}</span>
          <input className="vh-input vc-num" type="number" min={1} max={2000} value={hp} onChange={(e) => setQ({ hp: e.target.value === String(defaultHp) ? null : e.target.value })} />
          <small className="vh-dim">{t.combat.healthHint}</small>
        </label>
        <span className="vc-label">{t.combat.biome}</span>
        <div className="vh-opts">
          {BIOME_IDS.filter((b) => b !== "ocean").map((b) => (
            <button key={b} type="button" className="vh-chip" data-biome={b} aria-pressed={biome === b} onClick={() => setQ({ b, hp: null })}><span className="vh-dot" />{v.biomes[b]}</button>
          ))}
        </div>
        <div className="vc-two">
          <div><span className="vc-label">{t.combat.stars}</span>{chips("st2", [0, 1, 2], fstars, (o) => (o ? "★".repeat(Number(o)) : "—"))}</div>
          <div><span className="vc-label">{t.combat.difficulty}</span>{chips("d", Object.keys(DIFF), diff, (o) => t.combat.diff[o])}</div>
        </div>
        <p className="vc-total"><b>{t.combat.totalArmor(Math.round(ac))}</b>{shield && <> · {t.combat.shield} {num(block, lang)}</>}</p>
      </section>

      <div className="vc-tablewrap">
        {rows.length ? (
          <table className="vc-table">
            <thead>
              <tr>
                <th>{t.combat.colCreature}</th><th>{t.combat.colAttack}</th><th>{t.combat.colRaw}</th><th>{t.combat.colTaken}</th><th>{t.combat.colHits}</th>
                {shield && <th>{t.combat.blocked}</th>}{shield?.parry ? <th>{t.combat.parried}</th> : null}
              </tr>
            </thead>
            <tbody>
              <LazyRows items={rows} rowHeight={44} tag="tr" render={(r, i) => (
                <tr key={`${r.foe.id}-${i}`}>
                  <td>
                    <RouteLink className="vc-foe" to={to(r.foe.tab, r.foe.slug)} onNavigate={navigate}>
                      <Slot icon={r.foe.icon} size="sm" /><span>{tx(r.foe.name, lang)}</span>
                    </RouteLink>
                  </td>
                  <td>{tx(r.name, lang)}</td>
                  <td>{num(r.raw, lang)}</td>
                  <td><b>{num(r.taken, lang)}</b></td>
                  <td><b>{hits(r.taken)}</b></td>
                  {shield && <td>{num(r.blocked!, lang)} · {hits(r.blocked!)}</td>}
                  {shield?.parry ? <td>{num(r.parried!, lang)} · {hits(r.parried!)}</td> : null}
                </tr>
              )} />
            </tbody>
          </table>
        ) : (
          <p className="vh-dim">{t.combat.noAttacks}</p>
        )}
      </div>
    </div>
  );
}
