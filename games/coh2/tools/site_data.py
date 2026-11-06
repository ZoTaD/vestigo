"""
La enciclopedia de Company of Heroes 2 (2026-11-06), de los archivos del juego instalado: unidades, armas,
comandantes y boletines de inteligencia, con los mismos formatos que CoH3 (`games/coh3/tools/site_data.py`), así las
pantallas del sitio se reutilizan. Corre a mano en la PC (nunca en Actions); lo que escribe se commitea.

    python games/coh2/tools/site_data.py [--root "C:/Program Files (x86)/Steam/steamapps/common"]

Qué entra: las escuadras de multijugador (`<nombre>_mp`, fuera de campaña, pruebas y Theater of War) que produce algún
edificio de multijugador de la raza (`spawner_ext`) o que habilita un comandante (su habilidad la convoca, o su mejora
es requisito de la escuadra). Las referencias del juego son por nombre de archivo, único dentro de cada tipo.

Salida (`games/coh2/data/`):
  - `meta.json`;
  - `units/list.json` + `units/f/NN.json` (fichas partidas como en CoH3, `shard` = FNV-1a % 32);
  - `weapons/…`, `commanders/…`;
  - `bulletins.json`;
  - íconos en `site/public/coh2/i/<nombre>.webp` y emblemas de facción en `site/public/coh2/f/<facción>.webp`.
"""
import argparse
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parents[2]
sys.path.insert(0, str(RAIZ / "games" / "coh" / "tools"))
sys.path.insert(0, str(RAIZ / "games" / "coh3" / "tools"))
from coh3 import CHUNKS, shard, write_json  # noqa: E402
from gfx import Gfx  # noqa: E402
from rgd import Keys, parse, ref_name  # noqa: E402
from sga import Sga  # noqa: E402
from ucs import load_ucs  # noqa: E402

STEAM = "C:/Program Files (x86)/Steam/steamapps/common"
JUEGO = "Company of Heroes 2"
DATA = RAIZ / "games" / "coh2" / "data"
PUBLIC = RAIZ / "site" / "public" / "coh2"
# Carpeta de raza del juego → clave del sitio.
FACCION = {"german": "wehrmacht", "soviet": "soviet", "west_german": "okw", "aef": "usf", "british": "british"}
TIPO = {"soldiers": "infantry", "team_weapons": "team_weapons", "vehicles": "vehicles", "buildings": "emplacements"}
FUERA = re.compile(r"/(campaign|sp|test|tests|tow|dev|debug)/|/(m\d\d_|tow_|test_|sp_)|_tow_|_sp_|_test")


# ------------------------------------------------------------------ funciones puras

def es_multijugador(ruta: str) -> bool:
    """Una ruta de atributo (`sbps/races/soviet/…/conscript_squad_mp`) de multijugador: `_mp` y fuera de campaña."""
    ruta = ruta.lower().replace("\\", "/")
    nombre = ruta.rsplit("/", 1)[-1]
    return nombre.endswith("_mp") and not FUERA.search(ruta)


def texto(ref, en: dict[int, str], es: dict[int, str]) -> dict | None:
    """Un id de texto del juego (`"11006679"` o `"$11006679"`) en los dos idiomas; sin español, el inglés."""
    s = str(ref or "").lstrip("$")
    if not s.isdigit() or s == "0":
        return None
    i = int(s)
    if i not in en:
        return None
    return {"en": en[i], "es": es.get(i) or en[i]}


def es_avion(tipos: set) -> bool:
    """Una entidad de avión (los de los ataques aéreos): su `unit_type_list` dice `aircraft`."""
    return "aircraft" in tipos


def _n(v):
    """Un número prolijo: entero si no tiene decimales, con hasta 3 decimales si no."""
    if v is None:
        return None
    v = float(v)
    return int(v) if v.is_integer() else round(v, 3)


def _nmf(d) -> list | None:
    return [_n(d.get(k)) for k in ("near", "mid", "far")] if isinstance(d, dict) and "near" in d else None


def _mm(d) -> list | None:
    return [_n(d.get("min")), _n(d.get("max"))] if isinstance(d, dict) and "min" in d else None


def blindaje(h: dict) -> list:
    """`[frente, lado, atrás]`. CoH2 sólo tiene frente y atrás: el lado cuenta como atrás. Sin daño trasero, el frente."""
    frente = _n(h.get("armor") or 1)
    atras = _n(h.get("rear_armor")) if h.get("rear_damage_enabled") else frente
    return [frente, atras, atras]


def stats_escuadra(loadout: list[tuple[str, float]], ents: dict) -> dict:
    """Costo, vida, blindaje, modelos, velocidad y visión de una escuadra a partir de sus entidades."""
    mp = mu = fu = t = pop = 0.0
    modelos = 0
    principal, velocidades, salida = None, [], []
    for ref, num in loadout:
        e = ents.get(ref)
        if not e:
            continue
        c = e.get("cost") or {}
        mp += (c.get("mp") or 0) * num
        mu += (c.get("mu") or 0) * num
        fu += (c.get("fu") or 0) * num
        t += (c.get("t") or 0) * num
        pop += (e.get("pop") or 0) * num
        modelos += num
        if e.get("speed"):
            velocidades.append(e["speed"])
        salida.append({"slug": ref, "num": _n(num), "hp": _n(e.get("hp")), "armor": e.get("armor"), "targetSize": _n(e.get("ts"))})
        if e.get("hp") is not None and (principal is None or e["hp"] > principal["hp"]):
            principal = e
    principal = principal or {}
    return {
        "cost": {"mp": _n(mp), "mu": _n(mu), "fu": _n(fu), "pop": _n(pop), "t": _n(t)},
        "hp": _n(principal.get("hp")),
        "armor": [_n(a) for a in principal["armor"]] if principal.get("armor") else None,
        "models": _n(modelos),
        "speed": _n(min(velocidades)) if velocidades else None,
        "sight": _n(principal.get("sight")),
        "targetSize": _n(principal.get("ts")),
        "loadout": salida,
    }


def arma(slug: str, d: dict, en: dict, es: dict) -> dict:
    """Una ficha de arma (los campos de CoH3) a partir del `weapon_bag`."""
    b = d.get("weapon_bag") or {}
    ae = b.get("area_effect") or {}
    radio = _n((ae.get("area_info") or {}).get("outer_radius") or 0)
    burst = b.get("burst") or {}
    aim = b.get("aim") or {}
    rng = b.get("range") or {}
    nombre = texto(b.get("ui_name"), en, es)
    return {
        "slug": slug,
        "name": nombre or {"en": b.get("name") or slug, "es": b.get("name") or slug},
        "nameFromCode": nombre is None,
        "icon": b.get("icon_name") or None,
        "kind": None,
        "cls": None,
        "pen": _nmf(b.get("penetration")),
        "dist": _nmf(rng.get("distance")),
        "acc": _nmf(b.get("accuracy")),
        "dmg": _mm(b.get("damage")),
        "dmgType": None,
        "aoe": {"radius": radio, "dmg": _nmf(ae.get("damage")), "dist": _nmf(ae.get("distance")),
                "pen": _nmf(ae.get("aoe_penetration"))} if radio else None,
        "reload": _mm((b.get("reload") or {}).get("duration")),
        "reloadEvery": _mm((b.get("reload") or {}).get("frequency")),
        "burst": {"dur": _mm(burst.get("duration")), "rof": _mm(burst.get("rate_of_fire"))} if burst.get("can_burst") else None,
        "cooldown": _mm((b.get("cooldown") or {}).get("duration")),
        "aim": {"fire": _mm(aim.get("fire_aim_time")), "ready": _mm(aim.get("ready_aim_time"))},
        "range": _mm(rng),
        "windup": _n((b.get("fire") or {}).get("wind_up")),
        "winddown": _n((b.get("fire") or {}).get("wind_down")),
        "moving": _n((b.get("moving") or {}).get("accuracy_multiplier")),
        "suppression": _n((b.get("suppression") or {}).get("amount")),
    }


def _lista(v) -> list:
    return v if isinstance(v, list) else [] if v in (None, "", {}) else [v]


def _strings(o, out: set) -> set:
    if isinstance(o, dict):
        for v in o.values():
            _strings(v, out)
    elif isinstance(o, list):
        for v in o:
            _strings(v, out)
    elif isinstance(o, str) and o:
        out.add(ref_name(o))
    return out


# ------------------------------------------------------------------ lectura del juego

class Atributos:
    """Los `.rgd` de `AttribArchive.sga` por tipo y nombre, leídos cuando hacen falta."""

    def __init__(self, sga: Sga):
        self.sga, self.keys, self.idx, self._c = sga, Keys(), {}, {}
        for ruta in sga.entries:
            if ruta.startswith("attrib/") and ruta.endswith(".rgd"):
                partes = ruta[len("attrib/"):-4].split("/")
                self.idx.setdefault(partes[0], {})[partes[-1]] = ruta[len("attrib/"):-4]

    def ruta(self, tipo: str, nombre: str) -> str | None:
        return self.idx.get(tipo, {}).get(ref_name(nombre).lower())

    def get(self, tipo: str, nombre: str) -> dict | None:
        r = self.ruta(tipo, nombre)
        if not r:
            return None
        if r not in self._c:
            try:
                self._c[r] = parse(self.sga.read(f"attrib/{r}.rgd"), self.keys)
            except ValueError:
                self._c[r] = {}
        return self._c[r]


def _raza(ruta: str) -> str | None:
    p = ruta.split("/")
    return p[2] if len(p) > 2 and p[1] == "races" else None


def _ui_escuadra(d: dict) -> dict:
    rl = (d.get("squad_ui_ext") or {}).get("race_list") or {}
    for v in rl.values():
        for x in _lista(v):
            if isinstance(x, dict) and isinstance(x.get("info"), dict):
                return x["info"]
    return {}


def _entidad(d: dict) -> dict:
    h = d.get("health_ext") or {}
    c = ((d.get("cost_ext") or {}).get("time_cost") or {})
    cc = c.get("cost") or {}
    pop = d.get("population_ext") or {}
    armas = []
    for hp in _lista(((d.get("combat_ext") or {}).get("hardpoints") or {}).get("hardpoint")):
        for w in _lista(((hp or {}).get("weapon_table") or {}).get("weapon")):
            n = ref_name((w or {}).get("weapon"))
            if n:
                armas.append(n)
    return {
        "hp": h.get("hitpoints"), "armor": blindaje(h) if h else None, "ts": h.get("target_size"),
        "cost": {"mp": cc.get("manpower", 0), "mu": cc.get("munition", 0), "fu": cc.get("fuel", 0), "t": c.get("time_seconds", 0)},
        "pop": sum(pop.get(k) or 0 for k in ("personnel_pop", "vehicle_pop", "medic_pop")),
        "speed": (d.get("moving_ext") or {}).get("speed_max"),
        "sight": ((d.get("sight_ext") or {}).get("sight_package") or {}).get("outer_radius"),
        "weapons": armas,
        "icon": (d.get("ui_ext") or {}).get("icon_name") or None,
        "types": {str(v) for v in ((d.get("type_ext") or {}).get("unit_type_list") or {}).values() if v},
    }


def main(argv: list[str]) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=STEAM)
    a = ap.parse_args(argv)
    base = Path(a.root) / JUEGO
    at = Atributos(Sga(base / "CoH2/Archives/AttribArchive.sga"))
    en = load_ucs(base / "CoH2/Locale/English/RelicCoH2.English.ucs")
    es = load_ucs(base / "CoH2/Locale/Spanish/RelicCoH2.Spanish.ucs")
    gfx = Gfx(Sga(base / "CoH2/Archives/UIHigh.sga"))
    t = lambda ref: texto(ref, en, es)  # noqa: E731

    # --- Comandantes: sus habilidades, la mejora que habilita cada una y lo que convoca.
    comandantes, upg_comandante, conv_comandante = [], {}, {}
    for nombre, ruta in sorted(at.idx.get("commander", {}).items()):
        raza = ruta.split("/")[1] if "/" in ruta else None
        if raza not in FACCION or not es_multijugador(ruta + "_mp") and "tow" in ruta:
            continue
        b = (at.get("commander", nombre) or {}).get("commander_bag") or {}
        n = t(b.get("name"))
        if not n:
            continue
        habs = []
        for ca in _lista((b.get("commander_abilities") or {}).get("commander_ability")):
            cb = (at.get("commander_ability", ca) or {}).get("commander_ability_bag") or {}
            ab = at.get("abilities", cb.get("ability") or "") or {}
            habs.append({"slug": ref_name(ca), "name": t(cb.get("name")) or {"en": ca, "es": ca}, "icon": cb.get("icon") or None,
                         "desc": t(cb.get("description")), "upgrade": ref_name(cb.get("upgrade")), "_conv": _strings(ab, set())})
        comandantes.append({"slug": nombre, "name": n, "faction": FACCION[raza], "icon": b.get("icon_secondary") or b.get("icon") or None,
                            "desc": t(b.get("description")), "short": t(b.get("description_short")), "abilities": habs})
        for h in habs:
            if h["upgrade"]:
                upg_comandante.setdefault(h["upgrade"], (nombre, h["slug"]))
            for s in h["_conv"]:
                conv_comandante.setdefault(s, (nombre, h["slug"]))

    # Los refuerzos de comandante son habilidades habilitadas por su mejora (`required_player_upgrade`), que convocan
    # escuadras (`reinforcements_action/squad_table/squad`): lo que nombran cuenta como del comandante.
    for nombre in at.idx.get("abilities", {}):
        d = at.get("abilities", nombre) or {}
        reqs = {ref_name(x) for x in _strings(_buscar_todo(d, "upgrade_name"), set())}
        cm = next((upg_comandante[r] for r in reqs if r in upg_comandante), None)
        if not cm:
            continue
        for s in _strings(d.get("ability_bag", {}).get("action_list"), set()):
            if at.ruta("sbps", s):
                conv_comandante.setdefault(s, cm)
                for c in comandantes:
                    if c["slug"] == cm[0]:
                        for h in c["abilities"]:
                            if h["slug"] == cm[1]:
                                h["_conv"].add(s)

    # --- Escuadras de multijugador.
    candidatas: dict[str, tuple[str, str] | None] = {}
    for nombre, ruta in at.idx.get("ebps", {}).items():
        if not es_multijugador(ruta) or "/buildings/" not in ruta or _raza(ruta) not in FACCION:
            continue
        for it in _lista(((at.get("ebps", nombre) or {}).get("spawner_ext") or {}).get("spawn_items")):
            for x in (it.values() if isinstance(it, dict) and "squad" not in it else [it]):
                for y in _lista(x):
                    sq = ref_name((y or {}).get("squad")) if isinstance(y, dict) else ""
                    if sq:
                        candidatas.setdefault(sq, None)
    # Lo que produce un edificio base no es del comandante aunque alguna habilidad también lo convoque (los
    # Conscripts que trae una habilidad soviética siguen siendo la infantería del cuartel general).
    for s, cm in conv_comandante.items():
        if at.ruta("sbps", s) and s not in candidatas:
            candidatas[s] = cm

    ents_cache: dict[str, dict] = {}

    def ent(nombre: str) -> dict:
        if nombre not in ents_cache:
            ents_cache[nombre] = _entidad(at.get("ebps", nombre) or {})
        return ents_cache[nombre]

    unidades, armas_uso = [], {}
    for sq, cm in sorted(candidatas.items()):
        ruta = at.ruta("sbps", sq)
        raza = _raza(ruta or "")
        if not ruta or not es_multijugador(ruta) or raza not in FACCION:
            continue
        d = at.get("sbps", sq) or {}
        info = _ui_escuadra(d)
        nombre = t(info.get("screen_name"))
        if not nombre:
            continue
        reqs = _strings((d.get("squad_requirement_ext") or {}), set())
        if cm is None:
            cm = next((upg_comandante[r] for r in reqs if r in upg_comandante), None)
        loadout = []
        for u in (((d.get("squad_loadout_ext") or {}).get("unit_list")) or {}).values():
            for x in _lista(u):
                if isinstance(x, dict) and x.get("type"):
                    loadout.append((ref_name(x["type"]), x.get("num") or 1))
        ents = {r: ent(r) for r, _ in loadout}
        # Los aviones de los ataques aéreos son escuadras, pero no unidades que se manejen.
        if any(es_avion(ents[r]["types"]) for r in ents):
            continue
        st = stats_escuadra(loadout, ents)
        cuenta = {}
        for r, num in loadout:
            for w in ents[r]["weapons"]:
                cuenta[w] = cuenta.get(w, 0) + num
        armas = []
        for w, c in cuenta.items():
            wd = at.get("weapon", w)
            if not wd or "dummy" in w or not ((wd.get("weapon_bag") or {}).get("damage") or {}).get("max"):
                continue
            armas_uso.setdefault(w, []).append(sq)
            armas.append({"slug": w, "count": _n(c)})
        mejoras = []
        for u in _lista(((d.get("squad_upgrade_ext") or {}).get("upgrades") or {}).get("upgrade")):
            ub = (at.get("upgrade", u) or {}).get("upgrade_bag") or {}
            ui = ub.get("ui_info") or {}
            nm = t(ui.get("screen_name"))
            if nm:
                cc = ((ub.get("time_cost") or {}).get("cost")) or {}
                mejoras.append({"slug": ref_name(u), "name": nm, "icon": ui.get("icon_name") or None, "desc": t(ui.get("help_text")),
                                "cost": {"mp": _n(cc.get("manpower", 0)), "mu": _n(cc.get("munition", 0)), "fu": _n(cc.get("fuel", 0))}})
        habilidades = []
        for h in _lista(((d.get("squad_ability_ext") or {}).get("abilities") or {}).get("ability")):
            hb = (at.get("abilities", h) or {}).get("ability_bag") or {}
            ui = hb.get("ui_info") or {}
            nm = t(ui.get("screen_name"))
            if nm:
                cc = hb.get("cost") or {}
                habilidades.append({"slug": ref_name(h), "name": nm, "icon": ui.get("icon_name") or None, "desc": t(ui.get("help_text")),
                                    "cost": {"mp": _n(cc.get("manpower", 0)), "mu": _n(cc.get("munition", 0)), "fu": _n(cc.get("fuel", 0))},
                                    "recharge": _n(hb.get("recharge_time"))})
        vet = []
        for r in _lista(_buscar(d.get("squad_veterancy_ext"), "veterancy_rank")):
            if isinstance(r, dict) and r.get("experience_value") is not None:
                vet.append({"xp": _n(r["experience_value"]), "desc": None})
        kind = next((TIPO[p] for p in ruta.split("/") if p in TIPO), "infantry")
        unidades.append({
            "slug": sq, "name": nombre, "faction": FACCION[raza], "kind": kind,
            "icon": info.get("icon_name") or None, "symbol": info.get("symbol_icon_name") or None,
            **st, "role": t(info.get("help_text")), "desc": t(info.get("brief_text")), "extra": t(info.get("extra_text")),
            "upkeep": None, "upgrades": mejoras, "abilities": habilidades, "vet": vet,
            "bg": cm[0] if cm else None, "builtIn": [], "weapons": armas,
        })

    # Las habilidades de cada comandante, con la unidad que habilitan.
    por_upg = {}
    for u in unidades:
        d = at.get("sbps", u["slug"]) or {}
        for r in _strings(d.get("squad_requirement_ext") or {}, set()):
            por_upg.setdefault(r, u["slug"])
    for c in comandantes:
        for h in c["abilities"]:
            conv = sorted(s for s in h.pop("_conv") if any(u["slug"] == s for u in unidades))
            h["unit"] = por_upg.get(h.pop("upgrade")) or (conv[0] if conv else None)

    # --- Armas.
    fichas_armas = []
    usadas = {u["slug"]: u for u in unidades}
    for w, quienes in sorted(armas_uso.items()):
        f = arma(w, at.get("weapon", w), en, es)
        primera = usadas[quienes[0]]
        f["faction"] = primera["faction"]
        f["kind"] = at.ruta("weapon", w).split("/")[2] if at.ruta("weapon", w).count("/") > 2 else None
        f["usedBy"] = sorted(set(quienes))
        if not f["icon"]:
            f["icon"], f["iconFromUnit"] = primera["icon"], True
        fichas_armas.append(f)
    for u in unidades:
        nombres = {f["slug"]: f["name"] for f in fichas_armas}
        u["weapons"] = [{**x, "name": nombres.get(x["slug"])} for x in u["weapons"]]

    # --- Boletines de inteligencia.
    boletines = []
    for nombre, ruta in sorted(at.idx.get("intel_bulletin", {}).items()):
        b = (at.get("intel_bulletin", nombre) or {}).get("intel_bag") or {}
        # La raza viene en una lista (un boletín puede servir a varias): todas las que sean facciones de multijugador.
        razas = [r for r in _ordenadas(_strings(b.get("server_item") or {}, set())) if r in FACCION]
        n = t(b.get("name"))
        if n and razas:
            boletines.append({"slug": nombre, "name": n, "faction": FACCION[razas[0]], "factions": [FACCION[r] for r in razas],
                              "icon": b.get("icon") or None, "desc": t(b.get("description")) or t(b.get("description_short"))})

    # --- Íconos.
    (PUBLIC / "i").mkdir(parents=True, exist_ok=True)
    guardados: set[str] = set()

    def icono(nombre: str | None, lado: int) -> str | None:
        if not nombre:
            return None
        if nombre in guardados:
            return nombre
        im = gfx.crop(nombre)
        if im is None:
            return None
        if max(im.size) > lado:
            im.thumbnail((lado, lado))
        im.save(PUBLIC / "i" / f"{nombre}.webp", quality=88)
        guardados.add(nombre)
        return nombre

    for u in unidades:
        u["icon"] = icono(u["icon"], 64)
        u["symbol"] = icono(u["symbol"], 36)
        for x in u["upgrades"] + u["abilities"]:
            x["icon"] = icono(x["icon"], 64)
    for w in fichas_armas:
        w["icon"] = icono(w["icon"], 64)
    for c in comandantes:
        c["icon"] = icono(c["icon"], 128)
        for h in c["abilities"]:
            h["icon"] = icono(h["icon"], 64)
    for b in boletines:
        b["icon"] = icono(b["icon"], 64)
    (PUBLIC / "f").mkdir(parents=True, exist_ok=True)
    for raza, f in FACCION.items():
        im = gfx.crop(f"Icons_factions_faction_{raza}_128")
        if im is not None:
            im.save(PUBLIC / "f" / f"{f}.webp", quality=90)

    # --- Escritura.
    ahora = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    write_json(DATA / "meta.json", {"generatedAt": ahora, "tag": "coh2", "patch": None,
                                    "counts": {"units": len(unidades), "weapons": len(fichas_armas),
                                               "commanders": len(comandantes), "bulletins": len(boletines)}})
    _tab("units", unidades, lambda u: {k: u[k] for k in ("slug", "name", "faction", "kind", "icon", "cost", "hp", "armor",
                                                          "targetSize", "models", "bg")})
    _tab("weapons", fichas_armas, lambda w: {k: w[k] for k in ("slug", "name", "faction", "kind", "icon", "cls", "pen", "dist",
                                                                "acc", "dmg", "reload", "reloadEvery", "range")}
         | {"aoe": w["aoe"]["radius"] if w["aoe"] else None, "users": len(w["usedBy"]), "by": w["usedBy"][0]})
    _tab("commanders", comandantes, lambda c: {k: c[k] for k in ("slug", "name", "faction", "icon")} | {"image": None})
    write_json(DATA / "bulletins.json", {"generatedAt": ahora, "list": boletines})
    por = {}
    for u in unidades:
        por[u["faction"]] = por.get(u["faction"], 0) + 1
    print(f"coh2: {len(unidades)} unidades {por}, {len(fichas_armas)} armas, {len(comandantes)} comandantes, "
          f"{len(boletines)} boletines, {len(guardados)} íconos")


def _ordenadas(xs: set) -> list:
    """Las razas en el orden de `FACCION` (así la primera es estable)."""
    return [r for r in FACCION if r in xs]


def _buscar_todo(o, clave: str) -> list:
    """Todos los valores con esa clave, en cualquier nivel."""
    out = []
    if isinstance(o, dict):
        for k, v in o.items():
            if k == clave:
                out.append(v)
            out.extend(_buscar_todo(v, clave))
    elif isinstance(o, list):
        for v in o:
            out.extend(_buscar_todo(v, clave))
    return out


def _buscar(o, clave: str):
    """El primer valor con esa clave en cualquier nivel."""
    if isinstance(o, dict):
        if clave in o:
            return o[clave]
        for v in o.values():
            r = _buscar(v, clave)
            if r is not None:
                return r
    elif isinstance(o, list):
        for v in o:
            r = _buscar(v, clave)
            if r is not None:
                return r
    return None


def _tab(nombre: str, fichas: list, fila) -> None:
    base = DATA / nombre
    if (base / "f").exists():
        shutil.rmtree(base / "f")
    write_json(base / "list.json", [fila(x) for x in fichas])
    partes: dict = {}
    for x in fichas:
        partes.setdefault(shard(x["slug"]), {})[x["slug"]] = x
    for n in range(CHUNKS):
        write_json(base / "f" / f"{n:02d}.json", partes.get(n, {}))


if __name__ == "__main__":
    main(sys.argv[1:])
