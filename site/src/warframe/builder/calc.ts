/**
 * Las cuentas del armador de Warframe (2026-10-27): drenaje, capacidad y las stats de un arma o un Warframe con sus mods.
 *
 * Todo sale de `docs/superpowers/specs/2026-10-27-warframe-formulas.md`, relevado contra la wiki y las notas de parche;
 * lo que ese documento marca "NO VERIFICADO" no se calcula (topes mínimos, Umbra en casilleros comunes, DPS). Funciones
 * puras: la pestaña las llama en cada cambio y los tests las prueban con los casos del documento.
 */
import type { BuildItem, BuildMod, Kind, Pol, StatKey } from "../data";

export type SlotId = "aura" | "stance" | "exilus" | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type Slot = { id: SlotId; pol: Pol | null; mod: BuildMod | null; rank: number };
export type Build = { item: BuildItem; slots: Slot[]; reactor: boolean };

export type DmgType = "impact" | "puncture" | "slash" | "heat" | "cold" | "electricity" | "toxin" | "blast" | "corrosive" | "gas" | "magnetic" | "radiation" | "viral";
export type WStat = { total: number; byType: Partial<Record<DmgType, number>>; cc: number; cd: number; sc: number; rate: number; mag?: number; reload?: number; ms: number };
export type WeaponStats = { base: WStat; mod: WStat };
export type FStat = { health: number; shield: number; armor: number; energy: number; strength: number; duration: number; efficiency: number; range: number };
export type FrameStats = { base: FStat; mod: FStat };

/** Los casilleros de cada clase de objeto, en el orden en que se combinan los elementos (0–7 y después el exilio). */
const NORMALES: SlotId[] = [0, 1, 2, 3, 4, 5, 6, 7];
export function slotIds(kind: Kind): SlotId[] {
  const extra: SlotId[] = kind === "warframe" ? ["aura"] : kind === "melee" ? ["stance"] : [];
  return [...extra, ...NORMALES, "exilus"];
}
export const emptyBuild = (item: BuildItem): Build => ({ item, slots: slotIds(item.kind).map((id) => ({ id, pol: null, mod: null, rank: 0 })), reactor: false });

/** ¿Entra este mod en ese casillero de ese objeto? Por `compatName` y por el tipo de casillero. */
export function modFits(mod: BuildMod, item: BuildItem, slot: SlotId): boolean {
  if (!item.compat.includes(mod.compat) || !slotIds(item.kind).includes(slot)) return false;
  if (slot === "aura") return mod.slot === "aura";
  if (slot === "stance") return mod.slot === "stance";
  if (slot === "exilus") return mod.slot === "normal" && mod.exilus;
  return mod.slot === "normal";
}

/**
 * La familia de un mod: el nombre inglés sin `Primed`, `Amalgam`, `Archon`, `Umbral` ni `Flawed`. Respaldo de `inc` para
 * los mods que la wiki no tiene: Serration y Amalgam Serration ya vienen marcados en los datos.
 */
export const modFamily = (name: BuildMod["name"]): string => name[0].replace(/^(Primed|Amalgam|Archon|Umbral|Flawed) /, "");

/**
 * ¿No van juntos? El juego no deja equipar dos variantes del mismo mod ni los pares que la wiki marca incompatibles
 * (`inc`: Split Chamber con Galvanized Chamber, Point Strike con Critical Delay). Un mod tampoco va dos veces.
 */
export const modsClash = (a: BuildMod, b: BuildMod): boolean =>
  a.slug === b.slug || !!a.inc?.includes(b.slug) || !!b.inc?.includes(a.slug) || modFamily(a.name) === modFamily(b.name);

/** Redondeo "mitad hacia arriba" del documento: `floor(x + 0,5)`. */
const redondeo = (x: number): number => Math.floor(x + 0.5);

/**
 * Lo que gasta un mod en su casillero (positivo) o lo que suma un aura o postura (negativo).
 * - Normal: `baseDrain + rango`; polaridad igual, la mitad hacia arriba; distinta, ×1,25 al más cercano (franjas de la
 *   wiki: en 5, 9, 13 y 17 la wiki se contradice; queda el redondeo).
 * - Aura y postura: `|baseDrain| + rango`; ×2 con su polaridad, ×0,8 hacia abajo con otra.
 * - Umbra contra Madurai/Vazarin/Naramon no está verificado: ni descuento ni castigo.
 */
export function modDrain(mod: BuildMod, rank: number, slotPol: Pol | null): number {
  const r = Math.max(0, Math.min(rank, mod.max));
  const umbraCruzada = slotPol !== null && slotPol !== mod.pol && (slotPol === "umbra" || mod.pol === "umbra");
  if (mod.slot !== "normal") {
    const v = Math.abs(mod.drain) + r;
    if (slotPol === null || umbraCruzada) return -v;
    return slotPol === mod.pol ? -2 * v : -Math.floor(0.8 * v);
  }
  const d = mod.drain + r;
  if (slotPol === null || umbraCruzada) return d;
  return slotPol === mod.pol ? Math.ceil(d / 2) : redondeo(d * 1.25);
}

/** Capacidad: rango del objeto (×2 con potenciador o catalizador) más lo que suman aura y postura; lo libre puede quedar negativo. */
export function capacity(build: Build): { total: number; used: number; free: number } {
  let total = build.item.cap * (build.reactor ? 2 : 1);
  let used = 0;
  for (const s of build.slots) {
    if (!s.mod) continue;
    const d = modDrain(s.mod, s.rank, s.pol);
    if (d < 0) total -= d;
    else used += d;
  }
  return { total, used, free: total - used };
}

/** Las Formas que puso el usuario: casilleros con polaridad (el export no trae las de fábrica). */
export const formas = (build: Build): number => build.slots.filter((s) => s.pol !== null).length;

/** El valor de una stat de un mod en su rango (puntos: 165 = +165 %). */
const fxAt = (vals: number[], rank: number): number => vals[Math.max(0, Math.min(rank, vals.length - 1))] ?? 0;

/** Σ de cada stat sobre los casilleros con mod, en puntos. */
function sumas(slots: readonly Slot[]): Map<StatKey, number> {
  const s = new Map<StatKey, number>();
  for (const sl of slots) if (sl.mod) for (const [k, v] of sl.mod.fx) s.set(k, (s.get(k) ?? 0) + fxAt(v, sl.rank));
  return s;
}

/** Regla general: `base × (1 + Σ%) + Σplanos`. Los planos (arcanos, Tenacious Bond) no los trae ningún mod del armador. */
export const bonus = (base: number, pct: number, flat = 0): number => base * (1 + pct / 100) + flat;

/** Posiciones de `damagePerShot` en el export (las de después de Viral: Void, Tau… suman al total pero no se combinan). */
const DT_EXPORT: (DmgType | null)[] = ["impact", "puncture", "slash", "heat", "cold", "electricity", "toxin", "blast", "radiation", "gas", "magnetic", "viral", "corrosive"];
const FISICOS: DmgType[] = ["impact", "puncture", "slash"];
const PRIMARIOS: DmgType[] = ["heat", "cold", "electricity", "toxin"];
const SECUNDARIOS: DmgType[] = ["blast", "corrosive", "gas", "magnetic", "radiation", "viral"];
const PAR: Record<string, DmgType> = {
  "cold+heat": "blast", "electricity+heat": "radiation", "heat+toxin": "gas",
  "cold+electricity": "magnetic", "cold+toxin": "viral", "electricity+toxin": "corrosive",
};
const combinar = (a: DmgType, b: DmgType): DmgType => PAR[[a, b].sort().join("+")]!;

/**
 * El daño por proyectil, por tipo, como lo cuenta el Arsenal (sin cuantizar):
 * - `daño base` × (1 + Σ%daño) para todos los tipos; los físicos además × (1 + Σ%tipo);
 * - cada elemento de mod = total base modificado × Σ%elemento;
 * - se combinan de a pares en el orden de los casilleros (0–7, exilio); un elemento repetido queda donde apareció
 *   primero; los innatos del arma van al final (Calor > Frío > Electricidad > Toxina) salvo que un mod tenga el mismo;
 * - los secundarios innatos o de mod quedan como están.
 * Devuelve también el total base modificado, que es la unidad de la cuantización.
 */
function danio(item: BuildItem, slots: readonly Slot[]): { byType: Partial<Record<DmgType, number>>; total: number; baseMod: number } {
  const w = item.w!;
  const s = sumas(slots);
  const pct = (k: StatKey) => s.get(k) ?? 0;
  const D = 1 + (pct("damage") + (item.kind === "melee" ? pct("meleeDamage") : 0)) / 100;
  const base = w.dmg.reduce((a, b) => a + b, 0);
  const baseMod = base * D;
  const innato = (t: DmgType) => (w.dmg[DT_EXPORT.indexOf(t)] ?? 0) * D;
  const byType: Partial<Record<DmgType, number>> = {};
  const sumar = (t: DmgType, v: number) => { if (v) byType[t] = (byType[t] ?? 0) + v; };

  for (const t of FISICOS) sumar(t, innato(t) * (1 + pct(t) / 100));
  // Lo que no se combina (Void, Tau, Verdadero…) entra al total sin tipo.
  const resto = w.dmg.slice(DT_EXPORT.length).reduce((a, b) => a + b, 0) * D;

  // Primarios en orden de aparición; secundarios de mod directos.
  const orden: { t: DmgType; v: number }[] = [];
  const porCasillero = [...slots].filter((sl) => sl.mod && sl.id !== "aura" && sl.id !== "stance")
    .sort((a, b) => (a.id === "exilus" ? 8 : (a.id as number)) - (b.id === "exilus" ? 8 : (b.id as number)));
  for (const sl of porCasillero) {
    for (const [k, vals] of sl.mod!.fx) {
      const t = k as DmgType;
      const v = (baseMod * fxAt(vals, sl.rank)) / 100;
      if (PRIMARIOS.includes(t)) {
        const e = orden.find((o) => o.t === t);
        if (e) e.v += v;
        else orden.push({ t, v });
      } else if (SECUNDARIOS.includes(t)) sumar(t, v);
    }
  }
  for (const t of PRIMARIOS) {
    const v = innato(t);
    if (!v) continue;
    const e = orden.find((o) => o.t === t);
    if (e) e.v += v;
    else orden.push({ t, v });
  }
  for (let i = 0; i < orden.length; i += 2) {
    const a = orden[i]!, b = orden[i + 1];
    if (b) sumar(combinar(a.t, b.t), a.v + b.v);
    else sumar(a.t, a.v);
  }
  for (const t of SECUNDARIOS) sumar(t, innato(t));

  const total = Object.values(byType).reduce((a, b) => a + (b ?? 0), 0) + resto;
  return { byType, total, baseMod };
}

/** Las stats de un arma sin mods (`base`) y con los de los casilleros (`mod`). El daño es por proyectil: la UI lo multiplica por `ms`. */
export function weaponStats(item: BuildItem, slots: Slot[]): WeaponStats {
  const calc = (sl: readonly Slot[]): WStat => {
    const w = item.w!;
    const s = sumas(sl);
    const pct = (k: StatKey) => s.get(k) ?? 0;
    const { byType, total } = danio(item, sl);
    // Cadencia: en cuerpo a cuerpo suma la velocidad de ataque; en arcos los mods de cadencia valen ×2.
    const rate = pct("fireRate") * (w.bow ? 2 : 1) + (item.kind === "melee" ? pct("attackSpeed") : 0);
    const out: WStat = {
      total, byType,
      cc: bonus(w.cc, pct("critChance")),
      cd: bonus(w.cd, pct("critDamage")),
      sc: bonus(w.sc, pct("statusChance")),
      rate: bonus(w.rate, rate),
      ms: bonus(w.ms, pct("multishot")),
    };
    if (w.mag !== undefined) out.mag = redondeo(bonus(w.mag, pct("magazine")));
    if (w.reload !== undefined) out.reload = w.reload / (1 + pct("reload") / 100);
    return out;
  };
  return { base: calc([]), mod: calc(slots) };
}

/**
 * El daño que pega en combate: cada tipo cuantizado al múltiplo más cercano de 1/32 del total base modificado
 * (Damage/Calculation, caso Nagantaka Prime). El Arsenal no cuantiza: `weaponStats` da lo del Arsenal.
 */
export function combatDamage(item: BuildItem, slots: Slot[]): { total: number; byType: Partial<Record<DmgType, number>> } {
  const { byType, baseMod } = danio(item, slots);
  const u = baseMod / 32;
  const q: Partial<Record<DmgType, number>> = {};
  let total = 0;
  for (const [t, v] of Object.entries(byType) as [DmgType, number][]) {
    const r = u > 0 ? redondeo(v / u) * u : 0;
    if (r) q[t] = r;
    total += r;
  }
  return { total, byType: q };
}

/** Eficiencia que muestra el Arsenal: entre 25 % y 175 %. */
const TOPE_EFICIENCIA: [number, number] = [25, 175];

/** Stats de un Warframe a rango 30: salud, escudo, armadura y energía `× (1 + Σ%)`; habilidades `100 + Σ%`. */
export function frameStats(item: BuildItem, slots: Slot[]): FrameStats {
  const f = item.f!;
  const calc = (sl: readonly Slot[]): FStat => {
    const s = sumas(sl);
    const pct = (k: StatKey) => s.get(k) ?? 0;
    return {
      health: bonus(f.health, pct("health")),
      shield: bonus(f.shield, pct("shield")),
      armor: bonus(f.armor, pct("armor")),
      energy: bonus(f.energy, pct("energy")),
      strength: 100 + pct("strength"),
      duration: 100 + pct("duration"),
      efficiency: Math.min(TOPE_EFICIENCIA[1], Math.max(TOPE_EFICIENCIA[0], 100 + pct("efficiency"))),
      range: 100 + pct("range"),
    };
  };
  return { base: calc([]), mod: calc(slots) };
}

/** Coste de una habilidad con eficiencia `ef` (en %): `base × max(2 − E, 0,25)`. */
export const abilityCost = (base: number, ef: number): number => base * Math.max(2 - ef / 100, 0.25);

/** Drenaje de una canalizada: `base × (2 − E) / D`, con E sin tope, limitado a [0,25 ; 1,75] × base. */
export const channelDrain = (base: number, ef: number, dur: number): number =>
  base * Math.min(1.75, Math.max(0.25, (2 - ef / 100) / (dur / 100)));
