"""
Arma los datos de Company of Heroes 3 del sitio en `games/coh3/data/` (2026-11-04) a partir de coh3-data (MIT) en
`raw/<tag>/` (lo baja `fetch.py`).

    python games/coh3/tools/site_data.py

RAM: coh3-data viene partido por raza; se carga **un archivo por vez**, se resume en diccionarios chicos (`_ents`,
`_weapons`, `_upgrades`, `_abilities`, `_squads`) y se suelta antes del siguiente. El pico ronda lo que pesa el archivo
más grande (abilities/american, 13 MB) parseado.

Salida (contrato de docs/superpowers/specs/2026-11-04-coh3-design.md, con estos ajustes):
- `meta.json` `{generatedAt, tag, patch, prev, counts:{units, weapons, battlegroups, maps}}`: `patch` es el número del
  tag ("2.5.3"); `prev`, el tag contra el que se comparan los parches; `counts`, las fichas de cada lista (portada).
- `units/list.json` `[{slug, name, faction, kind, icon, cost:{mp,mu,fu,pop}, hp, armor, targetSize, models}]`
  (`targetSize`, como `hp`, de la entidad más dura; la calculadora multiplica la precisión por él). `hp` es la vida
  de la entidad más dura del pelotón (por soldado en infantería; el cañón en las armas de equipo). `armor` = [frente,
  lado, atrás]; en blindaje uniforme los tres iguales (la infantería tiene 1). `cost.t` = segundos de producción.
- `units/f/NN.json` `{slug: ficha}`: fila + `role` (la línea de tipo, "Medium Tank"), `desc`, `speed`, `sight`,
  `targetSize`, `loadout:[{slug, num, hp, armor, targetSize}]`, `weapons:[{slug, name, count}]`,
  `upgrades:[{slug, name, icon, desc, cost}]`, `abilities:[{slug, name, icon, desc, cost, recharge}]`,
  `vet:[{xp, desc}]`, `bg` (battlegroup que la habilita, o null), `builtIn:[edificios]`, `upkeep` (mano de obra por
  minuto). Las unidades que nada enlaza en coh3-data se suman desde `extra_units.json` (ver `_extras`). **No va `received`**: los modificadores de precisión/daño recibido viven en árboles de estado que coh3-data
  no exporta.
- `weapons/list.json` y `weapons/f/NN.json`: `{slug, name, faction, kind, icon (propio o el de su primera unidad, con `iconFromUnit`), cls, pen, dist, acc, dmg, aoe, reload,
  burst, cooldown, aim, range, usedBy}`. `name` es el de la interfaz si el arma lo tiene; si no, se arma con el
  nombre de la primera unidad que la usa + el tipo ("Panzer IV Medium Tank · Cannon") y va `nameFromUnit: true`.
  `reloadEvery` = [min, max] disparos entre recargas (`reload.frequency` crudo; 0 = recarga en cada disparo). `dist` = [cerca, medio, lejos] en metros; `pen` y `acc`
  van en ese orden. `aoe` = `{radius, dmg:[n,m,f], dist:[n,m,f]}` o null. `burst` = `{dur:[min,max], rof:[min,max]}` o
  null. `aim` = `{fire:[min,max], ready:[min,max]}`. La lista lleva sólo lo de la tabla; la ficha, todo.
  Las armas son las de los puntos de anclaje de las unidades jugables (las de mejoras vienen de `slot_item`, que
  coh3-data no exporta, y no están).
- `battlegroups/list.json` + `f/`: `{slug, name, faction, icon, image, desc, branches:[{name, upgrades:[{slug, name,
  icon, desc, cp, unlocks?, abilities?}]}]}`; la lista sin `branches` ni `desc`.
- `factions.json`: `{faccion: {name, icon, buildings:[{slug, name, icon, desc, cost, units}], battlegroups:[slugs]}}`.
- `maps.json`: mapas de multijugador visibles en la sala: `{slug, name, desc, players, layout, size:[w,h], points:
  [{kind, tier, x, y}], income, community}`. `minimap` = `m/<slug>`: la imagen
  la baja `images.py` a `site/public/coh3/m/` (cubre `size` entero, centrada en 0,0).
- `challenges.json` `{daily:[...], weekly:[...]}`: `{slug, name, desc, count, merits}`.
- `finalstand.json` `{faccion: {name, perks:[{tier, slug, name, desc, icon, levels:[{cost, desc}]}],
  technologies:[{slug, name, desc, icon, category, cp}]}}`.
- `patches/index.json` `[{slug, tag, prev, patch, name, date, units, weapons}]` (los últimos 8 parches con cambios de
  stats, del más nuevo al más viejo; `slug` = `tag` = el tag nuevo del par y nombre del archivo; `date` = fecha del
  commit del tag en coh3-data; `units`/`weapons` = cuántas cambiaron) + `patches/<tag>.json` = la misma fila con
  `units:[{slug, name, faction, icon, status, changes:[{field, before, after}]}]` y `weapons:[...]`; `status` =
  "changed" | "new". Sólo se comparan las unidades y armas jugables hoy.

Los textos visibles van `{en, es}`. Los íconos, como ruta del juego (`races/american/infantry/riflemen_us`); los baja
`images.py` a `site/public/coh3/i/<ruta>.webp`.
"""
import json
import re
import shutil
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))  # `python -I` no suma la carpeta del script

from coh3 import (CHUNKS, DATA, FACTION, FACTIONS, RACES, free, load, peak_mb, shard, tags_info, tags_raw,  # noqa: E402
                  write_json)

PARTIDOS = {"sbps": "chunked/sbps/races", "ebps": "chunked/ebps/races", "weapon": "chunked/weapon",
            "upgrade": "chunked/upgrade", "abilities": "chunked/abilities/races"}
LEER = RACES + ("common",)
# Prefijo de las referencias de cada tipo de blueprint: "ebps/races/american/..." → raza en la posición 2.
PREFIJO = {"sbps": "sbps/races/", "ebps": "ebps/races/", "weapon": "weapon/", "upgrade": "upgrade/",
           "abilities": "abilities/races/"}
# Los cuarteles generales de multijugador: de acá sale todo lo jugable (lo que construyen, lo que producen).
HQ = {
    "american": "ebps/races/american/buildings/production/hq_us",
    "british": "ebps/races/british_africa/buildings/production/hq_africa_uk",
    "german": "ebps/races/german/buildings/production/hq_ger",
    "dak": "ebps/races/afrika_korps/buildings/production/hq_ak",
}
NOMBRE_FACCION = {
    "american": {"en": "US Forces", "es": "Fuerzas estadounidenses"},
    "british": {"en": "British Forces", "es": "Fuerzas británicas"},
    "german": {"en": "Wehrmacht", "es": "Wehrmacht"},
    "dak": {"en": "Deutsches Afrikakorps", "es": "Deutsches Afrikakorps"},
}
ICONO_FACCION = {"american": "common/races/american", "british": "common/races/british",
                 "german": "common/races/german", "dak": "common/races/afrika_korps"}
# La etiqueta del tipo de arma (`weapon_class`, o la carpeta) para las que no tienen nombre propio.
TIPO_ARMA = {
    "grenade": {"en": "Grenade", "es": "Granada"}, "hmg": {"en": "Machine Gun", "es": "Ametralladora"},
    "lmg": {"en": "Light Machine Gun", "es": "Ametralladora ligera"}, "smg": {"en": "Submachine Gun", "es": "Subfusil"},
    "rifle": {"en": "Rifle", "es": "Fusil"}, "cannon": {"en": "Cannon", "es": "Cañón"},
    "cannon_small": {"en": "Cannon", "es": "Cañón"}, "cannon_burst": {"en": "Autocannon", "es": "Cañón automático"},
    "at_gun": {"en": "Anti-tank Gun", "es": "Cañón antitanque"}, "bazooka": {"en": "Launcher", "es": "Lanzacohetes"},
    "mortar": {"en": "Mortar", "es": "Mortero"}, "rifle_grenade": {"en": "Rifle Grenade", "es": "Granada de fusil"},
    "flame": {"en": "Flamethrower", "es": "Lanzallamas"}, "nebelwerfer": {"en": "Rocket Launcher", "es": "Lanzacohetes"},
    "artillery_small": {"en": "Artillery", "es": "Artillería"}, "artillery_medium": {"en": "Artillery", "es": "Artillería"},
    "artillery_mobile": {"en": "Artillery", "es": "Artillería"}, "smoke": {"en": "Smoke", "es": "Humo"},
    "small_arms": {"en": "Small Arms", "es": "Arma ligera"}, "explosive_weapon": {"en": "Explosive", "es": "Explosivo"},
    "weapon": {"en": "Weapon", "es": "Arma"},
}
# Las claves de raza de fs-perks / fs-technologies / battlegroup.json → la del sitio.
RAZA_SITIO = {"american": "american", "british": "british", "german": "german", "afrika_korps": "dak"}


# ---------------------------------------------------------------- utilidades de lectura

def _ext(o: dict, suf: str) -> dict | None:
    for e in o.get("extensions", ()):
        i = next(iter(e.values()))
        if isinstance(i, dict) and i.get("template_reference", {}).get("value", "").endswith(suf):
            return i
    return None


def _refs(x, out=None) -> list[str]:
    """Todas las `instance_reference` no vacías debajo de `x`."""
    if out is None:
        out = []
    if isinstance(x, dict):
        for k, v in x.items():
            if k == "instance_reference":
                if isinstance(v, str) and v:
                    out.append(v)
            else:
                _refs(v, out)
    elif isinstance(x, list):
        for v in x:
            _refs(v, out)
    return out


def _req_upgrades(x, out=None) -> list[str]:
    """Las mejoras que un requisito pide que estén (`is_present: True`)."""
    if out is None:
        out = []
    if isinstance(x, dict):
        if "upgrade_name" in x and x.get("is_present") == "True":
            r = x["upgrade_name"].get("instance_reference")
            if r:
                out.append(r)
        for v in x.values():
            _req_upgrades(v, out)
    elif isinstance(x, list):
        for v in x:
            _req_upgrades(v, out)
    return out


def _cp(reqs) -> float:
    """Puntos de mando que pide una mejora de battlegroup (requisito de recursos del jugador)."""
    for r in reqs or ():
        i = next(iter(r.values()))
        if isinstance(i, dict) and i.get("template_reference", {}).get("value", "").endswith("required_player_resources"):
            return i.get("resource", {}).get("command", 0) or 0
    return 0


def _blueprints(x, clave: str, p=()):
    """(ruta, blueprint) de cada objeto con `clave` (extensions, weapon_bag, upgrade_bag, ability_bag)."""
    if isinstance(x, dict):
        if clave in x:
            yield p, x
            return
        for k, v in x.items():
            yield from _blueprints(v, clave, p + (k,))


def _num(v):
    if v is None:
        return None
    try:
        v = float(v)
    except (TypeError, ValueError):  # algún tag viejo trae el nombre del campo en vez del número
        return None
    return int(v) if v == int(v) else round(v, 4)


def _nmf(d: dict | None) -> list | None:
    if not d:
        return None
    return [_num(d.get("near")), _num(d.get("mid")), _num(d.get("far"))]


def _mm(d: dict | None) -> list | None:
    if not d:
        return None
    return [_num(d.get("min")), _num(d.get("max"))]


def _cost(c: dict | None) -> dict:
    c = c or {}
    return {"mp": _num(c.get("manpower", 0)), "mu": _num(c.get("munition", 0)), "fu": _num(c.get("fuel", 0))}


def _slug(ref: str) -> str:
    return ref.rsplit("/", 1)[-1]


def _raza(ref: str) -> str:
    """La raza de una referencia ("ebps/races/american/..." → american; "weapon/german/..." → german)."""
    partes = ref.split("/")
    return partes[2] if partes[1] == "races" else partes[1]


# ---------------------------------------------------------------- textos

class Loc:
    """Los textos del juego en inglés y español; `t(id)` → {en, es} o None."""

    def __init__(self, tag: str):
        self.en = load(tag, "locales/en-locstring.json")
        self.es = load(tag, "locales/es-locstring.json")

    @staticmethod
    def _limpiar(s: str) -> str:
        return s.replace("\\n", "\n").replace("\\r", "").replace(" ", " ").strip()

    def t(self, lid) -> dict | None:
        if isinstance(lid, dict):
            lid = lid.get("locstring", {}).get("value") if "locstring" in lid else lid.get("value")
        lid = str(lid or "0")
        if lid == "0" or lid not in self.en:
            return None
        en = self._limpiar(self.en[lid])
        es = self._limpiar(self.es.get(lid, self.en[lid]))
        if not en or en.startswith("$"):
            return None
        return {"en": en, "es": es}

    def fmt(self, formatter: dict | None, plano=None) -> dict | None:
        """Un `ui_text_formatter` ("%1% / %2%" + argumentos) armado en los dos idiomas; si no hay, el texto plano."""
        if formatter and formatter.get("template_reference", {}).get("value") == "ui_text_formatter":
            molde = self.t(formatter.get("formatter"))
            if molde:
                args = []
                for a in formatter.get("formatter_arguments", []):
                    if "locstring_value" in a:
                        args.append(self.t(a["locstring_value"]) or {"en": "", "es": ""})
                    else:
                        v = next(iter(a.values()))
                        v = _num(v) if isinstance(v, (int, float)) else v
                        args.append({"en": str(v), "es": str(v)})
                out = {}
                for idioma in ("en", "es"):
                    s = molde[idioma]
                    for n in range(len(args), 0, -1):
                        s = s.replace(f"%{n}%", args[n - 1][idioma])
                    out[idioma] = re.sub(r"%(\d+)%", "", s).replace("%%", "%").strip()
                return out
        return self.t(plano)


def _ui_texto(ui: dict, loc: Loc, campo: str) -> dict | None:
    return loc.fmt(ui.get(f"{campo}_formatter"), ui.get(campo))


# ---------------------------------------------------------------- resúmenes por tipo de blueprint

def _ents(tag: str, loc: Loc | None) -> dict:
    """Cada entidad (ebps) resumida: vida, blindaje, costo, población, armas, qué construye y qué produce."""
    out = {}
    for raza in LEER:
        datos = load(tag, f"{PARTIDOS['ebps']}/{raza}.json")
        for p, o in _blueprints(datos, "extensions"):
            ref = f"ebps/races/{raza}/" + "/".join(p)
            e = {"kind": p[0]}
            h = _ext(o, "health_ext")
            if h:
                e["hp"] = _num(h.get("hitpoints"))
                e["ts"] = _num(h.get("target_size"))
                lay = h.get("armor_layout_option") or {}
                if "front_armor" in lay:
                    # "front_rear" no trae lado: el lado cuenta como atrás.
                    atras = _num(lay.get("rear_armor", lay["front_armor"]))
                    e["armor"] = [_num(lay["front_armor"]), _num(lay.get("side_armor", atras)), atras]
                elif "armor" in lay:
                    a = _num(lay["armor"])
                    e["armor"] = [a, a, a]
            c = _ext(o, "cost_ext")
            if c:
                tc = c.get("time_cost", {})
                e["cost"] = {**_cost(tc.get("cost")), "t": _num(tc.get("time_seconds", 0))}
            pop = _ext(o, "population_ext")
            if pop:
                e["pop"] = _num(sum(_num(pop.get(k)) or 0 for k in ("personnel_pop", "vehicle_pop", "medic_pop")))
                e["upkeep"] = _num((pop.get("upkeep_per_pop_per_minute_override") or {}).get("manpower", 0))
            s = _ext(o, "sight_ext")
            if s:
                e["sight"] = _num(s.get("sight_package", {}).get("outer_radius"))
            m = _ext(o, "moving_ext")
            if m:
                e["speed"] = _num(m.get("speed_scaling_table", {}).get("max_speed"))
            cb = _ext(o, "combat_ext")
            if cb:
                e["wents"] = [r for r in _refs(cb.get("hardpoints")) if r.startswith("ebps/") and "/weapons/" in r]
            w = _ext(o, "weapon_ext")
            if w:
                e["wref"] = next((r for r in _refs(w) if r.startswith("weapon/")), None)
            k = _ext(o, "construction_ext")
            if k:
                e["build"] = [r for r in _refs(k) if r.startswith("ebps/races/")]
            sp = _ext(o, "spawner_ext")
            if sp:
                e["spawn"] = list(dict.fromkeys(r for r in _refs(sp.get("spawn_items")) if r.startswith("sbps/races/")))
            ab = _ext(o, "ability_ext")
            if ab:
                e["abil"] = [r for r in _refs(ab) if r.startswith("abilities/")]
            up = _ext(o, "upgrade_ext")
            if up:
                e["upg"] = [r for r in _refs(up.get("standard_upgrades")) if r.startswith("upgrade/")]
            ui = _ext(o, "ui_ext")
            if ui and loc and p[0] == "buildings":
                e["name"] = loc.t(ui.get("screen_name"))
                e["icon"] = ui.get("icon_name") or None
                e["desc"] = _ui_texto(ui, loc, "brief_text") or _ui_texto(ui, loc, "help_text")
            out[ref] = e
        del datos
        free()
    return out


def _weapons(tag: str, loc: Loc | None) -> dict:
    out = {}
    for raza in LEER:
        datos = load(tag, f"{PARTIDOS['weapon']}/{raza}.json")
        for p, o in _blueprints(datos, "weapon_bag"):
            b = o["weapon_bag"]
            ref = f"weapon/{raza}/" + "/".join(p)
            ae = b.get("area_effect") or {}
            radio = _num((ae.get("area_info") or {}).get("outer_radius") or 0)
            burst = b.get("burst") or {}
            aim = b.get("aim") or {}
            rng = b.get("range") or {}
            dmg = b.get("damage") or {}
            out[ref] = {
                "name": loc.t(b.get("ui_name")) if loc else None,
                "icon": b.get("icon_name") or None,
                "kind": p[0],
                "cls": b.get("weapon_class") or None,
                "pen": _nmf(b.get("penetration")),
                "dist": _nmf(rng.get("distance")),
                "acc": _nmf(b.get("accuracy")),
                "dmg": _mm(dmg),
                "dmgType": dmg.get("damage_type") or None,
                "aoe": {"radius": radio, "dmg": _nmf(ae.get("damage")), "dist": _nmf(ae.get("distance")),
                        "pen": _nmf(ae.get("aoe_penetration"))} if radio else None,
                "reload": _mm((b.get("reload") or {}).get("duration")),
                "reloadEvery": _mm((b.get("reload") or {}).get("frequency")),
                "burst": {"dur": _mm(burst.get("duration")), "rof": _mm(burst.get("rate_of_fire"))}
                if burst.get("can_burst") == "True" else None,
                "cooldown": _mm((b.get("cooldown") or {}).get("duration")),
                "aim": {"fire": _mm(aim.get("fire_aim_time")), "ready": _mm(aim.get("ready_aim_time"))},
                "range": _mm(rng),
                "windup": _num((b.get("fire") or {}).get("wind_up")),
                "winddown": _num((b.get("fire") or {}).get("wind_down")),
                "moving": _num((b.get("moving") or {}).get("accuracy_multiplier")),
                "suppression": _num((b.get("suppression") or {}).get("amount")),
            }
        del datos
        free()
    return out


def _upgrades(tag: str, loc: Loc) -> dict:
    out = {}
    for raza in LEER:
        datos = load(tag, f"{PARTIDOS['upgrade']}/{raza}.json")
        for p, o in _blueprints(datos, "upgrade_bag"):
            b = o["upgrade_bag"]
            ui = b.get("ui_info") or {}
            out[f"upgrade/{raza}/" + "/".join(p)] = {
                "name": loc.t(ui.get("screen_name")),
                "icon": ui.get("icon_name") or None,
                "desc": _ui_texto(ui, loc, "help_text") or _ui_texto(ui, loc, "brief_text"),
                "brief": _ui_texto(ui, loc, "brief_text"),
                "cost": _cost((b.get("time_cost") or {}).get("cost")),
                "cp": _num(_cp(b.get("requirements"))),
                "reqs": _req_upgrades(b.get("requirements")),
            }
        del datos
        free()
    return out


def _abilities(tag: str, loc: Loc) -> dict:
    out = {}
    for raza in LEER:
        datos = load(tag, f"{PARTIDOS['abilities']}/{raza}.json")
        for p, o in _blueprints(datos, "ability_bag"):
            b = o["ability_bag"]
            ui = b.get("ui_info") or {}
            todas = _refs(o)
            cost = b.get("cost_to_player") or {}
            out[f"abilities/races/{raza}/" + "/".join(p)] = {
                "name": loc.t(ui.get("screen_name")),
                "icon": ui.get("icon_name") or None,
                "desc": _ui_texto(ui, loc, "help_text"),
                "brief": _ui_texto(ui, loc, "brief_text"),
                "cost": {**_cost(cost), "pop": _num(cost.get("popcap", 0))},
                "recharge": _num(b.get("recharge_time")),
                "reqs": _req_upgrades(b.get("requirements")),
                "sbps": list(dict.fromkeys(r for r in todas if r.startswith("sbps/races/"))),
                "ebps": list(dict.fromkeys(r for r in todas if r.startswith("ebps/races/"))),
            }
        del datos
        free()
    return out


def _squads(tag: str, loc: Loc | None) -> dict:
    out = {}
    for raza in LEER:
        datos = load(tag, f"{PARTIDOS['sbps']}/{raza}.json")
        for p, o in _blueprints(datos, "extensions"):
            ref = f"sbps/races/{raza}/" + "/".join(p)
            s = {"kind": p[0]}
            lo = _ext(o, "loadout_ext")
            s["loadout"] = [(u["loadout_data"]["type"]["instance_reference"], _num(u["loadout_data"].get("num", 1)))
                            for u in (lo or {}).get("unit_list", [])
                            if u.get("loadout_data", {}).get("type", {}).get("instance_reference")]
            pop = _ext(o, "population_ext")
            s["pop"] = _num((pop or {}).get("personnel_pop", 0) or 0)
            ui = _ext(o, "squad_ui_ext")
            info = ((ui or {}).get("race_list") or [{}])[0].get("race_data", {}).get("info", {})
            s["icon"] = info.get("icon_name") or None
            s["symbol"] = info.get("symbol_icon_name") or None
            if loc:
                s["name"] = loc.t(info.get("screen_name"))
                s["role"] = _ui_texto(info, loc, "help_text")
                s["desc"] = _ui_texto(info, loc, "brief_text")
                s["extra"] = _ui_texto(info, loc, "extra_text")
            up = _ext(o, "squad_upgrade_ext")
            s["upg"] = [r for r in _refs((up or {}).get("upgrades")) if r.startswith("upgrade/")]
            ab = _ext(o, "squad_ability_ext")
            s["abil"] = [r for r in _refs((ab or {}).get("abilities")) if r.startswith("abilities/")]
            en = _ext(o, "squad_engineer_ext")
            s["build"] = [r for r in _refs(en) if r.startswith("ebps/races/")] if en else []
            rq = _ext(o, "squad_requirement_ext")
            s["reqs"] = _req_upgrades((rq or {}).get("requirement_table"))
            s["reqs_top"] = [i["upgrade_name"]["instance_reference"] for r in (rq or {}).get("requirement_table", [])
                             for i in r.values() if isinstance(i, dict) and i.get("is_present") == "True"
                             and i.get("template_reference", {}).get("value", "").endswith("required_player_upgrade")
                             and i.get("upgrade_name", {}).get("instance_reference")]
            vet = _ext(o, "squad_veterancy_ext")
            vinfo = ((vet or {}).get("race_list") or [{}])[0].get("race_data", {}).get("info", {})
            s["vet"] = [{"xp": _num(r["veterancy_rank"].get("veterancy_value")),
                         "desc": loc.fmt(r["veterancy_rank"].get("brief_text_formatter"),
                                         r["veterancy_rank"].get("brief_text")) if loc else None}
                        for r in vinfo.get("veterancy_rank_info", []) if "veterancy_rank" in r]
            out[ref] = s
        del datos
        free()
    return out


# ---------------------------------------------------------------- armado

def _stats_unidad(s: dict, ents: dict) -> dict:
    """Costo, vida, blindaje, modelos, velocidad y visión de un pelotón a partir de sus entidades."""
    mp = mu = fu = t = 0.0
    pop = s.get("pop") or 0
    modelos = 0
    upkeep = 0.0
    loadout = []
    principal = None
    for ref, num in s["loadout"]:
        e = ents.get(ref)
        if not e:
            continue
        c = e.get("cost") or {}
        mp += (c.get("mp") or 0) * num
        mu += (c.get("mu") or 0) * num
        fu += (c.get("fu") or 0) * num
        t += (c.get("t") or 0) * num
        pop += (e.get("pop") or 0) * num
        upkeep += (e.get("upkeep") or 0) * (e.get("pop") or 0) * num
        modelos += num
        loadout.append({"slug": _slug(ref), "num": _num(num), "hp": e.get("hp"), "armor": e.get("armor"),
                        "targetSize": e.get("ts")})
        if e.get("hp") is not None and (principal is None or e["hp"] > principal["hp"]):
            principal = e
    principal = principal or {}
    velocidades = [ents[r].get("speed") for r, _ in s["loadout"] if r in ents and ents[r].get("speed")]
    return {
        "cost": {"mp": _num(round(mp, 1)), "mu": _num(round(mu, 1)), "fu": _num(round(fu, 1)),
                 "pop": _num(round(pop, 1)), "t": _num(round(t, 1))},
        "hp": principal.get("hp"),
        "armor": principal.get("armor"),
        "models": _num(modelos),
        "speed": min(velocidades) if velocidades else None,
        "sight": principal.get("sight"),
        "targetSize": principal.get("ts"),
        "upkeep": _num(upkeep) if upkeep else None,
        "loadout": loadout,
    }


def _armas_de(s: dict, ents: dict) -> list[tuple[str, float]]:
    """(ref del arma, cuántas) de las entidades del pelotón."""
    cuenta = {}
    for ref, num in s["loadout"]:
        for went in dict.fromkeys(ents.get(ref, {}).get("wents", [])):
            wref = ents.get(went, {}).get("wref")
            if wref:
                cuenta[wref] = cuenta.get(wref, 0) + num
    return list(cuenta.items())


RAZAS_DE = {"american": ("american",), "british": ("british_africa", "british"), "german": ("german",),
            "dak": ("afrika_korps",)}


def _por_icono(squads: dict) -> dict:
    """(facción, ícono) → el pelotón "principal" con ese ícono: sin variantes de tamaño, de misión (`_sp`) ni
    recuperables (`recrew`), y el británico de multijugador (`british_africa`) antes que el de campaña."""
    out = {}
    for f, razas in RAZAS_DE.items():
        cand = {}
        for ref, s in squads.items():
            raza = _raza(ref)
            slug = _slug(ref)
            if raza not in razas or not s.get("icon") or not s.get("name"):
                continue
            if "squad_size_variants" in ref or "recrew" in slug or re.search(r"_sp(_|$)", slug):
                continue
            cand.setdefault(s["icon"], []).append((razas.index(raza), len(slug), ref))
        for icono, lista in cand.items():
            out[(f, icono)] = min(lista)[2]
    return out


def _jugables(ents: dict, squads: dict, upgrades: dict, abilities: dict, bgs: dict) -> tuple:
    """
    Lo que se puede tener en multijugador. Desde cada cuartel: los pelotones que producen los edificios, los edificios
    que construyen esos pelotones (o que levantan sus habilidades, como los "auto_build" del cuartel) y lo que traen
    las mejoras de los battlegroups. coh3-data no exporta los árboles de estado que hacen aparecer muchas unidades
    de apoyo (paracaidistas, Fallschirmjäger...): ésas se reconocen porque la mejora o la habilidad que las trae usa
    el mismo ícono que el pelotón. Devuelve (pelotón → facción, pelotón → [edificios que lo producen], edificio →
    facción, pelotón → battlegroup que lo trae, mejora de battlegroup → {pelotones}).
    """
    faccion, hecho_en, edificios, bg_de, desbloquea = {}, {}, {}, {}, {}
    icono = _por_icono(squads)
    cola = [(hq, f) for f, hq in HQ.items()]
    for f, lista in bgs.items():
        for key, bg in lista.items():
            for u in bg["all_upgrades"]:
                abil = bg["abil_por_upgrade"].get(u, [])
                trae = [r for a in abil for r in abilities[a]["sbps"]]
                iconos = [upgrades.get(u, {}).get("icon")] + [abilities[a]["icon"] for a in abil]
                trae += [icono[(f, i)] for i in iconos if (f, i) in icono]
                for sq in dict.fromkeys(trae):
                    if sq in squads and squads[sq].get("name") and squads[sq].get("icon"):
                        bg_de.setdefault(sq, key)
                        desbloquea.setdefault(u, set()).add(sq)
                        cola.append((sq, f))
                cola += [(r, f) for a in abil for r in abilities[a]["ebps"]]
    vistos = set()
    while cola:
        ref, f = cola.pop()
        if (ref, f) in vistos:
            continue
        vistos.add((ref, f))
        if ref.startswith("ebps/"):
            e = ents.get(ref)
            if not e or e["kind"] != "buildings" and not e.get("spawn"):
                continue
            # Los edificios de producción se levantan con habilidades del cuartel ("auto_build").
            for a in e.get("abil", []):
                cola += [(b, f) for b in abilities.get(a, {}).get("ebps", []) if ents.get(b, {}).get("kind") == "buildings"]
            # Mejoras y habilidades del edificio con el ícono de un pelotón (médicos, armas pesadas...).
            for i in [upgrades.get(u, {}).get("icon") for u in e.get("upg", [])] + \
                     [abilities.get(a, {}).get("icon") for a in e.get("abil", [])]:
                if (f, i) in icono:
                    cola.append((icono[(f, i)], f))
            if e.get("spawn"):
                edificios.setdefault(ref, f)
                for sq in e["spawn"]:
                    hecho_en.setdefault(sq, [])
                    if ref not in hecho_en[sq]:
                        hecho_en[sq].append(ref)
                    cola.append((sq, f))
        else:
            s = squads.get(ref)
            if not s or not s.get("icon") or not s.get("name"):
                continue
            faccion.setdefault(ref, f)
            for r, _ in s["loadout"]:
                cola += [(b, f) for b in ents.get(r, {}).get("build", [])]
            cola += [(b, f) for b in s.get("build", [])]
            for a in s["abil"] + [a for r, _ in s["loadout"] for a in ents.get(r, {}).get("abil", [])]:
                cola += [(b, f) for b in abilities.get(a, {}).get("ebps", []) if ents.get(b, {}).get("kind") == "buildings"]
    return faccion, hecho_en, edificios, bg_de, desbloquea


EXTRA = Path(__file__).resolve().parent / "extra_units.json"


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


def _extras(squads: dict, upgrades: dict, abilities: dict, bgs: dict) -> tuple[dict, dict]:
    """
    Los pelotones de `extra_units.json` (los que nada enlaza: ver su `_nota`) → (pelotón → facción, pelotón →
    (battlegroup, mejora)). El battlegroup sale de una mejora o habilidad de los battlegroups de su facción con el
    mismo ícono o el mismo nombre (o el plural: "Hardpoints" trae el "Hardpoint"); si no hay, va sin battlegroup.
    """
    lista = json.loads(EXTRA.read_text(encoding="utf-8"))
    faccion, bg = {}, {}
    for f, slugs in lista.items():
        if f.startswith("_"):
            continue
        razas = RAZAS_DE[f]
        for slug in slugs:
            refs = sorted((razas.index(_raza(r)), r) for r, s in squads.items()
                          if _slug(r) == slug and _raza(r) in razas and s.get("name") and s.get("icon"))
            if not refs:
                print(f"  extra_units.json: {slug} no está en el tag (o sin nombre/ícono)")
                continue
            ref = refs[0][1]
            faccion[ref] = f
            s = squads[ref]
            nombre = _norm(s["name"]["en"])
            for key, b in sorted(bgs.get(f, {}).items()):
                for u in b["all_upgrades"]:
                    cand = [upgrades.get(u, {})] + [abilities[a] for a in b["abil_por_upgrade"][u]]
                    if any(c.get("icon") == s["icon"] or c.get("name") and _norm(c["name"]["en"]) in (nombre, nombre + "s")
                           for c in cand):
                        bg.setdefault(ref, (key, u))
    return faccion, bg


def _battlegroups(tag: str, loc: Loc, upgrades: dict, abilities: dict) -> dict:
    """{faccion: {slug: bg}} con las mejoras de cada rama y las habilidades que cada mejora habilita."""
    datos = load(tag, "battlegroup.json")
    por_upgrade = {}
    for aref, a in abilities.items():
        for u in a["reqs"]:
            por_upgrade.setdefault(u, []).append(aref)
    out = {}
    for raza, bgs in datos["races"].items():
        f = RAZA_SITIO.get(raza)
        if not f:
            continue
        for key, bg in bgs.items():
            tb = bg.get("techtree_bag") or {}
            act = (tb.get("activation_upgrade") or {}).get("instance_reference")
            ramas = [{"name": loc.t(br["branch"].get("name")),
                      "upgrades": [u["upgrade"]["instance_reference"] for u in br["branch"].get("upgrades", [])]}
                     for br in tb.get("branches", [])]
            todas = ([act] if act else []) + [u for r in ramas for u in r["upgrades"]]
            out.setdefault(f, {})[key] = {
                "slug": key, "name": loc.t(tb.get("name")), "faction": f, "act": act,
                "image": tb.get("image_wide") or None, "ramas": ramas, "all_upgrades": todas,
                "abil_por_upgrade": {u: por_upgrade.get(u, []) for u in todas},
            }
    del datos
    free()
    return out


def _unico(slug: str, usados: set, extra: str) -> str:
    if slug not in usados:
        return slug
    alt = f"{slug}_{extra}"
    if alt in usados:
        raise ValueError(f"slug repetido: {slug}")
    return alt


def _upgrade_fila(ref: str, upgrades: dict) -> dict | None:
    u = upgrades.get(ref)
    if not u or not u["name"]:
        return None
    return {"slug": _slug(ref), "name": u["name"], "icon": u["icon"], "desc": u["desc"], "cost": u["cost"]}


def _ability_fila(ref: str, abilities: dict) -> dict | None:
    a = abilities.get(ref)
    if not a or not a["name"]:
        return None
    return {"slug": _slug(ref), "name": a["name"], "icon": a["icon"], "desc": a["desc"] or a["brief"],
            "cost": a["cost"], "recharge": a["recharge"]}


def build_explorer(tag: str) -> dict:
    """Unidades, armas, battlegroups y facciones del tag. Carga y suelta un archivo crudo por vez."""
    loc = Loc(tag)
    ents = _ents(tag, loc)
    weapons = _weapons(tag, loc)
    upgrades = _upgrades(tag, loc)
    abilities = _abilities(tag, loc)
    squads = _squads(tag, loc)
    bgs = _battlegroups(tag, loc, upgrades, abilities)
    faccion, hecho_en, edificios, bg_via, desbloquea = _jugables(ents, squads, upgrades, abilities, bgs)

    # El británico de campaña (`british`) se cuela por alguna habilidad compartida: afuera si el de multijugador
    # (`british_africa`) tiene un pelotón con el mismo nombre.
    nombres_mp = {(f, squads[r]["name"]["en"]) for r, f in faccion.items() if _raza(r) != "british"}
    for r in [r for r, f in faccion.items() if _raza(r) == "british" and (f, squads[r]["name"]["en"]) in nombres_mp]:
        del faccion[r]

    # Los que nada enlaza (extra_units.json), con el battlegroup que se pueda deducir.
    extra_f, extra_bg = _extras(squads, upgrades, abilities, bgs)
    for ref, f in extra_f.items():
        if ref not in faccion:
            faccion[ref] = f
            if ref in extra_bg:
                key, u = extra_bg[ref]
                bg_via.setdefault(ref, key)
                desbloquea.setdefault(u, set()).add(ref)

    # battlegroup de cada pelotón: si no sale de ningún edificio, el que lo trae; si sale de uno, el que pide su
    # requisito directo (como la producción de Panther del Mechanized).
    bg_de_upgrade = {u: key for lista in bgs.values() for key, bg in lista.items() for u in bg["all_upgrades"]}
    bg_de_squad = {}
    for ref in faccion:
        if hecho_en.get(ref):
            for u in squads[ref]["reqs_top"]:
                if u in bg_de_upgrade:
                    bg_de_squad.setdefault(ref, bg_de_upgrade[u])
                    desbloquea.setdefault(u, set()).add(ref)
        elif ref in bg_via:
            bg_de_squad[ref] = bg_via[ref]
    # Una mejora "desbloquea" lo que trae o lo que la pide; no lo que sólo nombra (convertir fusileros en rangers
    # nombra a los fusileros, que salen del cuartel sin battlegroup).
    for u, lista in desbloquea.items():
        desbloquea[u] = {sq for sq in lista if not hecho_en.get(sq) or u in squads[sq]["reqs_top"]}

    # unidades
    unidades, slug_de, usados = [], {}, set()
    usado_por = {}
    for ref in sorted(faccion, key=lambda r: (FACTIONS.index(faccion[r]), r)):
        s = squads[ref]
        slug = _unico(_slug(ref), usados, faccion[ref])
        usados.add(slug)
        slug_de[ref] = slug
    for ref in sorted(faccion, key=lambda r: (FACTIONS.index(faccion[r]), r)):
        s, slug = squads[ref], slug_de[ref]
        st = _stats_unidad(s, ents)
        armas = []
        for wref, n in _armas_de(s, ents):
            usado_por.setdefault(wref, []).append(slug)
            armas.append((wref, n))
        unidades.append({
            "slug": slug, "name": s["name"], "faction": faccion[ref], "kind": s["kind"], "icon": s["icon"],
            "cost": st["cost"], "hp": st["hp"], "armor": st["armor"], "models": st["models"],
            "role": s["role"], "desc": s["desc"], "speed": st["speed"], "sight": st["sight"],
            "targetSize": st["targetSize"], "upkeep": st["upkeep"], "loadout": st["loadout"],
            "_weapons": armas,
            "upgrades": [x for x in (_upgrade_fila(u, upgrades) for u in dict.fromkeys(s["upg"])) if x],
            "abilities": [x for x in (_ability_fila(a, abilities) for a in dict.fromkeys(
                s["abil"] + [a for r, _ in s["loadout"] for a in ents.get(r, {}).get("abil", [])])) if x],
            "vet": s["vet"],
            "bg": bg_de_squad.get(ref),
            "builtIn": [_slug(b) for b in hecho_en.get(ref, []) if b in edificios],
        })

    # Variantes: mismo nombre en la misma facción ("x2" de producción en masa, los partisanos del battlegroup). La de
    # slug más corto es la principal; las otras llevan `variantOf` para que la tabla pueda agruparlas.
    principal = {}
    for u in sorted(unidades, key=lambda u: (len(u["slug"]), u["slug"])):
        clave = (u["faction"], u["name"]["en"])
        if clave in principal:
            u["variantOf"] = principal[clave]
        else:
            principal[clave] = u["slug"]

    # armas
    armas, wslug = [], {}
    wusados = set()
    for wref in sorted(usado_por):
        w = weapons.get(wref)
        if not w:
            continue
        slug = _unico(_slug(wref), wusados, _raza(wref))
        wusados.add(slug)
        wslug[wref] = slug
        raza = _raza(wref)
        armas.append({"slug": slug, "name": w["name"], "faction": FACTION.get(raza, "common"), **{
            k: v for k, v in w.items() if k != "name"}, "usedBy": sorted(set(usado_por[wref]))})
    # Casi ninguna arma tiene nombre propio: se arma con la primera unidad que la usa y el tipo de arma.
    nombre_u = {u["slug"]: u["name"] for u in unidades}
    for w in armas:
        if not w["name"] and w["usedBy"]:
            dueño = nombre_u[w["usedBy"][0]]
            tipo = TIPO_ARMA.get(w["cls"]) or TIPO_ARMA.get(w["kind"]) or TIPO_ARMA["weapon"]
            w["name"] = {i: f"{dueño[i]} · {tipo[i]}" for i in ("en", "es")}
            w["nameFromUnit"] = True
    # Pocas armas traen ícono propio (las de mejoras: MG42, bazooka…); las demás llevan el de su primera unidad.
    icono_u = {u["slug"]: u["icon"] for u in unidades}
    for w in armas:
        if not w.get("icon") and w["usedBy"] and icono_u.get(w["usedBy"][0]):
            w["icon"] = icono_u[w["usedBy"][0]]
            w["iconFromUnit"] = True
    nombre_w = {w["slug"]: w["name"] for w in armas}
    for u in unidades:
        u["weapons"] = [{"slug": wslug[w], "name": nombre_w[wslug[w]], "count": _num(n)}
                        for w, n in u.pop("_weapons") if w in wslug]

    # battlegroups
    unidades_por_slug = {u["slug"]: u for u in unidades}
    bgs_out = []
    for f in FACTIONS:
        for key, bg in sorted(bgs.get(f, {}).items()):
            act = upgrades.get(bg["act"], {}) if bg["act"] else {}
            ramas = []
            for r in bg["ramas"]:
                ups = []
                for uref in r["upgrades"]:
                    u = upgrades.get(uref) or {}
                    ab = [x for x in (_ability_fila(a, abilities) for a in bg["abil_por_upgrade"][uref]) if x]
                    unlocks = sorted(slug_de[sq] for sq in desbloquea.get(uref, ()) if sq in slug_de)
                    fila = {"slug": _slug(uref), "name": u.get("name"), "icon": u.get("icon"),
                            "desc": u.get("desc") or u.get("brief"), "cp": u.get("cp", 0)}
                    if unlocks:
                        fila["unlocks"] = unlocks
                    if ab:
                        fila["abilities"] = ab
                    ups.append(fila)
                ramas.append({"name": r["name"], "upgrades": ups})
            bgs_out.append({"slug": key, "name": bg["name"], "faction": f, "icon": act.get("icon"),
                            "image": bg["image"], "desc": act.get("desc") or act.get("brief"), "branches": ramas})

    # facciones
    facciones = {f: {"name": NOMBRE_FACCION[f], "icon": ICONO_FACCION[f], "buildings": [],
                     "battlegroups": [b["slug"] for b in bgs_out if b["faction"] == f]} for f in FACTIONS}
    for ref, f in sorted(edificios.items()):
        e = ents[ref]
        units = [slug_de[s] for s in e.get("spawn", []) if s in slug_de]
        if not units:
            continue
        facciones[f]["buildings"].append({"slug": _slug(ref), "name": e.get("name"), "icon": e.get("icon"),
                                          "desc": e.get("desc"), "cost": e.get("cost"), "units": units})
    for u in unidades:
        assert u["slug"] in unidades_por_slug
    return {"units": unidades, "weapons": armas, "battlegroups": bgs_out, "factions": facciones,
            "unit_refs": {v: k for k, v in slug_de.items()}, "weapon_refs": {v: k for k, v in wslug.items()}}


# ---------------------------------------------------------------- lo que no es del explorador

def build_maps(tag: str, loc: Loc) -> list:
    datos = load(tag, "mp-maps.json")
    out = []
    for key, m in sorted(datos.items()):
        if key == "__meta" or m.get("category") != "mp" or not m.get("isLobbyVisible"):
            continue
        nombre = loc.t(m["name"].get("locstring")) or {"en": m["name"].get("en"), "es": m["name"].get("en")}
        desc = loc.t(m.get("description", {}).get("locstring"))
        res = m.get("resources", {})
        out.append({
            "slug": key, "name": nombre, "desc": desc, "players": m.get("maxPlayers"), "layout": m.get("teamLayout"),
            "size": [m["mapSize"]["width"], m["mapSize"]["height"]] if m.get("mapSize") else None,
            "area": {k: _num(v) for k, v in (m.get("playableAreaEstimate") or {}).items()},
            "points": [{"kind": p.get("kind"), "tier": p.get("tier"), "x": round(p["x"], 1), "y": round(p["y"], 1)}
                       for p in m.get("points", [])],
            "counts": res.get("counts"), "income": res.get("incomePerMinute"),
            "community": bool(m.get("isCommunity")), "minimap": f"m/{key}",
        })
    del datos
    free()
    return out


def build_challenges(tag: str, loc: Loc) -> dict:
    out = {}
    for tipo, archivo in (("daily", "daily_challenges_store_release.json"), ("weekly", "weekly_challenges_store_release.json")):
        datos = load(tag, archivo)
        lista = []
        for key, c in datos.items():
            b = c.get("challenge_bag", {})
            if b.get("enable") != "True":
                continue
            premio = (b.get("reward", {}).get("item_bundle") or {}).get("instance_reference", "")
            m = re.search(r"merit_reward_(\d+)", premio)
            lista.append({"slug": key, "name": loc.t(b.get("name")), "desc": loc.t(b.get("description")),
                          "count": _num(b.get("completion_count")), "merits": int(m.group(1)) if m else None})
        out[tipo] = lista
        del datos
        free()
    return out


def build_finalstand(tag: str, loc: Loc) -> dict:
    perks = load(tag, "fs-perks.json")["races"]
    tech = load(tag, "fs-technologies.json")["races"]
    out = {}
    for raza, f in RAZA_SITIO.items():
        p = perks.get(raza, {})
        lista = []
        for ti in p.get("tiers", []):
            for k in ti.get("perks", []):
                ui = k.get("ui", {})
                niveles = []
                for lv in k.get("levels", []):
                    h = (lv.get("ui") or {}).get("helpTextFormatter") or {}
                    molde = loc.t(h.get("formatter"))
                    if molde:
                        args = [str(_num(a)) if isinstance(a, (int, float)) else (loc.t(a) or {}).get("en", str(a))
                                for a in h.get("arguments", [])]
                        d = {}
                        for idioma in ("en", "es"):
                            s = molde[idioma]
                            for n in range(len(args), 0, -1):
                                s = s.replace(f"%{n}%", args[n - 1])
                            d[idioma] = s.replace("%%", "%")
                    else:
                        d = None
                    niveles.append({"cost": lv.get("cost"), "desc": d})
                lista.append({"tier": ti.get("tier"), "unlock": ti.get("unlockThreshold"), "slug": k["id"],
                              "name": loc.t(ui.get("screenName")), "desc": loc.t(ui.get("briefText")),
                              "icon": ui.get("icon"), "levels": niveles})
        t = tech.get(raza, {})
        techs = [{"slug": x["id"], "name": loc.t(x["ui"].get("screenName")),
                  "desc": loc.t(x["ui"].get("briefText")) or loc.t(x["ui"].get("helpText")),
                  "icon": x["ui"].get("icon"), "category": x.get("category"), "cp": x.get("commandCost")}
                 for x in t.get("technologies", []) if x.get("enabled", True)]
        out[f] = {"name": loc.t((p.get("ui") or {}).get("name")) or NOMBRE_FACCION[f], "perks": lista,
                  "technologies": techs}
    del perks, tech
    free()
    return out


# ---------------------------------------------------------------- parches

CAMPOS_UNIDAD = ("cost.mp", "cost.mu", "cost.fu", "cost.pop", "cost.t", "hp", "armor", "models", "speed", "sight",
                 "targetSize")
CAMPOS_ARMA = ("pen", "dist", "acc", "dmg", "aoe.radius", "aoe.dmg", "aoe.dist", "reload", "reloadEvery", "burst.dur", "burst.rof",
               "cooldown", "aim.fire", "aim.ready", "range", "windup", "winddown", "moving", "suppression")


def _campo(d: dict | None, campo: str):
    for k in campo.split("."):
        if not isinstance(d, dict):
            return None
        d = d.get(k)
    return d


def stats_tag(tag: str, unit_refs: dict, weapon_refs: dict) -> tuple[dict, dict]:
    """Los stats comparables de unidades y armas de un tag (para parches): {slug: fila}. Sólo sbps/ebps/weapon."""
    ents = _ents(tag, None)
    squads = _squads(tag, None)
    weapons = _weapons(tag, None)
    u = {}
    for slug, ref in unit_refs.items():
        if ref in squads:
            st = _stats_unidad(squads[ref], ents)
            st.pop("loadout")
            st["weapons"] = sorted(_slug(w) for w, _ in _armas_de(squads[ref], ents))
            u[slug] = st
    w = {slug: weapons[ref] for slug, ref in weapon_refs.items() if ref in weapons}
    del ents, squads, weapons
    free()
    return u, w


def diff(antes: dict, despues: dict, campos: tuple) -> list:
    out = []
    for c in campos:
        a, d = _campo(antes, c), _campo(despues, c)
        if a != d:
            out.append({"field": c, "before": a, "after": d})
    return out


def _cambios(antes: dict, despues: dict, campos: tuple, fichas: dict) -> list:
    """Lo que cambió de cada unidad o arma de hoy entre dos tags (las que no existían en ninguno no van)."""
    out = []
    for slug, d in despues.items():
        f = fichas[slug]
        base = {"slug": slug, "name": f["name"], "faction": f["faction"], "icon": f.get("icon")}
        if slug not in antes:
            out.append({**base, "status": "new", "changes": []})
            continue
        if "hp" in campos and (antes[slug].get("hp") is None or d.get("hp") is None):
            continue  # export roto en ese tag (v2.4.2-2 trae el Weasel con los nombres de campo en vez de números)
        ch = diff(antes[slug], d, campos)
        if ch:
            out.append({**base, "status": "changed", "changes": ch})
    return out


def build_patches(ex: dict, tags: list[dict]) -> list:
    """
    Un archivo por par de tags seguidos con cambios de stats (`patches/<tag nuevo>.json`) y el índice. Se compara lo
    de hoy (unidades y armas jugables del tag actual, buscadas por su ref) y se calcula cada tag una sola vez, de a
    uno, soltando lo crudo. Un par sin cambios en lo jugable (tocó sólo campaña o Final Stand) no se escribe.
    """
    if (DATA / "patches").exists():
        shutil.rmtree(DATA / "patches")
    unidades = {u["slug"]: u for u in ex["units"]}
    armas = {w["slug"]: w for w in ex["weapons"]}
    indice = []
    nuevo = None
    for t in tags:
        stats = stats_tag(t["tag"], ex["unit_refs"], ex["weapon_refs"])
        if nuevo:
            (tn, (nu, nw)), (u_viejo, w_viejo) = nuevo, stats
            cu = _cambios(u_viejo, nu, CAMPOS_UNIDAD + ("weapons",), unidades)
            cw = _cambios(w_viejo, nw, CAMPOS_ARMA, armas)
            if cu or cw:
                numero = re.sub(r"^v|-\d+$", "", tn["tag"])
                fila = {"slug": tn["tag"], "tag": tn["tag"], "prev": t["tag"], "patch": numero,
                        "name": {"en": f"Patch {numero}", "es": f"Parche {numero}"}, "date": tn.get("date"),
                        "units": len(cu), "weapons": len(cw)}
                write_json(DATA / "patches" / f"{tn['tag']}.json", {**fila, "units": cu, "weapons": cw})
                indice.append(fila)
        nuevo = (t, stats)
        free()
    # Varios tags del mismo parche (re-exportaciones de un hotfix): el nombre lleva la revisión ("2.4.2 · rev. 3").
    numeros = [f["patch"] for f in indice]
    for f in indice:
        if numeros.count(f["patch"]) > 1:
            rev = f["tag"].rsplit("-", 1)[-1]
            f["name"] = {"en": f"Patch {f['patch']} · rev. {rev}", "es": f"Parche {f['patch']} · rev. {rev}"}
            d = json.loads((DATA / "patches" / f"{f['tag']}.json").read_text(encoding="utf-8"))
            d["name"] = f["name"]
            write_json(DATA / "patches" / f"{f['tag']}.json", d)
    write_json(DATA / "patches" / "index.json", indice)
    return indice


# ---------------------------------------------------------------- escritura

def _fila_unidad(u: dict) -> dict:
    fila = {k: u[k] for k in ("slug", "name", "faction", "kind", "icon", "cost", "hp", "armor", "targetSize", "models",
                              "bg")}
    if u.get("variantOf"):
        fila["variantOf"] = u["variantOf"]
    return fila


def _fila_arma(w: dict) -> dict:
    fila = {k: w[k] for k in ("slug", "name", "faction", "kind", "icon", "cls", "pen", "dist", "acc", "dmg", "reload",
                              "reloadEvery", "range")} | {"aoe": w["aoe"]["radius"] if w["aoe"] else None,
                                                          "users": len(w["usedBy"]),
                                                          "by": w["usedBy"][0] if w["usedBy"] else None}
    if w.get("nameFromUnit"):
        fila["nameFromUnit"] = True
    return fila


def _fila_bg(b: dict) -> dict:
    return {k: b[k] for k in ("slug", "name", "faction", "icon", "image")}


def _escribir_tab(nombre: str, fichas: list, fila) -> dict:
    """`list.json` + `f/NN.json`; borra la carpeta de fichas vieja para que no queden archivos huérfanos."""
    base = DATA / nombre
    if (base / "f").exists():
        shutil.rmtree(base / "f")
    write_json(base / "list.json", [fila(x) for x in fichas])
    partes = {}
    for x in fichas:
        partes.setdefault(shard(x["slug"]), {})[x["slug"]] = x
    for n in range(CHUNKS):
        write_json(base / "f" / f"{n:02d}.json", partes.get(n, {}))
    return partes


def main() -> None:
    t0 = time.time()
    tags = tags_raw()
    tag, prev = tags[0], (tags[1] if len(tags) > 1 else None)
    ex = build_explorer(tag)
    loc = Loc(tag)
    mapas = build_maps(tag, loc)
    desafios = build_challenges(tag, loc)
    fs = build_finalstand(tag, loc)
    del loc
    free()

    DATA.mkdir(parents=True, exist_ok=True)
    _escribir_tab("units", ex["units"], _fila_unidad)
    _escribir_tab("weapons", ex["weapons"], _fila_arma)
    _escribir_tab("battlegroups", ex["battlegroups"], _fila_bg)
    write_json(DATA / "factions.json", ex["factions"])
    write_json(DATA / "maps.json", mapas)
    write_json(DATA / "challenges.json", desafios)
    write_json(DATA / "finalstand.json", fs)

    indice = build_patches(ex, tags_info())
    write_json(DATA / "patches" / "index.json", indice)

    meta = {"generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "tag": tag,
            "patch": re.sub(r"^v|-\d+$", "", tag), "prev": prev,
            "counts": {"units": len(ex["units"]), "weapons": len(ex["weapons"]),
                       "battlegroups": len(ex["battlegroups"]), "maps": len(mapas)}}
    viejo = DATA / "meta.json"
    if viejo.exists():
        anterior = json.loads(viejo.read_text(encoding="utf-8"))
        if {k: v for k, v in anterior.items() if k != "generatedAt"} == {k: v for k, v in meta.items() if k != "generatedAt"}:
            meta["generatedAt"] = anterior["generatedAt"]
    write_json(DATA / "meta.json", meta)

    for f in FACTIONS:
        print(f"{f}: {sum(u['faction'] == f for u in ex['units'])} unidades, "
              f"{sum(w['faction'] == f for w in ex['weapons'])} armas, "
              f"{sum(b['faction'] == f for b in ex['battlegroups'])} battlegroups")
    print(f"{len(mapas)} mapas, {len(desafios['daily'])}+{len(desafios['weekly'])} desafíos; parches: {indice}")
    pico = peak_mb()
    print(f"{time.time() - t0:.1f} s, pico de RAM {pico:.0f} MB" if pico else f"{time.time() - t0:.1f} s")


if __name__ == "__main__":
    main()
