"""Relaciones entre los objetos de Stardew Valley.

Regalos, paquetes del Centro Comunitario, recetas, máquinas y de dónde sale
cada cosa. Todo se lee de `games/stardew/raw/` por `sdv.raw`; los ids de
objeto son `str`, como en `Data/Objects` (los de `BigCraftables` llevan el
prefijo "(BC)"). Los resultados están cacheados: no se mutan.
"""
from functools import lru_cache

import sdv

SEASONS = ["spring", "summer", "fall", "winter"]
GUSTOS = ("love", "like", "dislike", "hate", "neutral")  # campos 1, 3, 5, 7 y 9
# Orden en que se miran las listas de un mismo nivel (personal o universal).
ORDEN_GUSTO = ("love", "hate", "like", "dislike", "neutral")
# Objetos de Data/Objects que no cuentan.
TIPOS_FUERA = {"Litter", "interactive"}
# Slime Crate (925), Camping Stove (927) y Hedge (929): su casilla de springobjects está vacía y ninguna parte del
# juego (código, tiendas, recetas, pedidos) los crea. Restos sin dibujo, no objetos que se consigan.
IDS_FUERA = {"449", "590", "SeedSpot", "925", "927", "929"}


def _sin_prefijo(item_id: str) -> str:
    """"(O)254" -> "254"; "(BC)12" queda igual."""
    return item_id[3:] if item_id.startswith("(O)") else item_id


@lru_cache(maxsize=None)
def objects() -> dict[str, dict]:
    """Los objetos considerados: todos los de `Data/Objects` menos la basura."""
    return {
        k: v
        for k, v in sdv.raw("Data/Objects").items()
        if v.get("Type") not in TIPOS_FUERA and k not in IDS_FUERA and v.get("Name") != "???"
    }


def _nombre(token: str | None, otro: str = "") -> list[str]:
    return [sdv.text(token, "en") or otro, sdv.text(token, "es") or otro]


# Categorías que salen con calidad: cosecha, recolección, pesca y productos animales (más la trufa y la Baya gema
# dulce, -17). La savia (92) es "greens" pero sale del árbol, sin calidad.
_CATEGORIAS_CON_CALIDAD = {-75, -79, -80, -81, -4, -5, -6, -18, -17}
# Productos artesanos con calidad: los que copian la del ingrediente (`CreateFlavoredDriedFruit`,
# `…DriedMushroom`, `…SmokedFish`), más los de la barrica y los de máquina con `Quality`/`CopyQuality` (abajo).
_ARTESANOS_CON_CALIDAD = {"DriedFruit", "DriedMushrooms", "SmokedFish"}


@lru_cache(maxsize=None)
def _artesanos_con_calidad() -> frozenset[str]:
    out = set(_ARTESANOS_CON_CALIDAD)
    for maquina, datos in sdv.raw("Data/Machines").items():
        for regla in datos.get("OutputRules") or []:
            for t in regla["Triggers"]:
                if maquina == "(BC)163" and t.get("RequiredItemId"):  # la barrica añeja lo que entra
                    out.add(_sin_prefijo(t["RequiredItemId"]))
            for it in regla["OutputItem"]:
                if (it.get("Quality", -1) > 0 or it.get("CopyQuality")) and it.get("ItemId"):
                    out.add(_sin_prefijo(it["ItemId"]))
    return frozenset(out)


def con_calidad(item_id: str) -> bool:
    """¿Puede tener calidad (plata, oro, iridio)? Los lingotes, gemas, anillos y demás tienen un solo precio."""
    o = sdv.raw("Data/Objects").get(item_id)
    if not o or item_id == "92":
        return False
    if o.get("Category") in _CATEGORIAS_CON_CALIDAD:
        return True
    if o.get("Category") == -23:  # la recolección de la playa sí; la hueva y la tinta de calamar, no
        return item_id not in ("812", "814")
    return item_id in _artesanos_con_calidad()


def precio_de_venta(item_id: str) -> int:
    """El precio base de venta: el de `Data/Objects`, salvo los anillos, que se venden a la mitad (no son `Object`:
    `Item.sellToStorePrice` es `salePrice() / 2`)."""
    o = sdv.raw("Data/Objects").get(item_id, {})
    return o.get("Price", 0) // 2 if o.get("Type") == "Ring" else o.get("Price", 0)


# ---------------------------------------------------------------- aldeanos


@lru_cache(maxsize=None)
def villagers() -> list[dict]:
    """Aldeanos sociables: `CanSocialize` distinto de "FALSE" y con gustos."""
    gustos = sdv.raw("Data/NPCGiftTastes")
    out = []
    for key, c in sdv.raw("Data/Characters").items():
        if c.get("CanSocialize") == "FALSE" or key not in gustos:
            continue
        out.append(
            {
                "key": key,
                "name": _nombre(c.get("DisplayName"), key),
                "birthday": [c.get("BirthSeason"), c.get("BirthDay")],
                "romance": bool(c.get("CanBeRomanced")),
                "region": c.get("HomeRegion") or "",
            }
        )
    return out


# ------------------------------------------------------------------ gustos


@lru_cache(maxsize=None)
def _listas(npc: str) -> dict[str, frozenset[str]]:
    """Las cinco listas de gustos de un aldeano (o las universales) como conjuntos."""
    gustos = sdv.raw("Data/NPCGiftTastes")
    if npc == "Universal":
        return {g: frozenset(gustos.get(f"Universal_{g.capitalize()}", "").split()) for g in GUSTOS}
    campos = gustos[npc].split("/")
    return {
        g: frozenset(campos[1 + 2 * i].split()) if len(campos) > 1 + 2 * i else frozenset()
        for i, g in enumerate(GUSTOS)
    }


def _en_listas(listas: dict[str, frozenset[str]], clave: str, neutral: bool = True) -> str | None:
    for g in ORDEN_GUSTO if neutral else ORDEN_GUSTO[:-1]:
        if clave in listas[g]:
            return g
    return None


def _por_tag(listas: dict[str, frozenset[str]], tags: set[str], neutral: bool = True) -> str | None:
    """Como `NPC.CheckTasteContextTags`: entradas que no empiezan con número ni "-"."""
    for g in ORDEN_GUSTO if neutral else ORDEN_GUSTO[:-1]:
        if any(t[0] not in "-0123456789" and t in tags for t in listas[g]):
            return g
    return None


def gift_taste(npc: str, item_id: str) -> str:
    """"love" | "like" | "neutral" | "dislike" | "hate" de un aldeano por un objeto.

    Como `NPC.getGiftTasteForThisItem`: primero lo universal (categoría, después tags, después id); los artefactos
    ("Arch") quedan en "dislike" salvo para Penny y el Enano; sin nada universal por id, lo que no se come
    (comestibilidad negativa) es "hate" y lo de menos de 20 g, "dislike". Después lo personal, que gana: por id, por
    tags y, sólo si ningún universal nombra el id, por categoría. Los anillos no son `Object` en el juego: neutrales.
    Los ids pueden ser de texto (`SkillBook_4`, `Book_Void`).
    """
    if item_id == "StardropTea":
        return "love"
    obj = sdv.raw("Data/Objects").get(item_id, {})
    if obj.get("Type") == "Ring":
        return "neutral"
    cat = str(obj.get("Category", ""))
    tags = _tags(item_id) if obj else set()
    uni = _listas("Universal")
    gusto = _por_tag(uni, tags, neutral=False) or _en_listas(uni, cat, neutral=False) or "neutral"
    por_id = _en_listas(uni, item_id)
    if por_id:
        gusto = por_id
    if obj.get("Type") == "Arch":
        gusto = "like" if npc in ("Penny", "Dwarf") else "dislike"
    if gusto == "neutral" and por_id != "neutral" and obj:
        comer = obj.get("Edibility", -300)
        if comer != -300 and comer < 0:
            gusto = "hate"
        elif obj.get("Price", 0) < 20:
            gusto = "dislike"
    if npc in sdv.raw("Data/NPCGiftTastes"):
        listas = _listas(npc)
        if g := _en_listas(listas, item_id) or _por_tag(listas, tags):
            return g
        if not por_id and cat != "0" and (g := _en_listas(listas, cat)):
            return g
    return gusto


@lru_cache(maxsize=None)
def tastes_by_item() -> dict[str, dict[str, list[str]]]:
    """objeto -> {"love": [npc…], "like": […], "dislike": […], "hate": […]}.

    Sólo lo que difiere de neutral; un objeto que nadie valora no aparece.
    """
    npcs = [v["key"] for v in villagers()]
    out: dict[str, dict[str, list[str]]] = {}
    for item_id in objects():
        fila: dict[str, list[str]] = {"love": [], "like": [], "dislike": [], "hate": []}
        for npc in npcs:
            g = gift_taste(npc, item_id)
            if g != "neutral":
                fila[g].append(npc)
        if any(fila.values()):
            out[item_id] = fila
    return out


# ---------------------------------------------------------------- paquetes


def _nombre_sala(room: str) -> list[str]:
    """Sala de `Data/Bundles` -> `Strings/Locations:CommunityCenter_AreaName_*`."""
    clave = "CommunityCenter_AreaName_" + room.replace(" ", "")
    en = sdv.raw("Strings/Locations").get(clave) or room
    es = sdv.raw("Strings/Locations.es-ES").get(clave) or en
    return [en, es]


def _recompensa(campo: str) -> list | None:
    """"O 465 20" -> ["465", 20]; "BO 10 1" -> ["(BC)10", 1]; vacío -> None."""
    partes = campo.split()
    if len(partes) != 3:
        return None
    tipo, item, cantidad = partes
    prefijo = {"O": "", "R": "", "BO": "(BC)"}.get(tipo, f"({tipo})")
    return [prefijo + item, int(cantidad)]


@lru_cache(maxsize=None)
def bundles() -> list[dict]:
    """Paquetes del Centro Comunitario, de `Data/Bundles`.

    Valor: nombre/recompensa/ítems/color/requeridos/…/nombre traducido. Los
    ítems son de a tres (`id cantidad calidad`; el id -1 es oro). El nombre en
    español sale de `Strings/BundleNames.es-ES` si trae el paquete (los del
    "remix"); si no, del último campo de `Data/Bundles.es-ES`.
    """
    en_data = sdv.raw("Data/Bundles")
    es_data = sdv.raw("Data/Bundles.es-ES")
    nombres_es = sdv.raw("Strings/BundleNames.es-ES")
    out = []
    for clave, valor in en_data.items():
        sala, indice = clave.split("/")
        campos = valor.split("/")
        ultimo_es = es_data.get(clave, valor).split("/")[-1]
        n = campos[2].split()
        items = [[n[i], int(n[i + 1]), int(n[i + 2])] for i in range(0, len(n) - 2, 3)]
        requeridos = campos[4] if len(campos) > 4 else ""
        out.append(
            {
                "room": sala,
                "index": int(indice),
                "room_name": _nombre_sala(sala),
                "name": [campos[0], nombres_es.get(campos[0]) or ultimo_es or campos[-1]],
                "items": items,
                "need": int(requeridos) if requeridos else len(items),
                "reward": _recompensa(campos[1]),
            }
        )
    return out


@lru_cache(maxsize=None)
def bundles_by_item() -> dict[str, list[list]]:
    """objeto -> [[sala, índice, cantidad, calidad]] (el oro, id -1, no entra)."""
    out: dict[str, list[list]] = {}
    for b in bundles():
        for item_id, cantidad, calidad in b["items"]:
            if item_id != "-1":
                out.setdefault(item_id, []).append([b["room"], b["index"], cantidad, calidad])
    return out


# ----------------------------------------------------------------- recetas


@lru_cache(maxsize=None)
def recipes() -> list[dict]:
    """Recetas de fabricación y de cocina.

    `CraftingRecipes`: ingredientes/lugar/salida/¿es de BigCraftables?/desbloqueo.
    `CookingRecipes`: ingredientes/-/salida/desbloqueo. Los ingredientes son un
    id de objeto o una categoría (número negativo).
    """
    objs = sdv.raw("Data/Objects")
    grandes = sdv.raw("Data/BigCraftables")
    out = []
    for kind, archivo in (("craft", "Data/CraftingRecipes"), ("cook", "Data/CookingRecipes")):
        for key, valor in sdv.raw(archivo).items():
            campos = valor.split("/")
            n = campos[0].split()
            grande = kind == "craft" and len(campos) > 3 and campos[3] == "true"
            salida = campos[2].split()
            item = salida[0]
            origen = (grandes if grande else objs).get(item)
            out.append(
                {
                    "kind": kind,
                    "key": key,
                    "name": _nombre(origen.get("DisplayName") if origen else None, key),
                    "out": "(BC)" + item if grande else item,
                    "qty": int(salida[1]) if len(salida) > 1 else 1,
                    "ings": [[n[i], int(n[i + 1])] for i in range(0, len(n) - 1, 2)],
                }
            )
    return out


# ---------------------------------------------------------------- máquinas

# Tags que el juego agrega a cada objeto según su categoría (`category_*`).
_TAG_CATEGORIA = {
    -2: "gem", -4: "fish", -5: "egg", -6: "milk", -7: "cooking", -12: "minerals",
    -15: "metal_resources", -16: "resource", -18: "animal_product", -26: "artisan_goods",
    -27: "syrup", -28: "monster_loot", -74: "seeds", -75: "vegetable", -79: "fruits",
    -80: "flowers", -81: "greens",
}

# Producto con sabor (`FLAVORED_ITEM <Sabor> …` en Data/Machines): id del objeto
# y precio en función del precio p del ingrediente. Las reglas no traen el
# precio: sale del código del juego (`Object.cs`, tabla de sabores), en enteros
# y redondeando hacia abajo:
#   Wine 3p; Juice 2,25p; Jelly y Pickles 2p + 50; Dried Fruit y Dried Mushrooms
#   7,5p + 25 (se hacen con 5 ingredientes); Aged Roe 2p (p = precio de la hueva);
#   Smoked Fish 2p; Honey 2p + 100 (p = precio de la flor); el cebo con sabor
#   (SpecificBait) no tiene factor: vale lo que el objeto base.
_SABORES = {
    "Wine": ("348", lambda p: 3 * p),
    "Juice": ("350", lambda p: 9 * p // 4),
    "Jelly": ("344", lambda p: 2 * p + 50),
    "Pickle": ("342", lambda p: 2 * p + 50),
    "DriedFruit": ("DriedFruit", lambda p: 15 * p // 2 + 25),
    "DriedMushroom": ("DriedMushrooms", lambda p: 15 * p // 2 + 25),
    "AgedRoe": ("447", lambda p: 2 * p),
    "SmokedFish": ("SmokedFish", lambda p: 2 * p),
    "Honey": ("340", lambda p: 2 * p + 100),
    "Bait": ("SpecificBait", lambda p: None),
}


def _tags(item_id: str) -> set[str]:
    o = sdv.raw("Data/Objects")[item_id]
    tags = set(o.get("ContextTags") or [])
    tags.add("id_o_" + item_id.lower())
    if o.get("Category") in _TAG_CATEGORIA:
        tags.add("category_" + _TAG_CATEGORIA[o["Category"]])
    return tags


def _condicion_del_objeto(condicion: str | None, item_id: str, tags: set[str]) -> bool:
    """Las consultas de `GameStateQuery` sobre el objeto (`Input` o `Target`), separadas por coma.

    `ITEM_ID`, `ITEM_CONTEXT_TAG` e `ITEM_EDIBILITY <objeto> [mín] [máx]` (por defecto -299 y sin tope: lo que se
    come); con "!" adelante se niegan. Las que no miran el objeto (estación, azar, profesión) se dan por ciertas.
    """
    for parte in (condicion or "").split(","):
        p = parte.split()
        if not p:
            continue
        negada = p[0].startswith("!")
        clave = p[0].lstrip("!")
        if clave == "ITEM_ID":
            vale = any(_sin_prefijo(i) == item_id for i in p[2:])
        elif clave == "ITEM_CONTEXT_TAG":
            vale = all(t in tags for t in p[2:])
        elif clave == "ITEM_EDIBILITY":
            comer = sdv.raw("Data/Objects").get(item_id, {}).get("Edibility", -300)
            minimo = int(p[2]) if len(p) > 2 else -299
            maximo = int(p[3]) if len(p) > 3 else 2**31
            vale = minimo <= comer <= maximo
        else:
            continue
        if vale == negada:
            return False
    return True


def _cumple(trigger: dict, item_id: str, tags: set[str]) -> bool:
    """¿El disparador acepta este objeto? Sólo cuenta `ItemPlacedInMachine` (1)."""
    if trigger.get("Trigger") != 1:
        return False
    requerido = trigger.get("RequiredItemId")
    exigidos = trigger.get("RequiredTags")
    if not (requerido or exigidos):
        return False  # sin condición no hay un objeto concreto que listar
    if requerido and _sin_prefijo(requerido) != item_id:
        return False
    for t in exigidos or []:
        if (t[1:] in tags) if t.startswith("!") else (t not in tags):
            return False
    return _condicion_del_objeto(trigger.get("Condition"), item_id, tags)


def _salida(item: dict, entrada: str, precio_entrada: int, objs: dict) -> dict | None:
    """Qué sale de un `OutputItem` para un ingrediente concreto, o None."""
    item_id = item.get("ItemId")
    if not item_id:
        return None  # el resultado lo calcula código del juego (barril, incubadora…)
    base = {"stack": item.get("MinStack", -1), "quality": max(item.get("Quality", -1), 0)}
    if item_id.startswith("FLAVORED_ITEM"):
        sal, formula = _SABORES[item_id.split()[1]]
        precio = formula(precio_entrada)
        if precio is None:
            precio = objs[sal]["Price"]
        return {"out": sal, "flavor": entrada, "price": precio, **base}
    if item_id == "DROP_IN":
        return {"out": entrada, "price": precio_entrada, **base}
    sal = _sin_prefijo(item_id)
    return {"out": sal, "price": objs[sal]["Price"] if sal in objs else 0, **base}


def _tiempos(regla: dict, modificadores: list[dict] | None = None, item_id: str = "") -> dict:
    """Minutos y días de la regla; con los `ReadyTimeModifiers` de la máquina que miran el objeto (el Cristalario
    tarda distinto con cada gema). Los que dependen del jugador (la profesión Avicultor) no se aplican."""
    minutos = max(regla.get("MinutesUntilReady", 0), 0)
    if minutos and modificadores and item_id:
        tags = _tags(item_id) if item_id in sdv.raw("Data/Objects") else set()
        propios = [{**m, "Condition": None} for m in modificadores
                   if (m.get("Condition") or "").lstrip("!").startswith("ITEM_")
                   and _condicion_del_objeto(m["Condition"].replace("Target", "Input"), item_id, tags)]
        minutos = _aplicar_recargos(minutos, propios, 0)
    return {"minutes": minutos, "days": max(regla.get("DaysUntilReady", 0), 0)}


@lru_cache(maxsize=None)
def machines_by_input() -> dict[str, list[dict]]:
    """objeto -> qué produce en cada máquina de `Data/Machines`.

    Cada máquina usa la primera regla cuyo disparador (ítem exacto o tags)
    acepta el objeto, como el juego. Cada entrada: `machine`, `out` (id del
    producto; en los de sabor, el producto genérico), `flavor` (el ingrediente,
    sólo en los de sabor), `price`, `minutes` y `days` (0 el que no aplica),
    `count` (ingredientes por vez) y `stack` (cantidad mínima producida).
    """
    objs = sdv.raw("Data/Objects")
    validos = objects()
    out: dict[str, list[dict]] = {}
    for maquina, datos in sdv.raw("Data/Machines").items():
        reglas = datos.get("OutputRules") or []
        for entrada in validos:
            tags = _tags(entrada)
            for regla in reglas:
                disp = [t for t in regla["Triggers"] if _cumple(t, entrada, tags)]
                if not disp:
                    continue
                for item in regla["OutputItem"]:
                    s = _salida(item, entrada, objs[entrada]["Price"], objs)
                    if s:
                        out.setdefault(entrada, []).append(
                            {"machine": maquina, **s,
                             **_tiempos(regla, datos.get("ReadyTimeModifiers"), entrada),
                             "count": disp[0].get("RequiredCount", 1)}
                        )
                break  # sólo la primera regla que acepta el objeto
        # La colmena no recibe ítems: la miel sale de la flor que tiene al lado.
        for regla in reglas:
            for item in regla["OutputItem"]:
                if not (item.get("ItemId") or "").startswith("FLAVORED_ITEM Honey"):
                    continue
                for flor, o in validos.items():
                    if o.get("Category") == -80:
                        out.setdefault(flor, []).append(
                            {"machine": maquina, **_salida(item, flor, o["Price"], objs),
                             **_tiempos(regla), "count": 0}
                        )
    return out


# ------------------------------------------------------------------ fuentes


# Botín con id negativo en `Data/Monsters`: `GameLocation.monsterDrop` hace `Debris(abs(id), 1–3)` y
# `Debris.InitializeResource` lo vuelve una mena o recurso (-4 carbón, -6 mena de oro…). Caen de 1 a 3.
RECURSOS_DE_BOTIN = {"-0": "378", "-2": "380", "-4": "382", "-6": "384", "-10": "386", "-12": "388", "-14": "390"}
CANTIDAD_DE_RECURSO = 3


def botin(texto: str) -> list[tuple[str, float, int]]:
    """Los pares `id probabilidad` del botín de un monstruo, con los ids negativos ya convertidos: (id, p, hasta)."""
    out = []
    for iid, p in _pares(texto):
        if iid.startswith("-"):
            if iid in RECURSOS_DE_BOTIN:
                out.append((RECURSOS_DE_BOTIN[iid], p, CANTIDAD_DE_RECURSO))
        else:
            out.append((iid, p, 1))
    return out


def _pares(texto: str) -> list[tuple[str, float]]:
    p = texto.split()
    return [(p[i], float(p[i + 1])) for i in range(0, len(p) - 1, 2)]


# Lugares de Data/Locations que no son sitios del mapa: la pesca de los festivales (el minijuego de la Feria y el
# mapa temporal de los festivales).
LUGARES_FUERA = {"Temp", "fishingGame"}


def estaciones_de_entrada(e: dict) -> set[int] | None:
    """Las estaciones de una entrada de `Data/Locations`: su `Season` o las de `LOCATION_SEASON`/`SEASON` en su
    `Condition` (negadas con "!"); None si no pide ninguna (todo el año). En 1.6 la estación de `Data/Fish` ya no
    cuenta (`GameLocation.CheckGenericFishRequirements` sólo mira horas, clima y nivel)."""
    if e.get("Season") is not None:
        return {e["Season"]}
    out = None
    for parte in (e.get("Condition") or "").split(","):
        p = parte.split()
        if not p or p[0].lstrip("!") not in ("LOCATION_SEASON", "SEASON"):
            continue
        nombres = p[2:] if p[0].lstrip("!") == "LOCATION_SEASON" else p[1:]
        estas = {SEASONS.index(x.lower()) for x in nombres if x.lower() in SEASONS}
        if p[0].startswith("!"):
            estas = {0, 1, 2, 3} - estas
        out = estas if out is None else out & estas
    return out


def _por_lugar(campo: str, valido) -> dict[str, dict]:
    """objeto -> {"where": [lugar…], "seasons": {estación…}} de `Locations.<campo>`."""
    res: dict[str, dict] = {}
    for lugar, loc in sdv.raw("Data/Locations").items():
        if lugar in LUGARES_FUERA:
            continue
        for e in loc.get(campo) or []:
            iid = _sin_prefijo(e.get("ItemId") or "")
            if not valido(iid):
                continue
            d = res.setdefault(iid, {"where": [], "seasons": set(), "todo_el_año": False})
            if lugar not in d["where"]:
                d["where"].append(lugar)
            estaciones = estaciones_de_entrada(e)
            if estaciones is None:
                d["todo_el_año"] = True
            else:
                d["seasons"] |= estaciones
    return res


# Las tiendas que sólo abren un día de festival, con su fecha (`Data/Festivals/FestivalDates`): las de Pierre y del
# mercader del Festival del Hielo salen de `Event.checkAction` (la acción "shop" de cada festival) y la de estrellas de
# la Feria, de `Event.answerDialogue` ("starTokenShop").
_TIENDAS_DE_FESTIVAL = {
    "Festival_EggFestival_Pierre": "spring13",
    "Festival_FlowerDance_Pierre": "spring24",
    "Festival_Luau_Pierre": "summer11",
    "Festival_DanceOfTheMoonlightJellies_Pierre": "summer28",
    "Festival_StardewValleyFair_StarTokens": "fall16",
    "Festival_SpiritsEve_Pierre": "fall27",
    "Festival_FestivalOfIce_TravelingMerchant": "winter8",
    "Festival_FeastOfTheWinterStar_Pierre": "winter25",
}
# Las de los festivales de varios días (`Data/PassiveFestivals`) llevan el id del festival adelante.
_PREFIJOS_DE_FESTIVAL_PASIVO = {"Festival_NightMarket_": "NightMarket", "DesertFestival_": "DesertFestival"}


def shop_season(tienda: str) -> int | None:
    """La estación en que abre una tienda de festival, o None si la tienda abre todo el año."""
    fecha = _TIENDAS_DE_FESTIVAL.get(tienda)
    if fecha is not None:
        fechas = sdv.raw("Data/Festivals/FestivalDates")
        if fecha not in fechas:
            raise ValueError(f"{tienda}: el festival {fecha} no está en FestivalDates")
        return next(n for n, e in enumerate(SEASONS) if fecha.startswith(e))
    for prefijo, festival in _PREFIJOS_DE_FESTIVAL_PASIVO.items():
        if tienda.startswith(prefijo):
            return sdv.raw("Data/PassiveFestivals")[festival]["Season"]
    return None


# Condiciones de recargo que se dan por ciertas: el jugador sin membresía de Joja.
_CONDICIONES_SUPUESTAS = {"!PLAYER_HAS_MAIL Current JojaMember"}


def _rango_de_recargos(precio: int, recargos: list[dict] | None, modo: int) -> tuple[int, int]:
    """El precio más bajo y el más alto con recargos al azar (`RandomAmount`, el carro ambulante): cada uno en su
    extremo bajo y después en el alto (sumar, multiplicar y fijar crecen con el valor). Sin azar, los dos iguales."""
    if not recargos or not any(r.get("RandomAmount") for r in recargos):
        p = _aplicar_recargos(precio, recargos, modo)
        return p, p

    def extremo(f) -> int:
        fijos = [{**r, "Amount": f(r["RandomAmount"]), "RandomAmount": None} if r.get("RandomAmount") else r
                 for r in recargos]
        return _aplicar_recargos(precio, fijos, modo)

    return extremo(min), extremo(max)


def _aplicar_recargos(precio: int, recargos: list[dict] | None, modo: int) -> int:
    """`Utility.ApplyQuantityModifiers` del juego sobre un precio, truncado a entero como en `ShopBuilder`.

    `Modification`: 0 suma, 1 resta, 2 multiplica, 3 divide, 4 fija. `modo` (`PriceModifierMode`): 0 se encadenan,
    1 el menor resultado, 2 el mayor. Un recargo al azar (`RandomAmount`) deja el precio como está (el rango lo da
    `_rango_de_recargos`), y uno con otra condición no se aplica.
    """
    if not recargos or any(r.get("RandomAmount") for r in recargos):
        return precio
    activos = [r for r in recargos if not r.get("Condition") or r["Condition"] in _CONDICIONES_SUPUESTAS]
    if not activos:
        return precio

    def uno(base: float, r: dict) -> float:
        m, a = r.get("Modification", 0), r.get("Amount", 0)
        return {0: base + a, 1: base - a, 2: base * a, 3: base / a if a else base, 4: a}.get(m, base)

    if modo == 0:
        valor = float(precio)
        for r in activos:
            valor = uno(valor, r)
    else:
        valores = [uno(float(precio), r) for r in activos]
        valor = min(valores) if modo == 1 else max(valores)
    return int(valor)


def _desde_cuando(condicion: str | None) -> dict:
    """Desde cuándo vende la tienda el ítem: `YEAR 2` -> {"year": 2}; `DAYS_PLAYED 15` -> {"day": 15}."""
    out = {}
    for parte in (condicion or "").split(","):
        p = parte.split()
        if len(p) == 2 and p[0] == "YEAR" and p[1].isdigit() and int(p[1]) > 1:
            out["year"] = int(p[1])
        elif len(p) == 2 and p[0] == "DAYS_PLAYED" and p[1].isdigit():
            out["day"] = int(p[1])
    return out


@lru_cache(maxsize=None)
def sources_by_item() -> dict[str, list[dict]]:
    """De dónde sale cada objeto: cultivo, árbol, tienda, pesca, recolección o botín."""
    objs = sdv.raw("Data/Objects")
    out: dict[str, list[dict]] = {}

    def sumar(item_id: str, fuente: dict) -> None:
        out.setdefault(item_id, []).append(fuente)

    # Cultivos: la clave es la semilla; los días son la suma de las fases.
    for semilla, c in sdv.raw("Data/Crops").items():
        sumar(
            c["HarvestItemId"],
            {"k": "crop", "seed": semilla, "days": sum(c["DaysInPhase"]),
             "seasons": list(c["Seasons"]), "regrow": max(c.get("RegrowDays", -1), 0)},
        )

    # Árboles frutales: la clave es el retoño; tardan 28 días en madurar
    # (`FruitTree.daysUntilMature` del código del juego; no está en los datos).
    for retono, t in sdv.raw("Data/FruitTrees").items():
        for fruto in t["Fruit"]:
            sumar(
                _sin_prefijo(fruto["ItemId"]),
                {"k": "tree", "sapling": retono, "days": 28, "seasons": list(t["Seasons"])},
            )

    # Tiendas: sólo ítems de id fijo, en moneda común y sin trueque. Sin precio
    # propio vale el del objeto por dos (`salePrice`). Después, como el juego
    # (`ShopBuilder`), los recargos de la tienda (salvo `IgnoreShopPriceModifiers`)
    # y los del ítem: Pierre ×2 a lo que no son semillas, Joja ×1,25 sin membresía.
    for tienda, t in sdv.raw("Data/Shops").items():
        if t.get("Currency", 0) != 0:
            continue
        vistos = set()
        for it in t["Items"]:
            iid = it.get("ItemId") or ""
            if it.get("TradeItemId") or not iid.startswith(("(O)", "(BC)")):
                continue
            sid = _sin_prefijo(iid)
            precio = it["Price"]
            if precio < 0:
                if sid not in objs:
                    continue
                precio = objs[sid]["Price"] * 2
            if not it.get("IgnoreShopPriceModifiers"):
                precio = _aplicar_recargos(precio, t.get("PriceModifiers"), t.get("PriceModifierMode", 0))
            precio, hasta = _rango_de_recargos(precio, it.get("PriceModifiers"), it.get("PriceModifierMode", 0))
            if (sid, precio) not in vistos:
                vistos.add((sid, precio))
                fuente = {"k": "shop", "shop": tienda, "price": precio}
                if hasta != precio:
                    fuente["max"] = hasta  # al azar entre los dos (el carro ambulante)
                fuente.update(_desde_cuando(it.get("Condition")))
                sumar(sid, fuente)

    # Pesca: lugares y estaciones de Locations.Fish (la estación de Data/Fish no cuenta desde 1.6).
    fish = sdv.raw("Data/Fish")
    lugares = _por_lugar("Fish", lambda i: i in fish)
    for iid, linea in fish.items():
        campos = linea.split("/")
        if campos[1] == "trap":  # trampas de cangrejo: el agua está en el campo 4
            sumar(iid, {"k": "fish", "where": ["CrabPot:" + campos[4]], "seasons": [0, 1, 2, 3]})
        elif iid in lugares:
            d = lugares[iid]
            estaciones = [0, 1, 2, 3] if d["todo_el_año"] else sorted(d["seasons"])
            sumar(iid, {"k": "fish", "where": d["where"], "seasons": estaciones})

    # Recolección: una entrada sin estación vale todo el año.
    for iid, d in _por_lugar("Forage", lambda i: i in objs).items():
        estaciones = [0, 1, 2, 3] if d["todo_el_año"] else sorted(d["seasons"])
        sumar(iid, {"k": "forage", "where": d["where"], "seasons": estaciones})

    # Botín de monstruos: campo 6 de Data/Monsters, pares `id probabilidad`;
    # el nombre en español es el último campo de Data/Monsters.es-ES. Cada par es una tirada aparte
    # (`Monster.parseMonsterInfo`): `rate` es la probabilidad de que caiga al menos uno, 1 − ∏(1 − p), y `n` cuántas
    # tiradas hay (hasta cuántos caen) cuando es más de una.
    es = sdv.raw("Data/Monsters.es-ES")
    for clave, linea in sdv.raw("Data/Monsters").items():
        por_objeto: dict[str, list[tuple[float, int]]] = {}
        for iid, p, hasta in botin(linea.split("/")[6]):
            por_objeto.setdefault(iid, []).append((p, hasta))
        nombre_es = es.get(clave, linea).split("/")[-1]
        for iid, ps in por_objeto.items():
            nada = 1.0
            for p, _ in ps:
                nada *= 1 - min(p, 1.0)
            fuente = {"k": "monster", "who": [clave, nombre_es], "rate": round(1 - nada, 6)}
            if (n := sum(h for _, h in ps)) > 1:
                fuente["n"] = n
            sumar(iid, fuente)
    return out
