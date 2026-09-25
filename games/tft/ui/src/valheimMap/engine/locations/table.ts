// Portado de Valheim-SeedLab (MIT, © 2026 DoomMachine) — src/SeedLab.Locations/LocationTable.cs y AltBiomes.cs (AltBiomeRuntime.FromDump)
/**
 * Las tablas de datos del juego que usa la ubicación: los `ZoneLocation`
 * (`locations.json`) y las variantes de bioma (`altbiomes.json`), tal como las
 * exporta `games/valheim/pipeline/map_data.py` con los nombres de campo de
 * SeedLab. Nada de esto está escrito en el código: el motor es maquinaria y la
 * tabla son datos.
 */
import { stableHashCode, stableHashLanes } from "../stableHash";

const F = Math.fround;

/** Una entrada de `locations.json` (`LocationDef` de SeedLab). Sólo los campos que se leen. */
export interface LocationDef {
  index: number;
  orderedIndex?: number;
  name: string | null;
  enable: boolean;
  prefabName: string | null;
  softRefName: string | null;
  nameHash: number;
  assetId: { v3: number; v2: number; v1: number; v0: number } | null;
  biome: number;
  biomeArea: number;
  quantity: number;
  prioritized: boolean;
  centerFirst: boolean;
  unique: boolean;
  group: string | null;
  minDistanceFromSimilar: number;
  groupMax: string | null;
  maxDistanceFromSimilar: number;
  interiorRadius: number;
  exteriorRadius: number;
  minTerrainDelta: number;
  maxTerrainDelta: number;
  minimumVegetation: number;
  maximumVegetation: number;
  surroundCheckVegetation: boolean;
  surroundCheckDistance: number;
  surroundCheckLayers: number;
  surroundBetterThanAverage: number;
  inForest: boolean;
  forestTresholdMin: number;
  forestTresholdMax: number;
  minDistanceFromCenter: number;
  maxDistanceFromCenter: number;
  minDistance: number;
  maxDistance: number;
  minAltitude: number;
  maxAltitude: number;
  altBiomeParent: string | null;
}

/** Una entrada de `altbiomes.json` (`AltBiomeDef` de SeedLab). */
export interface AltBiomeDef {
  name: string | null;
  enabled: boolean;
  biome: number;
  nameHash: number;
  minDistanceFromCenter: number;
  minAmountSpawned: number;
  maxAmountSpawned: number;
  chance: number;
  requireNeighbor: number;
  notNeighbor: number;
  incompatibleAltBiomes: string[] | null;
  minEdgeSize: number;
  maxEdgeSize: number;
  minAvgHeight: number;
  maxAvgHeight: number;
  belowWorldX: number;
  aboveWorldX: number;
  belowWorldY: number;
  aboveWorldY: number;
  blockLocationNames: string[] | null;
}

/** Un `ZoneSystem.ZoneLocation` como lo necesita el motor. */
export interface LocationEntry {
  readonly index: number;
  /** `m_name`: el filtro de bloqueo de las variantes compara ESTE texto, no el prefab. */
  readonly name: string;
  readonly enable: boolean;
  /** `m_prefab.Name`: la semilla del Random del tipo, lo que cuenta CountNrOfLocation. */
  readonly prefabName: string;
  readonly nameHash: number;
  /** El AssetID como texto (la identidad de "el mismo prefab" en los filtros de similares). */
  readonly assetKey: string;
  readonly biome: number;
  /** Máscara Edge/Median; -1 (CharredFortress y otros) = todos los bits. */
  readonly biomeArea: number;
  readonly quantity: number;
  readonly prioritized: boolean;
  readonly centerFirst: boolean;
  readonly unique: boolean;
  readonly group: string;
  readonly minDistanceFromSimilar: number;
  readonly groupMax: string;
  readonly maxDistanceFromSimilar: number;
  readonly interiorRadius: number;
  readonly exteriorRadius: number;
  readonly minTerrainDelta: number;
  readonly maxTerrainDelta: number;
  readonly minimumVegetation: number;
  readonly maximumVegetation: number;
  readonly surroundCheckVegetation: boolean;
  readonly surroundCheckDistance: number;
  readonly surroundCheckLayers: number;
  readonly surroundBetterThanAverage: number;
  readonly inForest: boolean;
  readonly forestTresholdMin: number;
  readonly forestTresholdMax: number;
  readonly minDistanceFromCenter: number;
  readonly maxDistanceFromCenter: number;
  readonly minDistance: number;
  readonly maxDistance: number;
  readonly minAltitude: number;
  readonly maxAltitude: number;
  /** El nombre de la variante de bioma que la agregó (`m_addLocations`), o null. */
  readonly altBiomeParent: string | null;
  /** `Mathf.Max(exterior, interior)`: el margen del sorteo de punto. */
  readonly maxRadius: number;
  /** 60.000 intentos si es prioritaria, 12.000 si no. */
  readonly attempts: number;
}

export interface LocationTable {
  /** En el orden de `ZoneSystem.m_locations`. */
  readonly all: LocationEntry[];
  /**
   * El orden que recorre la colocación: prioritarias primero (orden estable) y
   * después se sacan las deshabilitadas o con cantidad 0.
   */
  readonly ordered: LocationEntry[];
}

/** Un `AltBiome` (variante de bioma), sin el estado por mundo (va en la asignación). */
export interface AltBiomeEntry {
  readonly name: string;
  readonly nameHash: number;
  readonly enabled: boolean;
  readonly biome: number;
  readonly minDistanceFromCenter: number;
  readonly minAmountSpawned: number;
  readonly maxAmountSpawned: number;
  readonly chance: number;
  readonly requireNeighbor: number;
  readonly notNeighbor: number;
  readonly incompatibleAltBiomes: readonly string[];
  readonly minEdgeSize: number;
  readonly maxEdgeSize: number;
  readonly minAvgHeight: number;
  readonly maxAvgHeight: number;
  readonly belowWorldX: number;
  readonly aboveWorldX: number;
  readonly belowWorldY: number;
  readonly aboveWorldY: number;
  readonly blockLocationNames: readonly string[];
}

/**
 * `AssetId.FromPrefabNameFallback`: un id sacado del nombre para las entradas
 * sin AssetID (en 1.0.15 son todas deshabilitadas, así que nunca corren).
 */
function fallbackAssetKey(prefab: string): string {
  const { even, odd } = stableHashLanes(prefab);
  return `5eed1ab0:0:${odd}:${even}`;
}

/**
 * `LocationTable.FromDump`: arma la tabla desde `locations.json`. El `nameHash`
 * del JSON se VERIFICA contra el hash (si no coincidieran, se correría todo el
 * Random de ese tipo).
 */
export function locationTableFromJson(json: unknown): LocationTable {
  const defs = (json as { locations: LocationDef[] }).locations;
  if (!Array.isArray(defs)) throw new Error("locations.json no trae la lista `locations`.");
  const all: LocationEntry[] = defs.map((d) => {
    const prefab = d.softRefName ?? d.prefabName ?? d.name ?? "";
    if (prefab.length === 0) throw new Error(`locations.json: la entrada ${d.index} no tiene prefab.`);
    const hash = stableHashCode(prefab);
    if (d.nameHash !== 0 && d.nameHash !== hash) {
      throw new Error(`locations.json: '${prefab}' trae nameHash ${d.nameHash} pero su hash es ${hash}.`);
    }
    const id = d.assetId;
    const assetKey = id && ((id.v3 | id.v2 | id.v1 | id.v0) !== 0)
      ? `${id.v3 >>> 0}:${id.v2 >>> 0}:${id.v1 >>> 0}:${id.v0 >>> 0}`
      : fallbackAssetKey(prefab);
    const exteriorRadius = F(d.exteriorRadius);
    const interiorRadius = F(d.interiorRadius);
    return {
      index: d.index,
      name: d.name ?? "",
      enable: d.enable,
      prefabName: prefab,
      nameHash: hash,
      assetKey,
      biome: d.biome | 0,
      biomeArea: d.biomeArea | 0,
      quantity: d.quantity | 0,
      prioritized: d.prioritized,
      centerFirst: d.centerFirst,
      unique: d.unique,
      group: d.group ?? "",
      minDistanceFromSimilar: F(d.minDistanceFromSimilar),
      groupMax: d.groupMax ?? "",
      maxDistanceFromSimilar: F(d.maxDistanceFromSimilar),
      interiorRadius,
      exteriorRadius,
      minTerrainDelta: F(d.minTerrainDelta),
      maxTerrainDelta: F(d.maxTerrainDelta),
      minimumVegetation: F(d.minimumVegetation),
      maximumVegetation: F(d.maximumVegetation),
      surroundCheckVegetation: d.surroundCheckVegetation,
      surroundCheckDistance: F(d.surroundCheckDistance),
      surroundCheckLayers: d.surroundCheckLayers | 0,
      surroundBetterThanAverage: F(d.surroundBetterThanAverage),
      inForest: d.inForest,
      forestTresholdMin: F(d.forestTresholdMin),
      forestTresholdMax: F(d.forestTresholdMax),
      minDistanceFromCenter: F(d.minDistanceFromCenter),
      maxDistanceFromCenter: F(d.maxDistanceFromCenter),
      minDistance: F(d.minDistance),
      maxDistance: F(d.maxDistance),
      minAltitude: F(d.minAltitude),
      maxAltitude: F(d.maxAltitude),
      altBiomeParent: d.altBiomeParent ?? null,
      maxRadius: exteriorRadius > interiorRadius ? exteriorRadius : interiorRadius,
      attempts: d.prioritized ? 60000 : 12000,
    };
  });
  // OrderByDescending(prioritized) es una partición estable…
  const ordered = [...all.filter((e) => e.prioritized), ...all.filter((e) => !e.prioritized)];
  // …y después se sacan hacia atrás las que no corren (conserva el orden relativo).
  for (let i = ordered.length - 1; i >= 0; i--) {
    if (!ordered[i].enable || ordered[i].quantity === 0) ordered.splice(i, 1);
  }
  return { all, ordered };
}

/** `AltBiomeRuntime.FromDump` para cada variante de `altbiomes.json`, en el orden de `m_alts`. */
export function altBiomesFromJson(json: unknown): AltBiomeEntry[] {
  const defs = (json as { altBiomes: AltBiomeDef[] }).altBiomes;
  if (!Array.isArray(defs)) throw new Error("altbiomes.json no trae la lista `altBiomes`.");
  return defs.map((d) => {
    const name = d.name ?? "";
    const hash = stableHashCode(name);
    if (d.nameHash !== 0 && d.nameHash !== hash) {
      throw new Error(`altbiomes.json: '${name}' trae nameHash ${d.nameHash} pero su hash es ${hash}.`);
    }
    return {
      name,
      nameHash: hash,
      enabled: d.enabled,
      biome: d.biome | 0,
      minDistanceFromCenter: F(d.minDistanceFromCenter),
      minAmountSpawned: d.minAmountSpawned | 0,
      maxAmountSpawned: d.maxAmountSpawned | 0,
      chance: F(d.chance),
      requireNeighbor: d.requireNeighbor | 0,
      notNeighbor: d.notNeighbor | 0,
      incompatibleAltBiomes: d.incompatibleAltBiomes ?? [],
      minEdgeSize: d.minEdgeSize | 0,
      maxEdgeSize: d.maxEdgeSize | 0,
      minAvgHeight: F(d.minAvgHeight),
      maxAvgHeight: F(d.maxAvgHeight),
      belowWorldX: F(d.belowWorldX),
      aboveWorldX: F(d.aboveWorldX),
      belowWorldY: F(d.belowWorldY),
      aboveWorldY: F(d.aboveWorldY),
      blockLocationNames: d.blockLocationNames ?? [],
    };
  });
}
