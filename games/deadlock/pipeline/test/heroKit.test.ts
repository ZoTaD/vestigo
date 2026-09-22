import { describe, expect, it } from "vitest";
import {
  buildAbility,
  buildBaseStats,
  buildHeroKit,
  kitStat,
  sinTeclaDibujada,
  upgradeText,
  type RawAbility,
  type RawHeroKit,
} from "../src/heroKit";
import { buildInsights, perMatchOf, MIN_PAIR } from "../src/heroInsights";

// Recortes reales de la API del 2026-09-22 (Dínamo), sin los SVG.
const stomp: RawAbility = {
  id: 3760705623,
  class_name: "citadel_ability_stomp",
  name: "Kinetic Pulse",
  ability_type: "signature",
  image_webp: "https://x/sumo_stomp.webp",
  videos: { mp4: "https://x/stomp.mp4" },
  description: {
    quip: "Release a pulse that knocks enemies up",
    t1_desc: '<span class="highlight">+1</span> Charge',
  },
  properties: {
    AbilityCooldown: { value: 26, label: "Cooldown", postfix: "s", css_class: "cooldown", icon: "https://x/cd.svg" },
    AbilityCharges: { value: "1", label: "Charges" },
    Damage: {
      value: 115,
      label: "Damage",
      icon: "https://x/dmg.svg",
      scale_function: { specific_stat_scale_type: "ETechPower", stat_scale: 1.55 },
    },
    TossDuration: { value: "1", label: "Duration", postfix: "s" },
    StompRange: { value: "16m", label: "Pulse Range", postfix: "m" },
    BulletResistReduction: { value: 0, label: "Bullet Resist" },
    SlowPercent: { value: 0, label: "Slow", postfix: "%" },
  },
  tooltip_details: {
    info_sections: [
      {
        loc_string:
          'Release an energy pulse, dealing <svg><path d="M0"/></svg><span class="inline-attribute-label SpiritDamage">spirit damage</span>.',
        properties_block: [
          {
            properties: [
              { important_property: "Damage" },
              {
                important_property: "StatusEffectDisplacement",
                status_effect_value: "TossDuration",
                important_property_icon: "https://x/knock.svg",
              },
            ],
          },
        ],
        basic_properties: ["StompRange"],
      },
      // "On Hit:" sólo tiene cifras en cero hasta la mejora T2.
      {
        properties_block: [
          { loc_string: "On Hit:", properties: [{ important_property: "BulletResistReduction" }, { important_property: "SlowPercent" }] },
        ],
      },
    ],
  },
  upgrades: [
    { property_upgrades: [{ name: "AbilityCharges", bonus: "1" }] },
    { property_upgrades: [{ name: "SlowPercent", bonus: "24" }] },
    { property_upgrades: [{ name: "AbilityCooldown", bonus: "-6" }, { name: "StompRange", bonus: "20m" }] },
  ],
};

describe("kitStat", () => {
  it("toma etiqueta, unidad, ícono y la escala de espíritu del juego", () => {
    expect(kitStat(stomp.properties!, "Damage")).toEqual({
      label: "Damage",
      value: "115",
      unit: "",
      icon: "https://x/dmg.svg",
      spirit: 1.55,
    });
  });

  it("un efecto de estado se lee por la propiedad que tiene su duración", () => {
    const st = kitStat(stomp.properties!, "StatusEffectDisplacement", {
      status_effect_value: "TossDuration",
      important_property_icon: "https://x/knock.svg",
    });
    expect(st).toEqual({ label: "Duration", value: "1", unit: "s", icon: "https://x/knock.svg" });
  });

  it("no publica una cifra en cero ni una sin etiqueta", () => {
    expect(kitStat(stomp.properties!, "SlowPercent")).toBeUndefined();
    expect(kitStat({ X: { value: 3 } }, "X")).toBeUndefined();
    expect(kitStat(stomp.properties!, "NoExiste")).toBeUndefined();
  });

  it("no repite la unidad que ya trae el valor", () => {
    expect(kitStat(stomp.properties!, "StompRange")).toMatchObject({ value: "16m", unit: "" });
  });
});

describe("upgradeText", () => {
  it("usa la frase del juego cuando la hay", () => {
    expect(upgradeText(stomp, 0, new Map())).toEqual([{ t: "+1", hi: true }, { t: " Charge" }]);
  });

  it("sin frase, arma el texto con la etiqueta de cada propiedad y su signo", () => {
    expect(upgradeText(stomp, 2, new Map())).toEqual([{ t: "-6s Cooldown · +20m Pulse Range", hi: true }]);
    expect(upgradeText(stomp, 1, new Map())).toEqual([{ t: "+24% Slow", hi: true }]);
  });

  it("una propiedad sin etiqueta no se inventa", () => {
    const a: RawAbility = { ...stomp, description: {}, upgrades: [{ property_upgrades: [{ name: "ReduceDebuffs", bonus: 50 }] }] };
    expect(upgradeText(a, 0, new Map())).toEqual([]);
  });
});

describe("buildAbility", () => {
  it("arma la tarjeta: frase, cifras, básicas, recarga y tres mejoras", () => {
    const icons = new Map<string, string>();
    const a = buildAbility(stomp, 1, icons);
    expect(a).toMatchObject({ id: 3760705623, slot: 1, ultimate: false, name: "Kinetic Pulse", video: { mp4: "https://x/stomp.mp4" } });
    expect(a.cooldown).toMatchObject({ value: "26", unit: "s" });
    // Una carga es lo normal y no se dice.
    expect(a.charges).toBeUndefined();
    expect(a.sections).toHaveLength(1);
    expect(a.sections[0].groups[0].stats.map((s) => s.label)).toEqual(["Damage", "Duration"]);
    expect(a.sections[0].basics.map((s) => s.label)).toEqual(["Pulse Range"]);
    expect(a.sections[0].text).toContainEqual({ t: "spirit damage", attr: "SpiritDamage", icon: "attr_SpiritDamage" });
    expect(a.upgrades).toHaveLength(3);
    expect(icons.has("attr_SpiritDamage")).toBe(true);
  });

  it("marca la pasiva por el rótulo en inglés aunque el texto esté en español", () => {
    const es: RawAbility = {
      ...stomp,
      tooltip_details: {
        info_sections: [{ properties_block: [{ loc_string: "Pasiva:", properties: [{ important_property: "Damage" }] }] }],
      },
    };
    const a = buildAbility(es, 2, new Map(), [["Passive:"]]);
    expect(a.sections[0].groups[0]).toMatchObject({ label: "Pasiva:", passive: true });
  });
});

describe("sinTeclaDibujada", () => {
  it("saca el ícono de tecla con sus dos puntos", () => {
    const raw = 'Restores stamina. <span class="highlight"><svg><path d="M1"/></svg>\n</span>: Bring nearby allies.';
    expect(sinTeclaDibujada(raw)).toBe("Restores stamina. Bring nearby allies.");
  });
});

const dynamo: RawHeroKit = {
  id: 11,
  name: "Dynamo",
  player_selectable: true,
  complexity: 2,
  tags: ["Cooperative"],
  description: { role: "Locks down", playstyle: "Protects allies", lore: "A scientist.\r\n" },
  images: { icon_hero_card_webp: "https://x/card.webp", background_image_webp: "https://x/bg.webp" },
  items: { weapon_primary: "citadel_weapon_sumo_set", signature1: "citadel_ability_stomp" },
  starting_stats: {
    max_health: { value: 880 },
    base_health_regen: { value: 1.75 },
    max_move_speed: { value: 6.7 },
    sprint_speed: { value: 1.6 },
    stamina: { value: 3 },
    light_melee_damage: { value: 50 },
    heavy_melee_damage: { value: 116 },
  },
  standard_level_up_upgrades: {
    MODIFIER_VALUE_BASE_BULLET_DAMAGE_FROM_LEVEL: 0.5,
    MODIFIER_VALUE_BASE_HEALTH_FROM_LEVEL: 61,
    MODIFIER_VALUE_TECH_POWER: 1.1,
    MODIFIER_VALUE_BASE_MELEE_DAMAGE_FROM_LEVEL: 1.58,
  },
};

const weapon: RawAbility = {
  id: 1,
  class_name: "citadel_weapon_sumo_set",
  name: "weapon",
  weapon_info: {
    bullet_damage: 12.6,
    bullets: 1,
    shots_per_second: 3.8095238095238098,
    damage_per_second: 47.99999999999999,
    damage_per_second_with_reload: 32.10191082802548,
    clip_size: 20,
    reload_duration: 2.35,
    damage_per_magazine: 252,
  },
};

describe("buildBaseStats", () => {
  it("toma los atributos base, lo que da cada bendición y el arma, redondeados", () => {
    expect(buildBaseStats(dynamo, weapon)).toEqual({
      health: 880,
      healthRegen: 1.75,
      moveSpeed: 6.7,
      sprintSpeed: 1.6,
      stamina: 3,
      lightMelee: 50,
      heavyMelee: 116,
      perBoon: { bulletDamage: 0.5, health: 61, spiritPower: 1.1, meleeDamage: 1.58 },
      weapon: { bulletDamage: 12.6, pellets: 1, fireRate: 3.81, dps: 48, sustainedDps: 32.1, clip: 20, reload: 2.35, magazineDamage: 252 },
    });
  });

  it("sin arma no inventa una", () => {
    expect(buildBaseStats(dynamo, undefined).weapon).toBeUndefined();
  });
});

describe("buildHeroKit", () => {
  it("una fila por héroe jugable, con la huella de su detalle", () => {
    const enPrueba: RawHeroKit = { ...dynamo, id: 99, in_development: true };
    const esDynamo: RawHeroKit = { ...dynamo, tags: ["Cooperativo"], description: { role: "Bloquea" } };
    const { file, details } = buildHeroKit(
      { en: [dynamo, enPrueba], es: [esDynamo] },
      { en: [stomp, weapon], es: [{ ...stomp, name: "Pulsación Cinética" }] },
      "2026-09-22T00:00:00Z"
    );
    expect(Object.keys(file.heroes)).toEqual(["11"]);
    expect(file.heroes["11"].hash).toMatch(/^[0-9a-f]{12}$/);
    expect(details[0].abilities.es[0].name).toBe("Pulsación Cinética");
    expect(details[0].text.es.tags).toEqual(["Cooperativo"]);
    expect(details[0].text.en.lore).toBe("A scientist.");
    expect(details[0].art).toEqual({ card: "https://x/card.webp", background: "https://x/bg.webp" });
  });
});

describe("heroInsights", () => {
  it("promedia por partida y calcula la precisión con tiros acertados sobre totales", () => {
    expect(
      perMatchOf({ hero_id: 11, wins: 5, matches: 10, total_kills: 41, total_shots_hit: 3, total_shots_missed: 1 })
    ).toEqual({ kills: 4.1, accuracy: 0.75 });
  });

  it("deja afuera los cruces sin muestra y los de héroes que no se publican", () => {
    const f = buildInsights(
      "phantom-above",
      [11, 8, 52],
      { from: "2026-09-06", to: "2026-09-20" },
      [],
      [{ hero_id: 11, bucket: 1789516800, wins: 7, matches: 13 }],
      [
        { hero_id: 11, enemy_hero_id: 8, wins: 46, matches_played: 100 },
        { hero_id: 11, enemy_hero_id: 52, wins: 60, matches_played: 99 },
        { hero_id: 11, enemy_hero_id: 999, wins: 60, matches_played: 500 },
      ],
      [{ hero_id1: 8, hero_id2: 11, wins: 70, matches_played: 120 }],
      "now"
    );
    expect(f.minPair).toBe(MIN_PAIR);
    expect(f.heroes["11"].vs).toEqual([[8, 100, 46]]);
    expect(f.heroes["11"].with).toEqual([[8, 120, 70]]);
    expect(f.heroes["8"].with).toEqual([[11, 120, 70]]);
    expect(f.heroes["11"].daily).toEqual([["2026-09-16", 13, 7]]);
  });
});

describe("parseLoc conserva el espacio que el juego deja adentro del resaltado", () => {
  it("no pega la palabra de antes ni la de después", async () => {
    const { parseLoc } = await import("../src/catalog");
    const spans = parseLoc('de movimiento<span class="highlight"> durante 4 s</span> y <span class="highlight">+20 m </span>de alcance');
    expect(spans.map((s) => s.t).join("")).toBe("de movimiento durante 4 s y +20 m de alcance");
  });
});

describe("parseLoc y los saltos de línea", () => {
  it("un <br> separa las frases en vez de pegarlas", async () => {
    const { parseLoc } = await import("../src/catalog");
    const spans = parseLoc('<span class="highlight">+1.0</span> Charge<br><span class="highlight">+2s</span> Trail Duration');
    expect(spans.map((s) => s.t).join("")).toBe("+1.0 Charge +2s Trail Duration");
  });
});
