/**
 * Las secciones de la ficha de Rust que no son crafteo, reciclaje ni botín (2026-10-05): lo que hace al usarlo y la
 * reparación, de dónde se obtiene, en qué se convierte, la construcción (qué se le pone, mantenimiento y desgaste),
 * qué lo detecta y las skins. Cada una devuelve `null` si no hay nada que mostrar.
 */
import { useLang, useLocale } from "../../i18n";
import type { Route } from "../../route";
import { useRustCopy } from "../../rustCopy";
import { say, type Ficha } from "./data";
import { formatDuration, upkeepRange } from "./format";
import { Icon, RefLink, type Nav } from "./parts";

type Props = { ficha: Ficha; route: Route; navigate: Nav };

/** "+20" o "−10" (con el signo menos tipográfico). */
function signed(n: number, num: (n: number) => string): string {
  return `${n > 0 ? "+" : "−"}${num(Math.abs(n))}`;
}

export function UseSection({ ficha, route, navigate }: Props) {
  const t = useRustCopy().items;
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);
  const u = ficha.use;
  if (!u) return null;
  const mods = u.mods;
  if (!u.effects.length && !mods.length && !u.spoil) return null;
  return (
    <section className="rs-pnl">
      <h2 className="rs-hd">{t.use}</h2>
      {(u.effects.length > 0 || mods.length > 0) && (
        <dl className="rs-facts">
          {u.effects.map((e, i) => (
            <div key={i}>
              <dt>{t.stats[e.stat]}</dt>
              <dd>
                {signed(e.amount, num)}
                {e.time > 0 && ` · ${t.overTime(formatDuration(e.time))}`}
              </dd>
            </div>
          ))}
          {mods.map((m, i) => (
            <div key={i}>
              <dt>{t.mods[m.stat]}</dt>
              <dd>{t.modRow(`${signed(Math.round(m.value * 100), (n) => t.pct(n))}`, formatDuration(m.duration))}</dd>
            </div>
          ))}
        </dl>
      )}
      {u.spoil && (
        <p className="rs-meta">
          <span>{(u.spoil.into ? t.spoilInto : t.spoil)(formatDuration(u.spoil.hours * 3600))}</span>
          {u.spoil.into && (
            <RefLink r={u.spoil.into} route={route} navigate={navigate}>
              {say(u.spoil.into.name, lang)}
            </RefLink>
          )}
        </p>
      )}
    </section>
  );
}

export function RepairSection({ ficha, route, navigate }: Props) {
  const t = useRustCopy().items;
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);
  const r = ficha.repair;
  if (!r) return null;
  return (
    <section className="rs-pnl">
      <h2 className="rs-hd">{t.repair}</h2>
      <p className="rs-ficha-note">{t.repairMax}</p>
      <ul className="rs-ings">
        {r.cost.map((g) => (
          <li key={g.id}>
            <RefLink r={g} route={route} navigate={navigate}>
              <span className="rs-slot">
                <Icon id={g.id} />
                <b className="rs-qty">{num(g.amount)}</b>
              </span>
              <span>{say(g.name, lang)}</span>
            </RefLink>
          </li>
        ))}
      </ul>
      <p className="rs-meta">
        <span>{t.repairLoss(num(Math.round(r.loss * 100)))}</span>
        {r.bp && <span>{t.repairBp}</span>}
      </p>
    </section>
  );
}

/** Cómo se consigue este objeto sin crafteo ni botín: cocinando, fundiendo, quemando o usando otro, o en la mesa de mezcla. */
export function ObtainSection({ ficha, route, navigate }: Props) {
  const t = useRustCopy().items;
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);
  if (!ficha.obtained.length) return null;
  return (
    <section className="rs-pnl">
      <h2 className="rs-hd">{t.obtained}</h2>
      <ul className="rs-obtain">
        {ficha.obtained.map((o, i) => (
          <li key={i}>
            <b>{t.how[o.how]}</b>
            <span className="rs-yields">
              {o.from.map((f) => (
                <RefLink key={f.id} r={f} route={route} navigate={navigate}>
                  <Icon id={f.id} size={28} />
                  <span>{o.how === "mix" ? `${num(f.amount)} × ` : ""}{say(f.name, lang)}</span>
                </RefLink>
              ))}
            </span>
            <span>
              → × {num(o.amount)}
              {o.chance < 1 && ` (${t.perUnit(t.pct(Math.round(o.chance * 100)))})`}
              {o.time ? ` · ${t.seconds(num(o.time))}` : ""}
              {o.bp ? ` · ${t.repairBp}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** En qué se convierte este objeto: al cocinarlo o fundirlo, al quemarlo, al usarlo. */
export function TurnsSection({ ficha, route, navigate }: Props) {
  const t = useRustCopy().items;
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);
  if (!ficha.turns.length) return null;
  return (
    <section className="rs-pnl">
      <h2 className="rs-hd">{t.turnsInto}</h2>
      <ul className="rs-obtain">
        {ficha.turns.map((o, i) => (
          <li key={i}>
            <b>{t.how[o.how]}</b>
            <RefLink r={o.into} route={route} navigate={navigate}>
              <Icon id={o.into.id} size={28} />
              <span>× {num(o.amount)} {say(o.into.name, lang)}</span>
            </RefLink>
            {o.chance < 1 && <span>{t.perUnit(t.pct(Math.round(o.chance * 100)))}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Lo de construcción: qué se le pone (puertas), cuánto mantenimiento paga y cuánto tarda en romperse. */
export function BuildingSection({ ficha, route, navigate }: Props) {
  const t = useRustCopy().items;
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);
  const d = ficha.deploy;
  if (!d) return null;
  return (
    <section className="rs-pnl">
      <h2 className="rs-hd">{t.building}</h2>
      {d.attach.length > 0 && (
        <>
          <h3 className="rs-sub">{t.attach}</h3>
          <ul className="rs-refs">
            {d.attach.map((a) => (
              <li key={a.id}>
                <RefLink r={a} route={route} navigate={navigate}>
                  <Icon id={a.id} size={32} />
                  <span>{say(a.name, lang)}</span>
                </RefLink>
              </li>
            ))}
          </ul>
        </>
      )}
      {d.upkeep.length > 0 && (
        <>
          <h3 className="rs-sub">{t.upkeep}</h3>
          <ul className="rs-yields">
            {d.upkeep.map((u) => {
              const [lo, hi] = upkeepRange(u.amount);
              return (
                <li key={u.id}>
                  <RefLink r={u} route={route} navigate={navigate}>
                    <Icon id={u.id} size={28} />
                    <span>{say(u.name, lang)}</span>
                    <b>{`${num(lo)}–${num(hi)}`}</b>
                  </RefLink>
                </li>
              );
            })}
          </ul>
          <p className="rs-ficha-note">{t.upkeepNote}</p>
        </>
      )}
      {d.decay && (
        <>
          <h3 className="rs-sub">{t.decay}</h3>
          <p className="rs-meta">
            <span>{t.decayOut(formatDuration(d.decay.duration * 3600))}</span>
            <span>{t.decayIn(formatDuration(d.decay.duration * 36000))}</span>
            {d.decay.delay > 0 && <span>{t.decayDelay(formatDuration(d.decay.delay * 3600))}</span>}
          </p>
          <p className="rs-ficha-note">{t.decayNote}</p>
        </>
      )}
    </section>
  );
}

/** Qué lo detecta: el sensor sísmico, con el nivel de vibración de la explosión. */
export function DetectedSection({ ficha, route, navigate }: Props) {
  const t = useRustCopy().items;
  const { lang } = useLang();
  if (!ficha.vibration || !ficha.detectedBy) return null;
  return (
    <section className="rs-pnl">
      <h2 className="rs-hd">{t.detectedBy}</h2>
      <p className="rs-meta">
        <RefLink r={ficha.detectedBy} route={route} navigate={navigate}>
          <Icon id={ficha.detectedBy.id} size={28} />
          <span>{say(ficha.detectedBy.name, lang)}</span>
        </RefLink>
        <span>{t.vibration(ficha.vibration)}</span>
      </p>
    </section>
  );
}

/** Las skins que trae el juego para este objeto, con su ícono. Las de workshop llevan la etiqueta. */
export function SkinsSection({ ficha }: { ficha: Ficha }) {
  const t = useRustCopy().items;
  const { lang } = useLang();
  const locale = useLocale();
  if (!ficha.skins.length) return null;
  return (
    <section className="rs-pnl">
      <h2 className="rs-hd">{t.skins(ficha.skins.length.toLocaleString(locale))}</h2>
      <ul className="rs-skins">
        {ficha.skins.map((s) => (
          <li key={s.id}>
            <span className="rs-slot">
              <img src={`/rust/${s.icon ?? `items/${ficha.id}`}.webp`} alt="" width={64} height={64} loading="lazy" />
            </span>
            <span>{say(s.name, lang)}</span>
            {s.workshop && <em className="rs-tag">{t.workshop}</em>}
          </li>
        ))}
      </ul>
    </section>
  );
}
