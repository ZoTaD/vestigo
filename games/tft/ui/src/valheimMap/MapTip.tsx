/**
 * La ventanita que aparece al pasar el mouse por un lugar del mapa (pedido de
 * ZoTaD, 2026-09-25: "así no tengo que salir del mapa para ver algo"): qué es,
 * dónde está, a cuánto del inicio y, si tiene ficha en el sitio, su foto, quién
 * vive ahí, qué se encuentra y cómo se invoca al jefe.
 */
import { useLang } from "../i18n";
import { useValheimCopy } from "../valheimCopy";
import { tx, type PlaceRow, type BossRow } from "../valheimData";
import { useTab } from "../ValheimParts";
import { useMapCopy } from "./copy";
import type { MapLocation } from "./locations";
import { BIOME_ID } from "./palette";

interface Props {
  l: MapLocation;
  sx: number;
  sy: number;
  /** El tamaño del visor, para que la ventanita no se salga. */
  box: { w: number; h: number };
  biome: number | null;
  spawn: { x: number; z: number } | null;
}

const W = 280;

export default function MapTip({ l, sx, sy, box, biome, spawn }: Props) {
  const t = useMapCopy();
  const v = useValheimCopy();
  const { lang } = useLang();
  const places = useTab(l.page?.tab === "places" ? "places" : null) as PlaceRow[] | null;
  const bosses = useTab(l.page?.tab === "bosses" ? "bosses" : null) as BossRow[] | null;
  const place = l.page?.tab === "places" ? places?.find((p) => p.slug === l.page!.slug) : undefined;
  const boss = l.page?.tab === "bosses" ? bosses?.find((b) => b.slug === l.page!.slug) : undefined;
  const photo = place?.photo ?? boss?.photo ?? null;
  const bid = biome != null ? BIOME_ID[biome] : null;

  // A la derecha y abajo del mouse; si no entra, del otro lado.
  const left = sx + 16 + W > box.w ? Math.max(4, sx - 16 - W) : sx + 16;
  const top = Math.min(Math.max(4, sy + 14), Math.max(4, box.h - (photo ? 330 : 190)));

  const names = (list: { name: { en: string; es: string } }[], max: number) =>
    list.slice(0, max).map((r) => tx(r.name, lang)).join(", ") + (list.length > max ? "…" : "");

  return (
    <div className="vm-tip" style={{ left, top, width: W }} role="tooltip">
      {photo && <img className="vm-tip-photo" src={photo.src} alt="" width={photo.w} height={photo.h} />}
      <div className="vm-tip-body">
        <h4>{l.name[lang]}</h4>
        <p className="vm-tip-kind">{l.categoryName[lang]}{bid ? ` · ${v.biomes[bid as keyof typeof v.biomes]}` : ""}</p>
        {l.candidate && <p className="vm-note">{t.candidates}</p>}
        {boss && (
          <p>
            {v.guide.health} <b>{boss.health}</b>
            {boss.summon.item ? <> · {t.summon} <b>{boss.summon.amount} × {tx(boss.summon.item.name, lang)}</b></> : null}
          </p>
        )}
        {place && place.inhabitants.length > 0 && <p><span className="vh-dim">{t.inside}:</span> {names(place.inhabitants, 5)}</p>}
        {place && place.resources.length > 0 && <p><span className="vh-dim">{t.found}:</span> {names(place.resources, 4)}</p>}
        {place && place.loot.length > 0 && <p><span className="vh-dim">{t.chests}:</span> {names(place.loot, 5)}</p>}
        <p className="vm-tip-pos">
          x {Math.round(l.x)} · z {Math.round(l.z)}
          {spawn ? ` · ${t.km(Math.hypot(l.x - spawn.x, l.z - spawn.z))} ${t.fromSpawnShort}` : ""}
        </p>
        {l.page && <p className="vm-tip-hint">{t.clickForMore}</p>}
      </div>
    </div>
  );
}
