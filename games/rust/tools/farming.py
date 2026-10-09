"""
Rust → los datos de la pestaña Granjas (2026-10-09). Plan: docs/superpowers/plans/2026-10-09-rust-granjas.md.

Lee la caché cruda del cliente (`games/rust/cache/farming/`, `localization/`, `sprites/`; ver su README) más lo que
es código (`farming_overrides.py`, del decompilado) y escribe:

  games/rust/data/farming.json               plantas, genética, jardineras, compost, animales y caballos
  games/rust/data/site/farming-slugs-es.json  los slugs en español de las fichas de plantas (`{"farming": {...}}`)
  site/public/rust/farming/<nombre>.webp     los retratos de los animales y las razas de caballo (64 px)

No abre bundles: corre en un segundo y no necesita el juego. Uso, desde la raíz del repo:
    python games/rust/tools/farming.py
"""
import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(__file__))
import farming_overrides as fo  # noqa: E402
from extract import slugify, text_of  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
CACHE = Path(os.environ.get("RUST_CACHE_DIR", ROOT / "games" / "rust" / "cache"))
DATA = ROOT / "games" / "rust" / "data"
PICS = ROOT / "site" / "public" / "rust" / "farming"
PIC_SIZE = 64

# `PlantProperties.State` (PlantProperties.cs): el índice de cada etapa en `stages`.
STATES = ["seed", "seedling", "sapling", "crossbreed", "mature", "fruiting", "ripe", "dying"]


def load(rel):
    with open(CACHE / rel, encoding="utf-8") as f:
        return json.load(f)


def read_texts():
    return {lang: load(f"localization/{lang}/engine.json") for lang in ("en", "es-es")}


def loc(texts, token, fallback=""):
    en = text_of(texts, "en", token) if token else None
    es = text_of(texts, "es-es", token) if token else None
    return {"en": en or fallback, "es": es}


class Items:
    """Los objetos de `items.json` (para enlazar fichas) y el mapa GameObject → shortname de la caché."""

    def __init__(self, items, cached):
        self.by_id = {i["id"]: i for i in items}
        self.lower = {i.lower(): i for i in self.by_id}
        self.go = {}
        for c in cached:
            go = c["data"]["m_GameObject"]["name"]
            self.go[strip_item(go)] = c["sid"]

    def sid_of_go(self, go):
        """El shortname de un GameObject de objeto (`meat.deer.burned.item.prefab` → `deermeat.burned`), o None."""
        name = strip_item(os.path.basename(go))
        if name in self.go:
            return self.go[name]
        if name in fo.GO_TO_SHORTNAME:
            return fo.GO_TO_SHORTNAME[name]
        cands = [name, name.replace("_", ".")]
        m = re.fullmatch(r"meat\.(\w+)\.(raw|cooked|burned|spoiled)", name)
        if m:
            animal, state = m.groups()
            cands += [f"{animal}meat.{state}", f"{animal}meat"] if state == "raw" else [f"{animal}meat.{state}"]
        cands.append(f"fish.{name}")
        for c in cands:
            if c.lower() in self.lower:
                return self.lower[c.lower()]
        return None

    def ref(self, sid):
        it = self.by_id.get(sid)
        if not it:
            return {"id": sid, "slug": None, "name": {"en": sid, "es": None}}
        return {"id": sid, "slug": it.get("slug"), "name": it["name"]}

    def ref_go(self, go_ref):
        if not go_ref:
            return None
        sid = self.sid_of_go(go_ref.get("go") or go_ref.get("name") or "")
        return self.ref(sid) if sid else None


def strip_item(name):
    name = name[:-7] if name.endswith(".prefab") else name
    return name[:-5] if name.endswith(".item") else name


def curve(c):
    return [(k["time"], k["value"]) for k in c["m_Curve"]]


def temp_range(points):
    """Dónde crece (calidad > 0) y la temperatura ideal (la de valor más alto), en °C, de la curva de felicidad."""
    best = max(points, key=lambda p: p[1])[0]
    zeros = [t for t, v in points if v == 0]
    low = max((t for t in zeros if t < best), default=None)
    high = min((t for t in zeros if t > best), default=None)
    return {"min": low, "max": high, "best": best}


def num(x):
    return int(x) if float(x).is_integer() else round(x, 4)


def genes(texts, props):
    """Los pesos del cliente en el orden del enum (`farming_overrides.GENE_ORDER`), con el nombre de cada gen."""
    weights = props[0]["data"]["Weights"]
    if len(weights) != len(fo.GENE_ORDER):
        raise SystemExit(f"[rust] los genes son {len(weights)}, se esperaban {len(fo.GENE_ORDER)}: revisar farming_overrides")
    names = {}
    for lang, key in (("en", "en"), ("es-es", "es")):
        desc = text_of(texts, lang, "genesdesc") or ""
        for m in re.finditer(r"<color=\w+>(\w)</color>\s*-\s*([^\n]+?)\.?\s*(?:\n|$)", desc):
            names.setdefault(m.group(1), {})[key] = m.group(2).strip()
    out = []
    for letter, w in zip(fo.GENE_ORDER, weights):
        n = names.get(letter, {})
        out.append({
            "letter": letter, "positive": fo.GENE_POSITIVE[letter], "name": {"en": n.get("en", letter), "es": n.get("es")},
            "base": num(w["BaseWeight"]), "cross": num(w["CrossBreedingWeight"]),
        })
    return out


def plant_of(texts, items, p):
    d = p["data"]
    name = loc(texts, d["Description"]["token"], d["Description"].get("legacyEnglish", ""))
    stages = [{
        "state": STATES[i], "minutes": num(s["lifeLength"]), "yield": num(s["yield"]), "resources": num(s["resources"]),
        **({"fixed": True} if s["IgnoreConditions"] else {}),
    } for i, s in enumerate(d["stages"])]
    harvest = items.ref_go(d["pickupItem"])
    clone = items.ref_go(d["CloneItem"])
    return {
        "id": slugify(name["en"]),
        "slugEs": slugify(name["es"] or name["en"]),
        "key": d["m_Name"].replace(".plantproperty", ""),
        "name": name,
        "stages": stages,
        "water": num(d["WaterIntake"]),
        "optimal": {k: num(d[f"Optimal{k.title()}Quality"]) for k in ("light", "water", "ground", "temperature")},
        "temp": temp_range(curve(d["temperatureHappiness"])),
        "light": temp_range(curve(d["timeOfDayHappiness"]))["best"],
        # El ícono de la planta es el de lo que da; el cáñamo da tela, y ahí va el de su esqueje.
        "icon": clone["id"] if harvest["id"] == "cloth" else harvest["id"],
        "harvest": {"item": harvest, "mult": d["pickupMultiplier"], "max": d["maxHarvests"]},
        "seed": items.ref_go(d["SeedItem"]),
        "clone": clone,
        "clones": d["BaseCloneCount"],
        "market": d["BaseMarketValue"],
        "seasons": d["MaxSeasons"],
    }


def planters(items, rows):
    out, seen = [], set()
    for r in rows:
        tgt = (r["data"].get("pickup") or {}).get("itemTarget")
        if not tgt or "respawning" in (r["ctx"].get("go") or ""):
            continue
        ref = items.ref_go(tgt)
        # Sin ficha (un objeto oculto, como la jardinera de vía del DLC que ya no se vende): afuera.
        if not ref or not ref["slug"] or ref["id"] in seen:
            continue
        seen.add(ref["id"])
        out.append({"item": ref, "water": r["data"]["soilSaturationMax"], "pot": bool(r["data"]["PlantPot"])})
    return sorted(out, key=lambda x: (-x["water"], x["item"]["id"]))


def compost(items, rows):
    """Cuánto abono da cada objeto en el compostador (una vez por objeto, sin las copias de cada escena)."""
    by = {}
    missing = []
    for r in rows:
        sid = items.sid_of_go(r["ctx"]["go"])
        if not sid:
            missing.append(r["ctx"]["go"])
            continue
        by[sid] = num(r["data"]["TotalFertilizerProduced"])
    if missing:
        raise SystemExit(f"[rust] compostables sin objeto: {sorted(set(missing))[:10]} (sumarlos a GO_TO_SHORTNAME)")
    return [{"item": items.ref(sid), "fert": v} for sid, v in sorted(by.items(), key=lambda kv: (-kv[1], kv[0]))]


def first(rows):
    return rows[0]["data"]


def animals(items, texts):
    coop = first(load("farming/ChickenCoop.json"))
    hen = first(load("farming/FarmableAnimal.json"))
    hive = first(load("farming/Beehive.json"))
    cow = next(r["data"] for r in load("farming/Cow.json") if r["ctx"]["go"].endswith("/cow.prefab"))
    sheep = next(r["data"] for r in load("farming/Sheep.json") if r["ctx"]["go"].endswith("/sheep.prefab"))
    sprinkler = first(load("farming/Sprinkler.json"))
    comp = first(load("farming/Composter.json"))
    biofuel = first(load("farming/BiofuelGenerator.json"))
    trough = first(load("farming/HitchTrough.json"))
    lights = [items.ref_go({"go": r["data"]["pickup"]["itemTarget"]["go"]}) for r in load("farming/CeilingLight.json")
              if r["data"].get("shouldAffectGrowables") and (r["data"].get("pickup") or {}).get("itemTarget")]
    heater = first(load("farming/ElectricalHeater.json"))
    shear = sheep["ShearItems"][0]
    return {
        "composter": {
            "item": items.ref_go(comp["pickup"]["itemTarget"]), "slots": comp["inputSlots"], "out": items.ref_go(comp["FertilizerDef"]),
            "interval": fo.COMPOST_INTERVAL,
        },
        "sprinkler": {"item": items.ref_go(sprinkler["sourceItem"]), "water": sprinkler["WaterPerSplash"], "every": num(sprinkler["SplashFrequency"])},
        "lights": [l for l in lights if l],
        "heater": items.ref_go(heater["sourceItem"]),
        "chickens": {
            "coop": items.ref_go(coop["pickup"]["itemTarget"]), "max": coop["MaxChickens"], "hatch": num(coop["ChickenHatchTimeMinutes"]),
            "egg": items.ref_go(hen["ItemToCreate"]), "every": [num(hen["MinimumMinutesBetweenProduction"]), num(hen["MaximumMinutesBetweenProduction"])],
        },
        "beehive": {
            "item": items.ref_go(hive["pickup"]["itemTarget"]), "comb": items.ref_go(hive["HoneyCombDefinition"]),
            "nucleus": items.ref_go(hive["BeeNucleusDefinition"]),
        },
        "trough": items.ref_go(trough["pickup"]["itemTarget"]),
        "biofuel": {"item": items.ref_go(biofuel["sourceItem"]), "waste": [items.ref_go(w) for w in biofuel["wasteItems"] if items.ref_go(w)]},
        "livestock": [
            {"species": "cow", "grow": num(cow["TimeToGrow"]), "pregnant": num(cow["PregnantDuration"]),
             "product": {"item": items.ref_go(cow["MilkDef"]), "amount": cow["MilkAmount"], "cooldown": num(cow["MilkCooldown"])},
             "dung": {"item": items.ref_go(cow["DungItem"]), "every": num(cow["DungInterval"])}, "herd": [cow["ComfortableHerdSize"], cow["CrowdedHerdSize"]]},
            {"species": "sheep", "grow": num(sheep["TimeToGrow"]), "pregnant": num(sheep["PregnantDuration"]),
             "product": {"item": items.ref_go(shear["itemDef"]), "amount": num(shear["amount"]), "cooldown": num(sheep["ShearCooldown"])},
             "dung": {"item": items.ref_go(sheep["DungItem"]), "every": num(sheep["DungInterval"])}, "herd": [sheep["ComfortableHerdSize"], sheep["CrowdedHerdSize"]]},
        ],
    }


def horses(texts, refs):
    out = []
    for r in load("farming/HorseBreed.json"):
        d = r["data"]
        png = refs.get((d.get("trophyHeadSprite") or {}).get("unresolved") or "")
        out.append({
            "id": slugify(d["breedName"]["legacyEnglish"]),
            "name": loc(texts, d["breedName"]["token"], d["breedName"]["legacyEnglish"]),
            "health": num(d["maxHealth"]), "speed": num(d["maxSpeed"]), "stamina": num(d["maxStamina"]), "drain": num(d["staminaDrain"]),
            "pic": png[:-4] if png else None,
        })
    return out


def build():
    texts = read_texts()
    with open(DATA / "items.json", encoding="utf-8") as f:
        items_doc = json.load(f)
    cached = load("farming/items.json") + load("io/items.json")
    items = Items(items_doc["items"], cached)
    refs = load("sprites/refs.json")
    plants = sorted((plant_of(texts, items, p) for p in load("farming/PlantProperties.json")), key=lambda p: p["name"]["en"])
    doc = {
        "genes": genes(texts, load("farming/GrowableGeneProperties.json")),
        "rules": {
            "slots": fo.GENE_SLOTS, "radius": fo.CROSSBREED_RADIUS, "growthPerG": fo.GROWTH_PER_G, "yieldPerY": fo.YIELD_PER_Y,
            "waterPerW": fo.WATER_PER_W, "hardinessTemp": fo.HARDINESS_TEMP, "hardinessGround": fo.HARDINESS_GROUND,
            "planterGround": fo.PLANTER_GROUND, "fertilizerGround": fo.FERTILIZER_GROUND, "tick": fo.PLANT_TICK,
            "lightRange": fo.CEILING_LIGHT_RANGE, "heatRange": fo.HEAT_RANGE, "saturation": fo.OPTIMAL_SATURATION,
            "marketPerGene": fo.MARKET_PER_GENE,
        },
        "plants": plants,
        "planters": planters(items, load("farming/PlanterBox.json")),
        "compost": compost(items, load("farming/ItemModCompostable.json")),
        **animals(items, texts),
        "horses": horses(texts, refs),
    }
    pics = sorted({h["pic"] for h in doc["horses"] if h["pic"]} | {"CowAvatar", "SheepAvatar", "ChickenAvatar_White"})
    doc["animalPics"] = {"cow": "CowAvatar", "sheep": "SheepAvatar", "chicken": "ChickenAvatar_White"}
    slugs = {"farming": {"genetics": "genetica", **{p["id"]: p["slugEs"] for p in plants if p["slugEs"] != p["id"]}}}
    return doc, slugs, pics


def write_pics(pics):
    from PIL import Image
    PICS.mkdir(parents=True, exist_ok=True)
    for name in pics:
        dst = PICS / f"{name}.webp"
        if dst.exists():
            continue
        im = Image.open(CACHE / "sprites" / "png" / f"{name}.png").convert("RGBA").resize((PIC_SIZE, PIC_SIZE), Image.LANCZOS)
        im.save(dst, "WEBP", quality=82, method=6)


def dump(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")


def main():
    doc, slugs, pics = build()
    dump(DATA / "farming.json", doc)
    dump(DATA / "site" / "farming-slugs-es.json", slugs)
    write_pics(pics)
    print(f"[rust] granjas: {len(doc['plants'])} plantas, {len(doc['compost'])} compostables, {len(doc['horses'])} razas")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
