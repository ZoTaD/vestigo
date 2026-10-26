"""Datos del museo de Stardew Valley para el sitio: las piezas que se donan, sus premios y los libros.

Uso: python games/stardew/tools/museum_data.py

Escribe `games/stardew/data/museum.json`. Las piezas son los objetos de tipo `Arch` o `Minerals`
(`LibraryMuseum.IsItemSuitableForDonation`); de dónde salen se arma con `ArtifactSpotChances` y `ArtifactSpots`
(`Data/Objects`, `Data/Locations`), `GeodeDrops`, el botín de los monstruos de `mines.json` y, lo que el juego tiene en
el código (lo que da cada geoda por defecto, lo que se excava en las Minas, el cofre de pesca, las vetas de gemas),
copiado como valores a las tablas de abajo, cada una con el método de origen. Los premios salen de
`Data/MuseumRewards`; los libros, de `Data/Objects` (categorías -102 y -103), `Data/Powers` y `Data/Shops`.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import crops_data  # noqa: E402
import mines_data  # noqa: E402
import sdv  # noqa: E402

DATA = crops_data.DATA

# Libros perdidos de la biblioteca (`LibraryMuseum.totalNotes`) y el objeto que los representa.
_LIBROS_PERDIDOS = 21
_LIBRO_PERDIDO = "102"

# Nombre de cada lugar de excavación: clave de `Data/Locations` (o de `ArtifactSpotChances`) -> (archivo, clave).
# Las granjas (`Farm_*`) son todas "Granja". `Mine` es la entrada de las Minas y `UndergroundMine`, sus pisos.
_LUGARES = {
    "Farm": ("Strings/UI", "ParrotPlatform_Farm"),
    "Town": ("Strings/StringsFromCSFiles", "MapPage.cs.11190"),
    "Mountain": ("Strings/StringsFromCSFiles", "MapPage.cs.11176"),
    "Forest": ("Strings/StringsFromCSFiles", "MapPage.cs.11186"),
    "BusStop": ("Strings/StringsFromCSFiles", "MapPage.cs.11066"),
    "Beach": ("Strings/StringsFromCSFiles", "MapPage.cs.11174"),
    "Mine": ("Strings/StringsFromCSFiles", "MapPage.cs.11098"),
    "UndergroundMine": ("Strings/StringsFromCSFiles", "MapPage.cs.11098"),
    "Desert": ("Strings/StringsFromCSFiles", "MapPage.cs.11062"),
    "Railroad": ("Strings/StringsFromCSFiles", "MapPage.cs.11119"),
    "Backwoods": ("Strings/StringsFromCSFiles", "MapPage.cs.11065"),
}

# Lo que sale al cavar con la azada en los pisos de las Minas, fuera de los lugares de artefacto
# (`MineShaft.checkForBuriedItem`): 96, 110, 112 y 585 en cualquier piso; 121 y 97 hasta el 39, 122 del 40 al 79, 99
# del 80 en adelante, y las muñecas 126 y 127.
_EXCAVAR_MINAS = ["96", "97", "99", "110", "112", "121", "122", "126", "127", "585"]

# Lo que da cada geoda cuando no toca `GeodeDrops` (`Utility.getTreasureFromGeode`, con `GeodeDropsDefaultItems`):
# además de menas, carbón y arcilla, la geoda común da el cristal de tierra, la helada la lágrima congelada, la de magma
# el cuarzo de fuego y la omni cualquiera de los tres.
_GEODA_POR_DEFECTO = {"535": ["86"], "536": ["84"], "537": ["82"], "749": ["82", "84", "86"]}

# Piezas del cofre del tesoro de pesca (`FishingRod.openTreasureMenuEndFunction`): 585 a 587 y 103 a 119 (después de
# donar algo), las gemas según la distancia al agua limpia (60, 62, 64, 66, 68, 70, 72 y los cristales 82, 84, 86), las
# muñecas 126 y 127 y el fragmento prismático 74.
_PESCA = {"585", "586", "587", *(str(n) for n in range(103, 120)),
          "60", "62", "64", "66", "68", "70", "72", "82", "84", "86", "126", "127", "74"}

# Lo que sueltan los monstruos fuera de su botín de `Data/Monsters` (`getExtraDropItems`): el Rex pimienta da el huevo
# de dinosaurio (10 %) o uno de tres fósiles (`DinoMonster.getExtraDropItems`). Quedan afuera las babas de color
# (`GreenSlime.getExtraDropItems`), que dependen del color y no de la clave del monstruo.
_MONSTRUOS_EXTRA = {"Pepper Rex": ["107", "580", "583", "584"]}

# Lo demás, con texto propio y nombres del juego: las vetas de gemas (`GameLocation.breakStone`, piedras 2 a 14), las
# piedras de las Minas que sueltan cuarzos y cristales (`MineShaft.checkStoneForItems` / `Object.performToolAction`
# según el tramo: 86 hasta el 39, 84 del 40 al 79, 82 del 80 en adelante, 80 en cualquiera), el fragmento prismático
# de la piedra mística y la veta de iridio (`breakStone`, 46 y 765) y los fósiles de las vetas de hueso de la Isla
# Jengibre (`breakStone`, 816 y 817: 579 a 589).
_GEMAS = {"60", "62", "64", "66", "68", "70", "72"}
_PIEDRAS = {"80": None, "86": (1, 39), "84": (40, 79), "82": (80, 120)}
# Las que dan 84 y 82 lo hacen sólo después de haber llegado al fondo de las Minas (`breakStone`, `timesReachedMineBottom > 0`).
_PIEDRAS_AL_FONDO = {"84", "82"}
_FOSILES_ISLA = {str(n) for n in range(579, 590)}


def _par(archivo: str, clave: str) -> list[str]:
    """[en, es] de una clave de `Strings/*`; en español cae al inglés si falta."""
    en = sdv.raw(archivo)[clave]
    return [en.strip(), (sdv.raw(archivo + ".es-ES").get(clave) or en).strip()]


def _tok(token: str) -> list[str]:
    return [sdv.text(token, "en").strip(), sdv.text(token, "es").strip()]


def _obj(n: str) -> list[str]:
    return mines_data.objeto(n)


def _sin_prefijo(i: str) -> str:
    return i[3:] if i.startswith("(O)") else i


def slug(clave: str) -> str:
    """El ancla de una fila: la clave del juego en minúsculas, con espacios y "_" cambiados por "-"."""
    return clave.lower().replace(" ", "-").replace("_", "-")


def _plata(n: int) -> list[str]:
    return [f"{n:,}g", f"{n:,}".replace(",", ".") + " g"]


def _lugar(clave: str) -> list[str]:
    if clave.startswith("Farm_"):
        clave = "Farm"
    if clave not in _LUGARES:
        raise KeyError(f"lugar sin nombre: {clave}")
    return _par(*_LUGARES[clave])


def _piezas_ids() -> list[str]:
    return [k for k, o in sdv.raw("Data/Objects").items() if o["Type"] in ("Arch", "Minerals")]


def _excavar(ids: set[str]) -> dict[str, list[list[str]]]:
    """id -> lugares donde se excava (sin repetir y en el orden en que aparecen)."""
    out: dict[str, list[list[str]]] = {}

    def sumar(i: str, lugar: str):
        nombre = _lugar(lugar)
        if nombre not in out.setdefault(i, []):
            out[i].append(nombre)

    for i, o in sdv.raw("Data/Objects").items():
        if i in ids:
            for lugar in o.get("ArtifactSpotChances") or {}:
                sumar(i, lugar)
    for lugar, l in sdv.raw("Data/Locations").items():
        for spot in l.get("ArtifactSpots") or []:
            iid = _sin_prefijo(spot.get("ItemId") or "")
            if iid in ids and lugar != "Default":
                sumar(iid, lugar)
    for i in _EXCAVAR_MINAS:
        sumar(i, "UndergroundMine")
    return out


def _geodas(ids: set[str]) -> dict[str, list[str]]:
    """id de pieza -> geodas que la dan (`GeodeDrops` y la tabla por defecto)."""
    out: dict[str, list[str]] = {}
    for g, o in sdv.raw("Data/Objects").items():
        dan = []
        for drop in o.get("GeodeDrops") or []:
            dan += [_sin_prefijo(x) for x in [drop.get("ItemId"), *(drop.get("RandomItemId") or [])] if x]
        if o.get("GeodeDropsDefaultItems"):
            dan += _GEODA_POR_DEFECTO.get(g, [])
        for i in dan:
            if i in ids and g not in out.setdefault(i, []):
                out[i].append(g)
    return out


def _monstruos() -> list[dict]:
    return json.loads((DATA / "mines.json").read_text(encoding="utf-8"))["monsters"]


def _otras(i: str) -> list[list[str]]:
    minas = _par("Strings/StringsFromCSFiles", "MapPage.cs.11098")
    out = []
    if i in _GEMAS:
        out.append([f"Gem nodes in the {minas[0]}.", f"Vetas de gemas en las {minas[1]}."])
    if i in _PIEDRAS:
        pisos = _PIEDRAS[i]
        fondo = i in _PIEDRAS_AL_FONDO
        if pisos:
            out.append([f"Rocks in the {minas[0]}, floors {pisos[0]} to {pisos[1]}"
                        + (f", once you have reached the bottom of the {minas[0]}." if fondo else "."),
                        f"Piedras de las {minas[1]}, pisos {pisos[0]} a {pisos[1]}"
                        + (f", después de haber llegado al fondo de las {minas[1]}." if fondo else ".")])
        else:
            out.append([f"Rocks in the {minas[0]}.", f"Piedras de las {minas[1]}."])
    if i == "74":
        mistica, iridio = _par("Strings/Objects", "MysticStone_Name"), _obj("386")
        out.append([f"{mistica[0]} and {iridio[0].lower()} nodes, rarely.",
                    f"{mistica[1]} y vetas de {iridio[1].lower()}, muy de vez en cuando."])
    if i == "74":
        caja = _par("Strings/Objects", "MysteryBox_Name")
        out.append([f"Very rarely inside a {caja[0]}.", f"Muy de vez en cuando dentro de una {caja[1].lower()}."])
    if i in _FOSILES_ISLA:
        isla = _par("Strings/StringsFromCSFiles", "IslandName")
        out.append([f"Fossil nodes on {isla[0]}.", f"Vetas de fósiles en la {isla[1]}."])
    return out


def pieces() -> list[dict]:
    slugs, _ = mines_data.sitio()
    ids = _piezas_ids()
    todas = set(ids)
    excavar, geodas, mons = _excavar(todas), _geodas(todas), _monstruos()
    out = []
    for i in ids:
        o = sdv.raw("Data/Objects")[i]
        where = []
        if i in excavar:
            where.append({"k": "dig", "places": excavar[i]})
        if i in geodas:
            where.append({"k": "geode", "geodes": geodas[i]})
        vistos = set()
        for m in mons:
            # El Gólem de iridio se llama igual que el salvaje en el juego (`Wilderness Golem`): una fila por nombre.
            if m["name"][0] in vistos:
                continue
            if any(fila[0] == i for fila in m["loot"]) or i in _MONSTRUOS_EXTRA.get(m["key"], []):
                vistos.add(m["name"][0])
                where.append({"k": "monster", "who": m["name"], "slug": m["slug"], "slugEs": m["slugEs"]})
        if i in _PESCA:
            where.append({"k": "fish"})
        where += [{"k": "other", "text": t} for t in _otras(i)]
        out.append({"id": i, "slug": slugs[i][0] if i in slugs else slug(o["Name"]),
                    "kind": "arch" if o["Type"] == "Arch" else "mineral", "where": where})
    return out


# Qué cuenta cada etiqueta de `TargetContextTags` (`LibraryMuseum.getRewardsForPlayer`); la vacía, cualquier donación.
_ETIQUETAS = {"item_type_arch": "arch", "item_type_minerals": "mineral", "": "any"}

# Tamaño del dibujo de un mueble cuando `Data/Furniture` no lo trae (`Furniture.getDefaultSourceRectForType`), en
# casillas de 16 px.
_MUEBLE_POR_TIPO = {"chair": (1, 2), "painting": (2, 2), "decor": (1, 2)}

# El premio de las 60 donaciones no es un objeto: el evento 295672 (`MarkEventSeen`), en el que Gunther da la Llave
# oxidada, que es un poder de `Data/Powers`.
_EVENTO_LLAVE = "MarkEventSeen Host 295672"


def _premio(r: dict, slugs: dict) -> dict:
    iid = r["RewardItemId"]
    if iid is None:
        if _EVENTO_LLAVE not in (r.get("RewardActions") or []):
            raise ValueError(f"premio sin objeto: {r}")
        return {"id": "RustyKey", "n": 1, "recipe": False,
                "name": _tok(sdv.raw("Data/Powers")["RustyKey"]["DisplayName"]), "sprite": [16, 16]}
    out = {"id": _sin_prefijo(iid), "n": r["RewardItemCount"], "recipe": r["RewardItemIsRecipe"]}
    if iid.startswith("(O)"):
        out["name"] = _obj(iid[3:])
        # La receta se nombra como en el juego: "Semillas milenarias (Receta)" (`Object.cs.12657`).
        if out["recipe"]:
            out["name"] = [f"{n} {suf}" for n, suf in zip(out["name"], _par("Strings/StringsFromCSFiles", "Object.cs.12657"))]
        if iid[3:] not in slugs:
            out["sprite"] = [16, 16]
    elif iid.startswith("(BC)"):
        out["name"] = _tok(sdv.raw("Data/BigCraftables")[iid[4:]]["DisplayName"])
        out["sprite"] = [16, 32]
    elif iid.startswith("(F)"):
        campos = sdv.raw("Data/Furniture")[iid[3:]].split("/")
        tam = campos[2].split()
        w, h = (int(tam[0]), int(tam[1])) if len(tam) == 2 else _MUEBLE_POR_TIPO[campos[1]]
        out["name"] = _tok(campos[7])
        out["sprite"] = [w * 16, h * 16]
    else:
        raise ValueError(f"premio de tipo desconocido: {iid}")
    return out


def rewards(total: int) -> list[dict]:
    slugs, _ = mines_data.sitio()
    arts = [t.lower() for t in _par("Strings/UI", "Collections_Artifacts")]
    mins = [t.lower() for t in _par("Strings/UI", "Collections_Minerals")]
    out = []
    for k, r in sdv.raw("Data/MuseumRewards").items():
        ids, tags = [], []
        for t in r["TargetContextTags"]:
            if t["Tag"].startswith("id_o_"):
                ids.append(t["Tag"][5:])
            else:
                tags.append([_ETIQUETAS[t["Tag"]], total if t["Count"] < 0 else t["Count"]])
        partes = [[], []]
        nombres = [_obj(i) for i in ids]
        for lang in (0, 1):
            lista = ", ".join(n[lang] for n in nombres)
            if len(ids) > 1 and not tags:
                lista = f"{len(ids)} {'items' if lang == 0 else 'objetos'}: {lista}"
            if lista:
                partes[lang].append(lista)
            for tag, n in tags:
                if tag == "arch":
                    partes[lang].append(f"{n} {arts[lang]}")
                elif tag == "mineral":
                    partes[lang].append(f"{n} {mins[lang]}")
                elif n == total:
                    partes[lang].append(f"All {n} {arts[0]} and {mins[0]}" if lang == 0
                                        else f"Los {n} {arts[1]} y {mins[1]}")
                else:
                    partes[lang].append(f"{n} {arts[lang]} {'or' if lang == 0 else 'o'} {mins[lang]}")
        out.append({"key": k, "slug": slug(k), "need": {"ids": ids, "tags": tags},
                    "text": [" + ".join(partes[0]), " + ".join(partes[1])], "reward": _premio(r, slugs)})
    return out


# Otras fuentes de los libros, con texto propio y nombres del juego. Métodos: `GameLocation.monsterDrop` (Book_Void),
# `GameLocation.answerDialogueAction` premio "12_3" de la Fiesta del Calamar (Book_Crabbing), `Object.performToolAction`
# al cavar un lugar de artefacto (Book_Defense), `Utility.getTreasureFromGeode` con las cajas misteriosas
# (Book_Mystery, PurpleBook), `FishingRod.openTreasureMenuEndFunction` (Book_Roe y los de habilidad en el cofre
# dorado), `Tree.performToolAction` (Book_Woodcutting), `PrizeTicketMenu.getPrizeItem` (Book_Friendship),
# `AdventureGuild.resetLocalState` y `Town.resetLocalState` con `addOneTimeGiftBox` (Book_Marlon, Book_Trash) y
# `Raccoon.getBundleReward` de los mapaches, la segunda vez (Book_WildSeeds).
def _fuentes_extra() -> dict[str, list[list[str]]]:
    caja, cofre = _par("Strings/Objects", "MysteryBox_Name"), _par("Strings/Objects", "TreasureChest_Name")
    calamar = _par("Strings/1_6_Strings", "SquidFest")
    lugar = _par("Strings/Objects", "ArtifactSpot_Name")
    gremio = _par("Strings/StringsFromCSFiles", "MapPage.cs.11099")
    pueblo = _par("Strings/StringsFromCSFiles", "MapPage.cs.11190")
    misterio = [f"Sometimes inside a {caja[0]}.", f"A veces dentro de una {caja[1].lower()}."]
    habilidad = [f"Sometimes in a golden fishing {cofre[0].lower()}.", f"A veces en un {cofre[1].lower()} dorado de pesca."]
    out = {
        "Book_Void": [["A rare drop from monsters.", "Lo sueltan los monstruos, muy de vez en cuando."]],
        "Book_Crabbing": [[f"A {calamar[0]} prize.", f"Premio de la {calamar[1]}."]],
        "Book_Defense": [[f"Rarely, when digging up an {lugar[0].lower()}.", f"A veces, al cavar un {lugar[1].lower()}."]],
        "Book_Mystery": [misterio],
        "PurpleBook": [misterio],
        "Book_Roe": [[f"Rarely in a fishing {cofre[0].lower()}.", f"A veces en un {cofre[1].lower()} de pesca."]],
        "Book_Woodcutting": [["Rarely when chopping down trees.", "A veces al talar árboles."]],
        "Book_Friendship": [["A Prize Machine prize.", "Premio de la máquina de premios."]],
        "Book_Marlon": [[f"A gift box the first time you enter the {gremio[0]}.",
                         f"Una caja de regalo la primera vez que se entra al {gremio[1]}."]],
        "Book_Trash": [[f"A one-time gift box in {pueblo[0]}.", f"Una caja de regalo, una sola vez, en {pueblo[1]}."]],
        "Book_WildSeeds": [["The raccoons' reward, the second time you help them.",
                            "El premio de los mapaches, la segunda vez que se los ayuda."]],
    }
    for n in range(5):
        out[f"SkillBook_{n}"] = [habilidad, misterio]
    return out


def _condicion(cond: str | None) -> list[str] | None:
    """La condición de una fila de tienda, en palabras; None si no tiene."""
    if not cond:
        return None
    partes = cond.split()
    if partes[0] == "YEAR":
        anio = [t.format(partes[1]) for t in _par("Strings/UI", "Billboard_Year")]
        return [f"from {anio[0]}", f"desde el {anio[1].lower()}"]
    if partes[0] == "WORLD_STATE_FIELD" and partes[1] == "GoldenWalnutsFound":
        nuez = _par("Strings/Objects", "GoldenWalnut_Name")
        return [f"after finding {partes[2]} {nuez[0]}s",
                f"después de encontrar {partes[2]} {nuez[1].lower().replace('nuez', 'nueces', 1)}"]
    if partes[0] == "PLAYER_STAT" and partes[2].startswith("Book_"):
        leido = _obj(partes[2])
        return [f"after reading {leido[0]}", f"después de leer {leido[1]}"]
    if partes[0] == "SYNCED_RANDOM":
        return ["some days", "algunos días"]
    raise ValueError(f"condición sin texto: {cond}")


def _ventas(libros: set[str]) -> dict[str, list[tuple[str, int | None, list[str] | None, str | None, int, bool]]]:
    """id de libro -> [(tienda, precio, condición, objeto que pide a cambio, cuántos, si es uno al azar)] en el orden de `Data/Shops`."""
    tiendas = {"Bookseller", "AnimalShop", "Dwarf", "VolcanoShop", "Traveler", "DesertFestival_EggShop"}
    out: dict[str, list] = {}
    for t, s in sdv.raw("Data/Shops").items():
        if t not in tiendas:
            continue
        for it in s["Items"]:
            for iid in [it.get("ItemId"), *(it.get("RandomItemId") or [])]:
                if not iid or _sin_prefijo(iid) not in libros:
                    continue
                precio = it["Price"] if it["Price"] > 0 else None
                al_azar = bool(it.get("RandomItemId"))
                out.setdefault(_sin_prefijo(iid), []).append(
                    (t, precio, _condicion(it.get("Condition")), it.get("TradeItemId"), it.get("TradeItemAmount") or 1,
                     al_azar))
    return out


def _nombre_tienda(t: str) -> list[str]:
    if t == "Bookseller":
        return _par("Strings/1_6_Strings", "Bookseller")
    if t == "AnimalShop":
        return _par("Strings/StringsFromCSFiles", "MapPage.cs.11068")
    if t == "Dwarf":
        return _par("Strings/NPCNames", "Dwarf")
    if t == "VolcanoShop":
        enano, volcan = _par("Strings/NPCNames", "Dwarf"), _par("Strings/WorldMap", "GingerIsland_North_Volcano")
        return [f"{enano[0]} ({volcan[0]})", f"{enano[1]} ({volcan[1]})"]
    if t == "Traveler":
        return ["Traveling Cart", "Carreta ambulante"]
    if t == "DesertFestival_EggShop":
        return _par("Strings/1_6_Strings", "DesertFestival")
    raise KeyError(t)


def books() -> list[dict]:
    slugs, _ = mines_data.sitio()
    libros = {k for k, o in sdv.raw("Data/Objects").items() if o["Category"] in (-102, -103)}
    poderes, ventas, extra = sdv.raw("Data/Powers"), _ventas(libros), _fuentes_extra()
    geodas = _geodas(libros)
    out = []
    for k, o in sdv.raw("Data/Objects").items():
        if k not in libros:
            continue
        desc = poderes.get(k, {}).get("Description") or o["Description"]
        frases: list[list[str]] = []
        precios = []
        # La condición de la fila del Librero cuando tiene precio (la pantalla la muestra junto a la cifra, no como una
        # fuente más): "uno de sus libros al azar, desde el año 3". None si no tiene condición.
        nota: list[str] | None = None
        # Por tienda, la fila más barata (el Librero ofrece los de habilidad a 5.000, 8.000 y 10.000 según el día).
        vistas = set()
        for t, precio, cond, pide, cuantos, al_azar in sorted(ventas.get(k, []), key=lambda v: (v[0] != "Bookseller", v[1] or 0)):
            if t in vistas:
                continue
            vistas.add(t)
            nombre = _nombre_tienda(t)
            if precio:
                paga = _plata(precio)
            else:
                cosa = _obj(_sin_prefijo(pide))
                paga = [f"{cuantos} × {cosa[0]}", f"{cuantos} × {cosa[1]}"]
            frase = [f"{nombre[0]}: {paga[0]}", f"{nombre[1]}: {paga[1]}"]
            notas = [[], []]
            if al_azar:
                notas[0].append("one of its random books")
                notas[1].append("uno de sus libros al azar")
            if cond:
                notas[0].append(cond[0])
                notas[1].append(cond[1])
            if t == "Bookseller" and precio:
                precios.append(precio)
                nota = [", ".join(notas[0]), ", ".join(notas[1])] if notas[0] else None
                continue
            if notas[0]:
                frase = [f"{frase[0]} ({', '.join(notas[0])})", f"{frase[1]} ({', '.join(notas[1])})"]
            frases.append([frase[0] + ".", frase[1] + "."])
        frases += extra.get(k, [])
        # Las geodas que lo dan por `GeodeDrops` (el Cofre de artefactos da la Guía de tasación).
        for g in geodas.get(k, []):
            geoda = _obj(g)
            frases.append([f"Sometimes inside an {geoda[0]}." if geoda[0][0] in "AEIOU" else f"Sometimes inside a {geoda[0]}.",
                           f"A veces dentro de {'una' if geoda[1].lower().startswith('geoda') else 'un'} {geoda[1].lower()}."])
        if not frases and not precios:
            raise ValueError(f"libro sin fuente: {k}")
        out.append({
            "id": k, "slug": slugs[k][0] if k in slugs else None, "name": _obj(k), "effect": _tok(desc),
            "price": min(precios) if precios else None,
            "priceNote": nota,
            "where": frases,
        })
    return out


def museum() -> dict:
    slugs, nombres = mines_data.sitio()
    pz = pieces()
    pr = rewards(len(pz))
    li = books()
    # Los objetos nombrados (con la forma de `Ref`: slug, slug español, nombre en, es, ancho, alto).
    ids = {p["id"] for p in pz} | {g for p in pz for w in p["where"] if w["k"] == "geode" for g in w["geodes"]}
    ids |= {i for r in pr for i in r["need"]["ids"]} | {r["reward"]["id"] for r in pr}
    ids |= {b["id"] for b in li} | {_LIBRO_PERDIDO}
    # Los `(BC)` (el cristalario, la piedra musical) miden 16×32 y su nombre en inglés sale de `Data/BigCraftables`
    # (`mines_data.sitio` nombra en inglés sólo lo de `Data/Objects`).
    def nombre(i: str) -> list[str]:
        if i.startswith("(BC)"):
            return [_tok(sdv.raw("Data/BigCraftables")[i[4:]]["DisplayName"])[0], nombres[i][1]]
        return nombres[i]

    refs = {i: [*slugs[i], *nombre(i), 16, 32 if i.startswith("(BC)") else 16] for i in sorted(ids) if i in slugs}
    return {"pieces": pz, "rewards": pr, "books": li, "lostBooks": _LIBROS_PERDIDOS, "lostBook": _LIBRO_PERDIDO,
            "refs": refs}


def main() -> None:
    ruta = DATA / "museum.json"
    ruta.write_text(json.dumps(museum(), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("museum.json", ruta.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
