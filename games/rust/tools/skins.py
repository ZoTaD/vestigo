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
import json
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


def wanted(classes):
    """
    {nombre del asset: (id de la skin, shortname del objeto)} de los objetos visibles, y {path_id: shortname} de todos los
    `ItemDefinition` (para seguir los `Redirect`). El nombre del asset es el final de la ruta sin `.asset`
    (`skin.ak47.digitalcamoak47.itemskin`), que es el `m_Name` del `ItemSkin`.
    """
    want, by_pid = {}, {}
    for pid, d in classes["ItemDefinition"]:
        by_pid[pid] = d["shortname"]
        if d["hidden"]:
            continue
        for s in d["skins"]:
            name = s["name"].rsplit("/", 1)[-1].removesuffix(".asset")
            want.setdefault(name, (s["id"], d["shortname"]))
    return want, by_pid


def read_skins(want, by_pid):
    """
    Los `ItemSkin` pedidos, leídos de content.bundle por nombre (`peek_name`, sin leer el typetree de los demás). Cada
    uno: {"id", "sid", "name", "workshop", "redirect", "icon": (archivo CAB, path_id) | None}.
    """
    env = UnityPy.load(str(BUNDLES / "shared" / "content.bundle"))
    texts = {lang: json.loads(env.container[f"assets/localization/{folder}/engine.json"].read().m_Script)
             for lang, folder in (("en", "en"), ("es", "es-es"))}
    out = []
    for o in env.objects:
        if o.type.name != "MonoBehaviour":
            continue
        name = o.peek_name()
        if name not in want:
            continue
        tt = o.read_typetree()
        skin_id, sid = want[name]
        if tt.get("id") != skin_id:
            continue  # otro MonoBehaviour con el mismo nombre
        token = tt["displayName"]["token"]
        icon = None
        ref = tt["icon"]
        if ref["m_PathID"] and ref["m_FileID"] > 0:
            icon = (o.assets_file.externals[ref["m_FileID"] - 1].path.split("/")[-1], ref["m_PathID"])
        redirect = by_pid.get(tt["Redirect"]["m_PathID"]) if tt["Redirect"]["m_PathID"] else None
        out.append({
            "id": skin_id, "sid": sid,
            "name": {"en": text_of(texts, "en", token) or tt["displayName"]["legacyEnglish"].strip(),
                     "es": text_of(texts, "es", token) or None},
            "workshop": bool(tt["workshopID"]), "redirect": redirect, "icon": icon,
        })
    return out


def write_sprites(needed):
    """
    Guarda los íconos de `needed` ({(archivo CAB, path_id): id de la skin}) como webp. Recorre los bundles de texturas
    compartidos de a uno (cargarlos juntos no entra en memoria) y devuelve los ids que quedaron escritos. Uno que ya
    existe no se rehace.
    """
    SKIN_ICONS.mkdir(parents=True, exist_ok=True)
    done, by_cab = set(), {}
    for (cab, pid), skin_id in needed.items():
        by_cab.setdefault(cab, {})[pid] = skin_id
    for bundle in sorted((BUNDLES / "shared").glob("textures.*.bundle")):
        env = UnityPy.load(str(bundle))
        cabs = {name for f in env.files.values() for name in getattr(f, "files", {})} & set(by_cab)
        if not cabs:
            continue
        for o in env.objects:
            cab = o.assets_file.name
            if cab in cabs and o.path_id in by_cab[cab] and o.type.name == "Sprite":
                skin_id = by_cab[cab][o.path_id]
                dst = SKIN_ICONS / f"{skin_id}.webp"
                if not dst.exists():
                    im = o.read().image.convert("RGBA")
                    im.thumbnail((SKIN_ICON_SIZE, SKIN_ICON_SIZE), Image.LANCZOS)
                    im.save(dst, "WEBP", quality=82, method=6)
                done.add(skin_id)
    return done


def collect(write_icons=True):
    """Lee el juego y devuelve `{"items": {...}}`, la forma de `skins.json`. Con `write_icons` escribe también los íconos."""
    want, by_pid = wanted(load_classes(BUNDLES / "shared" / "items.preload.bundle"))
    skins = read_skins(want, by_pid)
    missing = len(want) - len(skins)
    if missing:
        print(f"[rust] {missing} skins sin ItemSkin en content.bundle: quedan afuera", file=sys.stderr)
    needed = {}
    for s in skins:
        if s["redirect"] and (ITEM_ICONS / f"{s['redirect']}.webp").exists():
            s["path"] = f"items/{s['redirect']}"
        elif s["icon"]:
            needed[s["icon"]] = s["id"]
            s["path"] = f"skins/{s['id']}"
        else:
            s["path"] = None
    done = write_sprites(needed) if write_icons else {s["id"] for s in skins}
    items = {}
    for s in skins:
        icon = s["path"] if s["path"] and (s["path"].startswith("items/") or s["id"] in done) else None
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
