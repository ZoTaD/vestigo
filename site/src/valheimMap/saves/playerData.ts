/**
 * `m_playerData` del `.fch`: el byte array que escribe `Player.Save(ZPackage)`
 * y lee `Player.Load` (leído del IL de Valheim 0.221 / Norte profundo). Orden,
 * con la versión del bloque (`v`, el primer int32):
 *
 *   [v≥7] float salud máx; float salud; [v≥10] float aguante; [8≤v<28] bool;
 *   [v≥20] float tiempo desde la muerte; [v≥23] string poder guardián;
 *   [v≥24] float su enfriamiento; [v=2] ZDOID; inventario (`Inventory.Load`);
 *   recetas (int + strings); [v<15] lista vieja de strings, si no estaciones
 *   (int + string/int); materiales (int + strings); tutoriales salvo
 *   19≤v<21; [v≥6] únicos; [v≥9] trofeos; biomas ([v≥33 o v=31] strings,
 *   [v≥18] ints); [v≥22] textos (string/string); [v≥4] barba y pelo;
 *   [v≥5] dos Vector3 de colores; [v≥11] int modelo; [v≥12] comidas;
 *   [v≥17] habilidades (`Skills.Load`). Lo que sigue (claves propias, aguante,
 *   eitr, barra de construcción, semillas) no se lee.
 */
import type { PlayerProgress } from "./contract";
import { PackageReader } from "./package";

function readStrings(p: PackageReader, what: string): string[] {
  const n = p.readCount(what);
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(p.readString());
  return out;
}

/**
 * `Inventory.Load`: int32 versión; desde la 108 un ushort de cantidad y cada
 * objeto con un byte de banderas que dice qué campos vienen; antes,
 * `LoadOld` con todos los campos según la versión.
 */
function skipInventory(p: PackageReader): void {
  const v = p.readInt();
  if (v >= 108) {
    const n = p.readUShort();
    for (let i = 0; i < n; i++) {
      p.take(4 + 3); // durabilidad ×100, x, y, nivel de mundo
      const flags = p.readByte();
      if (flags & 4) p.take(2); // calidad
      if (flags & 8) p.take(2); // pila
      if (flags & 16) p.take(4); // variante
      if (flags & 32) { p.take(8); p.skipString(); } // quién lo fabricó
      if (flags & 64) p.take(4); // hash del prefab
      if (flags & 128) { const k = p.readNumItems(); for (let j = 0; j < 2 * k; j++) p.skipString(); }
      if (v >= 109 || v === 107) p.take(1);
    }
    return;
  }
  const n = p.readCount("objetos del inventario", 1);
  for (let i = 0; i < n; i++) {
    p.skipString(); // prefab
    p.take(4 + 4 + 8 + 1); // pila, durabilidad, posición, equipado
    if (v >= 101) p.take(4); // calidad
    if (v >= 102) p.take(4); // variante
    if (v >= 103) { p.take(8); p.skipString(); }
    if (v >= 104) { const k = p.readCount("datos del objeto", 2); for (let j = 0; j < 2 * k; j++) p.skipString(); }
    if (v >= 105) p.take(4); // nivel de mundo
    if (v >= 106) p.take(1); // recogido
    if (v === 107 || v >= 109) p.take(1);
  }
}

export function parsePlayerData(data: Uint8Array): PlayerProgress {
  const p = new PackageReader(data);
  const v = p.readInt();
  if (v < 1 || v > 1000) throw new RangeError(`versión de jugador imposible: ${v}`);
  if (v >= 7) p.take(4); // salud máxima
  p.take(4); // salud
  if (v >= 10) p.take(4); // aguante máximo
  if (v >= 8 && v < 28) p.take(1); // primer spawn (viejo)
  if (v >= 20) p.take(4); // tiempo desde la muerte
  if (v >= 23) p.skipString(); // poder guardián
  if (v >= 24) p.take(4); // su enfriamiento
  if (v === 2) p.take(12); // ZDOID
  skipInventory(p);

  const knownRecipes = readStrings(p, "recetas");
  const knownStations: Record<string, number> = {};
  if (v < 15) {
    readStrings(p, "estaciones viejas");
  } else {
    const n = p.readCount("estaciones", 5);
    for (let i = 0; i < n; i++) { const k = p.readString(); knownStations[k] = p.readInt(); }
  }
  const knownMaterials = readStrings(p, "materiales");
  if (v < 19 || v >= 21) readStrings(p, "tutoriales");
  if (v >= 6) readStrings(p, "únicos");
  const trophies = v >= 9 ? readStrings(p, "trofeos") : [];
  if (v >= 33 || v === 31) readStrings(p, "biomas");
  else if (v >= 18) p.take(p.readCount("biomas", 4) * 4);
  if (v >= 22) { const n = p.readCount("textos", 2); for (let i = 0; i < 2 * n; i++) p.skipString(); }
  if (v >= 4) { p.skipString(); p.skipString(); } // barba, pelo
  if (v >= 5) p.take(24); // colores de piel y pelo
  if (v >= 11) p.take(4); // modelo
  if (v >= 12) {
    const n = p.readCount("comidas", 5);
    for (let i = 0; i < n; i++) {
      p.skipString();
      if (v >= 14) p.take(v >= 25 ? 4 : v >= 16 ? 8 : 4);
      else p.take(6 * 4 + (v >= 13 ? 4 : 0));
    }
  }
  const skills: Record<number, number> = {};
  if (v >= 17) {
    const sv = p.readInt(); // versión de `Skills`
    const n = p.readCount("habilidades", sv >= 2 ? 12 : 8);
    for (let i = 0; i < n; i++) {
      const id = p.readInt();
      const level = p.readSingle();
      if (sv >= 2) p.take(4); // acumulado
      if (!Number.isFinite(level) || level < 0 || level > 1000) throw new RangeError(`nivel imposible ${level} en la habilidad ${id}`);
      skills[id] = level;
    }
  }
  return { knownRecipes, knownStations, knownMaterials, trophies, skills };
}
