"""
Imágenes de Deadlock sacadas del juego instalado → site/public/deadlock/game/

El sitio pedía todas las imágenes del juego a assets-bucket.deadlock-api.com,
que es una copia de las mismas carpetas del juego y que ya se cayó una vez
(2026-09-19). Este script las saca de TU instalación y las deja en el sitio con
la misma ruta relativa que usa ese bucket, así el reemplazo es un cambio de
prefijo (lo hace el plugin `localDeadlockAssets` de vite.config.ts).

Además exporta el material de estilo (papeles, tooltips, pizarra, arte de
héroes, armas, insignias en tiza) a public/deadlock/game/ui/.

Uso (una vez por parche, en la PC que tiene el juego):
    python games/deadlock/tools/game_assets.py --vrf <Source2Viewer-CLI.exe> [--cache <carpeta>] [--force]

Source2Viewer-CLI: github.com/ValveResourceFormat/ValveResourceFormat/releases
(cli-windows-x64.zip). Sólo LEE el pak del juego; no modifica nada.
"""
import argparse, json, os, re, subprocess, sys
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
DATA = os.path.join(ROOT, "games", "deadlock", "data")
OUT = os.path.join(ROOT, "site", "public", "deadlock", "game")
BUCKET = "https://assets-bucket.deadlock-api.com/assets-api-res/"
GAME_VPK = r"C:/Program Files (x86)/Steam/steamapps/common/Deadlock/game/citadel/pak01_dir.vpk"

# Carpeta del bucket → carpeta dentro de panorama/ del juego, cuando no coinciden.
REMAP = [("images/abilities/", "images/hud/abilities/"), ("images/ranks/", "images/ranked/badges/")]
SUFFIXES = ["_psd.png", "_png.png", ".png", "_psd.jpeg", "_jpg.jpeg", ".jpeg", ".svg"]

# Tamaño máximo (ancho) por tipo: lo que el sitio dibuja, con margen para pantallas 2x.
MAX_W = [
    (re.compile(r"heroes/backgrounds/"), 1600),
    (re.compile(r"heroes/.*_card"), 280),
    (re.compile(r"shop/catalog/catalog_tooltip_bg"), 520),
    (re.compile(r"shop/catalog/catalog_tooltip_header"), 520),
]


def extract(vrf, cache):
    if os.path.isdir(os.path.join(cache, "panorama", "images")):
        return
    print("Extrayendo panorama/images del juego…")
    subprocess.run([vrf, "-i", GAME_VPK, "-o", cache, "-d", "-f", "panorama/images/",
                    "-e", "vtex_c,vsvg_c", "--threads", "8"], check=True, stdout=subprocess.DEVNULL)


def find_local(panorama, rel):
    """De 'images/heroes/inferno_sm.webp' al archivo extraído del juego."""
    for a, b in REMAP:
        if rel.startswith(a):
            rel = b + rel[len(a):]
    base = rel.rsplit(".", 1)[0]
    for s in SUFFIXES:
        p = os.path.join(panorama, base + s)
        if os.path.exists(p):
            return p
    return None


FORCE = False


def save_webp(src, dst, max_w=None, quality=86, crop=None, mask=False, alpha=None):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    svg_dst = dst.rsplit(".", 1)[0] + ".svg"
    # Ya exportado y más nuevo que el original: no se repite (WebP método 6 es lento).
    # Con --force se rehace igual: en un clon o rama nueva todos los archivos del
    # sitio tienen fecha de hoy y el atajo se saltearía las imágenes de un parche.
    for d in (dst, svg_dst):
        if not FORCE and os.path.exists(d) and os.path.getmtime(d) >= os.path.getmtime(src):
            return d
    if src.endswith(".svg"):
        # Los SVG se copian tal cual (con extensión .svg).
        dst = dst.rsplit(".", 1)[0] + ".svg"
        with open(src, "rb") as f, open(dst, "wb") as g:
            g.write(f.read())
        return dst
    im = Image.open(src)
    im = im.convert("RGBA") if im.mode in ("RGBA", "LA", "P") else im.convert("RGB")
    if crop:
        im = im.crop(crop)
    if mask:
        # Las máscaras del juego vienen en blanco y negro opaco. Se pasan a
        # blanco con transparencia para que `mask-image` funcione en cualquier
        # navegador (Safari no sabe usar una máscara por luminancia).
        im = Image.merge("RGBA", (*Image.new("RGB", im.size, "white").split(), im.convert("L")))
    if alpha:
        # El recorte que el juego aplica con `opacity-mask` (la ficha de objeto de
        # City Never Sleeps): se hornea en la transparencia, así el sitio no carga
        # dos imágenes ni depende de `mask-image` para los bordes rasgados.
        m = Image.open(alpha)
        # Unas máscaras dibujan la forma en la transparencia (vitalidad,
        # espíritu) y otras en el brillo (arma): se usa la que tenga variación.
        a = m.getchannel("A") if "A" in m.getbands() and m.getchannel("A").getextrema() != (255, 255) else m.convert("L")
        a = a.resize(im.size, Image.LANCZOS)
        im = im.convert("RGBA")
        im.putalpha(Image.composite(im.getchannel("A"), Image.new("L", im.size, 0), a))
    if max_w and im.width > max_w:
        im = im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)
    im.save(dst, "WEBP", quality=quality, method=6)
    return dst


def used_urls():
    urls = set()
    for root, _, files in os.walk(DATA):
        for f in files:
            if f.endswith(".json"):
                s = open(os.path.join(root, f), encoding="utf-8").read()
                urls.update(u for u in re.findall(r'https?://[^"\s]+', s) if u.startswith(BUCKET + "images/"))
    return urls


# Material de estilo: (ruta en panorama/images, nombre de salida, ancho máximo)
STYLE = [
    ("textures/paper_tile_1k_02_dark_psd.png", "ui/paper-dark.webp", 512),
    ("textures/paper_tile_1k_01_png.png", "ui/paper.webp", 512),
    ("textures/paper_panel_bg_01_png.png", "ui/paper-panel.webp", 666),
    ("textures/card_grain_png.png", "ui/card-grain.webp", None),
    ("tooltips/ability/ability_tooltip_bg_png.png", "ui/ability-tooltip.webp", 540),
    ("shop/catalog/catalog_shop_generic_bg_psd.png", "ui/shop-generic.webp", 1200),
    ("shop/catalog/catalog_shop_builds_header_bg_psd.png", "ui/builds-header.webp", 1200),
    ("shop/card_backer_psd.png", "ui/card-backer.webp", None),
    ("global/wash_rectangle_bg_psd.png", "ui/wash-rect.webp", 852),
    # 1280 y no 1920: se ve al 32 % de opacidad en una franja de ~800 px (la
    # cabecera de cada pestaña), y a 1920 pesaba 184 KB en cada página.
    ("main_menu/background_gothic_jpg.jpeg", "ui/menu-gothic.webp", 1280),
    ("main_menu/bg_city_png.png", "ui/menu-city.webp", 1920),
    ("main_menu/background_nyc_cityscape_bw_psd.png", "ui/menu-nyc.webp", 1920),
    ("main_menu/hero_release_vote/text_backer_box_psd.png", "ui/backer-box.webp", 1182),
    ("main_menu/hero_release_vote/text_backer_box_light_psd.png", "ui/backer-box-light.webp", 1182),
    ("post_game/postgame_bg_psd.png", "ui/postgame.webp", 1600),
    ("post_game/mvp_bg_png.png", "ui/mvp.webp", 1600),
    ("post_game/medal_gold_png.png", "ui/medal-gold.webp", None),
    ("post_game/medal_silver_png.png", "ui/medal-silver.webp", None),
    ("post_game/medal_bronze_png.png", "ui/medal-bronze.webp", None),
    # La pizarra ocupa el 73 % izquierdo del lienzo; el resto es negro.
    ("hideout/hideout_rank_blackboard_bg_psd.png", "ui/blackboard.webp", 1024, (0, 0, 744, 1024)),
    ("hideout/chalk_doodle01_psd.png", "ui/chalk-doodle01.webp", None),
    ("hideout/chalk_doodle03_psd.png", "ui/chalk-doodle03.webp", None),
    ("hideout/chalk_onestroke01_psd.png", "ui/chalk-stroke01.webp", None),
    ("hideout/chalk_onestroke02_psd.png", "ui/chalk-stroke02.webp", None),
    ("hideout/chalk_check01_psd.png", "ui/chalk-check.webp", None),
    ("hideout/eternus_chalk_psd.png", "ui/chalk-rays.webp", None),
    ("masks/rough_edge_01_png.png", "ui/rough-edge.webp", 512),
    # La ficha del objeto (citadel_tooltip_mod_details): fondo de la sección de
    # componentes por categoría, el ícono de recarga y el símbolo de alma.
    ("shop/catalog/catalog_tooltip_bg_modifies_weapon_psd.png", "ui/tooltip-mod-bg-weapon.webp", 520),
    ("shop/catalog/catalog_tooltip_bg_modifies_vitality_psd.png", "ui/tooltip-mod-bg-vitality.webp", 520),
    ("shop/catalog/catalog_tooltip_bg_modifies_spirit_psd.png", "ui/tooltip-mod-bg-spirit.webp", 520),
    ("upgrades/property_cooldown_large_psd.png", "ui/cooldown.webp", None),
    ("hud/icons/icon_soul.svg", "ui/icon-soul.svg", None),
    # Vestigo News (2026-09-28): los recortes rasgados de las tarjetas de héroe de
    # la pantalla de fin de partida. Son máscaras: el cuarto valor es "mask".
    ("post_game/card_hero_mask_01_png.png", "ui/card-mask-1.webp", None, None, "mask"),
    ("post_game/card_hero_mask_02_png.png", "ui/card-mask-2.webp", None, None, "mask"),
    ("post_game/card_hero_mask_03_png.png", "ui/card-mask-3.webp", None, None, "mask"),
    ("post_game/card_hero_mask_04_png.png", "ui/card-mask-4.webp", None, None, "mask"),
    # City Never Sleeps (2026-09-29): la ficha de objeto nueva, papel pintado por
    # familia con el borde rasgado de su `opacity-mask` horneado ("alpha:").
    ("tooltips/items/tooltip_backer_weapon_psd.png", "ui/cns/tooltip-weapon.webp", 900, None,
     "alpha:tooltips/items/tooltip_backer_weapon_mask_psd.png"),
    ("tooltips/items/tooltip_backer_vitality_psd.png", "ui/cns/tooltip-vitality.webp", 900, None,
     "alpha:tooltips/items/tooltip_backer_vitality_mask_psd.png"),
    ("tooltips/items/tooltip_backer_spirit_psd.png", "ui/cns/tooltip-spirit.webp", 900, None,
     "alpha:tooltips/items/tooltip_backer_spirit_mask_psd.png"),
    ("tooltips/items/tooltip_backer_weapon_corrupted_psd.png", "ui/cns/tooltip-weapon-corrupted.webp", 900, None,
     "alpha:tooltips/items/tooltip_backer_weapon_mask_psd.png"),
    # La tienda nueva: grano, trama de puntos, papel de Populares, cartel, cabecera
    # de las tres columnas, pestañas, sigilos de los filtros y fases.
    ("textures/filmgrain_psd.png", "ui/cns/filmgrain.webp", 512),
    ("shop/catalog/filters/filter_backer_dot_pattern_psd.png", "ui/cns/dot-pattern.webp", 804),
    ("shop/catalog/catalog_shop_popular_bg_psd.png", "ui/cns/shop-popular-bg.webp", 1400),
    ("shop/catalog/catalog_shop_generic_bg2_psd.png", "ui/cns/shop-bg.webp", 1400),
    ("shop/catalog/catalog_shop_top_recommendations_header_psd.png", "ui/cns/popular-header.webp", 1825),
    ("shop/catalog/filters/shop_filtered_tree_header_full_psd.png", "ui/cns/shop-columns-header.webp", 2160),
    ("shop/catalog/filters/filter_nav_backer_psd.png", "ui/cns/filter-nav.webp", 1431),
    ("shop/catalog/catalog_shop_tab_shape_psd.png", "ui/cns/tab-shape.webp", None),
    ("shop/catalog/catalog_shop_tab_edge_overlay_psd.png", "ui/cns/tab-edge.webp", None),
    ("shop/catalog/catalog_shop_tab_icon_all_psd.png", "ui/cns/tab-all.webp", None),
    ("shop/catalog/catalog_shop_tab_icon_recommendations_psd.png", "ui/cns/tab-popular.webp", None),
    ("shop/catalog/catalog_shop_tab_icon_builds_psd.png", "ui/cns/tab-builds.webp", None),
    ("shop/catalog/catalog_shop_tab_weapon_sm_psd.png", "ui/cns/tab-weapon.webp", None),
    ("shop/catalog/catalog_shop_tab_spirit_sm_psd.png", "ui/cns/tab-spirit.webp", None),
    ("shop/catalog/catalog_shop_tab_vitality_sm_psd.png", "ui/cns/tab-vitality.webp", None),
    ("shop/catalog/filters/sigil_physical_psd.png", "ui/cns/sigil-physical.webp", None),
    ("shop/catalog/filters/sigil_magic_psd.png", "ui/cns/sigil-spirit.webp", None),
    ("shop/catalog/filters/sigil_defense_psd.png", "ui/cns/sigil-defense.webp", None),
    ("shop/catalog/filters/sigil_mobility_psd.png", "ui/cns/sigil-mobility.webp", None),
    ("shop/catalog/filters/sigil_disruption_psd.png", "ui/cns/sigil-disruption.webp", None),
    ("shop/catalog/filters/sigil_misc_psd.png", "ui/cns/sigil-misc.webp", None),
    ("shop/catalog/filters/icon_early_game_png.png", "ui/cns/phase-early.webp", None),
    ("shop/catalog/filters/icon_mid_game_png.png", "ui/cns/phase-mid.webp", None),
    ("shop/catalog/filters/icon_late_game_png.png", "ui/cns/phase-late.webp", None),
    ("shop/catalog/pricetag_tier1_psd.png", "ui/cns/pricetag-1.webp", 300),
    ("shop/catalog/pricetag_tier2_psd.png", "ui/cns/pricetag-2.webp", 300),
    ("shop/catalog/pricetag_tier3_psd.png", "ui/cns/pricetag-3.webp", 300),
    ("shop/catalog/pricetag_tier4_psd.png", "ui/cns/pricetag-4.webp", 300),
    ("shop/catalog/cards/shopitem_paperwear01_psd.png", "ui/cns/paperwear-1.webp", None),
    ("shop/catalog/cards/shopitem_paperwear02_psd.png", "ui/cns/paperwear-2.webp", None),
    ("masks/rough_edge_02_png.png", "ui/cns/rough-edge.webp", 1024, None, "mask"),
    ("main_menu/hero_release_vote/text_speckle_mask_psd.png", "ui/cns/speckle.webp", 1200, None, "mask"),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--vrf", required=True)
    ap.add_argument("--cache", default=os.path.join(ROOT, ".cache", "deadlock-panorama"))
    ap.add_argument("--force", action="store_true", help="rehacer todas las imágenes aunque parezcan al día")
    a = ap.parse_args()
    global FORCE
    FORCE = a.force
    extract(a.vrf, a.cache)
    panorama = os.path.join(a.cache, "panorama")

    manifest, missing = {}, []
    for u in sorted(used_urls()):
        rel = u[len(BUCKET):]
        src = find_local(panorama, rel)
        if not src:
            # El juego la borró pero el sitio todavía la usa (City Never Sleeps
            # sacó los fondos de la ficha vieja): queda la copia que ya teníamos
            # hasta que otra pieza la reemplace.
            kept = os.path.join(OUT, rel.rsplit(".", 1)[0] + ".webp")
            if os.path.exists(kept):
                manifest[rel] = os.path.relpath(kept, OUT).replace(os.sep, "/")
            missing.append(rel)
            continue
        max_w = next((w for rx, w in MAX_W if rx.search(rel)), None)
        dst = save_webp(src, os.path.join(OUT, rel.rsplit(".", 1)[0] + ".webp"), max_w)
        manifest[rel] = os.path.relpath(dst, OUT).replace(os.sep, "/")

    # Arte por héroe que el sitio todavía no pedía: arma, retratos alternativos y en tiza.
    img = os.path.join(panorama, "images")
    extra = 0
    for f in sorted(os.listdir(os.path.join(img, "heroes"))):
        m = re.match(r"([a-z_]+?)_(card_gloat|card_critical|vertical)_psd\.png$", f)
        if m:
            save_webp(os.path.join(img, "heroes", f), os.path.join(OUT, "images", "heroes", f"{m[1]}_{m[2]}.webp"), 280)
            extra += 1
    for f in sorted(os.listdir(os.path.join(img, "heroes", "guns"))):
        m = re.match(r"([a-z_]+)_gun_psd\.png$", f)
        if m:
            save_webp(os.path.join(img, "heroes", "guns", f), os.path.join(OUT, "images", "heroes", "guns", f"{m[1]}_gun.webp"), 600)
            extra += 1
    for f in sorted(os.listdir(os.path.join(img, "ranked", "badges"))):
        m = re.match(r"rank(\d\d)_(lg|chalk)_psd\.png$", f)
        if m:
            save_webp(os.path.join(img, "ranked", "badges", f), os.path.join(OUT, "images", "ranks", f"rank{m[1]}_{m[2]}.webp"))
            extra += 1
    for src, name, w, *rest in STYLE:
        p = os.path.join(img, src)
        if os.path.exists(p):
            crop = rest[0] if rest else None
            flags = rest[1:]
            alpha = next((os.path.join(img, f[len("alpha:"):]) for f in flags if f.startswith("alpha:")), None)
            save_webp(p, os.path.join(OUT, name), w, crop=crop, mask="mask" in flags, alpha=alpha)
            extra += 1
        else:
            print("no está en el juego:", src)

    # Qué arte extra existe, para que la UI no pida imágenes que el juego no tiene
    # (los héroes más nuevos todavía no traen arma).
    guns = sorted(f[:-len("_gun.webp")] for f in os.listdir(os.path.join(OUT, "images", "heroes", "guns")))
    # El fondo de arte de cada héroe, por id, para las páginas que no cargan su hero-kit.
    backgrounds = {}
    kit_dir = os.path.join(DATA, "hero-kit")
    for f in sorted(os.listdir(kit_dir)):
        if f.endswith(".json"):
            art = json.load(open(os.path.join(kit_dir, f), encoding="utf-8")).get("art") or {}
            rel = (art.get("background") or "")[len(BUCKET):]
            if rel in manifest:
                backgrounds[f[:-5]] = "/deadlock/game/" + manifest[rel]
    # Los héroes con las dos caras de ánimo (golpeado y festejando), que usa
    # Vestigo News para nerfeados y buffeados. Los más nuevos pueden no tenerlas.
    heroes_dir = os.path.join(OUT, "images", "heroes")
    moods = sorted(
        f[:-len("_card_critical.webp")]
        for f in os.listdir(heroes_dir)
        if f.endswith("_card_critical.webp") and os.path.exists(os.path.join(heroes_dir, f.replace("_critical", "_gloat")))
    )
    with open(os.path.join(DATA, "game-art.json"), "w", encoding="utf-8") as f:
        json.dump({"guns": guns, "backgrounds": backgrounds, "moods": moods}, f)
    with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=0, sort_keys=True)
    size = sum(os.path.getsize(os.path.join(r, x)) for r, _, fs in os.walk(OUT) for x in fs)
    print(f"reemplazos {len(manifest)} · extras {extra} · faltan {len(missing)} · {size // 1024} KB")
    for m in missing[:20]:
        print("  falta:", m)
    # Las versiones chicas (48/96/160 px) que usa GameImg: ver thumbs.py.
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import thumbs
    thumbs.build()


if __name__ == "__main__":
    sys.exit(main())
