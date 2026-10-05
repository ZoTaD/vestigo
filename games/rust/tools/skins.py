"""
Las skins de cada objeto de Rust (2026-10-05): las que trae el juego, con su nombre oficial en/es y su ícono. Plan:
docs/superpowers/plans/2026-10-05-rust-objetos-2b.md (Task A7).

De dónde sale cada cosa:
  - qué skins tiene un objeto: `ItemDefinition.skins` (items.preload.bundle), con el `id` de Steam y la ruta del asset;
  - el resto, del `ItemSkin` de content.bundle con ese nombre: `displayName.token` da el nombre en engine.json,
    `workshopID` dice si vino del workshop, `Redirect` apunta al objeto que la representa (la AK de hielo es
    `rifle.ak.ice`) e `icon` es un `Sprite` de 256 px en alguno de los `Bundles/shared/textures.N.bundle`;
  - el ícono: el del objeto al que redirige, si ya existe (`site/public/rust/items/<shortname>.webp`, lo escribe
    extract.py); si no, el `Sprite` achicado a `SKIN_ICON_SIZE`.
Las skins de workshop que el juego no trae (las que se compran en el mercado de Steam) no están.

Escribe:
  - `games/rust/data/skins.json`: {"items": {shortname: [{"id", "name": {"en", "es"}, "icon", "workshop"}]}};
  - `site/public/rust/skins/<id>.webp`.

Uso, desde la raíz del repo y después de extract.py (~3 min: content.bundle y cinco bundles de texturas):
    python games/rust/tools/skins.py
"""
import gc
import json
import re
import sys
from pathlib import Path

import UnityPy
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract import BUNDLES, DATA, ROOT, load_classes, text_of  # noqa: E402

SKIN_ICONS = ROOT / "site" / "public" / "rust" / "skins"
ITEM_ICONS = ROOT / "site" / "public" / "rust" / "items"
# La ficha las muestra en casilleros de 64 px: 96 alcanza para pantallas de doble densidad sin pesar como las de 128.
SKIN_ICON_SIZE = 96
# Las rutas de `ItemDefinition.skins` casi siempre terminan en `.itemskin.asset`, pero hay algunas con `.skin` o `.sitem`
# (los planteros del ferrocarril, los separadores del Año Nuevo lunar). Se compara sin esa cola y sin mayúsculas.
_SKIN_SUFFIX = re.compile(r"(\.(itemskin|skin|sitem))?(\.asset)?$", re.I)


def skin_key(name):
    """`.../skin.ak47.digitalcamoak47.itemskin.asset` y `skin.ak47.digitalcamoak47.itemskin` → `skin.ak47.digitalcamoak47`."""
    return _SKIN_SUFFIX.sub("", name.rsplit("/", 1)[-1]).lower()


def wanted(classes):
    """
    {clave del asset: (id de la skin, shortname del objeto)} de los objetos visibles, y {path_id: shortname} de todos los
    `ItemDefinition` (para seguir los `Redirect`). La clave es `skin_key` de la ruta, que coincide con `skin_key` del
    `m_Name` del `ItemSkin` tenga o no la extensión.
    """
    want, by_pid = {}, {}
    for pid, d in classes["ItemDefinition"]:
        by_pid[pid] = d["shortname"]
        if d["hidden"]:
            continue
        for s in d["skins"]:
            want.setdefault(skin_key(s["name"]), (s["id"], d["shortname"]))
    return want, by_pid


def read_skins(want, by_pid):
    """
    Los `ItemSkin` pedidos, leídos de content.bundle por nombre (`peek_name`, sin leer el typetree de los demás). Cada
    uno: {"id", "sid", "name", "workshop", "redirect", "icon": (archivo CAB, path_id) | None}.
    """
    env = UnityPy.load(str(BUNDLES / "shared" / "content.bundle"))
    texts = {lang: json.loads(env.container[f"assets/localization/{folder}/engine.json"].read().m_Script)
             for lang, folder in (("en", "en"), ("es", "es-es"))}
    out, seen = [], set()
    for o in env.objects:
        if o.type.name != "MonoBehaviour":
            continue
        name = o.peek_name()
        if not name or skin_key(name) not in want:
            continue
        skin_id, sid = want[skin_key(name)]
        if skin_id in seen:
            continue
        tt = o.read_typetree()
        if tt.get("id") != skin_id or "displayName" not in tt:
            continue  # otro MonoBehaviour con el mismo nombre
        seen.add(skin_id)
        token = tt["displayName"]["token"]
        icon = None
        ref = tt.get("icon") or {}
        if ref.get("m_PathID"):
            if ref.get("m_FileID", 0) > 0:
                icon = (o.assets_file.externals[ref["m_FileID"] - 1].path.split("/")[-1], ref["m_PathID"])
            else:
                # Un ícono dentro del mismo content.bundle no se busca en los bundles de texturas: avisar para verlo.
                print(f"[rust] skin {skin_id} ({name}): ícono con m_FileID {ref.get('m_FileID')}, no se busca",
                      file=sys.stderr)
        red = (tt.get("Redirect") or {}).get("m_PathID")
        redirect = by_pid.get(red) if red else None
        out.append({
            "id": skin_id, "sid": sid,
            "name": {"en": text_of(texts, "en", token) or tt["displayName"]["legacyEnglish"].strip(),
                     "es": text_of(texts, "es", token) or None},
            "workshop": bool(tt["workshopID"]), "redirect": redirect, "icon": icon,
        })
    return out


def _sprites_of(bundle, by_cab, done, found):
    """Escribe los Sprite pedidos que estén en `bundle`; suma a `done` los ids y a `found` las claves encontradas."""
    env = UnityPy.load(str(bundle))
    cabs = {name for f in env.files.values() for name in getattr(f, "files", {})} & set(by_cab)
    if not cabs:
        return
    for o in env.objects:
        cab = o.assets_file.name
        if cab in cabs and o.path_id in by_cab[cab] and o.type.name == "Sprite":
            skin_id = by_cab[cab][o.path_id]
            found.add((cab, o.path_id))
            dst = SKIN_ICONS / f"{skin_id}.webp"
            if not dst.exists():
                im = o.read().image.convert("RGBA")
                im.thumbnail((SKIN_ICON_SIZE, SKIN_ICON_SIZE), Image.LANCZOS)
                im.save(dst, "WEBP", quality=82, method=6)
            done.add(skin_id)


def write_sprites(needed):
    """
    Guarda los íconos de `needed` ({(archivo CAB, path_id): id de la skin}) como webp. Recorre los bundles de texturas
    compartidos de a uno (cargarlos juntos no entra en memoria) y devuelve los ids que quedaron escritos. Uno que ya
    existe no se rehace.
    """
    SKIN_ICONS.mkdir(parents=True, exist_ok=True)
    done, found, by_cab = set(), set(), {}
    for (cab, pid), skin_id in needed.items():
        by_cab.setdefault(cab, {})[pid] = skin_id
    for bundle in sorted((BUNDLES / "shared").glob("textures.*.bundle")):
        _sprites_of(bundle, by_cab, done, found)
        # Cada bundle pesa 5-8 GB: se suelta antes de abrir el siguiente (en una función aparte, así no queda vivo
        # por la variable del loop).
        gc.collect()
    lost = sorted(set(needed) - found)
    if lost:
        print(f"[rust] {len(lost)} íconos de skins que no aparecen en ningún bundle de texturas: "
              + ", ".join(f"{needed[k]} ({k[0]}:{k[1]})" for k in lost), file=sys.stderr)
    return done


def has_item_icon(shortname):
    """Si extract.py ya escribió el ícono de ese objeto."""
    return (ITEM_ICONS / f"{shortname}.webp").exists()


def assign_icons(skins, has_icon):
    """
    Le pone a cada skin `path`, el ícono que le toca si todo sale bien, y devuelve los Sprite a escribir
    ({(archivo CAB, path_id): id de la skin}).

    - Con `Redirect` a un objeto con ícono: el del objeto.
    - Con `icon`: `skins/<id>`. Varias skins pueden compartir un Sprite (las AK de cristal usan el de la Sapphire, dos
      cajas grandes el mismo): se escribe una vez, con el id de la primera, y las demás apuntan ahí.
    """
    needed = {}
    for s in skins:
        if s["redirect"] and has_icon(s["redirect"]):
            s["path"] = f"items/{s['redirect']}"
        elif s["icon"]:
            s["path"] = f"skins/{needed.setdefault(s['icon'], s['id'])}"
        else:
            s["path"] = None
    return needed


def final_icon(s, done, has_icon):
    """
    El ícono de `skins.json`: `path` si quedó escrito (`done`, ids de los Sprite escritos); si no, como último recurso,
    el del objeto (mejor que un casillero vacío), o None.
    """
    path = s["path"]
    if path and (path.startswith("items/") or int(path.split("/")[1]) in done):
        return path
    return f"items/{s['sid']}" if has_icon(s["sid"]) else None


def collect(write_icons=True):
    """Lee el juego y devuelve `{"items": {...}}`, la forma de `skins.json`. Con `write_icons` escribe también los íconos."""
    want, by_pid = wanted(load_classes(BUNDLES / "shared" / "items.preload.bundle"))
    skins = read_skins(want, by_pid)
    got = {s["id"] for s in skins}
    missing = sorted(k for k, (skin_id, _) in want.items() if skin_id not in got)
    if missing:
        print(f"[rust] {len(missing)} skins sin ItemSkin en content.bundle, quedan afuera: {', '.join(missing)}",
              file=sys.stderr)
    needed = assign_icons(skins, has_item_icon)
    done = write_sprites(needed) if write_icons else set(needed.values())
    items = {}
    for s in skins:
        icon = final_icon(s, done, has_item_icon)
        items.setdefault(s["sid"], []).append({"id": s["id"], "name": s["name"], "icon": icon, "workshop": s["workshop"]})
    for rows in items.values():
        rows.sort(key=lambda r: (r["name"]["en"].lower(), r["id"]))
    return {"items": dict(sorted(items.items()))}


def main():
    got = collect()
    (DATA / "skins.json").write_text(json.dumps(got, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    n = sum(len(v) for v in got["items"].values())
    without = sum(1 for v in got["items"].values() for s in v if not s["icon"])
    print(f"[rust] skins: {n} en {len(got['items'])} objetos; {without} sin ícono")


if __name__ == "__main__":
    main()
