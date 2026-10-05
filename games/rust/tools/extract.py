"""
Los datos de la sección Rust (2026-10-05), sacados del juego instalado. Diseño: docs/design/2026-10-05-rust.md.

Rust es Unity con IL2CPP, pero los bundles traen los typetrees: UnityPy lee cada MonoBehaviour con sus nombres de
campo. Esto escribe:
  - `games/rust/data/items.json`: cada objeto visible con sus textos oficiales en/es, categoría, pila, durabilidad y
    receta (los `ItemDefinition` e `ItemBlueprint` de `Bundles/shared/items.preload.bundle`);
  - `games/rust/data/home.json`: los objetos que muestra la portada;
  - `games/rust/data/meta.json`: el build de Steam, las cifras y el sello `extractedAt`, que sólo se mueve si cambian
    los datos (va al `lastmod` del sitemap);
  - `site/public/rust/items/<shortname>.webp`: los íconos (`Bundles/items/<shortname>.png`), a 128 px.

Uso, desde la raíz del repo:
    python games/rust/tools/extract.py
La instalación se busca en la carpeta de Steam por defecto, o en la variable de entorno RUST_DIR.
"""
import hashlib
import json
import os
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

import UnityPy
from PIL import Image

RUST_DIR = Path(os.environ.get("RUST_DIR", r"C:\Program Files (x86)\Steam\steamapps\common\Rust"))
BUNDLES = RUST_DIR / "Bundles"
# El manifiesto de Steam vive dos carpetas arriba del juego (`steamapps/appmanifest_252490.acf`).
MANIFEST = RUST_DIR.parent.parent / "appmanifest_252490.acf"
ROOT = Path(__file__).resolve().parents[3]
DATA = ROOT / "games" / "rust" / "data"
ICONS = ROOT / "site" / "public" / "rust" / "items"
# La portada muestra los casilleros a ~64 px; 128 alcanza para pantallas de doble densidad y para la ficha.
ICON_SIZE = 128

# El enum `ItemCategory` del juego. 11 (All), 12 (Common), 14 (Search) y 15 (Favourite) son filtros del inventario,
# no categorías de un objeto. Lo cuida un test contra los `Bundles/items/<shortname>.json`, que la traen por nombre.
CATEGORIES = {
    0: "weapon", 1: "construction", 2: "items", 3: "resources", 4: "attire", 5: "tool", 6: "medical", 7: "food",
    8: "ammunition", 9: "traps", 10: "misc", 13: "component", 16: "electrical", 17: "fun",
}
# El enum `Rarity` del juego.
RARITIES = {0: "none", 1: "common", 2: "uncommon", 3: "rare", 4: "veryrare"}
# Objetos de desarrollo que el juego dejó sin ocultar: no existen para el jugador (nombres como "Smoke Rocket WIP!!!!"
# y "Test Generator") y no tienen que entrar en las cifras ni tener ficha.
EXCLUDED = {"ammo.rocket.smoke", "electric.generator.small"}
# Los casilleros de la portada (estética A "Inventario"), en orden: lo que más se busca y los materiales de siempre.
HOME_ITEMS = [
    "rifle.ak", "explosive.timed", "rocket.launcher", "hazmatsuit", "syringe.medical", "lock.code",
    "metal.fragments", "sulfur", "scrap", "wood", "stones", "cloth",
]


def slugify(name):
    """
    El mismo `slugify` de `site/src/route.ts`, paso por paso: NFD y afuera lo que no es ASCII (la tilde se va y la
    letra queda), minúsculas, sin `'` ni `.`, lo demás a `-` y sin guiones en las puntas. Tienen que dar lo mismo: el
    sitio le pide a cada ficha su dirección con el suyo, así que si se cambia uno se cambia el otro (y el de
    `games/zomboid/tools/extract.py`).
    """
    s = unicodedata.normalize("NFD", name).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"['.]", "", s)
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def stamp(prev, digest, now):
    """El `extractedAt` nuevo: el de antes si los datos no cambiaron, para que el sitemap no mienta una fecha."""
    if prev and prev.get("hash") == digest and prev.get("extractedAt"):
        return prev["extractedAt"]
    return now


def read_build():
    """El build de Steam instalado (`"buildid"` del manifiesto)."""
    m = re.search(r'"buildid"\s+"(\d+)"', MANIFEST.read_text(encoding="utf-8"))
    if not m:
        raise SystemExit(f"No encontré el buildid en {MANIFEST}")
    return int(m.group(1))


def load_classes(path):
    """Los MonoBehaviour de un bundle, por nombre de clase: {clase: [(path_id, typetree)]}."""
    env = UnityPy.load(str(path))
    scripts = {o.path_id: o.read().m_ClassName for o in env.objects if o.type.name == "MonoScript"}
    out = {}
    for o in env.objects:
        if o.type.name != "MonoBehaviour":
            continue
        tt = o.read_typetree()
        cls = scripts.get(tt.get("m_Script", {}).get("m_PathID"))
        out.setdefault(cls, []).append((o.path_id, tt))
    return out


def read_texts():
    """Los textos oficiales del juego, por token: {"en": {...}, "es": {...}}. No hay es-MX: el juego trae es-ES."""
    env = UnityPy.load(str(BUNDLES / "shared" / "content.bundle"))
    out = {}
    for lang, folder in (("en", "en"), ("es", "es-es")):
        out[lang] = json.loads(env.container[f"assets/localization/{folder}/engine.json"].read().m_Script)
    return out


def number(x):
    """1000.0 → 1000; 0.5 se queda. Los JSON del sitio no llevan `.0` de más."""
    return int(x) if float(x).is_integer() else round(float(x), 3)


def assign_slugs(items, previous=None):
    """
    Los slugs en/es de cada objeto, únicos en cada idioma y sin que el español de uno sea el inglés de otro (la
    dirección se traduce en los dos idiomas, ver `parseRoute`).

    - Los redirects (skins y variantes de otro objeto) no tienen ficha: llevan `None` y no entran en ninguna cuenta,
      así no le roban el slug limpio a un objeto visible.
    - `previous` es `{id: (slug, slugEs)}` del `items.json` de antes. Un objeto que ya tenía slug lo conserva si sigue
      saliendo de su nombre (es `slugify(nombre)` o empieza por eso más un guion) y no choca con otro que se lo quedó:
      un parche que suma un objeto con el nombre de uno existente no le cambia la URL al existente.
    - Los demás toman el slug limpio si está libre; si no (o si lo piden dos a la vez), llevan `-<shortname>`.
    """
    previous = previous or {}
    live = [it for it in items if not it["redirectOf"]]
    for it in items:
        if it["redirectOf"]:
            it["slug"] = it["slugEs"] = None

    def assign(field, base_of, forbidden):
        """`forbidden(slug, id)` dice si ese slug está vedado para ese objeto (cruce entre idiomas)."""
        idx = 0 if field == "slug" else 1
        taken, pending = set(), []
        for it in live:
            base, old = base_of(it), (previous.get(it["id"]) or (None, None))[idx]
            if old and (old == base or old.startswith(base + "-")) and old not in taken and not forbidden(old, it["id"]):
                it[field] = old
                taken.add(old)
            else:
                pending.append(it)
        wanting = {}
        for it in pending:
            wanting.setdefault(base_of(it), []).append(it)
        for base, group in wanting.items():
            for it in group:
                clean = len(group) == 1 and base not in taken and not forbidden(base, it["id"])
                it[field] = base if clean else f"{base}-{slugify(it['id'])}"
                taken.add(it[field])

    assign("slug", lambda i: slugify(i["name"]["en"]), lambda slug, sid: False)
    by_en = {it["slug"]: it["id"] for it in live}
    assign("slugEs", lambda i: slugify(i["name"]["es"] or i["name"]["en"]), lambda slug, sid: by_en.get(slug, sid) != sid)


def text_of(texts, lang, token):
    """
    El texto de un token. El juego busca sin distinguir mayúsculas: `jukebox` (el token del objeto) está en el
    `engine.json` como `Jukebox`, y con la búsqueda exacta quedaba con el nombre heredado de la Boom Box.
    """
    table = texts[lang]
    if token in table:
        return table[token]
    lower = texts.setdefault("_lower", {}).get(lang)
    if lower is None:
        lower = texts["_lower"][lang] = {}
        for k, v in table.items():
            lower.setdefault(k.lower(), v)
    return lower.get(token.lower())


def build_items(classes, texts, previous=None):
    defs = classes["ItemDefinition"]
    by_pid = {pid: tt["shortname"] for pid, tt in defs}
    blueprints = {tt["m_GameObject"]["m_PathID"]: tt for _, tt in classes.get("ItemBlueprint", [])}
    items, skipped = [], []
    for _, d in defs:
        sid = d["shortname"]
        if d["hidden"] or sid in EXCLUDED:
            continue
        tok_name, tok_desc = d["displayName"], d["displayDescription"]
        name_en = text_of(texts, "en", tok_name["token"]) or tok_name["legacyEnglish"]
        if not name_en:
            skipped.append(sid)
            continue
        if d["category"] not in CATEGORIES:
            raise SystemExit(f"{sid}: categoría {d['category']} desconocida (¿cambió el enum ItemCategory?)")
        cond = d["condition"]
        redirect = d["isRedirectOf"]
        bp = blueprints.get(d["m_GameObject"]["m_PathID"])
        craft = None
        if bp and bp["userCraftable"]:
            craft = {
                "ingredients": [{"id": by_pid[i["itemDef"]["m_PathID"]], "amount": number(i["amount"])} for i in bp["ingredients"]],
                "amount": bp["amountToCreate"],
                "time": number(bp["time"]),
                "workbench": bp["workbenchLevelRequired"],
                "researchable": bool(bp["isResearchable"]),
                "default": bool(bp["defaultBlueprint"]),
            }
        items.append({
            "id": sid,
            "itemid": d["itemid"],
            "name": {"en": name_en, "es": text_of(texts, "es", tok_name["token"]) or None},
            "desc": {
                "en": text_of(texts, "en", tok_desc["token"]) or tok_desc["legacyEnglish"] or None,
                "es": text_of(texts, "es", tok_desc["token"]) or None,
            },
            "category": CATEGORIES[d["category"]],
            "rarity": RARITIES.get(d["rarity"], "none"),
            "stack": d["stackable"],
            "condition": {"max": number(cond["max"]), "repairable": bool(cond["repairable"])} if cond["enabled"] else None,
            "redirectOf": by_pid.get(redirect["m_PathID"]) if redirect["m_FileID"] == 0 and redirect["m_PathID"] else None,
            "craft": craft,
        })
    if skipped:
        print(f"[rust] {len(skipped)} objetos sin nombre inglés quedaron afuera: {', '.join(skipped[:10])}…", file=sys.stderr)
    assign_slugs(items, previous)
    # Los redirects (sin slug) al final, por shortname.
    items.sort(key=lambda i: (i["slug"] is None, i["slug"] or "", i["id"]))
    return items


def collect(previous=None):
    """Lee el juego y devuelve los datos, sin escribir nada (lo usan los tests). `previous` ver `assign_slugs`."""
    classes = load_classes(BUNDLES / "shared" / "items.preload.bundle")
    return {"items": build_items(classes, read_texts(), previous), "build": read_build()}


def read_previous_slugs():
    """`{id: (slug, slugEs)}` del `items.json` de la corrida anterior, para que las URLs no se muevan entre parches."""
    f = DATA / "items.json"
    if not f.exists():
        return {}
    return {i["id"]: (i.get("slug"), i.get("slugEs")) for i in json.loads(f.read_text(encoding="utf-8"))["items"]}


def write_icons(items):
    """Los íconos a webp de 128 px. Uno que ya existe y es más nuevo que su PNG no se rehace."""
    ICONS.mkdir(parents=True, exist_ok=True)
    for it in items:
        src = BUNDLES / "items" / f"{it['id']}.png"
        dst = ICONS / f"{it['id']}.webp"
        it["icon"] = src.exists()
        if not src.exists() or (dst.exists() and dst.stat().st_mtime >= src.stat().st_mtime):
            continue
        im = Image.open(src).convert("RGBA")
        im.thumbnail((ICON_SIZE, ICON_SIZE), Image.LANCZOS)
        im.save(dst, "WEBP", quality=82, method=6)


def main():
    got = collect(read_previous_slugs())
    items = got["items"]
    write_icons(items)
    DATA.mkdir(parents=True, exist_ok=True)
    body = json.dumps({"items": items}, ensure_ascii=False, indent=1)
    (DATA / "items.json").write_text(body + "\n", encoding="utf-8")

    by_id = {i["id"]: i for i in items}
    home = [{k: by_id[sid][k] for k in ("id", "slug", "slugEs", "name")} for sid in HOME_ITEMS]
    (DATA / "home.json").write_text(json.dumps(home, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    meta_file = DATA / "meta.json"
    prev = json.loads(meta_file.read_text(encoding="utf-8")) if meta_file.exists() else None
    digest = hashlib.sha256(body.encode("utf-8")).hexdigest()
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    visible = [i for i in items if not i["redirectOf"]]  # los redirects no tienen ficha ni cuentan
    meta = {
        "build": got["build"],
        "extractedAt": stamp(prev, digest, now),
        "hash": digest,
        "counts": {"items": len(visible), "recipes": sum(1 for i in visible if i["craft"])},
    }
    meta_file.write_text(json.dumps(meta, indent=1) + "\n", encoding="utf-8")
    print(f"[rust] build {meta['build']}: {meta['counts']['items']} objetos, {meta['counts']['recipes']} recetas")


if __name__ == "__main__":
    main()
