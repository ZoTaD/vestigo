"""
Project Zomboid → el grafo de fabricación entero en un archivo, para el planificador de la pestaña Fabricación
(2026-10-02).

Lee lo mismo que `site.py` (los datos que escribió `extract.py` en games/zomboid/data, sin tocar el juego) y, si ya
está, el botín por objeto de `loot.py` (data/loot/items/*.json). Escribe:

  games/zomboid/data/craft.json   las 1.170 recetas reducidas a lo que necesita el motor (qué gasta, qué usa de
                                  herramienta, qué da, dónde se hace, qué habilidad pide y cómo se aprende), los objetos
                                  que nombran (nombre, ícono, usos de un drenable, si se encuentra y dónde), qué recetas
                                  da cada objeto, las estaciones con las construcciones que las dan, y los rasgos y
                                  profesiones que enseñan recetas. La forma está en `CraftData`
                                  (site/src/zomboid/crafting/data.ts).

Por qué un archivo y no las fichas repartidas de Recetas: el planificador arma un árbol que salta de receta en receta
(para la mesa, tablas; para las tablas, troncos y una sierra; para la sierra…) y no puede bajar una ficha por paso.
Va reducido: sin textos, sin tiempos y con los objetos por slug; los nombres, una vez en `items`.

Las opciones de cada línea son las de la ficha de receta (`Site.recipe_input`), en el mismo orden: el árbol y la
ficha nunca se contradicen (lo prueba site/test/zomboidCraftData.test.ts).

Uso: lo llama `extract.py` al final, después de `site.py`; o solo, sin volver a leer el juego (después de `loot.py`,
para sumar dónde se encuentra cada cosa):
    python games/zomboid/tools/craft.py

Como el resto: el mismo orden siempre y el archivo se reescribe sólo si cambió.
"""
import glob, gzip, importlib.util, json, os, sys
from collections import Counter, defaultdict

# site.py se carga por su ruta: `import site` daría el módulo de la biblioteca estándar (ver el docstring de site.py).
_spec = importlib.util.spec_from_file_location("zomboid_site", os.path.join(os.path.dirname(__file__), "site.py"))
zs = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(zs)

ROOT = zs.ROOT
DATA = zs.DATA
OUT = os.path.join(DATA, "craft.json")
LOOT = os.path.join(DATA, "loot", "items")

# El corte de "raro" de `band()` en site/src/zomboid/loot/chance.ts: lo que aparece en su mejor lugar menos que esto
# (menos de un mueble cada 200) no se cuenta como "se encuentra": conviene fabricarlo.
FOUND = 0.005


def load_loot():
    """{slug: ItemLoot} de loot.py, o None si todavía no se corrió (el planificador anda sin botín)."""
    paths = sorted(glob.glob(os.path.join(LOOT, "*.json")))
    if not paths:
        return None
    out = {}
    for p in paths:
        with open(p, encoding="utf-8") as f:
            out.update(json.load(f))
    return out


def best_chance(L):
    """La mejor chance del objeto en cualquier lado: habitación, escondite, zombi, atuendo, vehículo o bolso."""
    ps = [r[2] for r in L.get("rooms", [])] + [r[2] for r in L.get("stash", [])]
    z = L.get("zombie")
    if z:
        ps += [z.get("m", 0), z.get("f", 0)] + [o[1] for o in z.get("outfits", [])]
    ps += [v[2] for v in L.get("vehicles", [])] + [b[1] for b in L.get("bags", [])]
    return max(ps, default=0)


def build(s):
    granted = s.granted()
    item_entry = {e["id"]: e for e in s.item_entries}
    named = set()   # todo objeto que nombra alguna receta (entradas, salidas, libros, investigables)
    recipes = {}
    outs_of = {}    # slug de receta → slugs de objeto que da
    used_traits, used_profs = set(), set()

    for e in s.recipe_entries:  # el orden del índice
        r = s.recipes[e["ref"][0]]
        cat = r.get("category") or zs.NO_CATEGORY
        ficha_in = [s.recipe_input(io) for io in r["inputs"]]
        lines = []
        for k, io in enumerate(r["inputs"]):
            fi = ficha_in[k]
            line = {"n": zs.split_count(io.get("fluid", io.get("count")))[0]}
            if io.get("mode") == "keep":
                line["k"] = 1
            line["o"] = [ref["id"] for ref in fi["opts"]]
            on = {o["id"]: o["n"] for o in fi["opts"] if "n" in o}
            if on:
                line["on"] = on
            if "ItemCount" in io.get("flags", []):
                line["ic"] = 1
            if "fluid" in io:
                line["fl"] = fi["fluid"]
            if io.get("any"):
                line["any"] = 1
            named.update(line["o"])
            lines.append(line)

        ficha_out = []
        outs = []
        for o in r.get("outputs", []):
            fo = s.recipe_output(r, e, o)
            if fo is None:
                continue  # lo que la ficha descarta (un objeto sin ficha) tampoco va acá
            ficha_out.append(fo)
            if "entity" in fo:
                outs.append({"e": 1})
            elif "item" in fo:
                outs.append({"n": fo["n"], "i": fo["item"]["id"]})
            else:
                outs.append({"n": fo["n"],
                             "m": [[c["item"]["id"], [x["id"] for x in c["from"]]] for c in fo["choices"]],
                             "mi": [k for k, io in enumerate(r["inputs"]) if o["mapper"] in io.get("mappers", [])]})
        produced = []
        for o in outs:
            for slug in ([o["i"]] if "i" in o else [c[0] for c in o.get("m", [])]):
                if slug not in produced:
                    produced.append(slug)
        named.update(produced)
        outs_of[e["id"]] = produced

        rec = {"en": e["en"], "es": e["es"], "kind": r["kind"], "cat": cat, "icon": s.recipe_icon(r, ficha_out),
               "in": lines, "out": outs}
        sk = [[ref["id"], v] for k, v in r.get("skills", {}).items() for ref in [s.skill_ref(k)] if ref]
        if sk:
            rec["sk"] = sk
        xp = [[ref["id"], v] for k, v in r.get("xp", {}).items() for ref in [s.skill_ref(k)] if ref]
        if xp:
            rec["xp"] = xp
        st = [k for k in r.get("stations", []) if k in s.stations]
        if st:
            rec["st"] = st
        fl = s.recipe_learn(r, granted)
        if fl is not None:
            raw = r.get("learn", {})
            skills = raw.get("autoLearnAll") or raw.get("autoLearnAny") or {}
            learn = {"books": [x["id"] for x in fl["books"]],
                     "lv": [[ref["id"], v] for k, v in skills.items() for ref in [s.skill_ref(k)] if ref]}
            if fl.get("anySkill"):
                learn["anyLv"] = 1
            learn["research"] = [x["id"] for x in fl["research"]]
            learn["traits"] = [x["id"] for x in fl["traits"]]
            learn["profs"] = [x["id"] for x in fl["professions"]]
            named.update(learn["books"])
            named.update(learn["research"])
            used_traits.update(learn["traits"])
            used_profs.update(learn["profs"])
            rec["learn"] = learn
        recipes[e["id"]] = rec

    # --- Qué da cada objeto (en el orden del índice de recetas, sin repetir) ------------------------------------------
    makes = defaultdict(list)
    for rid, produced in outs_of.items():
        for slug in produced:
            if rid not in makes[slug]:
                makes[slug].append(rid)
    makes = dict(makes)

    # --- `x`: las recetas que el motor no elige solas para un paso intermedio ----------------------------------------
    # Como paso intermedio nadie quiere "para la cuerda, desatá un cinturón de cuerda" ni "para los clavos, abrí una
    # caja de clavos": esas recetas sólo andan si ya tenés el resultado de otra forma. Como objetivo, en cambio, todas
    # valen (el motor ignora `x` en la raíz), y en el árbol se pueden elegir a mano.
    def spent(rec):
        # Las líneas que se gastan y nombran objetos: ni herramientas, ni líquidos, ni "cualquier cosa".
        return [l for l in rec["in"] if not l.get("k") and "fl" not in l and not l.get("any")]

    consumers = defaultdict(set)  # slug de objeto → recetas que lo gastan
    for rid, rec in recipes.items():
        for l in spent(rec):
            for o in l["o"]:
                consumers[o].add(rid)

    for rid, rec in recipes.items():
        produced = set(outs_of[rid])
        lines = spent(rec)
        x = None
        if rec["cat"] == "Packing":
            x = "pack"
        elif rec["cat"] == "Repair":
            x = "repair"
        elif any(l["o"] and set(l["o"]) <= produced for l in lines):
            # Lo que da vuelve a ser lo que gasta (rellenar el farol, recargar, rebanar el salame): no lleva a ningún
            # lado. Tienen que ser TODAS las opciones de la línea: forjar una hoja de espada acepta la misma hoja para
            # reforjarla, pero la opción de verdad es la barra de acero, y ésa sí se elige sola (igual cortar barras o
            # fundir objetos en el crisol).
            x = "self"
        elif len(lines) == 1:
            # Deshace a otra: hay una receta que gasta lo que ésta da y da lo que ésta gasta. Las de desarmar y los
            # pares hacer/deshacer (atar y desatar, apilar y desapilar).
            opts = set(lines[0]["o"])
            others = {r2 for o in produced for r2 in consumers.get(o, ())} - {rid}
            if any(opts & set(outs_of[r2]) for r2 in others):
                x = "undo"
        if x:
            rec["x"] = x

    # --- Estaciones: nombre y las construcciones que las dan -----------------------------------------------------------
    builds_of = defaultdict(list)  # entidad del juego → slugs de recetas de construcción, en el orden del índice
    for e in s.recipe_entries:
        r = s.recipes[e["ref"][0]]
        if r["kind"] != "build" or not recipes[e["id"]]["out"]:
            continue
        for o in r.get("outputs", []):
            if "entity" in o:
                builds_of[o["entity"]].append(e["id"])
    used_st = {k for rec in recipes.values() for k in rec.get("st", [])}
    stations = {}
    for k, st in s.stations.items():  # el orden de recipes.json
        if k not in used_st:
            continue
        # En el orden de `entities`: en las forjas, la primitiva primero (la que se puede hacer sin otra forja).
        bl = []
        for ent in st.get("entities", []):  # el taladro de pie no tiene construcción que lo dé
            for rid in builds_of.get(ent, []):
                if rid not in bl:
                    bl.append(rid)
        stations[k] = {**zs.loc(st["name"]), "builds": bl}

    # --- Rasgos y profesiones -------------------------------------------------------------------------------------------
    # Rasgos: los que enseñan alguna receta. Profesiones: las que enseñan alguna directo, más las que la enseñan por un
    # rasgo gratis (el planificador dice "lo sabe el carpintero" aunque la receta la dé el rasgo que trae).
    trait_slug = {}
    for tid in s.traits:
        ref = s.trait_ref(tid, "traits")
        if ref:
            trait_slug[tid] = ref
    traits = {}
    for tid, ref in sorted(trait_slug.items(), key=lambda x: x[1]["id"]):
        if ref["id"] in used_traits:
            traits[ref["id"]] = {"en": ref["en"], "es": ref["es"], "icon": ref["icon"]}
    profs = {}
    prof_refs = [(pid, s.trait_ref(pid, "professions")) for pid in s.professions]
    for pid, ref in sorted(((p, r) for p, r in prof_refs if r), key=lambda x: x[1]["id"]):
        free = []
        for tid in s.professions[pid].get("traits", []):
            t = trait_slug.get(tid)
            if t and t["id"] in traits and t["id"] not in free:
                free.append(t["id"])
        if ref["id"] in used_profs or free:
            profs[ref["id"]] = {"en": ref["en"], "es": ref["es"], "icon": ref["icon"], "traits": free}

    # --- Objetos ---------------------------------------------------------------------------------------------------------
    loot = load_loot()
    items = {}
    for slug in (e["id"] for e in s.item_entries):  # el orden del índice
        if slug not in named:
            continue
        e = item_entry[slug]
        first = s.full[e["ref"][0]]
        it = {"en": e["en"], "es": e["es"], "icon": first["icon"],
              "c": recipes[makes[slug][0]]["cat"] if slug in makes else ""}
        # Un drenable (cordel, hilo, cinta) se gasta por usos: lleno trae round(1/useDelta). Sin `u`, por unidad.
        delta = first.get("stats", {}).get("useDelta")
        if first["type"] == "drainable" and isinstance(delta, (int, float)) and delta > 0:
            it["u"] = max(1, round(1 / delta))
        L = loot.get(slug) if loot else None
        if L:
            if best_chance(L) >= FOUND:
                it["f"] = 1
            if L.get("rooms"):
                r0 = L["rooms"][0]
                it["w"] = [r0[0], r0[1], r0[2], L["nRooms"]]
        items[slug] = it
    missing = named - set(items)
    if missing:
        raise SystemExit(f"Recetas que nombran objetos sin ficha en index.json: {sorted(missing)[:10]}. "
                         "No se escribió nada: hay que volver a correr extract.py.")

    used_cats = {rec["cat"] for rec in recipes.values()}
    cats = {c: zs.loc(s.recipe_cats.get(c, {"en": c, "es": c})) for c in sorted(used_cats)}
    with open(os.path.join(DATA, "meta.json"), encoding="utf-8") as f:
        version = json.load(f).get("version")

    data = {
        "v": version,
        "loot": loot is not None,
        "cats": cats,
        "items": items,
        "recipes": recipes,
        "makes": makes,
        "stations": stations,
        "skills": {ref["id"]: {"en": ref["en"], "es": ref["es"]}
                   for k in s.skills for ref in [s.skill_ref(k)] if ref},
        "traits": traits,
        "profs": profs,
        "counts": {"craftable": len(makes), "builds": sum(r["kind"] == "build" for r in recipes.values()),
                   "multi": sum(len(v) > 1 for v in makes.values()), "recipes": len(recipes)},
    }
    return data


def main():
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="backslashreplace")
    s = zs.Site()
    data = build(s)
    # Una línea que se gasta sin opciones (ni líquido ni "cualquier cosa") no se puede cumplir: el árbol quedaría trabado.
    empty_lines = [f"{rid}#{k}" for rid, r in data["recipes"].items() for k, l in enumerate(r["in"])
                   if not l["o"] and not l.get("k") and "fl" not in l and not l.get("any")]
    body = zs.dumps(data)
    if not os.path.exists(OUT) or open(OUT, encoding="utf-8").read() != body:
        with open(OUT, "w", encoding="utf-8", newline="\n") as f:
            f.write(body)
    raw = body.encode("utf-8")
    c = data["counts"]
    xs = Counter(r["x"] for r in data["recipes"].values() if "x" in r)
    found = sum(1 for it in data["items"].values() if it.get("f"))
    print(f"Fabricación (craft.json): {c['recipes']} recetas ({c['builds']} de construcción), {c['craftable']} objetos "
          f"fabricables, {c['multi']} con más de una receta, {len(data['items'])} objetos nombrados")
    print("  no se eligen solas: " + ", ".join(f"{k} {v}" for k, v in sorted(xs.items())))
    print(f"  botín: {'sí' if data['loot'] else 'no (falta correr loot.py)'}; se encuentran (≥ {FOUND:.1%}): {found}")
    print(f"  peso: {len(raw) / 1024:.0f}/{len(gzip.compress(raw, 9)) / 1024:.0f} KB (crudo/gzip)")
    if empty_lines:
        print(f"  AVISO: {len(empty_lines)} líneas que se gastan quedaron sin opciones: {empty_lines[:10]}", file=sys.stderr)
    for what, ids in sorted(s.dropped.items()):
        print(f"  AVISO: {len(ids)} {what} nombrados sin ficha (quedaron sin enlace): {sorted(ids)[:10]}", file=sys.stderr)


if __name__ == "__main__":
    main()
