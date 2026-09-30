/**
 * Los filtros de la tienda de Deadlock para cada objeto (City Never Sleeps, 2026-09-29).
 *
 *   npm run build:shop-filters
 *
 * La tienda nueva del juego filtra por categoría —Físico, Espíritu, Defensa,
 * Movilidad, Interrupción, Misceláneo— y subfiltros ("Poder espiritual",
 * "Recarga y cargas"…). **El juego no publica qué objeto cae en qué filtro**:
 * lo arma el cliente a partir de las propiedades de cada objeto
 * (`m_eGeneratedShopFilters`). Este script aplica esa misma regla sobre la API
 * de deadlock-api, más `shop_filters` / `disabled_shop_filters` que la API sí
 * trae:
 *
 *   visibles = ((generados & ~disabled_shop_filters) | shop_filters)
 *
 * Validado el 2026-09-29 contra los 173 objetos de abilities.vdata: 173/173 con
 * la tabla DISPLAY_OVERRIDES de abajo (42 propiedades cuyo `m_eDisplayType` la
 * API no expone), 165/173 sin ella. Si Valve cambia esas propiedades, hay que
 * rehacer la tabla desde el vdata del juego.
 *
 * Opciones: --file <items.json> usa un volcado local; --out <ruta> (por defecto
 * ../data/shop-filters.json); --no-overrides aplica la regla pura.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const API_URL = 'https://api.deadlock-api.com/v1/assets/items';
const ICON_BASE = 'https://assets-bucket.deadlock-api.com/assets-api-res/';

// ---------------------------------------------------------------------------------------------
// Filter menu, texts and icons (panorama/layout/citadel_ui_shop_filters.xml + localization).
// es = citadel_main_spanish (Spain; complete); es_latam = citadel_main_latam (Valve has not
// translated the new filter strings to latam yet, so the game falls back to English there).
export const FILTER_DEFS = {
 "categories": [
  {
   "key": "Physical",
   "locKey": "CitadelShopFilterCategory_Physical",
   "en": "Physical",
   "es": "Físico",
   "es_latam": null,
   "color": "#C0673B",
   "icon": "s2r://panorama/images/shop/catalog/filters/sigil_physical_psd.vtex"
  },
  {
   "key": "Spirit",
   "locKey": "CitadelShopFilterCategory_Spirit",
   "en": "Spirit",
   "es": "Espíritu",
   "es_latam": null,
   "color": "#B377E3",
   "icon": "s2r://panorama/images/shop/catalog/filters/sigil_magic_psd.vtex"
  },
  {
   "key": "Defense",
   "locKey": "CitadelShopFilterCategory_Defense",
   "en": "Defense",
   "es": "Defensa",
   "es_latam": null,
   "color": "#28AE4E",
   "icon": "s2r://panorama/images/shop/catalog/filters/sigil_defense_psd.vtex"
  },
  {
   "key": "Mobility",
   "locKey": "CitadelShopFilterCategory_Mobility",
   "en": "Mobility",
   "es": "Movilidad",
   "es_latam": null,
   "color": "#30ACE6",
   "icon": "s2r://panorama/images/shop/catalog/filters/sigil_mobility_psd.vtex"
  },
  {
   "key": "Disruption",
   "locKey": "CitadelShopFilterCategory_Disruption",
   "en": "Disruption",
   "es": "Interrupción",
   "es_latam": null,
   "color": "#E3B018",
   "icon": "s2r://panorama/images/shop/catalog/filters/sigil_disruption_psd.vtex"
  },
  {
   "key": "Misc",
   "locKey": "CitadelShopFilterCategory_Misc",
   "en": "Misc",
   "es": "Misceláneo",
   "es_latam": null,
   "color": "#B38763",
   "icon": "s2r://panorama/images/shop/catalog/filters/sigil_misc_psd.vtex"
  }
 ],
 "groups": [
  {
   "key": "Gun",
   "locKey": "CitadelShopFilterCategory_GunImprovements",
   "en": "Gun Improvements",
   "es": "Mejoras de arma",
   "es_latam": null
  },
  {
   "key": "AbilityImprovements",
   "locKey": "CitadelShopFilterCategory_AbilityImprovements",
   "en": "Ability Improvements",
   "es": "Mejoras de habilidades",
   "es_latam": null
  },
  {
   "key": "AdditionalDamage",
   "locKey": "CitadelShopFilterCategory_AdditionalDamage",
   "en": "Additional Damage",
   "es": "Daño adicional",
   "es_latam": null
  },
  {
   "key": "Health",
   "locKey": "CitadelShopFilterCategory_Health",
   "en": "Health",
   "es": "Vida",
   "es_latam": null
  },
  {
   "key": "Resistances",
   "locKey": "CitadelShopFilterCategory_Resistances",
   "en": "Resistances",
   "es": "Resistencias",
   "es_latam": null
  },
  {
   "key": "Movement",
   "locKey": "CitadelShopFilterCategory_Movement",
   "en": "Movement",
   "es": "Movimiento",
   "es_latam": null
  },
  {
   "key": "Effectiveness",
   "locKey": "CitadelShopFilterCategory_Effectiveness",
   "en": "Reductions",
   "es": "Reducciones",
   "es_latam": null
  },
  {
   "key": "GunReductions",
   "locKey": "CitadelShopFilterCategory_GunReductions",
   "en": "Gun Reductions",
   "es": "Reducciones de arma",
   "es_latam": null
  },
  {
   "key": "StatusEffects",
   "locKey": "CitadelShopFilterCategory_StatusEffects",
   "en": "Status Effects",
   "es": "Efectos de estado",
   "es_latam": null
  }
 ],
 "filters": [
  {
   "key": "EShopFilterWeaponDamage",
   "category": "Physical",
   "group": "Gun",
   "groupPath": [
    "Gun"
   ],
   "en": "Weapon Damage",
   "es": "Daño del arma",
   "es_latam": "Daño por arma",
   "iconClass": "Gun",
   "icon": "s2r://panorama/images/icons/properties/gun.vsvg"
  },
  {
   "key": "EShopFilterWeaponAmmo",
   "category": "Physical",
   "group": "Gun",
   "groupPath": [
    "Gun"
   ],
   "en": "Ammo",
   "es": "Munición",
   "es_latam": null,
   "iconClass": "Ammo",
   "icon": "s2r://panorama/images/icons/properties/ammo.vsvg"
  },
  {
   "key": "EShopFilterWeaponFireRate",
   "category": "Physical",
   "group": "Gun",
   "groupPath": [
    "Gun"
   ],
   "en": "Fire Rate",
   "es": "Cadencia de tiro",
   "es_latam": null,
   "iconClass": "FireRate",
   "icon": "s2r://panorama/images/icons/properties/fire_rate.vsvg"
  },
  {
   "key": "EShopFilterWeaponBulletVelocity",
   "category": "Physical",
   "group": "Gun",
   "groupPath": [
    "Gun"
   ],
   "en": "Bullet Velocity",
   "es": "Velocidad de las balas",
   "es_latam": null,
   "iconClass": "BulletVelocity",
   "icon": "s2r://panorama/images/icons/properties/bullet_velocity.vsvg"
  },
  {
   "key": "EShopFilterWeaponRange",
   "category": "Physical",
   "group": "Gun",
   "groupPath": [
    "Gun"
   ],
   "en": "Range",
   "es": "Alcance",
   "es_latam": null,
   "iconClass": "Range",
   "icon": "s2r://panorama/images/icons/properties/range.vsvg"
  },
  {
   "key": "EShopFilterMelee",
   "category": "Physical",
   "group": null,
   "groupPath": [],
   "en": "Melee",
   "es": "Cuerpo a cuerpo",
   "es_latam": "Cuerpo a cuerpo",
   "iconClass": "Melee",
   "icon": "s2r://panorama/images/icons/properties/melee.vsvg"
  },
  {
   "key": "EShopFilterPhysicalAdditionalDamage",
   "category": "Physical",
   "group": null,
   "groupPath": [],
   "en": "Additional Physical Damage",
   "es": "Daño físico adicional",
   "es_latam": null,
   "iconClass": "DamageWeapon",
   "icon": "s2r://panorama/images/icons/properties/damage_bullet.vsvg"
  },
  {
   "key": "EShopFilterSpiritDamage",
   "category": "Spirit",
   "group": "AbilityImprovements",
   "groupPath": [
    "AbilityImprovements"
   ],
   "en": "Spirit Power",
   "es": "Poder espiritual",
   "es_latam": null,
   "iconClass": "Spirit",
   "icon": "s2r://panorama/images/icons/properties/spirit.vsvg"
  },
  {
   "key": "EShopFilterSpiritCooldownAndCharges",
   "category": "Spirit",
   "group": "AbilityImprovements",
   "groupPath": [
    "AbilityImprovements"
   ],
   "en": "Cooldown & Charges",
   "es": "Tiempo de recarga y cargas",
   "es_latam": null,
   "iconClass": "Cooldown",
   "icon": "s2r://panorama/images/icons/properties/cooldown.vsvg"
  },
  {
   "key": "EShopFilterSpiritDuration",
   "category": "Spirit",
   "group": "AbilityImprovements",
   "groupPath": [
    "AbilityImprovements"
   ],
   "en": "Duration",
   "es": "Duración",
   "es_latam": null,
   "iconClass": "Duration",
   "icon": "s2r://panorama/images/icons/properties/duration.vsvg"
  },
  {
   "key": "EShopFilterSpiritRange",
   "category": "Spirit",
   "group": "AbilityImprovements",
   "groupPath": [
    "AbilityImprovements"
   ],
   "en": "Range",
   "es": "Alcance",
   "es_latam": null,
   "iconClass": "Range",
   "icon": "s2r://panorama/images/icons/properties/range.vsvg"
  },
  {
   "key": "EShopFilterSpiritAdditionalDamage",
   "category": "Spirit",
   "group": "AdditionalDamage",
   "groupPath": [
    "AdditionalDamage"
   ],
   "en": "Spirit Damage",
   "es": "Daño espiritual",
   "es_latam": null,
   "iconClass": "DamageMagic",
   "icon": "s2r://panorama/images/icons/properties/damage_magic_color.vsvg"
  },
  {
   "key": "EShopFilterSpiritAdditionalDamagePct",
   "category": "Spirit",
   "group": "AdditionalDamage",
   "groupPath": [
    "AdditionalDamage"
   ],
   "en": "Health % Damage",
   "es": "Daño según vida",
   "es_latam": null,
   "iconClass": "DamageOverTime",
   "icon": "s2r://panorama/images/icons/properties/damage_over_time_color.vsvg"
  },
  {
   "key": "EShopFilterHP",
   "category": "Defense",
   "group": "Health",
   "groupPath": [
    "Health"
   ],
   "en": "HP",
   "es": "Vida",
   "es_latam": null,
   "iconClass": "Health",
   "icon": "s2r://panorama/images/icons/properties/health.vsvg"
  },
  {
   "key": "EShopFilterRegen",
   "category": "Defense",
   "group": "Health",
   "groupPath": [
    "Health"
   ],
   "en": "Regen",
   "es": "Regeneración",
   "es_latam": null,
   "iconClass": "HealthRegen",
   "icon": "s2r://panorama/images/icons/properties/health_regen.vsvg"
  },
  {
   "key": "EShopFilterOutOfCombatRegen",
   "category": "Defense",
   "group": "Health",
   "groupPath": [
    "Health"
   ],
   "en": "Out of Combat Regen",
   "es": "Regeneración fuera de combate",
   "es_latam": null,
   "iconClass": "HealthRegenOutOfCombat",
   "icon": "s2r://panorama/images/icons/properties/health_regen.vsvg"
  },
  {
   "key": "EShopFilterBarrier",
   "category": "Defense",
   "group": "Health",
   "groupPath": [
    "Health"
   ],
   "en": "Barrier",
   "es": "Barrera",
   "es_latam": null,
   "iconClass": "Barrier",
   "icon": "s2r://panorama/images/icons/properties/armor_alt.vsvg"
  },
  {
   "key": "EShopFilterHealing",
   "category": "Defense",
   "group": "Health",
   "groupPath": [
    "Health"
   ],
   "en": "Healing",
   "es": "Curación",
   "es_latam": "Curación",
   "iconClass": "Heal",
   "icon": "s2r://panorama/images/icons/properties/heal.vsvg"
  },
  {
   "key": "EShopFilterLifesteal",
   "category": "Defense",
   "group": "Health",
   "groupPath": [
    "Health"
   ],
   "en": "Lifesteal",
   "es": "Robo de vida",
   "es_latam": null,
   "iconClass": "HealthSteal",
   "icon": "s2r://panorama/images/icons/properties/health_steal.vsvg"
  },
  {
   "key": "EShopFilterPhysicalResist",
   "category": "Defense",
   "group": "Resistances",
   "groupPath": [
    "Resistances"
   ],
   "en": "Physical Resistance",
   "es": "Resistencia física",
   "es_latam": null,
   "iconClass": "ArmorBullet",
   "icon": "s2r://panorama/images/icons/properties/armor_bullet.vsvg"
  },
  {
   "key": "EShopFilterSpiritResist",
   "category": "Defense",
   "group": "Resistances",
   "groupPath": [
    "Resistances"
   ],
   "en": "Spirit Resistance",
   "es": "Resistencia espiritual",
   "es_latam": null,
   "iconClass": "ArmorSpirit",
   "icon": "s2r://panorama/images/icons/properties/armor_spirit.vsvg"
  },
  {
   "key": "EShopFilterMeleeResist",
   "category": "Defense",
   "group": "Resistances",
   "groupPath": [
    "Resistances"
   ],
   "en": "Melee Resistance",
   "es": "Resistencia cuerpo a cuerpo",
   "es_latam": null,
   "iconClass": "ArmorMelee",
   "icon": "s2r://panorama/images/icons/properties/armor_melee.vsvg"
  },
  {
   "key": "EShopFilterDebuffResist",
   "category": "Defense",
   "group": "Resistances",
   "groupPath": [
    "Resistances"
   ],
   "en": "Debuff Resistance",
   "es": "Resistencia a desventajas",
   "es_latam": null,
   "iconClass": "DebuffRemove",
   "icon": "s2r://panorama/images/icons/properties/debuff_remove.vsvg"
  },
  {
   "key": "EShopFilterSlowResist",
   "category": "Defense",
   "group": "Resistances",
   "groupPath": [
    "Resistances"
   ],
   "en": "Slow Resistance",
   "es": "Resistencia a la ralentización",
   "es_latam": null,
   "iconClass": "ConditionSlow",
   "icon": "s2r://panorama/images/icons/properties/condition_slow.vsvg"
  },
  {
   "key": "EShopFilterAntiCC",
   "category": "Defense",
   "group": null,
   "groupPath": [],
   "en": "Anti-CC",
   "es": "Anticontrol de multitudes",
   "es_latam": null,
   "iconClass": "Debuff",
   "icon": "s2r://panorama/images/icons/properties/debuff.vsvg"
  },
  {
   "key": "EShopFilterInvulnerability",
   "category": "Defense",
   "group": null,
   "groupPath": [],
   "en": "Invulnerability",
   "es": "Invulnerabilidad",
   "es_latam": null,
   "iconClass": "Invulnerable",
   "icon": "s2r://panorama/images/upgrades/mods_armor/unstoppable_psd.vtex"
  },
  {
   "key": "EShopFilterMoveSpeed",
   "category": "Mobility",
   "group": "Movement",
   "groupPath": [
    "Movement"
   ],
   "en": "Move Speed",
   "es": "Velocidad de movimiento",
   "es_latam": null,
   "iconClass": "MoveSpeed",
   "icon": "s2r://panorama/images/icons/properties/move_speed.vsvg"
  },
  {
   "key": "EShopFilterSprint",
   "category": "Mobility",
   "group": "Movement",
   "groupPath": [
    "Movement"
   ],
   "en": "Sprint",
   "es": "Esprint",
   "es_latam": null,
   "iconClass": "MoveSprint",
   "icon": "s2r://panorama/images/icons/properties/move_sprint.vsvg"
  },
  {
   "key": "EShopFilterStamina",
   "category": "Mobility",
   "group": "Movement",
   "groupPath": [
    "Movement"
   ],
   "en": "Stamina",
   "es": "Aguante",
   "es_latam": null,
   "iconClass": "MoveStamina",
   "icon": "s2r://panorama/images/icons/properties/move_stamina.vsvg"
  },
  {
   "key": "EShopFilterJumpAndDash",
   "category": "Mobility",
   "group": "Movement",
   "groupPath": [
    "Movement"
   ],
   "en": "Jump/Dash/Slide",
   "es": "Salto/Impulso/Deslizamiento",
   "es_latam": null,
   "iconClass": "MoveSlide",
   "icon": "s2r://panorama/images/icons/properties/move_slide.vsvg"
  },
  {
   "key": "EShopFilterTeleport",
   "category": "Mobility",
   "group": null,
   "groupPath": [],
   "en": "Teleport",
   "es": "Teletransporte",
   "es_latam": null,
   "iconClass": "Teleport",
   "icon": "s2r://panorama/images/icons/properties/condition_immobilize.vsvg"
  },
  {
   "key": "EShopFilterStealth",
   "category": "Mobility",
   "group": null,
   "groupPath": [],
   "en": "Stealth",
   "es": "Sigilo",
   "es_latam": null,
   "iconClass": "Visibility",
   "icon": "s2r://panorama/images/icons/properties/visibility.vsvg"
  },
  {
   "key": "EShopFilterAntiHeal",
   "category": "Disruption",
   "group": null,
   "groupPath": [],
   "en": "Anti-Healing",
   "es": "Anticuración",
   "es_latam": null,
   "iconClass": "DebuffHealing",
   "icon": "s2r://panorama/images/icons/properties/debuff_healing_reduction.vsvg"
  },
  {
   "key": "EShopFilterBulletVuln",
   "category": "Disruption",
   "group": null,
   "groupPath": [],
   "en": "Physical Vulnerability",
   "es": "Vulnerabilidad física",
   "es_latam": null,
   "iconClass": "DebuffBulletArmor",
   "icon": "s2r://panorama/images/icons/properties/armor_debuff_bullet_reduction.vsvg"
  },
  {
   "key": "EShopFilterSpiritVuln",
   "category": "Disruption",
   "group": null,
   "groupPath": [],
   "en": "Spirit Vulnerability",
   "es": "Vulnerabilidad espiritual",
   "es_latam": null,
   "iconClass": "DebuffSpiritArmor",
   "icon": "s2r://panorama/images/icons/properties/armor_debuff_spirit_reduction.vsvg"
  },
  {
   "key": "EShopFilterBulletDamageReduction",
   "category": "Disruption",
   "group": "GunReductions",
   "groupPath": [
    "Effectiveness",
    "GunReductions"
   ],
   "en": "Bullet Damage Reduction",
   "es": "Reducción del daño balístico",
   "es_latam": null,
   "iconClass": "DebuffGun",
   "icon": "s2r://panorama/images/icons/properties/debuff_gun_damage.vsvg"
  },
  {
   "key": "EShopFilterFireRateReduction",
   "category": "Disruption",
   "group": "GunReductions",
   "groupPath": [
    "Effectiveness",
    "GunReductions"
   ],
   "en": "Fire Rate Reduction",
   "es": "Reducción de la cadencia de tiro",
   "es_latam": null,
   "iconClass": "DebuffFireRate",
   "icon": "s2r://panorama/images/icons/properties/debuff_fire_rate_reduction.vsvg"
  },
  {
   "key": "EShopFilterSpiritDamageReduction",
   "category": "Disruption",
   "group": "Effectiveness",
   "groupPath": [
    "Effectiveness"
   ],
   "en": "Spirit Damage Reduction",
   "es": "Reducción del daño espiritual",
   "es_latam": null,
   "iconClass": "DebuffSpirit",
   "icon": "s2r://panorama/images/icons/properties/debuff_spirit.vsvg"
  },
  {
   "key": "EShopFilterMobilityReduction",
   "category": "Disruption",
   "group": "Effectiveness",
   "groupPath": [
    "Effectiveness"
   ],
   "en": "Slow",
   "es": "Ralentización",
   "es_latam": null,
   "iconClass": "DebuffMoveSpeed",
   "icon": "s2r://panorama/images/icons/properties/debuff_move_speed.vsvg"
  },
  {
   "key": "EShopFilterStatus_Stun",
   "category": "Disruption",
   "group": "StatusEffects",
   "groupPath": [
    "StatusEffects"
   ],
   "en": "Stun",
   "es": "Aturdimiento",
   "es_latam": null,
   "iconClass": "ConditionStun",
   "icon": "s2r://panorama/images/icons/properties/condition_stun.vsvg"
  },
  {
   "key": "EShopFilterStatus_Disarm",
   "category": "Disruption",
   "group": "StatusEffects",
   "groupPath": [
    "StatusEffects"
   ],
   "en": "Disarm",
   "es": "Desarme",
   "es_latam": null,
   "iconClass": "ConditionDisarm",
   "icon": "s2r://panorama/images/icons/properties/condition_disarm.vsvg"
  },
  {
   "key": "EShopFilterStatus_Silence",
   "category": "Disruption",
   "group": "StatusEffects",
   "groupPath": [
    "StatusEffects"
   ],
   "en": "Silence",
   "es": "Silencio",
   "es_latam": null,
   "iconClass": "ConditionSilence",
   "icon": "s2r://panorama/images/icons/properties/condition_silence.vsvg"
  },
  {
   "key": "EShopFilterStatus_Curse",
   "category": "Disruption",
   "group": "StatusEffects",
   "groupPath": [
    "StatusEffects"
   ],
   "en": "Curse",
   "es": "Maldición",
   "es_latam": null,
   "iconClass": "ConditionCurse",
   "icon": "s2r://panorama/images/icons/properties/condition_curse.vsvg"
  },
  {
   "key": "EShopFilterStatus_Immobilize",
   "category": "Disruption",
   "group": "StatusEffects",
   "groupPath": [
    "StatusEffects"
   ],
   "en": "Immobilize",
   "es": "Inmovilización",
   "es_latam": null,
   "iconClass": "ConditionImmobilize",
   "icon": "s2r://panorama/images/icons/properties/condition_immobilize.vsvg"
  },
  {
   "key": "EShopFilterActive",
   "category": "Misc",
   "group": null,
   "groupPath": [],
   "en": "Active Items",
   "es": "Objetos activos",
   "es_latam": null,
   "iconClass": null,
   "icon": null
  },
  {
   "key": "EShopFilterImbue",
   "category": "Misc",
   "group": null,
   "groupPath": [],
   "en": "Imbue Items",
   "es": "Objetos imbuidos",
   "es_latam": null,
   "iconClass": null,
   "icon": null
  }
 ],
 "itemTypes": [
  {
   "key": "EShopFilterItemWeapon",
   "en": "Weapon Items",
   "es": "Objetos de la categoría Arma",
   "es_latam": null,
   "icon": "s2r://panorama/images/hud/core/core_weapon_icon_psd.vtex"
  },
  {
   "key": "EShopFilterItemSpirit",
   "en": "Spirit Items",
   "es": "Objetos de la categoría Espíritu",
   "es_latam": null,
   "icon": "s2r://panorama/images/hud/core/core_spirit_icon_psd.vtex"
  },
  {
   "key": "EShopFilterItemVitality",
   "en": "Vitality Items",
   "es": "Objetos de la categoría Vitalidad",
   "es_latam": null,
   "icon": "s2r://panorama/images/hud/core/core_armor_icon_psd.vtex"
  }
 ]
};

// Los bits de EShopFilters_t (el enum de filtros del juego).
export const BIT = {
  EShopFilterWeaponDamage: 0, EShopFilterWeaponAmmo: 1, EShopFilterWeaponFireRate: 2, EShopFilterWeaponBulletVelocity: 3,
  EShopFilterWeaponRange: 4, EShopFilterMelee: 5, EShopFilterPhysicalAdditionalDamage: 6, EShopFilterSpiritDamage: 7,
  EShopFilterSpiritCooldownAndCharges: 8, EShopFilterSpiritDuration: 9, EShopFilterSpiritRange: 10,
  EShopFilterSpiritAdditionalDamage: 11, EShopFilterSpiritAdditionalDamagePct: 12, EShopFilterHP: 13, EShopFilterRegen: 14,
  EShopFilterOutOfCombatRegen: 15, EShopFilterBarrier: 16, EShopFilterHealing: 17, EShopFilterLifesteal: 18,
  EShopFilterPhysicalResist: 19, EShopFilterSpiritResist: 20, EShopFilterMeleeResist: 21, EShopFilterDebuffResist: 22,
  EShopFilterSlowResist: 23, EShopFilterAntiCC: 24, EShopFilterInvulnerability: 25, EShopFilterMoveSpeed: 26,
  EShopFilterSprint: 27, EShopFilterStamina: 28, EShopFilterTeleport: 29, EShopFilterStealth: 30, EShopFilterBulletVuln: 31,
  EShopFilterSpiritVuln: 32, EShopFilterAntiHeal: 33, EShopFilterBulletDamageReduction: 34, EShopFilterFireRateReduction: 35,
  EShopFilterSpiritDamageReduction: 36, EShopFilterMobilityReduction: 37, EShopFilterStatus_Stun: 38,
  EShopFilterStatus_Disarm: 39, EShopFilterStatus_Silence: 40, EShopFilterStatus_Curse: 41, EShopFilterStatus_Immobilize: 42,
  EShopFilterStatus_Grounded: 43, EShopFilterJumpAndDash: 44, EShopFilterActive: 45, EShopFilterImbue: 46,
  EShopFilterPopular: 47, EShopFilterItemWeapon: 48, EShopFilterItemSpirit: 49, EShopFilterItemVitality: 50,
};

// Switch 1: property's m_eProvidedPropertyType (API: provided_property_type).
// A pair means [value > 0, value < 0]; HEAL_AMP_* uses [value >= 0, value < 0].
export const BY_PROVIDED = {
  MODIFIER_VALUE_WEAPON_DAMAGE_INCREASE: ['EShopFilterWeaponDamage', 'EShopFilterBulletDamageReduction'],
  MODIFIER_VALUE_BULLET_DAMAGE_INCREASE: ['EShopFilterWeaponDamage', 'EShopFilterBulletDamageReduction'],
  MODIFIER_VALUE_CLOSE_RANGE_WEAPON_DAMAGE_INCREASE: ['EShopFilterWeaponDamage', 'EShopFilterBulletDamageReduction'],
  MODIFIER_VALUE_LONG_RANGE_BULLET_DAMAGE_INCREASE: ['EShopFilterWeaponDamage', 'EShopFilterBulletDamageReduction'],
  MODIFIER_VALUE_BONUS_CRIT_DAMAGE_PERCENT: ['EShopFilterWeaponDamage', 'EShopFilterBulletDamageReduction'],
  MODIFIER_VALUE_WEAPON_POWER: ['EShopFilterWeaponDamage', 'EShopFilterBulletDamageReduction'],
  MODIFIER_VALUE_WEAPON_DAMAGE_TO_NPC_INCREASE: ['EShopFilterWeaponDamage', 'EShopFilterBulletDamageReduction'],
  MODIFIER_VALUE_ALL_DAMAGE_MULTIPLIER: [['EShopFilterWeaponDamage', 'EShopFilterSpiritDamage'], ['EShopFilterBulletDamageReduction', 'EShopFilterSpiritDamageReduction']],
  MODIFIER_VALUE_TECH_DAMAGE_MULTIPLIER: ['EShopFilterSpiritAdditionalDamage', 'EShopFilterSpiritDamageReduction'],
  MODIFIER_VALUE_TECH_POWER: ['EShopFilterSpiritDamage', 'EShopFilterSpiritDamageReduction'],
  MODIFIER_VALUE_TECH_POWER_PERCENT: ['EShopFilterSpiritDamage', 'EShopFilterSpiritDamageReduction'],
  MODIFIER_VALUE_FIRE_RATE: ['EShopFilterWeaponFireRate', 'EShopFilterFireRateReduction'],
  MODIFIER_VALUE_HEAL_AMP_CAST_PERCENT: ['EShopFilterHealing', 'EShopFilterAntiHeal'],
  MODIFIER_VALUE_HEAL_AMP_RECEIVE_PERCENT: ['EShopFilterHealing', 'EShopFilterAntiHeal'],
  MODIFIER_VALUE_HEAL_AMP_REGEN_PERCENT: ['EShopFilterHealing', 'EShopFilterAntiHeal'],
  MODIFIER_VALUE_FIRE_RATE_SLOW: 'EShopFilterFireRateReduction',
  MODIFIER_VALUE_MELEE_DAMAGE_INCREASE: 'EShopFilterMelee',
  MODIFIER_VALUE_MELEE_TRAVEL_DISTANCE_PERCENTAGE: 'EShopFilterMelee',
  MODIFIER_VALUE_TECH_RESIST: 'EShopFilterSpiritResist',
  MODIFIER_VALUE_TECH_RESIST_REDUCTION: 'EShopFilterSpiritVuln',
  MODIFIER_VALUE_TECH_RESIST_PIERCING: 'EShopFilterSpiritVuln',
  MODIFIER_VALUE_BULLET_ARMOR_DAMAGE_RESIST: 'EShopFilterPhysicalResist',
  MODIFIER_VALUE_BULLET_RESIST_NON_HERO: 'EShopFilterPhysicalResist',
  MODIFIER_VALUE_BULLET_AND_MELEE_RESIST_REDUCTION: 'EShopFilterBulletVuln',
  MODIFIER_VALUE_MELEE_RESIST: 'EShopFilterMeleeResist',
  MODIFIER_VALUE_PARRY_COOLDOWN_REDUCTION_FIXED: 'EShopFilterMeleeResist',
  MODIFIER_VALUE_PARRY_STUN_TIME_BONUS: 'EShopFilterMeleeResist',
  MODIFIER_VALUE_PARRY_COOLDOWN_REDUCTION_PERCENT: 'EShopFilterMeleeResist',
  MODIFIER_VALUE_HEALTH_MAX: 'EShopFilterHP',
  MODIFIER_VALUE_HEALTH_MAX_PERCENT: 'EShopFilterHP',
  MODIFIER_VALUE_BASE_HEALTH_PERCENT: 'EShopFilterHP',
  MODIFIER_VALUE_HEALTH_REGEN_PER_SECOND: 'EShopFilterRegen',
  MODIFIER_VALUE_REGEN_MAX_HEALTH_PERCENT_PER_SECOND: 'EShopFilterRegen',
  MODIFIER_VALUE_OUT_OF_COMBAT_HEALTH_REGEN: 'EShopFilterOutOfCombatRegen',
  MODIFIER_VALUE_AMMO_CLIP_SIZE: 'EShopFilterWeaponAmmo',
  MODIFIER_VALUE_AMMO_CLIP_SIZE_PERCENT: 'EShopFilterWeaponAmmo',
  MODIFIER_VALUE_RELOAD_SPEED: 'EShopFilterWeaponAmmo',
  MODIFIER_VALUE_MOVE_SPEED_LIMIT: 'EShopFilterMobilityReduction',
  MODIFIER_VALUE_MOVEMENT_SPEED_SLOW_PERCENT: 'EShopFilterMobilityReduction',
  MODIFIER_VALUE_MOVEMENT_SPEED_MAX: 'EShopFilterMoveSpeed',
  MODIFIER_VALUE_MOVEMENT_GROUND_DASH_INCREASE_PERCENT: 'EShopFilterJumpAndDash',
  MODIFIER_VALUE_AIR_MOVE_DISTANCE_INCREASE_PERCENT: 'EShopFilterJumpAndDash',
  MODIFIER_VALUE_MOVEMENT_SLIDE_DISTANCE_SCALE: 'EShopFilterJumpAndDash',
  MODIFIER_VALUE_BONUS_JUMP_VERTICAL_SPEED_PERCENT: 'EShopFilterJumpAndDash',
  MODIFIER_VALUE_FREE_AIR_JUMPS: 'EShopFilterJumpAndDash',
  MODIFIER_VALUE_AIR_CONTROL_PERCENT: 'EShopFilterJumpAndDash',
  MODIFIER_VALUE_AIR_CONTROL_ACCEL_PERCENT: 'EShopFilterJumpAndDash',
  MODIFIER_VALUE_AIR_DASH_DISTANCE_INCREASE_PERCENT: 'EShopFilterJumpAndDash',
  MODIFIER_VALUE_MOVEMENT_SLOW_RESISTANCE: 'EShopFilterSlowResist',
  MODIFIER_VALUE_BONUS_ATTACK_RANGE_PERCENT: 'EShopFilterWeaponRange',
  MODIFIER_VALUE_BONUS_WEAPON_DAMAGE_CLOSE_RANGE_MAX_RANGE: 'EShopFilterWeaponRange',
  MODIFIER_VALUE_BONUS_BULLET_DAMAGE_LONG_RANGE_MIN_RANGE: 'EShopFilterWeaponRange',
  MODIFIER_VALUE_BONUS_BULLET_SPEED_PERCENT: 'EShopFilterWeaponBulletVelocity',
  MODIFIER_VALUE_SPRINT_SPEED_BONUS: 'EShopFilterSprint',
  MODIFIER_VALUE_STATUS_RESISTANCE: 'EShopFilterDebuffResist',
  MODIFIER_VALUE_COOLDOWN_REDUCTION_PERCENTAGE: 'EShopFilterSpiritCooldownAndCharges',
  MODIFIER_VALUE_COOLDOWN_BETWEEN_CHARGE_REDUCTION_PERCENTAGE: 'EShopFilterSpiritCooldownAndCharges',
  MODIFIER_VALUE_ITEM_COOLDOWN_REDUCTION_PERCENTAGE: 'EShopFilterSpiritCooldownAndCharges',
  MODIFIER_VALUE_ULTIMATE_COOLDOWN_REDUCTION_PERCENTAGE: 'EShopFilterSpiritCooldownAndCharges',
  MODIFIER_VALUE_BONUS_ABILITY_CHARGES: 'EShopFilterSpiritCooldownAndCharges',
  MODIFIER_VALUE_ENABLE_CHARGES: 'EShopFilterSpiritCooldownAndCharges',
  MODIFIER_VALUE_BONUS_ABILITY_DURATION_PERCENTAGE: 'EShopFilterSpiritDuration',
  MODIFIER_VALUE_TECH_RANGE_PERCENT: 'EShopFilterSpiritRange',
  MODIFIER_VALUE_TECH_RADIUS_PERCENT: 'EShopFilterSpiritRange',
  MODIFIER_VALUE_STAMINA: 'EShopFilterStamina',
  MODIFIER_VALUE_STAMINA_REGEN_PER_SECOND_PERCENTAGE: 'EShopFilterStamina',
  MODIFIER_VALUE_BARRIER_HEALTH: 'EShopFilterBarrier',
  MODIFIER_VALUE_TECH_DAMAGE_TAKEN_HEALS_ATTACKER: 'EShopFilterLifesteal',
  MODIFIER_VALUE_TECH_LIFESTEAL: 'EShopFilterLifesteal',
  MODIFIER_VALUE_BULLET_LIFESTEAL: 'EShopFilterLifesteal',
  MODIFIER_VALUE_HERO_BULLET_LIFESTEAL_EFFECTIVENESS: 'EShopFilterLifesteal',
  MODIFIER_VALUE_HERO_SPIRIT_LIFESTEAL_EFFECTIVENESS: 'EShopFilterLifesteal',
};

// Switch 2: property's m_eDisplayType, only when it has no provided_property_type.
export const BY_DISPLAY = {
  EMaxHealth: 'EShopFilterHP', EClipSize: 'EShopFilterWeaponAmmo', EBaseHealthRegen: 'EShopFilterRegen',
  EExternalHealthRegen: 'EShopFilterRegen', EHealthRegen: 'EShopFilterRegen', EMaxMoveSpeed: 'EShopFilterMoveSpeed',
  ESprintSpeed: 'EShopFilterSprint', EBulletArmorDamageReduction: 'EShopFilterPhysicalResist',
  EBulletShieldHealth: 'EShopFilterBarrier', ETechArmorDamageReduction: 'EShopFilterSpiritResist',
  ELightMeleeDamage: 'EShopFilterMelee', EHeavyMeleeDamage: 'EShopFilterMelee', EWeaponRange: 'EShopFilterWeaponRange',
  EFireRate: 'EShopFilterWeaponFireRate', EWeaponPower: 'EShopFilterWeaponDamage', EBulletDamage: 'EShopFilterWeaponDamage',
  ERoundsPerSecond: 'EShopFilterWeaponFireRate', EBaseWeaponDamageIncrease: 'EShopFilterWeaponDamage',
  EBaseMeleeDamageIncrease: 'EShopFilterMelee', EAirJumpCount: 'EShopFilterJumpAndDash',
  ETechCooldown: 'EShopFilterSpiritCooldownAndCharges', ETechCooldownBetweenChargeUses: 'EShopFilterSpiritCooldownAndCharges',
  ETechRange: 'EShopFilterSpiritRange', ETechRadius: 'EShopFilterSpiritRange', EMeleeRange: 'EShopFilterMelee',
  EReloadSpeed: 'EShopFilterWeaponAmmo', EMaxChargesIncrease: 'EShopFilterSpiritCooldownAndCharges',
  EHealingOutput: 'EShopFilterHealing', ETechDuration: 'EShopFilterSpiritDuration', EReloadTime: 'EShopFilterWeaponAmmo',
  EStamina: 'EShopFilterStamina', ETechLifesteal: 'EShopFilterLifesteal', EBulletLifesteal: 'EShopFilterLifesteal',
  EChannelDuration: 'EShopFilterSpiritDuration',
  ETechPower: 'EShopFilterSpiritDamage', // skipped when the scale function is scale_function_tech_damage
  EStaminaRegenPerSecond: 'EShopFilterStamina', EMeleeTravelDistanceScale: 'EShopFilterMelee',
  EAirMoveDistanceScale: 'EShopFilterJumpAndDash', EWeaponFalloffMinRange: 'EShopFilterWeaponRange',
  EWeaponFalloffMaxRange: 'EShopFilterWeaponRange', EBulletSpeed: 'EShopFilterWeaponBulletVelocity',
  EBulletSpeedIncrease: 'EShopFilterWeaponBulletVelocity', EStaminaRegenIncrease: 'EShopFilterStamina',
  EStaminaCooldown: 'EShopFilterStamina', EDebuffResist: 'EShopFilterDebuffResist', EMeleeResist: 'EShopFilterMeleeResist',
  EParryCooldown: 'EShopFilterMeleeResist', EOOCHealthRegen: 'EShopFilterOutOfCombatRegen',
  ESlowResistance: 'EShopFilterSlowResist', EStaminaRegenPercent: 'EShopFilterStamina',
  EItemCooldown: 'EShopFilterSpiritCooldownAndCharges', EGroundDashDistanceInMeters: 'EShopFilterJumpAndDash',
  EAirDashDistanceInMeters: 'EShopFilterJumpAndDash', EDashSpeedInMeters: 'EShopFilterJumpAndDash',
  EEnableAbilityCharges: 'EShopFilterSpiritCooldownAndCharges', EHealingAmp: 'EShopFilterHealing',
};

// "Important" tooltip entries (the ones with a status icon) that add a status filter.
export const BY_STATUS_EFFECT = {
  StatusEffectEMP: 'EShopFilterStatus_Silence',
  StatusEffectSilence: 'EShopFilterStatus_Silence',
  StatusEffectStun: 'EShopFilterStatus_Stun',
  StatusEffectImmobilize: 'EShopFilterStatus_Immobilize',
  StatusEffectDisarmed: 'EShopFilterStatus_Disarm',
  StatusEffectTethered: 'EShopFilterStatus_Grounded',
};

// The API does not expose m_eDisplayType. These are the item properties (from abilities.vdata, CNS 6722)
// with no provided type whose display type feeds switch 2. Regenerate with truth_from_vdata.mjs --overrides.
export const DISPLAY_OVERRIDES = {
 "upgrade_ammo_scavenger": {
  "BonusSprintSpeed": "ESprintSpeed"
 },
 "upgrade_lifestrike_gauntlets": {
  "LifestrikeHeal": "EBulletLifesteal",
  "LifestrikeHealPercent": "EBulletLifesteal"
 },
 "upgrade_proc_tech_damage": {
  "BaseDamagePct": "ETechPower"
 },
 "upgrade_tech_purge": {
  "TechResistBelowThreshold": "ETechArmorDamageReduction"
 },
 "upgrade_improved_bullet_armor": {
  "BulletResistBelowThreshold": "EBulletArmorDamageReduction"
 },
 "upgrade_trophy_collector": {
  "StackingBonusHealth": "EMaxHealth"
 },
 "upgrade_weapon_shielding": {
  "DamageThreshold": "EBulletArmorDamageReduction"
 },
 "upgrade_spirit_bubble": {
  "DamageThreshold": "EBulletArmorDamageReduction"
 },
 "upgrade_omnicharge_pendant": {
  "BonusAbilityCharges": "EMaxChargesIncrease",
  "BonusAbilityChargesNonCharge": "EMaxChargesIncrease"
 },
 "upgrade_rebirth": {
  "RespawnHealthPercent": "EMaxHealth"
 },
 "upgrade_charge_mastery": {
  "BonusChargedCooldownReduction": "ETechCooldown"
 },
 "upgrade_discord": {
  "MaxHealthPercentAsDPS": "ETechPower"
 },
 "upgrade_aoe_root": {
  "TetherRadius": "ETechRange"
 },
 "upgrade_cloaking_device": {
  "InvisMoveSpeedMod": "EMaxMoveSpeed",
  "SpottedRadius": "ETechRange"
 },
 "upgrade_cloaking_device_active": {
  "InvisMoveSpeedMod": "EMaxMoveSpeed",
  "SpottedRadius": "ETechRange"
 },
 "upgrade_weapon_overdrive_clip": {
  "OverdriveClipDuration": "ETechDuration"
 },
 "upgrade_aoe_smoke_bomb": {
  "InvisMoveSpeedMod": "EMaxMoveSpeed",
  "SpottedRadius": "ETechRange"
 },
 "upgrade_stasis_bomb": {
  "MoveSpeedMax": "EMaxMoveSpeed"
 },
 "upgrade_glass_cannon": {
  "BonusClipPerKill": "EClipSize"
 },
 "upgrade_fury_trance": {
  "ActiveBonusFireRate": "EFireRate"
 },
 "upgrade_surging_power": {
  "ActiveBonusFireRate": "EFireRate"
 },
 "upgrade_frenzy": {
  "LowHealthLifeStealPercent": "EBulletLifesteal"
 },
 "upgrade_boxing_glove": {
  "LifestealHeal": "EBulletLifesteal",
  "LifestealHealPercent": "EBulletLifesteal"
 },
 "upgrade_melee_charge": {
  "BonusHeavyMeleeDamage": "EBaseMeleeDamageIncrease"
 },
 "upgrade_crushing_fists": {
  "BonusHeavyMeleeDamage": "EBaseMeleeDamageIncrease"
 },
 "upgrade_resonant_healing": {
  "HealingPerCast": "EMaxHealth"
 },
 "upgrade_magic_clarity": {
  "BonusSpirit": "ETechPower"
 },
 "upgrade_arcane_eater": {
  "SpiritStolePerHit": "ETechPower"
 },
 "upgrade_split_shot": {
  "WeaponDamagePerStack": "EBaseWeaponDamageIncrease"
 },
 "upgrade_magic_missile": {
  "BonusClipPerKill": "EClipSize",
  "MaxClipBonus": "EClipSize"
 },
 "upgrade_glass_cannon2": {
  "BonusClipPerKill": "EClipSize"
 },
 "upgrade_prism_blast": {
  "BeamLength": "ETechRadius",
  "BeamWidth": "ETechRadius"
 },
 "upgrade_shadow_strike": {
  "SpottedRadius": "ETechRadius",
  "ResistStealAmount": "ETechArmorDamageReduction"
 }
};

const UPGRADE_BITS = { ABILITY_UPGRADE_BIT_TRAINED: 1, ABILITY_UPGRADE_BIT_TIER_1: 2, ABILITY_UPGRADE_BIT_TIER_2: 4, ABILITY_UPGRADE_BIT_TIER_3: 8, ABILITY_UPGRADE_BIT_4: 16, ABILITY_UPGRADE_BIT_CORRUPTED: 128 };
export function upgradeBits(x) {
  if (x == null || x === '') return 0;
  if (typeof x === 'number') return x;
  const list = Array.isArray(x) ? x : String(x).split('|');
  return list.map((s) => String(s).trim()).reduce((a, s) => a | (UPGRADE_BITS[s] ?? UPGRADE_BITS['ABILITY_UPGRADE_BIT_' + s.toUpperCase()] ?? 0), 0);
}

/**
 * The game's generator. item = {
 *   sections: [{ attributes: [{ properties: [name], important: [name], elevated: [name] }] }],
 *   props: { [name]: { value, provided, display, css, negative, requiredUpgradeBits, scaleClass, scaleStat } },
 *   active: bool, imbue: bool }
 * Returns { mask: BigInt, trace: string[] }.
 */
export function generateShopFilters(item) {
  let mask = 0n;
  const trace = [];
  const set = (key, why) => { mask |= 1n << BigInt(BIT[key]); trace.push(`${key} <- ${why}`); };
  const has = (key) => ((mask >> BigInt(BIT[key])) & 1n) === 1n;
  // 1) Collect tooltip properties, in tooltip order: per attribute -> properties, important, elevated.
  const list = [];
  for (const sec of item.sections) {
    for (const at of sec.attributes) {
      for (const n of at.properties || []) { const p = item.props[n]; if (p) list.push([n, p]); }
      for (const n of at.important || []) {
        const p = item.props[n];
        if (p && p.negative) continue;
        if (p) list.push([n, p]);
        const st = Object.keys(BY_STATUS_EFFECT).find((k) => k.toLowerCase() === String(n).toLowerCase());
        if (st) set(BY_STATUS_EFFECT[st], `important ${n}`);
      }
      for (const n of at.elevated || []) { const p = item.props[n]; if (p) list.push([n, p]); }
    }
  }
  // 2) Item-level flags.
  if (item.active) set('EShopFilterActive', 'activation is not passive');
  if (item.imbue) set('EShopFilterImbue', 'imbue (m_TargetAbilityEffectsToApply)');
  // 3) Per property.
  for (const [name, p] of list) {
    const v = p.value;
    if (v === 0) continue;
    if (p.negative) continue;
    if ((p.requiredUpgradeBits || 0) & 0x82) continue; // needs TIER_1 or CORRUPTED
    const provided = p.provided || 'MODIFIER_VALUE_INVALID';
    const r = BY_PROVIDED[provided];
    if (r) {
      let keys;
      if (typeof r === 'string') keys = [r];
      else {
        const pos = provided.startsWith('MODIFIER_VALUE_HEAL_AMP') ? v >= 0 : v > 0;
        keys = [].concat(pos ? r[0] : r[1]);
      }
      for (const k of keys) set(k, `${name}: ${provided} = ${v}`);
    }
    const sc = p.scaleClass || null;
    const isTech = sc === 'scale_function_tech_damage';
    if (provided === 'MODIFIER_VALUE_INVALID' && p.display) {
      const k = BY_DISPLAY[p.display];
      if (k && !(p.display === 'ETechPower' && isTech)) set(k, `${name}: display ${p.display}`);
    }
    if (sc) {
      if ((sc === 'scale_function_healing_boon_scale' || sc === 'scale_function_healing_spirit_scale') && !has('EShopFilterLifesteal'))
        set('EShopFilterHealing', `${name}: scale ${sc}`);
      if (isTech) set(/pct|percent/i.test(name) ? 'EShopFilterSpiritAdditionalDamagePct' : 'EShopFilterSpiritAdditionalDamage', `${name}: scale ${sc}`);
      if (sc === 'scale_function_base_weapon_damage') set('EShopFilterPhysicalAdditionalDamage', `${name}: scale ${sc}`);
      if (p.scaleStat === 'EHealingOutput' && !has('EShopFilterLifesteal')) set('EShopFilterHealing', `${name}: scales with EHealingOutput`);
    }
    if (provided === 'MODIFIER_VALUE_INVALID') {
      const css = String(p.css || '').toLowerCase();
      if (css === 'bullet_damage') set('EShopFilterPhysicalAdditionalDamage', `${name}: css bullet_damage`);
      else if (css === 'tech_damage') set(/pct|percent/i.test(name) ? 'EShopFilterSpiritAdditionalDamagePct' : 'EShopFilterSpiritAdditionalDamage', `${name}: css tech_damage`);
    }
  }
  return { mask, trace };
}

export const maskToKeys = (mask) => Object.entries(BIT).filter(([, b]) => (mask >> BigInt(b)) & 1n).map(([k]) => k);
export const keysToMask = (keys) => keys.reduce((m, k) => (k in BIT ? m | (1n << BigInt(BIT[k])) : m), 0n);
export const finalMask = (generated, additional, disabled) => (generated & ~keysToMask(disabled)) | keysToMask(additional);

// API enum strings are snake_case without prefix: "spirit_additional_damage_pct" -> "EShopFilterSpiritAdditionalDamagePct".
export function apiFilterKey(s) {
  const want = String(s).replace(/^EShopFilter/, '').replace(/_/g, '').toLowerCase();
  return Object.keys(BIT).find((k) => k.slice(11).replace(/_/g, '').toLowerCase() === want) || null;
}

/** Normalises one /v1/assets/items entry. */
export function fromApi(it, { overrides = true } = {}) {
  const disp = (overrides && DISPLAY_OVERRIDES[it.class_name]) || {};
  const props = {};
  for (const [n, p] of Object.entries(it.properties || {})) {
    const v = parseFloat(p.value);
    props[n] = {
      value: Number.isNaN(v) ? 0 : v,
      provided: p.provided_property_type || null,
      display: p.display_type || disp[n] || null, // display_type in case the API adds it some day
      css: p.css_class || null,
      negative: !!p.negative_attribute,
      requiredUpgradeBits: upgradeBits(p.required_upgrade_bits),
      scaleClass: p.scale_function?.class_name || null,
      scaleStat: p.scale_function?.specific_stat_scale_type || null,
    };
  }
  const sections = (it.tooltip_sections || []).map((s) => ({
    attributes: (s.section_attributes || []).map((a) => ({
      properties: a.properties || [],
      important: a.important_properties || [],
      elevated: a.elevated_properties || [],
    })),
  }));
  const activation = String(it.activation || 'passive').toLowerCase();
  return { sections, props, active: activation !== 'passive' && activation !== 'none', imbue: !!it.imbue };
}

export function iconUrl(s2r) {
  if (!s2r) return null;
  const m = /^s2r:\/\/panorama\/images\/(.+)$/.exec(s2r);
  if (!m) return null;
  if (m[1].endsWith('.vsvg')) return ICON_BASE + 'icons/' + m[1].replace(/\.vsvg$/, '.svg');
  return ICON_BASE + 'images/' + m[1].replace(/_(psd|png|tga)\.vtex$/, '.png').replace(/\.vtex$/, '.png');
}

// Only the filters that exist in the in-game menu are emitted per item.
const MENU = new Set(FILTER_DEFS.filters.map((f) => f.key));

export function computeAll(apiItems, opts = {}) {
  const items = {};
  const byClass = {};
  for (const it of apiItems) {
    if (it.type !== 'upgrade' || !it.shopable) continue;
    const { mask } = generateShopFilters(fromApi(it, opts));
    const add = (it.shop_filters || []).map(apiFilterKey).filter(Boolean);
    const dis = (it.disabled_shop_filters || []).map(apiFilterKey).filter(Boolean);
    const keys = maskToKeys(finalMask(mask, add, dis)).filter((k) => MENU.has(k));
    items[String(it.id)] = keys;
    byClass[it.class_name] = keys;
  }
  return { items, byClass };
}

function arg(name) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; }

async function main() {
  const here = (p) => fileURLToPath(new URL(p, import.meta.url));
  const file = arg('--file');
  const api = file ? JSON.parse(readFileSync(file, 'utf8')) : await (await fetch(API_URL, { headers: { 'user-agent': 'vestigo-shop-filters' } })).json();
  const overrides = !process.argv.includes('--no-overrides');
  const { items, byClass } = computeAll(api, { overrides });
  const out = {
    source: file ? file : API_URL,
    generatedAt: new Date().toISOString(),
    categories: FILTER_DEFS.categories.map((c) => ({ ...c, iconUrl: iconUrl(c.icon) })),
    groups: FILTER_DEFS.groups,
    filters: FILTER_DEFS.filters.map((f) => ({ ...f, iconUrl: iconUrl(f.icon) })),
    itemTypes: FILTER_DEFS.itemTypes.map((t) => ({ ...t, iconUrl: iconUrl(t.icon) })),
    items,
  };
  const dest = arg('--out') || here('../../data/shop-filters.json');
  writeFileSync(dest, JSON.stringify(out, null, 1));
  console.log(`${Object.keys(items).length} shop items -> ${dest}${overrides ? '' : ' (without display overrides)'}`);

  const truthPath = arg('--truth') || (existsSync(here('./truth_vdata.json')) ? here('./truth_vdata.json') : null);
  if (truthPath) {
    const truth = JSON.parse(readFileSync(truthPath, 'utf8'));
    let same = 0, total = 0;
    const diffs = [];
    for (const [cls, keys] of Object.entries(byClass)) {
      const t = truth[cls];
      if (!t) { diffs.push(`${cls}: not in vdata`); continue; }
      total++;
      const want = t.final.filter((k) => MENU.has(k));
      const extra = keys.filter((k) => !want.includes(k)), miss = want.filter((k) => !keys.includes(k));
      if (!extra.length && !miss.length) same++;
      else diffs.push(`${cls}: extra [${extra.join(', ')}] missing [${miss.join(', ')}]`);
    }
    console.log(`vs vdata: ${same}/${total} items identical (${((100 * same) / total).toFixed(1)}%)`);
    for (const d of diffs) console.log('  ' + d);
  }

  if (process.argv.includes('--check-icons')) {
    const urls = [...new Set([...out.categories, ...out.filters, ...out.itemTypes].map((x) => x.iconUrl).filter(Boolean))];
    for (const u of urls) {
      const r = await fetch(u, { method: 'HEAD' });
      if (!r.ok) console.log('icon', r.status, u);
    }
    console.log(`${urls.length} icons checked`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
