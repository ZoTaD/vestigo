"""Datos de misiones de Stardew Valley para el sitio: las misiones de la historia y los pedidos especiales del tablero del
pueblo y del desierto.

Uso: python games/stardew/tools/quests_data.py

Escribe `games/stardew/data/quests.json`. Las misiones salen de `Data/Quests` (y `Data/Quests.es-ES`), con los campos
separados por "/" como los lee `Quest.getQuestFromId`. Los pedidos, de `Data/SpecialOrders` sin los de Qi (que van en
`island.json`), con los textos de `Strings/SpecialOrderStrings`. Los `RandomizedElements` (lo que el juego elige al azar
al poner el pedido en el tablero) se escriben como la lista de todas las opciones. Lo que se desbloquea con cada pedido
sale de la carta que manda (`Data/mail`) o, cuando no hay carta, de una tabla de abajo.
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import crops_data  # noqa: E402
import island_data  # noqa: E402
import mines_data  # noqa: E402
import sdv  # noqa: E402

DATA = crops_data.DATA
slug = island_data.slug

# Tipos de misión que nombran a un aldeano y a un objeto en sus condiciones (campo 4): `ItemDeliveryQuest`,
# `LostItemQuest` y `SecretLostItemQuest` empiezan con el aldeano y siguen con el objeto.
_CON_ALDEANO = {"ItemDelivery", "LostItem", "SecretLostItem"}

# Las dos misiones secretas del collar (`SecretLostItemQuest`) traen "..." de título y de texto: no salen en el diario.
# Se dan a una o a la otra (la cuarta condición es la misión que se cancela). Las frases son propias.
_COLLAR = {
    "128": {"title": ["Ornate Necklace: Abigail", "Collar adornado: Abigail"],
            "desc": ["Give the necklace to Abigail. It goes to her or to Caroline, not both.",
                     "Dale el collar a Abigail. Va para ella o para Caroline, no para las dos."],
            "goal": ["Bring the necklace to Abigail.", "Llevale el collar a Abigail."]},
    "129": {"title": ["Ornate Necklace: Caroline", "Collar adornado: Caroline"],
            "desc": ["Give the necklace to Caroline. It goes to her or to Abigail, not both.",
                     "Dale el collar a Caroline. Va para ella o para Abigail, no para las dos."],
            "goal": ["Bring the necklace to Caroline.", "Llevale el collar a Caroline."]},
}

# "Presentaciones" (`SocializeQuest.loadQuestInfo`) arma el objetivo en el código con "{0}/{1} people greeted": {1}
# son los aldeanos con `IntroductionsQuest` (o, si no lo dicen, los que viven en el pueblo).
_SALUDOS = ("Strings/StringsFromCSFiles", "SocializeQuest.cs.13802")

# Tablero de cada `OrderType` (`SpecialOrder.GetSpecialOrder`): "" es el del pueblo; Qi va a la isla.
_TABLERO = {"": "town", "DesertFestivalMarlon": "desert"}

# `FriendshipReward.Load`: si el pedido no dice cuánto, suma 250 puntos de amistad con quien lo pidió.
_AMISTAD = 250

# Cartas de premio que `Data/mail` no explica con un "%item": (tipo, valor). "recipe" es la receta de fabricación que
# enseña el evento (`addCraftingRecipe` en `Data/Events/Beach` 3131209), "gift" el objeto de otra carta (`hostMail
# MSB_Pierre` en `Data/Events/SeedShop` 963113), "shop" lo que Robin vende tras el evento (`Data/Shops` "Carpenter",
# `PLAYER_HAS_SEEN_EVENT 1053978`) y "tv" el canal que abre la carta `pamNewChannel` (`TV.checkForAction`).
_CARTAS = {
    "willyBugWadCutscene": ("recipe", "Quality Bobber"),
    "pierreQualityCrops": ("gift", "(BC)248"),
    "robinDeluxeBed": ("shop", "(F)2186"),
    "pamPotatoJuice": ("tv", ("Strings/StringsFromCSFiles", "TV_Fishing_Channel")),
}

_ITEM = re.compile(r"%item (craftingRecipe|id) ([^%]+?) ?%%")
_CORCHETE = re.compile(r"\[([A-Za-z0-9_]+)\]")
# Una tira de huecos del mismo elemento separados por espacios ("{Treasure:Count} {Treasure:LocalizedName}") se
# reemplaza junta, así cada opción conserva su cantidad.
_HUECOS = re.compile(r"\{(\w+)(?::\w+)?\}(?: \{\1(?::\w+)?\})*")
_HUECO = re.compile(r"\{\w+(?::(\w+))?\}")


def _par(archivo: str, clave: str) -> list[str]:
    return island_data._par(archivo, clave)


def _obj(n: str) -> list[str]:
    return mines_data._objeto(n)


def _id(iid: str) -> str:
    """Los objetos comunes van sin "(O)", como en las fichas del sitio."""
    return iid[3:] if iid.startswith("(O)") else iid


def _nombre(iid: str) -> list[str]:
    if iid.startswith("(BC)"):
        t = sdv.raw("Data/BigCraftables")[iid[4:]]["DisplayName"]
        return [sdv.text(t, "en").strip(), sdv.text(t, "es").strip()]
    if iid.startswith("(F)"):
        t = sdv.raw("Data/Furniture")[iid[3:]].split("/")[7]
        return [sdv.text(t, "en").strip(), sdv.text(t, "es").strip()]
    return _obj(_id(iid))


# ---------------------------------------------------------------------------------------------- misiones de la historia


def _campos(clave: str) -> tuple[list[str], list[str]]:
    en = sdv.raw("Data/Quests")[clave].split("/")
    es = (sdv.raw("Data/Quests.es-ES").get(clave) or sdv.raw("Data/Quests")[clave]).split("/")
    return en, es


def _siguientes(campo: str) -> list[str]:
    """`Quest.getQuestFromId`: claves separadas por espacio; la "h" de adelante es "sólo el anfitrión"."""
    return [k[1:] if k.startswith("h") else k for k in campo.split() if k != "-1"]


def _aldeanos_del_pueblo() -> int:
    n = 0
    for v in sdv.raw("Data/Characters").values():
        intro = v.get("IntroductionsQuest")
        n += bool(intro if intro is not None else v.get("HomeRegion") == "Town")
    return n


def story() -> list[dict]:
    claves = sdv.raw("Data/Quests")
    out = []
    for k in claves:
        en, es = _campos(k)
        tipo, cond = en[0], en[4].split()
        fila = {"key": k, "slug": slug(k), "type": tipo, "title": [en[1].strip(), es[1].strip()],
                "desc": [en[2].strip(), es[2].strip()], "goal": [en[3].strip(), es[3].strip()],
                "money": max(int(en[6]), 0),
                # `rewardDescription` (campo 7): el juego no trae ninguno ("-1" en todas).
                "reward": None if en[7] == "-1" else en[7],
                "next": [s for s in _siguientes(en[5]) if s in claves],
                "from": cond[0] if tipo in _CON_ALDEANO else None}
        item, n = None, 1
        if tipo in ("ItemDelivery", "LostItem", "SecretLostItem"):
            item = cond[1]
            if tipo == "ItemDelivery" and len(cond) > 2:
                n = int(cond[2])
        elif tipo in ("ItemHarvest", "Crafting") and cond and cond[0].startswith("("):
            item = cond[0]
            if tipo == "ItemHarvest" and len(cond) > 1:
                n = int(cond[1])
        fila["item"], fila["n"] = (_id(item) if item else None), n
        if tipo == "SecretLostItem":
            fila.update(_COLLAR[k])
            fila["friendship"] = int(cond[2])
        if k == "9":
            total = _aldeanos_del_pueblo()
            fila["goal"] = [t.replace("{0}", "0").replace("{1}", str(total)) for t in _par(*_SALUDOS)]
        out.append(fila)
    return out


# --------------------------------------------------------------------------------------------------- pedidos especiales


def _plural(nombre: str) -> str:
    """`Lexicon.makePlural`, sólo en inglés (en español devuelve la palabra tal cual). El juego escribe "Potatos" y
    "Tomatos" (le suma una "s" a todo lo que termina en "o"): acá van bien."""
    fijos = {"Wheat": "bushels of Wheat", "Ginger": "pieces of Ginger", "Garlic": "bulbs of Garlic",
             "Potato": "Potatoes", "Tomato": "Tomatoes"}
    iguales = {"Bok Choy", "Cranberries", "Largemouth Bass", "Smallmouth Bass", "Carp", "Sandfish", "Ghostfish"}
    if nombre in fijos:
        return fijos[nombre]
    if nombre in iguales:
        return nombre
    if nombre.endswith("y"):
        return nombre[:-1] + "ies"
    if nombre.endswith(("s", "x", "z", "sh", "ch")):
        return nombre + "es"
    return nombre + "s"


def _por_nombre() -> dict[str, str]:
    """Nombre interno -> id de `Data/Objects` (`Utility.fuzzyItemSearch`); "Stone" es la piedra, no las rocas."""
    objs = sdv.raw("Data/Objects")
    out = {}
    for k, v in objs.items():
        previo = out.get(v["Name"])
        if previo is None or (objs[previo].get("Type") == "Litter" and v.get("Type") != "Litter"):
            out[v["Name"]] = k
    return out


def _por_etiqueta() -> dict[str, str]:
    """Etiqueta "item_<nombre>" (`ItemContextTagManager`) -> id."""
    return {"item_" + n.lower().replace(" ", "_").replace("'", ""): k for n, k in _por_nombre().items()}


def _local(texto: str, lang: str) -> str:
    """`SpecialOrder.MakeLocalizationReplacements`: cada "[Clave]" de `Strings/SpecialOrderStrings`."""
    base = sdv.raw("Strings/SpecialOrderStrings")
    trad = sdv.raw("Strings/SpecialOrderStrings.es-ES") if lang == "es" else base
    for _ in range(3):
        texto = _CORCHETE.sub(lambda m: (trad.get(m.group(1)) or base[m.group(1)]), texto)
    return texto


def _opciones(orden: dict, lang: str) -> dict[str, list[dict]]:
    """Cada `RandomizedElement` con todas sus opciones (sin mirar sus `RequiredTags`, que dependen de la temporada o
    de una carta). Una opción "PICK_ITEM a, b" se abre en un objeto por opción, con los campos que lee
    `SpecialOrder.Parse` (`Text`, `TextPlural`, `TextPluralCapitalized`, `Price`); "Campo|valor|…" queda como tabla;
    el resto, como texto entero en "".
    """
    nombres = _por_nombre()
    out = {}
    for e in orden.get("RandomizedElements") or []:
        ops = []
        for v in e["Values"]:
            valor = v["Value"]
            if valor.startswith("PICK_ITEM"):
                for nombre in valor[len("PICK_ITEM"):].split(","):
                    iid = nombres[nombre.strip()]
                    n = _obj(iid)[0 if lang == "en" else 1]
                    pl = _plural(n) if lang == "en" else n
                    # La mayúscula de `TextPluralCapitalized` va sólo al principio de la lista (`_texto`).
                    ops.append({"id": iid, "Text": n, "TextPlural": pl, "TextPluralCapitalized": pl,
                                "Price": str(sdv.raw("Data/Objects")[iid]["Price"])})
            elif "|" in valor:
                partes = _local(valor, lang).split("|")
                ops.append(dict(zip(partes[::2], partes[1::2])))
            else:
                ops.append({"": _local(valor, lang)})
        out[e["Name"]] = ops
    return out


def _lista(cosas: list[str], lang: str) -> str:
    """"a, b or c" / "a, b o c" (la "o" pasa a "u" antes de "o" u "ho")."""
    if len(cosas) == 1:
        return cosas[0]
    y = "or"
    if lang == "es":
        y = "u" if re.match(r"h?o", cosas[-1], re.IGNORECASE) else "o"
    return f"{', '.join(cosas[:-1])} {y} {cosas[-1]}"


def _texto(texto: str, lang: str, ops: dict[str, list[dict]]) -> str:
    """`SpecialOrder.Parse` con todas las opciones a la vez. Un elemento sin campo (`{Greeting}`, `{Text}`) es una frase
    entera: va la primera, que puede traer otros huecos."""
    texto = _local(texto, lang)

    def tira(m: re.Match) -> str:
        opciones = ops[m.group(1)]
        campos = [h.group(1) for h in _HUECO.finditer(m.group(0))]
        if campos == [None]:
            return opciones[0][""]
        vistos = []
        for o in opciones:
            # En español los nombres van en minúscula en medio de la frase ("12 omnigeodas").
            t = " ".join(o[c][:1].lower() + o[c][1:] if lang == "es" else o[c] for c in campos)
            if t not in vistos:
                vistos.append(t)
        out = _lista(vistos, lang)
        return out[:1].upper() + out[1:] if "TextPluralCapitalized" in campos else out

    for _ in range(3):
        texto = _HUECOS.sub(tira, texto)
    return re.sub(r"\s+", " ", texto).strip()


def _pedido(orden: dict, campo: str) -> list[str]:
    return [_texto(campo, "en", _opciones(orden, "en")), _texto(campo, "es", _opciones(orden, "es"))]


def _valores(campo: str, ops: dict[str, list[dict]]) -> list[tuple[str | None, str]]:
    """(id de la opción o None, valor) de un campo de datos que puede ser un hueco ("{Crop:Price}")."""
    m = re.fullmatch(r"\{(\w+):(\w+)\}", campo.strip())
    if not m:
        return [(None, campo.strip())]
    return [(o.get("id"), o.get(m.group(2), "")) for o in ops[m.group(1)]]


def _pide(orden: dict, ops: dict[str, list[dict]]) -> list[dict]:
    """Los objetos que pide (`AcceptedContextTags` de una sola etiqueta "item_…" o de un elemento al azar) y cuántos."""
    etiquetas = _por_etiqueta()
    cuantos: dict[str, int] = {}
    for ob in orden["Objectives"]:
        tags = (ob.get("Data") or {}).get("AcceptedContextTags")
        if not tags or "," in tags:
            continue
        pares = _valores(tags, ops)
        ns = [int(n) for _, n in _valores(ob["RequiredCount"], ops)]
        for i, (iid, tag) in enumerate(pares):
            iid = iid or etiquetas.get(tag)
            if iid:
                n = ns[i] if len(ns) == len(pares) else ns[0]
                cuantos[iid] = max(cuantos.get(iid, 0), n)
    return [{"id": i, "n": n} for i, n in cuantos.items()]


def _receta(nombre: str) -> tuple[str, list[str]]:
    """Id y nombre de lo que fabrica una receta de `Data/CraftingRecipes` (campo 2 el producto, 3 si es grande)."""
    campos = sdv.raw("Data/CraftingRecipes")[nombre].split("/")
    iid = campos[2].split()[0]
    iid = f"(BC){iid}" if campos[3] == "true" else iid
    return iid, _nombre(iid)


def _carta(clave: str) -> dict:
    tipo, valor = _CARTAS.get(clave, (None, None))
    if tipo is None:
        m = _ITEM.search(sdv.raw("Data/mail")[clave])
        if not m:
            raise ValueError(f"carta sin premio: {clave}")
        tipo, valor = ("recipe", m.group(2).replace("_", " ")) if m.group(1) == "craftingRecipe" else ("gift", m.group(2))
        if tipo == "gift" and " " in valor:
            raise ValueError(f"carta con varios objetos: {clave}")
    if tipo == "recipe":
        iid, n = _receta(valor)
        return {"k": "mail", "id": _id(iid), "text": [f"Crafting recipe: {n[0]}", f"Receta de fabricación: {n[1].lower()}"]}
    if tipo == "gift":
        n = _nombre(valor)
        return {"k": "mail", "id": _id(valor), "text": [f"Gift: {n[0]}", f"Regalo: {n[1].lower()}"]}
    if tipo == "shop":
        n = _nombre(valor)
        return {"k": "mail", "id": valor, "text": [f"Robin starts selling the {n[0]}", f"Robin empieza a vender: {n[1].lower()}"]}
    canal = _par(*valor)
    return {"k": "mail", "text": [f"New TV channel: {canal[0]}", f"Canal nuevo en la tele: {canal[1]}"]}


def _premios(orden: dict, ops: dict[str, list[dict]]) -> list[dict]:
    out = []
    for r in orden["Rewards"]:
        d = r.get("Data") or {}
        if r["Type"] == "Money":
            mult = float(d.get("Multiplier", "1"))
            montos = sorted({int(int(v) * mult) for _, v in _valores(d["Amount"], ops)})
            fila = {"k": "money", "n": montos[0]}
            if len(montos) > 1:
                fila["max"] = montos[-1]
            out.append(fila)
        elif r["Type"] == "Object":
            out.append({"k": "item", "id": _id(d["Item"]), "n": int(d["Amount"])})
        elif r["Type"] == "Mail":
            out.append(_carta(d["MailReceived"]))
        elif r["Type"] == "Friendship":
            out.append({"k": "friendship", "n": int(d.get("Amount", _AMISTAD))})
        else:
            raise ValueError(f"premio desconocido: {r['Type']}")
    return out


def orders() -> list[dict]:
    out = []
    for k, o in sdv.raw("Data/SpecialOrders").items():
        if o.get("OrderType") == "Qi":
            continue
        ops = _opciones(o, "en")
        out.append({"key": k, "slug": slug(k), "who": o["Requester"], "name": _pedido(o, o["Name"]),
                    "text": _pedido(o, o["Text"]), "goals": [_pedido(o, x["Text"]) for x in o["Objectives"]],
                    "items": _pide(o, ops), "days": island_data._DIAS[o["Duration"]], "repeat": bool(o["Repeatable"]),
                    "rewards": _premios(o, ops), "board": _TABLERO[o["OrderType"]]})
    return out


def quests() -> dict:
    slugs, nombres = mines_data._sitio()
    st, od = story(), orders()
    ids = {q["item"] for q in st if q["item"]}
    for o in od:
        ids |= {i["id"] for i in o["items"]} | {r["id"] for r in o["rewards"] if r.get("id")}
    refs = {}
    for i in sorted(ids):
        if i not in slugs:
            continue
        alto = 32 if i.startswith("(BC)") else 16
        nombre = _nombre(i) if i.startswith("(") else nombres[i]
        refs[i] = [*slugs[i], *nombre, 16, alto]
    return {"story": st, "orders": od, "refs": refs}


def main() -> None:
    d = quests()
    ruta = DATA / "quests.json"
    ruta.write_text(json.dumps(d, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("quests.json", ruta.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
