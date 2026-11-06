"""
La enciclopedia de Company of Heroes (relanzado, app 228200, con Opposing Fronts y Tales of Valor) (2026-11-06), de
los archivos del juego instalado: unidades, armas y doctrinas, con los formatos de CoH3 (como `games/coh2/tools/
site_data.py`). Corre a mano en la PC; lo que escribe se commitea.

    python games/coh1/tools/site_data.py [--root "C:/Program Files (x86)/Steam/steamapps/common"]

Diferencias con CoH2:
  - Las referencias son rutas (`sbps\\races\\allies\\soldiers\\rifleman_squad.lua`) y las listas vienen numeradas
    (`squad_01`, `upgrade_01`…). Los archivos de multijugador no tienen sufijo; los de campaña, `_sp`.
  - El daño no usa blindaje: cada arma trae multiplicadores por tipo de blanco (`target_table/tp_*`) y cada entidad su
    tipo (`type_ext/type_target_weapon`). Las armas guardan `targets: {tp: [precisión, daño, penetración, pen. trasera]}`
    y las unidades `target`.
  - Las doctrinas son árboles de mejoras con costo en puntos de mando (`commander_tree`), en `doctrines/`.
  - Los íconos son texturas `.rgt` (`games/coh/tools/rgt.py`) en `art/ui/ingame/`.
  - Textos: hoy sólo está el español instalado; sin inglés, el inglés es el español.
"""
import argparse
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parents[2]
sys.path.insert(0, str(RAIZ / "games" / "coh" / "tools"))
sys.path.insert(0, str(RAIZ / "games" / "coh3" / "tools"))
import importlib.util  # noqa: E402

# Las funciones comunes con CoH2 (`games/coh2/tools/site_data.py`): se carga por ruta, porque los dos se llaman igual.
_spec = importlib.util.spec_from_file_location("coh2_site_data", RAIZ / "games" / "coh2" / "tools" / "site_data.py")
c2 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(c2)
from coh3 import write_json  # noqa: E402
from rgd import Keys, parse  # noqa: E402
from rgt import decode  # noqa: E402
from sga import Sga  # noqa: E402
from ucs import load_ucs  # noqa: E402

STEAM = c2.STEAM
JUEGO = "Company of Heroes Relaunch"
DATA = RAIZ / "games" / "coh1" / "data"
PUBLIC = RAIZ / "site" / "public" / "coh1"
FACCION = {"allies": "american", "allies_commonwealth": "british", "axis": "wehrmacht", "axis_panzer_elite": "panzer_elite"}
TIPO = {"soldiers": "infantry", "vehicles": "vehicles", "buildings": "emplacements"}
# Fuera: campaña, pruebas y las copias "_reinforcement" que traen las doctrinas (las mismas unidades base).
FUERA = re.compile(r"(_sp($|_)|/sp_|_m\d\d|test|battle_sim|tutorial|la_fiere|trun|villers|_rpg|deadforever|campaign|reinforcement|eselschreck)")
ARCHIVOS_ARTE = ["WW2/Archives/WW2Art.sga", "WW2/Archives/WW2Data.sga", "DLC1/Archives/DLC1Data.sga", "DLC2/Archives/DLC2Data.sga",
                 "DLC3/Archives/DLC3Data.sga", "DLC1/Archives/DLC1ArtHigh.sga", "DLC2/Archives/DLC2ArtHigh.sga", "DLC3/Archives/DLC3ArtHigh.sga"]
# Los árboles de doctrina de multijugador (los otros son de misiones).
DOCTRINAS = re.compile(r"^(allied|axis|pe|royal)_")


# ------------------------------------------------------------------ funciones puras

def es_multijugador(ruta: str) -> bool:
    return not FUERA.search(ruta.lower().replace("\\", "/"))


def raza_de(ruta: str) -> str | None:
    p = ruta.replace("\\", "/").split("/")
    return p[2] if len(p) > 2 and p[1] == "races" else None


def ruta_ref(v: str | None) -> str:
    """`"sbps\\races\\allies\\soldiers\\rifleman_squad.lua"` → `"sbps/races/allies/soldiers/rifleman_squad"`."""
    s = (v or "").replace("\\", "/").lower()
    return s[:-4] if s.endswith(".lua") else s


def _smt(d) -> list | None:
    """Cerca, media y lejos de CoH1 (`short`, `medium`, `long`)."""
    return [c2._n(d.get(k)) for k in ("short", "medium", "long")] if isinstance(d, dict) and "short" in d else None


def tabla_blancos(b: dict) -> dict:
    """`{tp: [precisión, daño, penetración, pen. trasera]}` de la `target_table` de un arma."""
    out = {}
    for tp, e in (b.get("target_table") or {}).items():
        if isinstance(e, dict) and tp.startswith("tp_"):
            out[tp] = [c2._n(e.get(k, 1)) for k in ("accuracy_multiplier", "damage_multiplier", "penetration_multiplier",
                                                    "rear_penetration_multiplier")]
    return out


def arma(slug: str, d: dict, en: dict, es: dict) -> dict:
    b = d.get("weapon_bag") or {}
    rng = b.get("range") or {}
    nombre = c2.texto(b.get("ui_name"), en, es)
    codigo = c2.nombre_codigo(b.get("name") or slug)
    return {
        "slug": slug,
        "name": nombre or {"en": codigo, "es": codigo},
        "icon": b.get("icon_name") or None,
        "kind": None, "cls": None,
        "pen": _smt(b.get("penetration")),
        "dist": _smt(rng.get("distance")),
        "acc": _smt(b.get("accuracy")),
        "dmg": c2._mm(b.get("damage")),
        "dmgType": None,
        "aoe": None,
        "reload": c2._mm((b.get("reload") or {}).get("duration")),
        "reloadEvery": c2._mm((b.get("reload") or {}).get("frequency")),
        "burst": None,
        "cooldown": c2._mm((b.get("cooldown") or {}).get("duration")),
        "aim": {"fire": c2._mm((b.get("aim") or {}).get("fire_aim_time")), "ready": c2._mm((b.get("aim") or {}).get("ready_aim_time"))},
        "range": c2._mm(rng),
        "windup": None, "winddown": None,
        "moving": c2._n((b.get("moving") or {}).get("accuracy_multiplier")),
        "suppression": None,
        "targets": tabla_blancos(b),
    }


def _valores(o) -> list:
    """Los valores de una tabla numerada (`squad_01`, `squad_02`…), sin `$REF` ni vacíos."""
    if not isinstance(o, dict):
        return []
    return [v for k, v in sorted(o.items()) if k != "$REF" and v not in ("", None)]


def _rutas(o, out: set, prefijo: str, clave: str | None = None) -> set:
    """Las rutas que empiezan con `prefijo` en cualquier nivel (opcionalmente sólo bajo una clave que contenga `clave`)."""
    if isinstance(o, dict):
        for k, v in o.items():
            if clave is None or clave in k or isinstance(v, (dict, list)):
                _rutas(v, out, prefijo, clave if clave is None or clave not in k else None)
    elif isinstance(o, list):
        for v in o:
            _rutas(v, out, prefijo, clave)
    elif isinstance(o, str) and o.lower().replace("\\", "/").startswith(prefijo):
        out.add(ruta_ref(o))
    return out


# ------------------------------------------------------------------ lectura del juego

class Atributos:
    def __init__(self, sga: Sga):
        self.sga, self.keys, self._c = sga, Keys(), {}
        self.rutas = {p[len("attrib/"):-4] for p in sga.entries if p.startswith("attrib/") and p.endswith(".rgd")}

    def get(self, ruta: str) -> dict | None:
        r = ruta_ref(ruta)
        if r not in self.rutas:
            return None
        if r not in self._c:
            try:
                self._c[r] = parse(self.sga.read(f"attrib/{r}.rgd"), self.keys)
            except ValueError:
                self._c[r] = {}
        return self._c[r]


def _entidad(d: dict) -> dict:
    h = d.get("health_ext") or {}
    c = (d.get("cost_ext") or {}).get("time_cost") or {}
    cc = c.get("cost") or {}
    armas = []
    for hp in _valores((d.get("combat_ext") or {}).get("hardpoints")):
        for w in _valores((hp or {}).get("weapon_table") if isinstance(hp, dict) else None):
            r = ruta_ref((w or {}).get("weapon")) if isinstance(w, dict) else ""
            if r:
                armas.append(r)
    tp = ((d.get("type_ext") or {}).get("type_target_weapon") or {}).get("$REF") or ""
    pop = d.get("population_ext") or {}
    return {
        # CoH1 no tiene blindaje numérico (lo reemplaza el tipo de blanco): sin `armor`.
        "hp": h.get("hitpoints"), "armor": None, "ts": 1,
        "cost": {"mp": cc.get("manpower", 0), "mu": cc.get("munition", 0), "fu": cc.get("fuel", 0), "t": c.get("time_seconds", 0)},
        "pop": sum(pop.get(k) or 0 for k in ("personnel_pop", "vehicle_pop")),
        "speed": (d.get("moving_ext") or {}).get("speed_max"),
        "sight": ((d.get("sight_ext") or {}).get("sight_package") or {}).get("outer_radius"),
        "weapons": armas,
        "target": ruta_ref(tp).rsplit("/", 1)[-1] or None,
    }


def main(argv: list[str]) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=STEAM)
    a = ap.parse_args(argv)
    base = Path(a.root) / JUEGO
    at = Atributos(Sga(base / "WW2/Archives/AttribArchive.sga"))
    es = load_ucs(base / "CoH/Engine/Locale/Spanish/RelicCOH.Spanish.ucs")
    en_f = base / "CoH/Engine/Locale/English/RelicCOH.English.ucs"
    en = load_ucs(en_f) if en_f.exists() else es
    if not en_f.exists():
        print("  sin textos en inglés: el inglés va igual al español hasta que estén instalados")
    t = lambda ref: c2.texto(ref, en, es)  # noqa: E731
    artes = [Sga(base / x) for x in ARCHIVOS_ARTE if (base / x).exists()]

    # --- Doctrinas.
    doctrinas, upg_doctrina = [], {}
    for r in sorted(x for x in at.rutas if x.startswith("commander_tree/")):
        nombre = r.split("/")[-1]
        if not DOCTRINAS.match(nombre):
            continue
        b = (at.get(r) or {}).get("commander_tree_bag") or {}
        n = t(b.get("name"))
        if not n:
            continue
        filas: dict[int, list] = {}
        for k, v in b.items():
            m = re.match(r"upgrade_row(\d+)_col(\d+)$", k)
            if m and v:
                filas.setdefault(int(m.group(1)), []).append((int(m.group(2)), ruta_ref(v)))
        ramas = []
        for fila in sorted(filas):
            mejoras = []
            for _, u in sorted(filas[fila]):
                ub = (at.get(u) or {}).get("upgrade_bag") or {}
                ui = ub.get("ui_info") or {}
                mejoras.append({"slug": u.split("/")[-1], "name": t(ui.get("screen_name")) or {"en": u, "es": u},
                                "icon": ui.get("icon_name") or None, "desc": t(ui.get("help_text")),
                                "cp": c2._n(((ub.get("time_cost") or {}).get("cost") or {}).get("command")), "unlocks": [], "_u": u})
                upg_doctrina[u] = nombre
            ramas.append({"name": {"en": f"Branch {fila + 1}", "es": f"Rama {fila + 1}"}, "upgrades": mejoras})
        lado = "allies" if nombre.startswith("allied") else "allies_commonwealth" if nombre.startswith("royal") else "axis_panzer_elite" if nombre.startswith("pe_") else "axis"
        doctrinas.append({"slug": nombre, "name": n, "faction": FACCION[lado], "icon": b.get("portrait_texture") or None,
                          "image": None, "desc": t(b.get("help_text_1")), "branches": ramas})

    # --- Escuadras: las que producen los edificios de multijugador, y las de doctrina.
    candidatas: dict[str, str | None] = {}
    desbloquea: dict[str, set] = {}
    for r in at.rutas:
        # Edificios y también vehículos: los británicos producen desde camiones que se despliegan.
        if r.startswith("ebps/races/") and es_multijugador(r) and raza_de(r) in FACCION:
            for s in _valores(((at.get(r) or {}).get("spawner_ext") or {}).get("squad_table")):
                candidatas.setdefault(ruta_ref(s), None)
    for r in at.rutas:
        if not r.startswith("abilities/"):
            continue
        d = at.get(r) or {}
        reqs = _rutas(d, set(), "upgrade/", "required")
        doc = next((upg_doctrina[u] for u in sorted(reqs) if u in upg_doctrina), None)
        if not doc:
            continue
        raza_doc = next(r for r, f in FACCION.items() if f == next(x["faction"] for x in doctrinas if x["slug"] == doc))
        for s in _rutas(d, set(), "sbps/", "squad_t") | _rutas(d, set(), "sbps/", "squad_to_spawn"):
            # Sólo escuadras de la raza de la doctrina.
            if raza_de(s) != raza_doc:
                continue
            candidatas.setdefault(s, doc)
            for u in reqs:
                if u in upg_doctrina:
                    desbloquea.setdefault(u, set()).add(s.split("/")[-1])

    unidades, armas_uso, ents_c = [], {}, {}
    repetidos: dict[str, int] = {}
    for sq in candidatas:
        if raza_de(sq) in FACCION and es_multijugador(sq):
            repetidos[sq.split("/")[-1]] = repetidos.get(sq.split("/")[-1], 0) + 1
    for sq, doc in sorted(candidatas.items()):
        raza = raza_de(sq)
        if raza not in FACCION or not es_multijugador(sq):
            continue
        d = at.get(sq) or {}
        ui = d.get("squad_ui_ext") or {}
        nombre = t(ui.get("screen_name"))
        if not nombre:
            continue
        reqs = _rutas(d.get("squad_requirement_ext") or {}, set(), "upgrade/")
        for u in reqs:
            if u in upg_doctrina:
                desbloquea.setdefault(u, set()).add(sq.split("/")[-1])
        if doc is None:
            doc = next((upg_doctrina[u] for u in sorted(reqs) if u in upg_doctrina), None)
        loadout = []
        for u in _valores((d.get("squad_loadout_ext") or {}).get("unit_list")):
            tipo = ruta_ref(((u or {}).get("type") or {}).get("type")) if isinstance(u, dict) else ""
            if tipo:
                loadout.append((tipo, u.get("num") or 1))
        for r, _ in loadout:
            if r not in ents_c:
                ents_c[r] = _entidad(at.get(r) or {})
        ents = {r: ents_c[r] for r, _ in loadout}
        if not ents:
            continue
        st = c2.stats_escuadra(loadout, ents)
        cuenta = {}
        for r, num in loadout:
            for w in ents[r]["weapons"]:
                cuenta[w] = cuenta.get(w, 0) + num
        armas = []
        for w, c in cuenta.items():
            wd = at.get(w)
            if not wd or not ((wd.get("weapon_bag") or {}).get("damage") or {}).get("max"):
                continue
            armas_uso.setdefault(w, []).append(sq)
            armas.append({"slug": w, "count": c2._n(c)})
        mejoras = []
        for u in _valores((d.get("squad_upgrade_ext") or {}).get("upgrades")):
            ub = (at.get(u) or {}).get("upgrade_bag") or {}
            uu = ub.get("ui_info") or {}
            nm = t(uu.get("screen_name"))
            if nm:
                cc = ((ub.get("time_cost") or {}).get("cost")) or {}
                mejoras.append({"slug": ruta_ref(u).split("/")[-1], "name": nm, "icon": uu.get("icon_name") or None, "desc": t(uu.get("help_text")),
                                "cost": {"mp": c2._n(cc.get("manpower", 0)), "mu": c2._n(cc.get("munition", 0)), "fu": c2._n(cc.get("fuel", 0))}})
        habilidades = []
        for h in _valores((d.get("squad_ability_ext") or {}).get("abilities")):
            hb = (at.get(h) or {}).get("ability_bag") or {}
            hu = hb.get("ui_info") or {}
            nm = t(hu.get("screen_name"))
            if nm:
                cc = hb.get("cost") or {}
                habilidades.append({"slug": ruta_ref(h).split("/")[-1], "name": nm, "icon": hu.get("icon_name") or None, "desc": t(hu.get("help_text")),
                                    "cost": {"mp": c2._n(cc.get("manpower", 0)), "mu": c2._n(cc.get("munition", 0)), "fu": c2._n(cc.get("fuel", 0))},
                                    "recharge": c2._n(hb.get("recharge_time"))})
        principal = max(ents.values(), key=lambda e: e.get("hp") or 0)
        kind = next((TIPO[p] for p in sq.split("/") if p in TIPO), "infantry")
        # El mismo nombre de archivo puede estar en dos razas: el slug lleva la facción si se repite.
        slug = sq.split("/")[-1]
        if repetidos.get(slug, 0) > 1:
            slug = f"{slug}_{FACCION[raza]}"
        unidades.append({
            "slug": slug, "name": nombre, "faction": FACCION[raza], "kind": kind,
            "icon": ui.get("icon_name") or None, "symbol": None, **st, "target": principal.get("target"),
            "role": t(ui.get("help_text")), "desc": t(ui.get("extra_text")), "upkeep": None,
            "upgrades": mejoras, "abilities": habilidades, "vet": [], "bg": doc, "builtIn": [], "weapons": armas, "_ruta": sq,
        })

    # Qué habilita cada mejora de doctrina.
    for dct in doctrinas:
        for rama in dct["branches"]:
            for m in rama["upgrades"]:
                u = m.pop("_u")
                slugs = {x["slug"] for x in unidades}
                m["unlocks"] = sorted(desbloquea.get(u, set()) & slugs)

    # --- Armas.
    fichas_armas = []
    por_slug = {u["_ruta"]: u for u in unidades}
    # El slug del arma es su nombre de archivo; si dos razas usan el mismo nombre, lleva la raza.
    tallos: dict[str, int] = {}
    for ruta in armas_uso:
        tallos[ruta.split("/")[-1]] = tallos.get(ruta.split("/")[-1], 0) + 1
    slug_arma = {r: (r.split("/")[-1] if tallos[r.split("/")[-1]] == 1 else f"{r.split('/')[-1]}_{r.split('/')[1]}") for r in armas_uso}
    for ruta, quienes in sorted(armas_uso.items()):
        slug = slug_arma[ruta]
        f = arma(slug, at.get(ruta), en, es)
        primera = por_slug[quienes[0]]
        f["faction"] = primera["faction"]
        f["kind"] = ruta.split("/")[2] if ruta.count("/") > 2 else None
        f["usedBy"] = sorted({por_slug[q]["slug"] for q in quienes if q in por_slug})
        if not f["icon"]:
            f["icon"], f["iconFromUnit"] = primera["icon"], True
        fichas_armas.append(f)
    nombres = {f["slug"]: f["name"] for f in fichas_armas}
    for u in unidades:
        u["weapons"] = [{**x, "slug": slug_arma[x["slug"]], "name": nombres.get(slug_arma[x["slug"]])} for x in u["weapons"]]
        u.pop("_ruta", None)

    # --- Íconos.
    (PUBLIC / "i").mkdir(parents=True, exist_ok=True)
    guardados: set[str] = set()

    def icono(nombre: str | None, lado: int) -> str | None:
        if not nombre:
            return None
        clave = nombre.replace("\\", "/").lower()
        clave = clave[:-4] if clave.endswith((".tga", ".rgt")) else clave
        archivo = re.sub(r"[^a-z0-9_-]+", "-", clave).strip("-")
        if archivo in guardados:
            return archivo
        ruta = f"art/ui/ingame/{clave}.rgt"
        for s in artes:
            if ruta in s.entries:
                im = decode(s.read(ruta))
                if im is None:
                    return None
                if max(im.size) > lado:
                    im.thumbnail((lado, lado))
                im.save(PUBLIC / "i" / f"{archivo}.webp", quality=88)
                guardados.add(archivo)
                return archivo
        return None

    for u in unidades:
        u["icon"] = icono(u["icon"], 64)
        for x in u["upgrades"] + u["abilities"]:
            x["icon"] = icono(x["icon"], 64)
    for w in fichas_armas:
        w["icon"] = icono(w["icon"], 64)
    for dct in doctrinas:
        dct["icon"] = icono(dct["icon"], 128)
        for rama in dct["branches"]:
            for m in rama["upgrades"]:
                m["icon"] = icono(m["icon"], 64)

    # --- Escritura (como CoH2).
    c2.DATA = DATA
    ahora = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    write_json(DATA / "meta.json", {"generatedAt": ahora, "tag": "coh1", "patch": None, "english": en_f.exists(),
                                    "counts": {"units": len(unidades), "weapons": len(fichas_armas), "doctrines": len(doctrinas)}})
    c2._tab("units", unidades, lambda u: {k: u[k] for k in ("slug", "name", "faction", "kind", "icon", "cost", "hp", "armor",
                                                             "targetSize", "models", "bg", "target")})
    c2._tab("weapons", fichas_armas, lambda w: {k: w[k] for k in ("slug", "name", "faction", "kind", "icon", "cls", "pen", "dist",
                                                                   "acc", "dmg", "reload", "reloadEvery", "range")}
            | {"aoe": None, "users": len(w["usedBy"]), "by": w["usedBy"][0]})
    c2._tab("doctrines", doctrinas, lambda d: {k: d[k] for k in ("slug", "name", "faction", "icon", "image")})
    por = {}
    for u in unidades:
        por[u["faction"]] = por.get(u["faction"], 0) + 1
    print(f"coh1: {len(unidades)} unidades {por}, {len(fichas_armas)} armas, {len(doctrinas)} doctrinas, {len(guardados)} íconos")


def _raza_en(faccion: str) -> str:
    return next(r for r, f in FACCION.items() if f == faccion)


if __name__ == "__main__":
    main(sys.argv[1:])
