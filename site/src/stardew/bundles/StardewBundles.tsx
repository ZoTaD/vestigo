/**
 * La pestaña Centro Comunitario de Stardew Valley (2026-10-22): una caja por sala con sus paquetes, y en cada paquete
 * los casilleros que se tildan con un clic. Lo tildado se guarda en el navegador (`progress.ts`); sin almacenamiento
 * (ventana privada, bloqueado) la lista anda igual, sólo que no guarda. Dos filtros: "sólo lo que falta" y la estación
 * (deja los objetos que se consiguen en ella; si no se sabe en cuál, el objeto queda visible).
 *
 * El prerender dibuja todo destildado: lo guardado se lee recién después del primer dibujo. Cada sala lleva un `id`
 * (`#pantry`), que es el ancla a la que enlaza la ficha de un objeto.
 */
import { useEffect, useMemo, useState } from "react";
import { useLang, useLocale } from "../../i18n";
import type { Route } from "../../route";
import { QUALITIES, useStardewCopy } from "../../stardewCopy";
import { useLoad } from "../../useLoad";
import { loadBundles, peekBundles, refName, say, type Bundle, type Ref, type Room } from "../data";
import { Box, Gold, Slot, Sprite, SdLoading, type Nav } from "../ui";
import { bundleState, doneKey, inSeason, qualityIndex, readDone, roomAnchor, roomState, tick, type Done } from "./progress";
import "../../styles/stardew-items.css";
import "../../styles/stardew-bundles.css";

export default function StardewBundles(_props: { route: Route; navigate: Nav }) {
  const rooms = useLoad("bundles", () => peekBundles() ?? undefined, loadBundles);
  if (rooms.failed) return <SdLoading onRetry={rooms.retry} />;
  if (!rooms.value) return <SdLoading />;
  return <BundleRooms rooms={rooms.value} />;
}

/** El id del oro en los paquetes de la Bóveda. */
const GOLD = "-1";

export function BundleRooms({ rooms }: { rooms: Room[] }) {
  const t = useStardewCopy();
  const c = t.bundles;
  const { lang } = useLang();
  const locale = useLocale();
  const [done, setDone] = useState<Done>({});
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [season, setSeason] = useState<number | null>(null);

  // Lo guardado se lee después del primer dibujo (el HTML prerenderizado va destildado), y se sigue si otra pestaña cambia.
  useEffect(() => {
    setDone(readDone());
    const onStorage = () => setDone(readDone());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  // Un enlace con ancla (`#pantry`) lleva a su sala; se espera un poco a que la pestaña termine de acomodar el scroll.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return;
    const timer = window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: "start" }), 80);
    return () => window.clearTimeout(timer);
  }, []);

  const onTick = (key: string) => setDone((prev) => tick(prev, key));

  const total = useMemo(() => rooms.reduce((n, r) => n + r.bundles.length, 0), [rooms]);
  const complete = useMemo(() => rooms.reduce((n, r) => n + roomState(r, done).done, 0), [rooms, done]);

  return (
    <main className="sd-main sd-bundles">
      <Box className="sd-intro">
        <h1 className="sd-h1">{c.h1}</h1>
        <p className="sd-lede">{c.lede(total.toLocaleString(locale))}</p>
        <p className="sd-muted">{c.saved}</p>
        <div className="sd-filters">
          <div className="sd-chips" role="group" aria-label={c.onlyMissing}>
            <button type="button" className={`sd-pill${onlyMissing ? " is-on" : ""}`} aria-pressed={onlyMissing} onClick={() => setOnlyMissing(!onlyMissing)}>
              {c.onlyMissing}
            </button>
          </div>
          <div className="sd-chips" role="group" aria-label={c.season}>
            <span className="sd-label">{c.season}</span>
            <button type="button" className={`sd-pill${season === null ? " is-on" : ""}`} aria-pressed={season === null} onClick={() => setSeason(null)}>
              {c.allSeasons}
            </button>
            {t.seasons.map((name, i) => (
              <button type="button" className={`sd-pill${season === i ? " is-on" : ""}`} aria-pressed={season === i} onClick={() => setSeason(i)} key={name}>
                {name}
              </button>
            ))}
          </div>
          <p className="sd-count" aria-live="polite">
            {c.progress(complete.toLocaleString(locale), total.toLocaleString(locale))}
          </p>
        </div>
      </Box>

      {rooms.map((room) => {
        const state = roomState(room, done);
        const anchor = roomAnchor(room.room);
        const bundles = room.bundles.filter((b) => !(onlyMissing && bundleState({ ...b, room: room.room }, done).complete));
        return (
          <Box className="sd-room" id={anchor} key={room.room} aria-labelledby={`${anchor}-h`}>
            <header className="sd-room-head">
              <h2 className="sd-h2" id={`${anchor}-h`}>
                {say(room.name, lang)}
              </h2>
              <p className="sd-count">{c.progress(state.done.toLocaleString(locale), state.total.toLocaleString(locale))}</p>
            </header>
            {bundles.length === 0 ? (
              <p className="sd-muted">{c.empty}</p>
            ) : (
              <ul className="sd-bundle-list">
                {bundles.map((b) => (
                  <li key={b.index}>
                    <BundleCard room={room} bundle={b} done={done} onlyMissing={onlyMissing} season={season} onTick={onTick} />
                  </li>
                ))}
              </ul>
            )}
          </Box>
        );
      })}
    </main>
  );
}

function BundleCard({ room, bundle, done, onlyMissing, season, onTick }: { room: Room; bundle: Bundle; done: Done; onlyMissing: boolean; season: number | null; onTick: (key: string) => void }) {
  const t = useStardewCopy();
  const c = t.bundles;
  const { lang } = useLang();
  const locale = useLocale();
  const st = bundleState({ ...bundle, room: room.room }, done);
  const ref = (id: string): Ref | undefined => room.refs[id];
  const shown = bundle.items
    .map(([id, qty, quality], pos) => ({ id, qty, quality, pos }))
    .filter((it) => !(onlyMissing && done[doneKey(room.room, bundle.index, it.pos)]) && (it.id === GOLD || inSeason(room.seasons, it.id, season)));
  const reward = bundle.reward ? ref(bundle.reward[0]) : undefined;

  return (
    <article className={`sd-bundle${st.complete ? " is-done" : ""}`}>
      <header className="sd-bundle-head">
        <h3 className="sd-h3">{say(bundle.name, lang)}</h3>
        <p className="sd-bundle-meta">
          <span>{c.needs(bundle.need, bundle.items.length)}</span>
          <b className="sd-have">{st.complete ? c.complete : c.have(st.have, st.need)}</b>
        </p>
      </header>
      <ul className="sd-bundle-items">
        {shown.map(({ id, qty, quality, pos }) => {
          const key = doneKey(room.room, bundle.index, pos);
          const on = !!done[key];
          const r = ref(id);
          const name = id === GOLD ? c.gold : r ? refName(r, lang) : id;
          const q = qualityIndex(quality);
          const qName = q > 0 ? t.qualities[QUALITIES[q]] : null;
          return (
            <li key={pos}>
              <button type="button" className={`sd-tickable${on ? " is-on" : ""}`} aria-pressed={on} aria-label={c.tick(name, qty, qName)} onClick={() => onTick(key)}>
                <Slot>
                  {id === GOLD ? <span className="sd-coin">g</span> : r ? <Sprite id={id} w={r[4]} h={r[5]} size={40} /> : null}
                  {q > 0 && (
                    <span className={`sd-star sd-q${q}`} aria-hidden="true">
                      ★
                    </span>
                  )}
                  {on && (
                    <span className="sd-check" aria-hidden="true">
                      ✓
                    </span>
                  )}
                </Slot>
                <span className="sd-tname">
                  {id === GOLD ? <Gold n={qty} /> : <b>{name}</b>}
                  {id !== GOLD && <small>× {qty.toLocaleString(locale)}</small>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {shown.length === 0 && <p className="sd-muted">{c.empty}</p>}
      {bundle.reward && (
        <p className="sd-reward">
          <span className="sd-label">{c.reward}</span>
          {reward ? (
            <>
              <Sprite id={bundle.reward[0]} w={reward[4]} h={reward[5]} size={24} />
              <b>{refName(reward, lang)}</b>
            </>
          ) : (
            <b>{bundle.reward[0]}</b>
          )}
          {bundle.reward[1] > 1 && <small>× {bundle.reward[1].toLocaleString(locale)}</small>}
        </p>
      )}
    </article>
  );
}
