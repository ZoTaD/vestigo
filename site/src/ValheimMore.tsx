/**
 * Lo que se sumó a las fichas el 2026-09-24 (pedido de ZoTaD): domesticar y
 * criar, cuándo aparece cada criatura, en qué ataques a la base, sus ataques y
 * consejos, y los efectos de armas, armaduras e hidromieles.
 *
 * Los números salen de los archivos del juego (`extract.py`); ataques y
 * consejos, de `tips.json`, redactados con palabras propias a partir de la wiki.
 */
import { useLang } from "./i18n";
import { useValheimCopy, type ValheimCopy } from "./valheimCopy";
import { tx, type Advice, type Attack, type BiomeRow, type CreatureEvent, type CreatureRow, type ItemEffects, type Resist, type SpawnRule, type StatusEffect } from "./valheimData";
import { BiomeTags, Ing, RefLink, type Nav, type To } from "./ValheimParts";

const minutes = (s: number | null | undefined) => Math.max(1, Math.round((s ?? 0) / 60));

/** Domesticación y cría: qué come, cuánto tarda, con qué se monta, cuántos crían. */
export function TameBlock({ row, to, navigate }: { row: CreatureRow; to: To; navigate: Nav }) {
  const t = useValheimCopy().more;
  const { tame, breed } = row;
  if (!tame && !breed) return null;
  return (
    <section className="vh-more">
      {tame && (
        <div>
          <p className="vh-h2">{t.tame}</p>
          <ul className="vh-lines">
            {tame.startsTamed ? <li>{t.startsTamed}</li> : tame.time ? <li>{t.tameTime(minutes(tame.time))}</li> : null}
            {tame.fed ? <li>{t.fed(minutes(tame.fed))}</li> : null}
            {tame.commandable && <li>{t.commandable}</li>}
          </ul>
          {tame.eats.length > 0 && (
            <>
              <p className="vh-src-k" style={{ marginTop: 10 }}>{t.eats}</p>
              <div className="vh-ings">{tame.eats.map((r) => <Ing key={r.slug ?? r.name.en} r={r} qty={null} to={to} navigate={navigate} />)}</div>
            </>
          )}
          {tame.saddle && (
            <>
              <p className="vh-src-k" style={{ marginTop: 10 }}>{t.saddle}</p>
              <div className="vh-ings"><Ing r={tame.saddle} qty={null} to={to} navigate={navigate} /></div>
            </>
          )}
        </div>
      )}
      {breed && (
        <div>
          <p className="vh-h2">{t.breed}</p>
          <ul className="vh-lines">
            {breed.max ? <li>{t.breedMax(breed.max)}</li> : null}
            {breed.love ? <li>{t.breedLove(breed.love)}</li> : null}
            {breed.pregnancy ? <li>{t.breedTime(Math.round(breed.pregnancy))}</li> : null}
          </ul>
          {breed.offspring && (
            <>
              <p className="vh-src-k" style={{ marginTop: 10 }}>{t.offspring}</p>
              <div className="vh-ings"><Ing r={breed.offspring} qty={null} to={to} navigate={navigate} /></div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function ruleText(s: SpawnRule, t: ValheimCopy["more"]): string {
  const when = s.day && s.night ? t.dayNight : s.night ? t.night : t.day;
  const bits = [when, t.group(s.group[0], s.group[1])];
  if (s.forest === "in") bits.push(t.forestIn);
  if (s.forest === "out") bits.push(t.forestOut);
  if (s.ocean) bits.push(t.ocean);
  if (s.minAltitude) bits.push(t.altitude(Math.round(s.minAltitude)));
  if (s.envs?.length) bits.push(`${t.weather}: ${s.envs.map((e) => t.env[e] ?? e.replace(/_/g, " ")).join(", ")}`);
  return bits.join(" · ");
}

/** Cuándo y dónde aparece en el mundo abierto, y en qué ataques a la base. */
export function SpawnBlock({ row, to, navigate }: { row: CreatureRow; to: To; navigate: Nav }) {
  const t = useValheimCopy().more;
  const { lang } = useLang();
  const spawns = row.spawns ?? [];
  const events = row.events ?? [];
  if (!spawns.length && !events.length) return null;
  return (
    <section className="vh-more">
      {spawns.length > 0 && (
        <div>
          <p className="vh-h2">{t.spawns}</p>
          <ul className="vh-rules">
            {spawns.map((s, i) => (
              <li key={i}>
                <BiomeTags ids={s.biomes} />
                <span>
                  {ruleText(s, t)}
                  {s.after && <> · {t.after} <RefLink r={s.after} to={to} navigate={navigate}><b>{tx(s.after.name, lang)}</b></RefLink></>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {events.length > 0 && (
        <div>
          <p className="vh-h2">{t.events}</p>
          <ul className="vh-rules">
            {events.map((e: CreatureEvent, i) => (
              <li key={i}>
                <span><b>«{tx(e.name, lang)}»</b>
                  {e.after.length > 0 && <> · {t.eventAfter} {e.after.map((r, j) => <span key={j}>{j > 0 && ", "}<RefLink r={r} to={to} navigate={navigate}>{tx(r.name, lang)}</RefLink></span>)}</>}
                  {e.until.length > 0 && <> · {t.eventUntil} {e.until.map((r, j) => <span key={j}>{j > 0 && ", "}<RefLink r={r} to={to} navigate={navigate}>{tx(r.name, lang)}</RefLink></span>)}</>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Los ataques (con su daño, sin el de talar y minar, que es contra construcciones) y los consejos para pelear. */
export function FightBlock({ attacks, advice }: { attacks: Attack[] | undefined; advice: Advice | null | undefined }) {
  const c = useValheimCopy();
  const { lang } = useLang();
  const tips = advice ? (lang === "es" ? advice.es : advice.en) : [];
  if (!attacks?.length && !tips.length) return null;
  return (
    <section className="vh-more">
      {attacks && attacks.length > 0 && (
        <div>
          <p className="vh-h2">{c.more.attacks}</p>
          <ul className="vh-rules">
            {attacks.map((a, i) => (
              <li key={i}>
                <b>{tx(a.name, lang)}</b>
                {a.group && <span className="vh-dim">({tx(a.group, lang)})</span>}
                <span className="vh-dim">{[...Object.entries(a.damage).filter(([k]) => k !== "chop" && k !== "pickaxe").map(([k, v]) => `${v} ${(c.damage[k] ?? k).toLowerCase()}`),
                  ...(a.cooldown ? [c.more.cooldown(a.cooldown)] : [])].join(" · ")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {tips.length > 0 && (
        <div>
          <p className="vh-h2">{c.more.tips}</p>
          <ul className="vh-lines">{tips.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </div>
      )}
    </section>
  );
}

/** Lo que cambia un efecto, en líneas legibles. */
function statLines(se: StatusEffect, c: ValheimCopy): string[] {
  const t = c.more;
  const out: string[] = [];
  for (const [k, v] of Object.entries(se.stats)) {
    if (k === "skills" || k === "resist" || k === "damagePct") continue;
    const f = t.stat[k];
    if (f && typeof v === "number") out.push(f(Math.round(v * 100) / 100));
  }
  for (const s of se.stats.skills ?? []) out.push(t.skill(t.skills[s.skill] ?? `#${s.skill}`, s.value));
  for (const [k, v] of Object.entries(se.stats.damagePct ?? {})) out.push(t.damagePct(c.damage[k] ?? k, v));
  return out;
}

function ResistLine({ list }: { list: Resist[] }) {
  const c = useValheimCopy();
  return <>{list.map((r) => `${c.more.mod[r.mod] ?? r.mod}: ${c.damage[r.type] ?? r.type}`).join(" · ")}</>;
}

function EffectBox({ title, se }: { title: string; se: StatusEffect }) {
  const c = useValheimCopy();
  const { lang } = useLang();
  const lines = statLines(se, c);
  return (
    <div className="vh-effect">
      <p className="vh-src-k">{title}</p>
      {se.name && <h4>{tx(se.name, lang)}</h4>}
      {se.tooltip && <p>{tx(se.tooltip, lang)}</p>}
      {(lines.length > 0 || (se.stats.resist ?? []).length > 0) && (
        <ul className="vh-lines">
          {lines.map((l, i) => <li key={i}>{l}</li>)}
          {(se.stats.resist ?? []).length > 0 && <li><ResistLine list={se.stats.resist!} /></li>}
        </ul>
      )}
    </div>
  );
}

/** Los efectos de un arma, armadura o hidromiel, con las otras piezas del set. */
export function EffectsBlock({ effects, setPieces, to, navigate }: { effects: ItemEffects | undefined; setPieces?: { slug: string | null; name: { en: string; es: string } }[] | undefined; to: To; navigate: Nav }) {
  const c = useValheimCopy();
  if (!effects) return null;
  const t = c.more;
  const has = effects.set || effects.equip || effects.consume || effects.resist?.length || effects.move;
  if (!has) return null;
  return (
    <div>
      <p className="vh-h2">{t.effects}</p>
      <div className="vh-effects">
        {effects.consume && <EffectBox title={t.consume} se={effects.consume} />}
        {effects.equip && <EffectBox title={t.equip} se={effects.equip} />}
        {effects.set && <EffectBox title={t.setBonus(effects.setSize)} se={effects.set} />}
        {(effects.resist?.length || effects.move) ? (
          <div className="vh-effect">
            <p className="vh-src-k">{t.resists}</p>
            <ul className="vh-lines">
              {effects.resist?.length ? <li><ResistLine list={effects.resist} /></li> : null}
              {effects.move ? <li>{t.move(Math.round(effects.move * 100))}</li> : null}
            </ul>
          </div>
        ) : null}
      </div>
      {setPieces && setPieces.length > 0 && (
        <>
          <p className="vh-src-k" style={{ marginTop: 12 }}>{t.setPieces}</p>
          <div className="vh-ings">{setPieces.map((r) => <Ing key={r.slug ?? r.name.en} r={r as never} qty={null} to={to} navigate={navigate} />)}</div>
        </>
      )}
    </div>
  );
}

/**
 * Los ataques a la base que pueden tocar en un bioma: el mensaje que avisa, desde
 * y hasta qué jefe, y quién viene (pedido de ZoTaD, 2026-09-24). Sólo con los
 * enemigos que viven en el bioma (`site.py`, 2026-09-25).
 */
export function BiomeEvents({ events, to, navigate }: { events: NonNullable<BiomeRow["events"]>; to: To; navigate: Nav }) {
  const t = useValheimCopy().more;
  const { lang } = useLang();
  if (!events.length) return null;
  const refs = (list: { slug: string | null; name: { en: string; es: string } }[]) =>
    list.map((r, j) => <span key={j}>{j > 0 && ", "}<RefLink r={r as never} to={to} navigate={navigate}>{tx(r.name, lang)}</RefLink></span>);
  return (
    <section className="vh-box">
      <p className="vh-h2">{t.biomeEvents} · {events.length}</p>
      <ul className="vh-rules">
        {events.map((e, i) => (
          <li key={i} style={{ display: "grid", gap: 6 }}>
            <span><b>«{tx(e.name, lang)}»</b>
              {e.after.length > 0 && <> · {t.eventAfter} {refs(e.after)}</>}
              {e.until.length > 0 && <> · {t.eventUntil} {refs(e.until)}</>}
            </span>
            <div className="vh-ings">{e.creatures.map((c) => <Ing key={c.slug ?? c.name.en} r={c} qty={null} to={to} navigate={navigate} />)}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}
