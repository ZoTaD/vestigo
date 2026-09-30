"""
Diablo II: Resurrected → lo que usa el sitio (2026-09-29).

Lee TU instalación del juego (sólo lectura, con CascLib: ver casc.py) y escribe:

  site/public/d2r/game/…   imágenes de la interfaz, íconos y la puerta animada (WebP)
  site/public/d2r/fonts/…  las dos tipografías del juego (WOFF2)
  games/d2r/data/home.json lo que muestra la portada de la sección: cifras,
                           runas con sus palabras rúnicas, clases y eventos,
                           con los nombres oficiales en inglés y en español (es-MX)
  games/d2r/data/meta.json el build del juego y la fecha en que cambiaron los datos

Uso (una vez por parche, en la PC que tiene el juego):
    python games/d2r/tools/extract.py

`extractedAt` sólo cambia si cambió algún dato: es el `lastmod` del sitemap, y
una fecha que se mueve sin que cambie nada le enseña a Google a no creerla.
"""
import csv, datetime, glob, io, json, os, re, shutil, subprocess, sys
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from casc import Casc, GAME_DIR, ROOT  # noqa: E402
import sprite  # noqa: E402

PUBLIC = os.path.join(ROOT, "site", "public", "d2r")
GAME = os.path.join(PUBLIC, "game")
DATA = os.path.join(ROOT, "games", "d2r", "data")
UI = "data:data/hd/global/ui/"

# El español del sitio es el de Latinoamérica: el que ve quien juega por la
# región de América en Battle.net (Conjurador, Talismán, Clasificación).
ES = "esMX"

CLASSES = ["amazon", "assassin", "barbarian", "druid", "necromancer", "paladin", "sorceress", "warlock"]
# La clave de cada clase en ui.json (no siguen un patrón).
CLASS_KEYS = {"amazon": "Amazon", "assassin": "assassinstr", "barbarian": "Barbarian", "druid": "druidstr",
              "necromancer": "Necromancer", "paladin": "Paladin", "sorceress": "Sorceress", "warlock": "Warlock"}
# Los eventos del mundo, con el título que les da el juego.
EVENTS = [("terror", "GameListDesecratedFilterTitle"), ("uber", "DiabloWalksEarth"),
          ("pandemonium", "strPandemoniumEventTitle"), ("cow", "strCowLevelTitle")]


def save(im, rel, w=None, q=82, lossless=False):
    path = os.path.join(GAME, rel + ".webp")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im = im.convert("RGBA")
    if w and im.width > w:
        im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
    im.save(path, "WEBP", quality=q, method=5, lossless=lossless)


def bbox(frames):
    """El contorno visible común a todos los cuadros (los sprites traen margen transparente)."""
    box = None
    for f in frames:
        b = f.split()[3].point(lambda v: 255 if v > 8 else 0).getbbox()
        box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
    return box


def ffmpeg():
    """ffmpeg del PATH o, si no está, el que instala `winget install Gyan.FFmpeg`."""
    found = shutil.which("ffmpeg")
    if found:
        return found
    pkgs = os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\WinGet\Packages")
    for p in glob.glob(os.path.join(pkgs, "Gyan.FFmpeg*", "*", "bin", "ffmpeg.exe")):
        return p
    raise SystemExit("Falta ffmpeg (winget install Gyan.FFmpeg): hace falta para el logo animado.")


def logo_avif(frames):
    tmp = os.path.join(ROOT, "games", "d2r", ".cache", "logo")
    os.makedirs(tmp, exist_ok=True)
    for i, f in enumerate(frames):
        f.save(os.path.join(tmp, f"f{i:02d}.png"))
    subprocess.run([
        ffmpeg(), "-loglevel", "error", "-y", "-framerate", "15", "-i", os.path.join(tmp, "f%02d.png"),
        # AVIF lleva la transparencia en una segunda pista en gris.
        "-filter_complex", "[0]format=yuva444p,split[c][a];[a]alphaextract[al]", "-map", "[c]", "-map", "[al]",
        "-c:v", "libaom-av1", "-crf", "40", "-b:v", "0", "-cpu-used", "5", "-row-mt", "1",
        "-pix_fmt:0", "yuv420p", "-pix_fmt:1", "gray", os.path.join(GAME, "logo.avif"),
    ], check=True)


def build_version():
    """"3.3.93847" desde .build.info (tabla separada por barras, la primera fila es la cabecera)."""
    with open(os.path.join(GAME_DIR, ".build.info"), encoding="utf-8") as f:
        rows = [line.rstrip("\n").split("|") for line in f if line.strip()]
    head = [h.split("!")[0] for h in rows[0]]
    active = next((r for r in rows[1:] if r[head.index("Active")] == "1"), rows[1])
    return active[head.index("Version")]


def assets(c):
    spr = lambda p: c.read(UI + p + ".sprite")
    first = lambda p: sprite.frames(spr(p))[0]

    # La puerta del monasterio (la pantalla de carga del juego): 10 cuadros sin su marco dorado.
    # Dos tamaños: el de escritorio y la mitad para celulares.
    for i, f in enumerate(sprite.frames(spr("loading/loadingscreen_blank"))):
        f = f.crop((44, 36, 1556, 1044))
        save(f, f"door/{i}", w=1512, q=76)
        save(f, f"door/{i}-m", w=756, q=74)

    # El logo en llamas: 27 cuadros a 15 por segundo en AVIF animado con
    # transparencia (293 KB; el mismo en WebP animado pesaba 2,3 MB), y un cuadro
    # quieto para quien pide menos movimiento o no tiene AVIF.
    fr = [f.convert("RGBA") for f in sprite.frames(spr("logoanimation/logoanimation"))]
    save(fr[0], "logo-still", q=85)
    logo_avif(fr)
    save(first("logoanimation/resurrectedtext"), "resurrected", q=90)

    # La vista previa para compartir (1200×630): la puerta abierta, oscurecida
    # hacia los bordes, con el logo en el centro y la dirección del sitio abajo.
    og = sprite.frames(spr("loading/loadingscreen_blank"))[9].crop((44, 36, 1556, 1044)).convert("RGB")
    og = og.resize((1200, round(og.height * 1200 / og.width)), Image.LANCZOS).crop((0, 95, 1200, 725))
    shade = Image.new("L", og.size, 0)
    from PIL import ImageDraw, ImageFilter, ImageFont
    ImageDraw.Draw(shade).ellipse((-200, -260, 1400, 900), fill=150)
    og = Image.composite(og, Image.new("RGB", og.size, (6, 5, 4)), shade.filter(ImageFilter.GaussianBlur(120)))
    logo = fr_logo = sprite.frames(spr("frontend/hd/frontend_logo"))[0].convert("RGBA")
    logo = logo.resize((560, round(logo.height * 560 / logo.width)), Image.LANCZOS)
    og.paste(logo, ((1200 - logo.width) // 2, 70), logo)
    font = ImageFont.truetype(io.BytesIO(c.read("data:data/hd/ui/fonts/exocetblizzardot-medium.otf")), 34)
    d = ImageDraw.Draw(og)
    txt = "VESTIGO.GG"
    w = d.textlength(txt, font=font)
    d.text(((1200 - w) / 2, 560), txt, font=font, fill=(199, 179, 119))
    og.save(os.path.join(PUBLIC, "og.jpg"), "JPEG", quality=86, optimize=True)

    # Pestañas del Arcón: tapa izquierda, centro repetible y tapa derecha de cada
    # estado, y la gema aparte, para estirarlas sin deformar la gema.
    for i, f in enumerate(sprite.frames(spr("panel/stash/stash_tabs"))):
        save(f.crop((0, 0, 24, 80)), f"tab/{i}-l", q=90)
        save(f.crop((50, 0, 90, 80)), f"tab/{i}-m", q=90)
        save(f.crop((225, 0, 249, 80)), f"tab/{i}-r", q=90)
        if i == 3:
            save(f.crop((106, 56, 143, 80)), "tab/gem", q=92)

    # Botones del menú principal (normal, encima, apretado), recortados al contorno.
    btn = sprite.frames(spr("frontend/hd/final/frontend_buttonmain"))[:3]
    box = bbox(btn)
    for i, f in enumerate(btn):
        save(f.crop(box), f"button/{i}", q=86)

    # El borde de los tooltips: 9 piezas de 48 px → una imagen 3×3 para `border-image`.
    tt = sprite.frames(spr("panel/tooltipborder/tooltipborder"))
    border = Image.new("RGBA", (144, 144))
    for i, f in enumerate(tt):
        border.paste(f, ((i % 3) * 48, (i // 3) * 48))
    save(border, "tooltip-border", lossless=True)

    save(sprite.frames(spr("frontend/hd/frontend_bracketleft"))[1], "gem-l", q=90)
    save(sprite.frames(spr("frontend/hd/frontend_bracketright"))[1], "gem-r", q=90)
    save(first("frontend/hd/frontend_banner"), "banner", w=300)
    save(first("lobby/lobby_bg"), "stone", w=1920, q=72)

    # El panel de inventario del juego para el planificador: el muñeco con sus
    # diez casilleros y la grilla de abajo (donde van los talismanes), y la silueta
    # de cada casillero vacío.
    save(first("panel/inventory/background"), "inventory", w=800, q=78)
    for slot in ["headarmor", "amulet", "weapon", "chestarmor", "shield", "glove", "belt", "boots", "ring"]:
        save(first(f"panel/inventory/inventory_paperdoll_{slot}"), f"paperdoll/{slot}", q=86)

    # La Crónica del juego, para el Grial: sus pestañas (apagada y elegida), la
    # barra de progreso con su relleno y la casilla vacía y marcada. La tira de
    # casillas trae 9 de 68 px separadas por 1 px: vacía, vacía encima, vacía
    # apretada, marcada…
    for i, f in enumerate(sprite.frames(spr("panel/chronicle/chronicle_tabs"))):
        save(f, f"grail/tab-{i}", q=86)
    save(first("panel/chronicle/progressbar_small_2"), "grail/bar", q=90)
    save(first("panel/chronicle/progressbar_small_2_fill"), "grail/bar-fill", q=90)
    boxes = first("panel/chronicle/checkbox_colap_states_full")
    for i, name in [(0, "off"), (3, "on")]:
        save(boxes.crop((i * 69, 0, i * 69 + 68, 68)), f"grail/check-{name}", q=90)

    for cl in CLASSES:
        save(first(f"hireables/{cl}icon"), f"class/{cl}", q=86)
    for n in ["uberdiablo", "cowking", "pandemoniumevent"]:
        save(first(f"questicons/misc/{n}"), f"event/{n}", q=86)
    save(sprite.frames(spr("panel/waypoints/terror_zone_icon"))[1], "event/terror", q=90)
    for q in ["a1q1", "a2q6", "a3q1", "a3q4", "a4q2"]:
        save(first(f"questicons/{q}"), f"quest/{q}", q=86)
    for n in ["armor/helmet/unique_warlock_helm", "misc/amulet/amulet", "weapon/sword/crystal_sword",
              "misc/gem/perfect_skull", "misc/charm/charm_large", "misc/quest/horadric_cube"]:
        save(first(f"items/{n}"), "item/" + n.split("/")[-1].replace("_", "-"), q=86)


def runes_icons(c, runes):
    for r in runes:
        im = sprite.frames(c.read(f"{UI}items/misc/rune/{r['id']}_rune.sprite"))[0]
        save(im, f"rune/{r['id']}", q=86)


def fonts(c):
    from fontTools.ttLib import TTFont
    out = os.path.join(PUBLIC, "fonts")
    os.makedirs(out, exist_ok=True)
    for src, name in [("exocetblizzardot-medium.otf", "exocet"), ("formal436bt.ttf", "formal436")]:
        f = TTFont(io.BytesIO(c.read("data:data/hd/ui/fonts/" + src)))
        f.flavor = "woff2"
        f.save(os.path.join(out, name + ".woff2"))


def table(c, name):
    text = c.read("data:data/global/excel/" + name).decode("latin-1")
    return list(csv.DictReader(io.StringIO(text), delimiter="\t"))


TAG = re.compile(r"^\[[a-z]{2}\]")


def strings(c):
    """Clave → {en, es}, de todos los archivos de textos del juego."""
    out = {}
    for f in ["ui", "item-names", "item-runes", "item-nameaffixes", "item-modifiers", "levels", "monsters", "skills"]:
        for e in json.loads(c.read(f"data:data/local/lng/strings/{f}.json").decode("utf-8-sig")):
            # Los textos en español traen el género adelante ("[fs]Coraza gótica").
            clean = lambda s: TAG.sub("", s or "").strip()
            out.setdefault(e["Key"], {"en": clean(e.get("enUS")), "es": clean(e.get(ES)) or clean(e.get("enUS"))})
    return out


def home_data(c, S):
    misc, rw = table(c, "misc.txt"), table(c, "runes.txt")
    done = [r for r in rw if r.get("complete") == "1"]
    runes = []
    for r in sorted((m for m in misc if m.get("type") == "rune"), key=lambda m: m["code"]):
        uses = [x for x in done if r["code"] in [x.get(f"Rune{i}") for i in range(1, 7)]]
        runes.append({
            "id": r["name"].split()[0].lower(),
            "code": r["code"],
            "name": S[r["code"]],
            "lvl": int(r["levelreq"]),
            "runewords": [S.get(x["Name"]) or {"en": x["*Rune Name"], "es": x["*Rune Name"]} for x in uses],
        })
    weapons, armor = table(c, "weapons.txt"), table(c, "armor.txt")
    counts = {
        "runes": len(runes),
        "runewords": len(done),
        "uniques": sum(1 for r in table(c, "uniqueitems.txt") if r.get("spawnable") == "1"),
        # Sólo lo que puede caer: "Warlord's Glory" está en la tabla pero no cae ni cuenta para la Crónica.
        "sets": len({r["set"] for r in table(c, "setitems.txt") if r.get("spawnable") == "1" and r.get("set")}),
        "setItems": sum(1 for r in table(c, "setitems.txt") if r.get("spawnable") == "1" and r.get("item")),
        "cubeRecipes": sum(1 for r in table(c, "cubemain.txt") if r.get("enabled") == "1"),
        "gems": sum(1 for r in misc if r.get("type", "").startswith("gem") and r.get("type") != "gem"),
        "bases": sum(1 for r in weapons + armor if r.get("spawnable") == "1"),
    }
    return {
        "counts": counts,
        "runes": runes,
        "classes": [{"id": cl, "name": S[CLASS_KEYS[cl]]} for cl in CLASSES],
        "events": [{"id": ev, "name": S[key]} for ev, key in EVENTS],
    }


def write_data(home, build):
    os.makedirs(DATA, exist_ok=True)
    body = json.dumps(home, ensure_ascii=False, indent=1)
    home_path, meta_path = os.path.join(DATA, "home.json"), os.path.join(DATA, "meta.json")
    old_body = open(home_path, encoding="utf-8").read() if os.path.exists(home_path) else None
    old_meta = json.load(open(meta_path, encoding="utf-8")) if os.path.exists(meta_path) else {}
    changed = old_body != body or old_meta.get("build") != build
    meta = {
        "build": build,
        "patch": ".".join(build.split(".")[:2]),
        # Las cifras también acá: la portada del sitio las muestra y así no carga home.json.
        "counts": home["counts"],
        "extractedAt": datetime.date.today().isoformat() if changed or "extractedAt" not in old_meta else old_meta["extractedAt"],
    }
    with open(home_path, "w", encoding="utf-8") as f:
        f.write(body)
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    return meta, changed


def main():
    build = build_version()
    with Casc() as c:
        S = strings(c)
        home = home_data(c, S)
        print("Datos:", home["counts"])
        assets(c)
        runes_icons(c, home["runes"])
        fonts(c)
    meta, changed = write_data(home, build)
    n = sum(len(fs) for _, _, fs in os.walk(PUBLIC))
    size = sum(os.path.getsize(os.path.join(d, f)) for d, _, fs in os.walk(PUBLIC) for f in fs)
    print(f"Build {meta['build']} · {n} archivos en site/public/d2r ({size / 1e6:.1f} MB) · datos {'cambiaron' if changed else 'sin cambios'} ({meta['extractedAt']})")


if __name__ == "__main__":
    main()
