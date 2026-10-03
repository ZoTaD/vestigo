"""
Project Zomboid → los datos de la pestaña Servidor (2026-10-01, Build 42).

Lee lo mismo que extract.py (el .jar, unos .lua y las traducciones; sólo lectura) y arma `server.json`:

  - las opciones de sandbox (`zombie.SandboxOptions` y sus clases internas): tipo, default, rango, etiquetas de cada
    valor, nombre y ayuda en/es, y en qué hoja del menú del juego van (`SettingsTable` de ServerSettingsScreen.lua);
  - los cinco presets del juego (media/lua/shared/Sandbox/*.lua), como los carga el juego (Apocalipsis ⊕ archivo) y con
    sólo lo que difiere del default de Java; `baseline: "apocalypse"` marca cuál es el default efectivo;
  - las opciones del `.ini` del servidor (`zombie.network.ServerOptions`), con su hoja y su ayuda;
  - cómo se cortan el agua y la luz: los rangos que sortea cada opción (`randomWaterShut` / `randomElectricityShut`), y
    las constantes de la cuenta de la edad del mundo (que el día del corte se cuenta desde las 7:00 y que cada mes
    desde el apocalipsis son 30 días), más las horas de arranque y el largo del día de las etiquetas en inglés.

Nada de esto está en un archivo de datos: las opciones son llamadas en el constructor de Java y los rangos, un
`switch`. Se leen del bytecode con el lector de .class de extract.py (sin Java ni javap), y si un parche cambia la forma
del código, se corta con un mensaje en vez de publicar una lista a medias o un número inventado. Ver "Cuándo corta" en
games/zomboid/README.md.

Uso:
    python games/zomboid/tools/server.py     # imprime el informe, sin escribir nada
    (extract.py lo llama y escribe games/zomboid/data/server.json)
"""
import json
import os
import re
import sys
import zipfile

sys.path.insert(0, os.path.dirname(__file__))
from extract import (EN, ES, GAME_DIR, MEDIA, TRANSLATE, Texts, _instructions, _jar_class, _ldc,  # noqa: E402
                     _member, _push_double, _push_float, _push_int, _tidy_float)

SANDBOX_CLASS = "zombie/SandboxOptions"
SERVER_CLASS = "zombie/network/ServerOptions"
SETTINGS_LUA = os.path.join(MEDIA, "lua", "client", "OptionScreens", "ServerSettingsScreen.lua")
PRESETS_LUA = os.path.join(MEDIA, "lua", "client", "OptionScreens", "SandboxOptions.lua")
PRESETS_DIR = os.path.join(MEDIA, "lua", "shared", "Sandbox")
DEFINES_LUA = os.path.join(MEDIA, "lua", "shared", "defines.lua")
INT_MAX = 2147483647  # Integer.MAX_VALUE: "nunca" en los cortes (opción "Deshabilitado")

# La 42.21 trae 269 opciones de sandbox y 144 del .ini. Con muchas menos, el lector perdió el hilo del constructor
# (un parche cambió cómo se crean): mejor cortar que publicar una pestaña con la mitad.
MIN_SANDBOX = 250
MIN_INI = 120

# TEXTO PROPIO (2026-10-01), no del juego: el nombre de la hoja donde van las opciones que existen en Java y el menú del
# juego no muestra (StartYear, los factores de saqueo viejos…). Sirven en un SandboxVars.lua o un .ini escrito a mano.
HIDDEN = {"id": "Hidden", "name": {"en": "Not in the game's menu", "es": "No aparecen en el menú del juego"}}


def _die(msg):
    raise SystemExit(f"{msg} No se escribió nada: hay que adaptar server.py.")


# ---------------------------------------------------------------------------
# Textos: Sandbox.json y UI.json
# ---------------------------------------------------------------------------

# Ayudas en español que el juego dejó viejas: la traducción de ES_MX de la ayuda de PopulationMultiplier trae los números
# de una tabla anterior (4.0 = Zombicidio…), y la inglesa y la tabla que usa el juego (`ZombiePopulationMultiplierTable`)
# dicen 2.5/1.6/1.2/0.65/0.15. Como la fila se mueve sola al elegir "Cantidad de zombies", la contradicción se veía.
# {clave: (texto viejo, texto corregido)}: sólo se reemplaza si el viejo sigue ahí (si un parche lo arregla, no se toca).
STALE_TIP_ES = {
    "ZombieConfig.PopulationMultiplier": (
        "4.0 = Zombicidio, Muy alto = 3.0, 2.0 = Alto, 1.0 = Normal, 0.35 = Bajo, 0.0 = Nada.",
        "Zombicidio = 2.5, Muy alto = 1.6, Alto = 1.2, Normal = 0.65, Bajo = 0.15, Nada = 0.0."),
}


class _Texts:
    """
    Los textos de las opciones: `Sandbox.json` y `UI.json`, en inglés y en el español de ES_MX con ES de respaldo (el
    mismo criterio que `Texts` de extract.py, que no carga estos dos archivos). Se limpian con `Texts.tidy` y, además,
    el `\\n` escrito en el JSON, el `<LINE>` de las descripciones y el `<br>` de alguna ayuda del .ini pasan a un salto
    de renglón de verdad (como se ven en el juego).
    """
    FILES = ("Sandbox", "UI")

    def __init__(self):
        self.en = self._load(EN)
        self.es = {}
        for lang in reversed(ES):  # el primero de la lista pisa a los demás, salvo con vacíos
            self.es.update({k: v for k, v in self._load(lang).items() if v and v.strip()})
        self.missing_es = set()

    @classmethod
    def _load(cls, lang):
        out = {}
        for fn in cls.FILES:
            path = os.path.join(TRANSLATE, lang, fn + ".json")
            if os.path.exists(path):
                with open(path, encoding="utf-8-sig") as f:
                    out.update(json.load(f))
        return out

    # Las etiquetas de formato del texto enriquecido del juego (`ISRichTextPanel:processCommand`): en el juego pintan el
    # aviso "[!] … [!]" de rojo y vuelven al blanco. En la página y en los archivos serían basura (`<BHC>`, `<RGB:1,1,1>`):
    # se sacan, y el "[!]" queda como aviso en texto. Sólo en las de sandbox; en el .ini son ejemplos (ver `clean`).
    _RICH_TAG = re.compile(r"[ \t]*<(?:LEFT|RIGHT|CENTRE|PUSHRGB:[^>]*|POPRGB|RGB:[^>]*|GHC|BHC|RED|ORANGE|GREEN|"
                           r"SIZE:[^>]*)>[ \t]*")
    # Comillas mal escapadas por la traducción: `\Multiplicador de Población\` (ES_MX/Sandbox.json, ZombieCount) en vez
    # de `"Multiplicador de Población"`; también `\Cantidad de zombies\` y `\???\`. Regla dirigida (revisión del
    # 2026-10-01), para no romper las rutas de `Mods`/`Map` (`\Steam\steamapps\workshop\…`): la barra que abre va al
    # principio o después de un espacio, adentro no hay otra barra ni un salto, y la que cierra va antes de un espacio,
    # de puntuación o del final. En `\Steam\steamapps` la segunda barra va antes de una letra: no se toca.
    _BACKSLASH_QUOTES = re.compile(r"(?:(?<=\s)|^)\\([^\\\n]+)\\(?=[\s.,;:!?)]|$)", re.M)

    @classmethod
    def clean(cls, v, key=""):
        v = Texts.tidy(v)
        if key.startswith("UI_ServerOption_"):
            # En la ayuda del .ini, `\n` y `<LINE>` entre espacios son lo que hay que escribir, no un salto: "Typing \n
            # will create a new line" (PublicDescription), "También puede utilizar <LINE> para crear una línea"
            # (ServerWelcomeMessage). Se apartan para que el salto de abajo no se los coma (la Task 1 los convertía y la
            # ayuda perdía el sentido). Y `\<RGB:1,0,0>` es el ejemplo escapado: va sin la barra.
            v = re.sub(r"(?<= )(\\n|<LINE>)(?= )", lambda m: "\0" + ("n" if m.group(1) == "\\n" else "L") + "\0", v)
            v = re.sub(r"\\(?=<)", "", v)
        elif key.startswith("Sandbox_"):
            v = cls._RICH_TAG.sub(" ", v)
        v = re.sub(r"[ \t]*(?:\\n|<LINE>|<br>|\n)[ \t]*", "\n", v, flags=re.I).strip()
        v = v.replace("\0n\0", "\\n").replace("\0L\0", "<LINE>")
        v = cls._BACKSLASH_QUOTES.sub(r'"\1"', v)
        # El juego pasa todo texto por String.formatted: "50%%" se ve "50%".
        return v.replace("%%", "%")

    def get(self, key):
        """{en, es} de una clave, o None si no está en inglés. Sin español: "" (y se anota)."""
        en = self.en.get(key)
        if en is None or not en.strip():
            return None
        es = self.es.get(key)
        if es is None:
            self.missing_es.add(key)
        return {"en": self.clean(en, key), "es": self.clean(es, key) if es else ""}


# ---------------------------------------------------------------------------
# Lua: un lector chico y seguro
# ---------------------------------------------------------------------------

_LUA_TOKEN = re.compile(r"""
    (?P<ws>\s+)
  | (?P<block>--\[(?P<eq>=*)\[.*?\](?P=eq)\])
  | (?P<comment>--[^\n]*)
  | (?P<str>"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')
  | (?P<num>\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)
  | (?P<name>[A-Za-z_]\w*)
  | (?P<sym>.)
""", re.VERBOSE | re.DOTALL)
_ESCAPES = {"n": "\n", "t": "\t", "r": "\r", "\\": "\\", '"': '"', "'": "'"}


def _lua_tokens(text):
    """[(tipo, valor, renglón)] de un texto Lua, sin espacios ni comentarios. Los textos ya vienen sin comillas."""
    out, line = [], 1
    for m in _LUA_TOKEN.finditer(text):
        kind, val = m.lastgroup, m.group()
        if kind == "eq":
            kind = "block"
        if kind == "str":
            body = val[1:-1]
            val = re.sub(r"\\(.)", lambda e: _ESCAPES.get(e.group(1), e.group(1)), body)
        if kind not in ("ws", "block", "comment"):
            out.append((kind, val, line))
        line += m.group().count("\n")
    return out


def _lua_number(s):
    v = float(s)
    return int(v) if re.fullmatch(r"\d+", s) else v


def lua_table(text, consts):
    """
    Los presets (`return { … }` o `X = { … }`) como {"Clave" | "Tabla.Clave": valor}. No es Lua: lee sólo lo que traen
    los presets del juego (números, true/false, textos con escapes, tablas anidadas de un nivel, comentarios, comas
    finales) y `tonumber(A.B)` si `A.B` es una de las constantes de defines.lua (`consts`, {"A.B": "texto"}). Cualquier
    otra cosa (una llamada, una variable, una cuenta) es ValueError con el renglón: el archivo no se ejecuta nunca, ni
    acá ni en el sitio, y un preset que traiga código no se adivina.
    """
    toks = _lua_tokens(text)
    pos = 0

    def peek(k=0):
        return toks[pos + k] if pos + k < len(toks) else ("eof", "", toks[-1][2] if toks else 1)

    def fail(msg):
        t = peek()
        raise ValueError(f"renglón {t[2]}: {msg} (leí {t[1]!r})")

    def take(kind, val=None):
        nonlocal pos
        t = peek()
        if t[0] != kind or (val is not None and t[1] != val):
            fail(f"esperaba {val or {'name': 'un nombre', 'str': 'un texto'}.get(kind, kind)}")
        pos += 1
        return t

    def value():
        nonlocal pos
        t = peek()
        if t[0] == "sym" and t[1] == "-" and peek(1)[0] == "num":
            pos += 2
            return -_lua_number(peek(-1)[1])
        if t[0] == "num":
            pos += 1
            return _lua_number(t[1])
        if t[0] == "str":
            pos += 1
            return t[1]
        if t[0] == "name" and t[1] in ("true", "false"):
            pos += 1
            return t[1] == "true"
        if t[0] == "name" and t[1] == "tonumber":
            pos += 1
            take("sym", "(")
            a = take("name")[1]
            take("sym", ".")
            b = take("name")[1]
            take("sym", ")")
            ref = f"{a}.{b}"
            if ref not in consts:
                raise ValueError(f"renglón {t[2]}: tonumber({ref}) no es una constante de defines.lua")
            s = consts[ref].strip()
            if not re.fullmatch(r"-?(?:\d+(?:\.\d*)?|\.\d+)", s):
                raise ValueError(f"renglón {t[2]}: {ref} = {s!r} no es un número")
            return -_lua_number(s[1:]) if s.startswith("-") else _lua_number(s)
        fail("esperaba un valor")

    def table(prefix, nested):
        out = {}
        take("sym", "{")
        while not (peek()[0] == "sym" and peek()[1] == "}"):
            key = take("name")[1]
            take("sym", "=")
            if peek()[0] == "sym" and peek()[1] == "{":
                if nested:
                    fail("una tabla dentro de otra tabla anidada")
                out.update(table(f"{prefix}{key}.", True))
            else:
                out[prefix + key] = value()
            if peek()[0] == "sym" and peek()[1] in (",", ";"):
                take("sym")
            elif not (peek()[0] == "sym" and peek()[1] == "}"):
                fail("esperaba , o }")
        take("sym", "}")
        return out

    if peek()[0] == "name" and peek()[1] == "return":
        take("name")
    else:
        take("name")
        take("sym", "=")
    out = table("", False)
    if peek()[0] != "eof":
        fail("algo después de la tabla")
    return out


def defines_consts():
    """Las constantes de texto de defines.lua (`ZombiePopulationMultiplier.VeryHigh = "1.6"`), para `tonumber`."""
    with open(DEFINES_LUA, encoding="utf-8", errors="replace") as f:
        return {f"{a}.{b}": v for a, b, v in re.findall(r'^\s*(\w+)\.(\w+)\s*=\s*"([^"]*)"', f.read(), re.M)}


def _lua_function(text, name):
    """El cuerpo de `function <name>(…)` de un .lua, hasta la próxima `function` al principio de un renglón."""
    m = re.search(r"^function\s+" + re.escape(name) + r"\s*\([^)]*\)(.*?)(?=^function\s|\Z)", text, re.M | re.S)
    return m.group(1) if m else None


def _option_blocks(body):
    """[(opción, texto)] de cada `if optionName == "X" then …` de un cuerpo, hasta el próximo o el final."""
    parts = re.split(r'\bif\s+optionName\s*==\s*"([\w.]+)"\s+then\b', body)
    return list(zip(parts[1::2], parts[2::2]))


_SET_TEXT = re.compile(r'\[\s*"([\w.]+)"\s*\]\s*:\s*setText\(([^()]*)\)')
_ANY_SET_TEXT = re.compile(r":\s*setText\s*\(")


def linked_options(opts, settings_text=None, defines_text=None):
    """
    Las opciones que la pantalla de servidor del juego reescribe cuando elegís otra (`Page3:onComboBoxSelected` y
    `Page3:onTickBoxSelected` de ServerSettingsScreen.lua): `Zombies` pone `ZombieConfig.PopulationMultiplier` (de la
    `ZombiePopulationMultiplierTable` de defines.lua), `ZombieRespawn` las tres de reaparición y `ZombieMigrate`
    `ZombieConfig.RedistributeHours`. En Java `Zombies` sólo mueve un tope: la cantidad de zombis sale del multiplicador,
    así que un generador que no copie esto escribe un archivo que no hace lo que elegiste (revisión del 2026-10-01).

    Devuelve [{"from", "to", "values": [[valor de "from", valor de "to"], …]}], en el orden del archivo. Lee sólo esta
    forma (una tabla local o de defines.lua indexada por `combo.selected`, o un `if value then … else … end` con textos)
    y corta si aparece otro `setText` o un valor que no es de la opción. `settings_text`/`defines_text` son para los tests.
    """
    if settings_text is None:
        with open(SETTINGS_LUA, encoding="utf-8", errors="replace") as f:
            settings_text = f.read()
    if defines_text is None:
        with open(DEFINES_LUA, encoding="utf-8", errors="replace") as f:
            defines_text = f.read()
    by_key = {o["key"]: o for o in opts}

    def str_list(src):
        """`"2.5", "1.6", …` → ["2.5", "1.6", …], o None si la tabla trae otra cosa que textos."""
        items = [x.strip() for x in src.split(",") if x.strip()]
        vals = [re.fullmatch(r'"([^"]*)"', x) for x in items]
        return [v.group(1) for v in vals] if items and all(vals) else None

    globals_ = {n: str_list(src) for n, src in re.findall(r"^(\w+)\s*=\s*\{([^{}]*)\}", defines_text, re.M)}

    def number(src, target, where):
        o = by_key.get(target)
        if o is None or o["type"] not in ("int", "double"):
            _die(f"{where}: {target} no es una opción numérica de sandbox.")
        if not re.fullmatch(r"-?(?:\d+(?:\.\d*)?|\.\d+)", src):
            _die(f"{where}: {target} recibe {src!r}, que no es un número.")
        v = _tidy_double(src) if o["type"] == "double" else int(float(src))
        if not o["min"] <= v <= o["max"]:
            _die(f"{where}: {target} = {v} queda fuera de su rango ({o['min']}..{o['max']}).")
        return v

    links = []
    combo = _lua_function(settings_text, "Page3:onComboBoxSelected")
    tick = _lua_function(settings_text, "Page3:onTickBoxSelected")
    if combo is None or tick is None:
        _die(f"No encontré Page3:onComboBoxSelected / onTickBoxSelected en {SETTINGS_LUA}: el menú cambió cómo enlaza "
             "opciones.")
    for source, block in _option_blocks(combo):
        where = f"onComboBoxSelected ({source})"
        o = by_key.get(source)
        if o is None or o["type"] != "enum":
            _die(f"{where}: {source} no es una opción de lista de sandbox.")
        sel = re.findall(r"local\s+(\w+)\s*=\s*combo\.selected\b", block)
        tables = {n: str_list(src) for n, src in re.findall(r"local\s+(\w+)\s*=\s*\{([^{}]*)\}", block)}
        tables.update({n: globals_.get(g) for n, g in re.findall(r"local\s+(\w+)\s*=\s*([A-Za-z_]\w*)\s*$", block, re.M)
                       if g in globals_})
        sets = _SET_TEXT.findall(block)
        if len(sel) != 1 or not sets:
            _die(f"{where}: no entiendo cómo elige el valor (combo.selected y setText).")
        for target, arg in sets:
            m = re.fullmatch(r"\s*(\w+)\s*\[\s*(\w+)\s*\]\s*", arg)
            if not m or m.group(2) != sel[0] or tables.get(m.group(1)) is None:
                _die(f"{where}: setText({arg}) no es una tabla de textos indexada por combo.selected.")
            vals = tables[m.group(1)]
            if len(vals) != len(o["values"]):
                _die(f"{where}: la tabla {m.group(1)} tiene {len(vals)} valores y {source} tiene {len(o['values'])}.")
            links.append({"from": source, "to": target,
                          "values": [[i + 1, number(v, target, where)] for i, v in enumerate(vals)]})
    for source, block in _option_blocks(tick):
        where = f"onTickBoxSelected ({source})"
        o = by_key.get(source)
        if o is None or o["type"] != "bool":
            _die(f"{where}: {source} no es una casilla de sandbox.")
        m = re.search(r"\bif\s+value\s+then\b(.*?)\belse\b(.*?)\bend\b", block, re.S)
        if not m or len(_SET_TEXT.findall(block)) != 2:
            _die(f"{where}: no entiendo el if value then … else … end.")
        on, off = _SET_TEXT.findall(m.group(1)), _SET_TEXT.findall(m.group(2))
        if len(on) != 1 or len(off) != 1 or on[0][0] != off[0][0]:
            _die(f"{where}: cada rama tiene que poner la misma opción, una vez.")
        target = on[0][0]
        pair = []
        for flag, (_t, arg) in ((True, on[0]), (False, off[0])):
            s = re.fullmatch(r'\s*"([^"]*)"\s*', arg)
            if not s:
                _die(f"{where}: setText({arg}) no es un texto.")
            pair.append([flag, number(s.group(1), target, where)])
        links.append({"from": source, "to": target, "values": pair})
    # Cada setText de las dos funciones tiene que haber entrado: uno nuevo que no se entienda corta, no se pierde.
    # (Se cuentan los `:setText(` crudos: uno con otra forma, como `setText(f(x))`, no entra en `_SET_TEXT`.)
    if len(links) != len(_ANY_SET_TEXT.findall(combo)) + len(_ANY_SET_TEXT.findall(tick)) // 2:
        _die("Hay un setText en onComboBoxSelected/onTickBoxSelected fuera de un `if optionName == …`.")
    if not links:
        _die(f"No encontré opciones enlazadas en {SETTINGS_LUA}: el menú cambió cómo las arma.")
    return links


def settings_table():
    """
    `SettingsTable` de ServerSettingsScreen.lua, la tabla que arma el menú del juego: {"INI" | "Sandbox": [(hoja,
    [(opción, subtítulo o None)])]}. Se recorre por profundidad de llaves (categoría en 2, hoja en 4, opción en 6), no
    por tabs: el archivo mezcla tabs y espacios. Las listas de `advancedCombo` (`{ name = "Sandbox_Insane", … }`)
    quedan más adentro y no cuentan; la hoja de presets no tiene `name` y tampoco. Lo comentado no se lee.
    """
    with open(SETTINGS_LUA, encoding="utf-8", errors="replace") as f:
        text = f.read()
    m = re.search(r"^SettingsTable\s*=\s*\{", text, re.M)
    if not m:
        _die(f"No encontré `SettingsTable = {{` en {SETTINGS_LUA}: el parche cambió cómo se arma el menú.")
    toks = _lua_tokens(text[m.end() - 1:])
    cats, depth, cat, page, setting = {}, 0, None, None, None
    for i, (kind, val, _line) in enumerate(toks):
        if kind == "sym" and val == "{":
            depth += 1
            if depth == 2:
                cat = {"name": None, "pages": []}
            elif depth == 4:
                page = {"name": None, "settings": []}
            elif depth == 6:
                setting = {"name": None, "title": None}
        elif kind == "sym" and val == "}":
            if depth == 6 and setting["name"]:
                page["settings"].append((setting["name"], setting["title"]))
            elif depth == 4 and page["name"]:
                cat["pages"].append((page["name"], page["settings"]))
            elif depth == 2 and cat["name"]:
                cats[cat["name"]] = cat["pages"]
            depth -= 1
            if depth == 0:
                break
        elif kind == "name" and val in ("name", "title") and i + 2 < len(toks) and toks[i + 1][1] == "=" \
                and toks[i + 2][0] == "str":
            s = toks[i + 2][1]
            if depth == 2 and val == "name":
                cat["name"] = s
            elif depth == 4 and val == "name":
                page["name"] = s
            elif depth == 6:
                setting[val] = s
    if "INI" not in cats or "Sandbox" not in cats:
        _die(f"No encontré las partes INI y Sandbox de SettingsTable en {SETTINGS_LUA} (leí {sorted(cats)}).")
    return cats


# ---------------------------------------------------------------------------
# Opciones de sandbox (zombie.SandboxOptions)
# ---------------------------------------------------------------------------

def _tidy_double(x):
    """
    Un double de una opción, legible. Los enteros van como entero (2147483647.0 → 2147483647; `_tidy_float` lo
    redondearía a siete cifras). Los que son un float de Java pasado a double (0.6499999761581421 = 0.65f) van con
    `_tidy_float`: el juego los muestra como 0.65 y así está en los presets. Los demás, tal cual.
    """
    x = float(x)
    if x.is_integer():
        return int(x)
    short = _tidy_float(x)
    return short if abs(short - x) < 1e-7 * max(1.0, abs(x)) else x


def _enum_order(cls):
    """
    Los valores de un enum de Java en su orden, de su `<clinit>`: cada `putstatic Clase.X` de un campo del tipo de la
    clase es una constante, en el orden en que se crean (el `ordinal`). `$VALUES` es el arreglo y no cuenta.
    """
    try:
        cp, code = _jar_class(cls + ".class")
    except (OSError, KeyError, zipfile.BadZipFile):
        _die(f"No encontré el enum {cls} en projectzomboid.jar.")
    out = []
    for ins in _instructions(code.get(("<clinit>", "()V"), b"")):
        m = _member(cp, ins, 0xb3)
        if m and m[0] == cls and m[2] == f"L{cls};":
            out.append(m[1])
    if not out:
        _die(f"No pude leer los valores del enum {cls}.")
    return out


# Las firmas de SandboxOptions.new*Option y cómo se lee cada argumento después del nombre.
_SANDBOX_NEW = {
    "(Ljava/lang/String;Z)Lzombie/SandboxOptions$BooleanSandboxOption;": ("bool", "i"),
    "(Ljava/lang/String;DDD)Lzombie/SandboxOptions$DoubleSandboxOption;": ("double", "ddd"),
    "(Ljava/lang/String;III)Lzombie/SandboxOptions$IntegerSandboxOption;": ("int", "iii"),
    "(Ljava/lang/String;II)Lzombie/SandboxOptions$EnumSandboxOption;": ("enum", "ii"),
    "(Ljava/lang/String;Ljava/lang/String;I)Lzombie/SandboxOptions$StringSandboxOption;": ("string", "si"),
    "(Ljava/lang/String;Ljava/lang/Class;Ljava/lang/Enum;)Lzombie/SandboxOptions$StrongEnumSandboxOption;":
        ("enum", "ce"),
}


_RANDOM = object()  # marcador del default al azar en los argumentos de una opción del .ini (ver _mark_random)


def _read_args(cp, seg, spec):
    """
    Los argumentos de una llamada, uno por instrucción según `spec` (i entero, d double, s texto, c clase, e enum), o
    None si alguno no es una constante. El marcador `_RANDOM` pasa tal cual.
    """
    if len(seg) != len(spec):
        return None
    out = []
    for ins, k in zip(seg, spec):
        if ins is _RANDOM:
            out.append(_RANDOM)
            continue
        if k == "i":
            v = _push_int(cp, ins)
        elif k == "d":
            v = _push_double(cp, ins)
        elif k == "s":
            v = _ldc(cp, ins)
            v = v if isinstance(v, str) else None
        elif k == "c":
            e = cp.get(ins[2], (0,)) if ins[1] in (0x12, 0x13) else (0,)
            v = cp[e[1]][1] if e[0] == 7 else None
        else:
            v = _member(cp, ins, 0xb2)
        if v is None:
            return None
        out.append(v)
    return out


def _sandbox_class(cls, opts, bad):
    """
    Las opciones que crea el constructor de `cls`, en orden: cada `newXOption("Nombre", …)` (las constantes empujadas
    desde la sentencia anterior) y el `setTranslation`/`setValueTranslation` que la sigue. Un `new SandboxOptions$X` con
    su `<init>` (ZombieLore, ZombieConfig…) se lee en ese momento, así el orden es el del juego (el de SandboxVars.lua).
    """
    cp, code = _jar_class(cls + ".class")
    init = code.get(("<init>", "()V")) or code.get(("<init>", f"(L{SANDBOX_CLASS};)V"))
    if init is None:
        _die(f"No encontré el constructor de {cls}.")
    seg, cur = [], None
    for ins in _instructions(init):
        called = _member(cp, ins, 0xb6, 0xb7)
        if called and called[0] == SANDBOX_CLASS and re.fullmatch(r"new\w*Option", called[1]):
            # Fuera el `this` (aload_0) y, en las clases internas, el `this$0` (el SandboxOptions de afuera).
            args = [x for x in seg if x[1] != 0x2a and (_member(cp, x, 0xb4) or ("", ""))[1] != "this$0"]
            kind = _SANDBOX_NEW.get(called[2])
            name = _ldc(cp, args[0]) if args else None
            vals = _read_args(cp, args[1:], kind[1]) if kind and isinstance(name, str) else None
            if vals is None:
                bad.append(name if isinstance(name, str) else f"{cls}@{ins[0]}")
                cur, seg = None, []
                continue
            o = {"key": name, "type": kind[0]}
            if kind[0] == "bool":
                o["default"] = bool(vals[0])
            elif kind[0] in ("int", "double"):
                conv = int if kind[0] == "int" else _tidy_double
                o["min"], o["max"], o["default"] = (conv(v) for v in vals)
            elif kind[1] == "ii":
                o["n"], o["default"] = vals
            elif kind[1] == "ce":
                # El enum "fuerte" (InjurySeverity, DamageModifier): tantos valores como constantes tenga su clase, y
                # el default es la posición de la constante + 1 (StrongEnumSandboxOption: `ordinal() + 1`).
                order = _enum_order(vals[0])
                if vals[1][0] != vals[0] or vals[1][1] not in order:
                    bad.append(name)
                    cur, seg = None, []
                    continue
                o["n"], o["default"] = len(order), order.index(vals[1][1]) + 1
            else:
                o["default"] = vals[0]
            opts.append(o)
            cur, seg = o, []
        elif called and called[1] in ("setTranslation", "setValueTranslation") and called[0].startswith(SANDBOX_CLASS):
            tr = _ldc(cp, seg[-1]) if len(seg) == 1 else None
            if cur is None or not isinstance(tr, str):
                bad.append(cur["key"] if cur else f"{cls}@{ins[0]}")
            else:
                cur["tr" if called[1] == "setTranslation" else "valueTr"] = tr
            seg = []
        elif called and called[1] == "<init>" and called[0].startswith(SANDBOX_CLASS + "$") \
                and called[2] == f"(L{SANDBOX_CLASS};)V" and called[0] != cls:
            _sandbox_class(called[0], opts, bad)
            seg, cur = [], None
        elif ins[1] in (0x57, 0xb5, 0xb1) \
                or (_member(cp, ins, 0xb6, 0xb7, 0xb8, 0xb9) or ("", "", ""))[2].endswith(")V"):
            # pop, putfield, return o una llamada que no devuelve nada (el `super()` de las clases internas): termina
            # una sentencia.
            seg, cur = [], None
        else:
            seg.append(ins)
    return opts


def first_year():
    """`SandboxOptions.getFirstYear()`: el año de la opción 1 de StartYear (1993 en la 42.21)."""
    cp, code = _jar_class(SANDBOX_CLASS + ".class")
    ins = _instructions(code.get(("getFirstYear", "()I"), b""))
    if len(ins) != 2 or ins[1][1] != 0xac or _push_int(cp, ins[0]) is None:
        _die("No pude leer SandboxOptions.getFirstYear(): el parche cambió de dónde sale el año de arranque.")
    return _push_int(cp, ins[0])


def sandbox_options(T):
    """
    Las opciones de sandbox en el orden de Java, con su nombre, su ayuda y las etiquetas de cada valor (enum). Las
    claves de traducción son las del juego (`SandboxOption.getTranslatedName`, `getTooltip`, `getValueTranslation`):
    `Sandbox_<traducción o nombre corto>`, `…_tooltip` y `Sandbox_<traducción de valores o traducción o nombre
    corto>_option<i>`. StartYear y StartDay no tienen etiquetas: el juego muestra el año (desde `getFirstYear`) y el
    número del día.
    """
    opts, bad = [], []
    try:
        _sandbox_class(SANDBOX_CLASS, opts, bad)
    except (OSError, KeyError, zipfile.BadZipFile) as e:
        _die(f"No pude leer {SANDBOX_CLASS} de projectzomboid.jar ({e!r}).")
    if bad or len(opts) < MIN_SANDBOX:
        _die(f"Leí {len(opts)} opciones de sandbox y no entendí {len(bad)} llamadas ({bad[:10]}…): el parche cambió cómo "
             "se crean.")
    year = first_year()
    no_name = []
    for o in opts:
        short = o["key"].rsplit(".", 1)[-1]
        base = o.pop("tr", None) or short
        value_base = o.pop("valueTr", None) or base
        name = T.get(f"Sandbox_{base}")
        if not name:
            no_name.append(o["key"])
            continue
        o["name"] = name
        # Las numéricas de la tabla ZombieConfig leen la ayuda de `_help` y no de `_tooltip`: así lo hacen
        # DoubleSandboxOption.getTooltip e IntegerSandboxOption.getTooltip (`"ZombieConfig".equals(tableName)`).
        suffix = "help" if o["key"].startswith("ZombieConfig.") and o["type"] in ("int", "double") else "tooltip"
        tip = T.get(f"Sandbox_{base}_{suffix}")
        if tip:
            o["tip"] = tip
            stale = STALE_TIP_ES.get(o["key"])
            if stale and stale[0] in tip["es"]:
                tip["es"] = tip["es"].replace(stale[0], stale[1])
        if o["type"] == "enum":
            n = o.pop("n")
            labels = [T.get(f"Sandbox_{value_base}_option{i}") for i in range(1, n + 1)]
            if o["key"] == "StartYear" and not any(labels):
                labels = [{"en": str(year + i), "es": str(year + i)} for i in range(n)]
            elif o["key"] == "StartDay" and not any(labels):
                labels = [{"en": str(i), "es": str(i)} for i in range(1, n + 1)]
            if None in labels:
                no_name.append(f"{o['key']} (etiqueta {labels.index(None) + 1} de Sandbox_{value_base}_option<i>)")
                continue
            o["values"] = labels
    if no_name:
        _die(f"Opciones de sandbox sin nombre o sin etiquetas en inglés en Translate/EN/Sandbox.json: {no_name}.")
    return opts


def sandbox_pages(opts, T, table):
    """
    Las hojas del menú del juego en orden, y cada opción con su hoja (`page`) y, si arranca un subtítulo, `title`. Las
    opciones salen ordenadas como en el menú; las que Java tiene y el menú no muestra van al final, a "Hidden", en el
    orden de Java.
    """
    by_key = {o["key"]: o for o in opts}
    pages, ordered, unknown = [], [], []
    for page, settings in table["Sandbox"]:
        if not settings:
            continue
        name = T.get(f"Sandbox_{page}")
        if not name:
            _die(f"La hoja {page} del menú no tiene nombre en inglés (Sandbox_{page}).")
        pages.append({"id": page, "name": name})
        for key, title in settings:
            o = by_key.get(key)
            if o is None or "page" in o:
                unknown.append(key)
                continue
            o["page"] = page
            if title:
                t = T.get(f"Sandbox_Title_{title}")
                if not t:
                    _die(f"El subtítulo {title} de {key} no tiene texto en inglés (Sandbox_Title_{title}).")
                o["title"] = t
            ordered.append(o)
    if unknown:
        _die(f"El menú de sandbox nombra opciones que Java no tiene (o repite): {unknown}.")
    hidden = [o for o in opts if "page" not in o]
    for o in hidden:
        o["page"] = HIDDEN["id"]
    if hidden:
        pages.append(dict(HIDDEN))
    return pages, ordered + hidden


# ---------------------------------------------------------------------------
# Presets
# ---------------------------------------------------------------------------

def _kebab(name):
    return re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "-", name).lower()


def _coerce(o, v, where):
    """El valor de un preset con el tipo de su opción, o corta: un `true` en una opción numérica no se adivina."""
    t = o["type"]
    if t == "bool" and isinstance(v, bool):
        return v
    if t in ("int", "enum") and not isinstance(v, bool) and isinstance(v, (int, float)) and float(v).is_integer():
        return int(v)
    if t == "double" and not isinstance(v, bool) and isinstance(v, (int, float)):
        return _tidy_double(v)
    if t == "string" and isinstance(v, str):
        return v
    _die(f"{where}: {o['key']} = {v!r} no es un valor de tipo {t}.")


def presets(opts, T, info):
    """
    Los presets del juego en el orden del menú (`SandboxOptionsScreen:loadPresets`, con su nombre `UI_NewGame_<X>` y
    su descripción `…_desc`).

    `values` es el preset **como lo carga el juego**, menos lo que coincide con el default de Java. El constructor de
    `SandboxOptions` termina con `loadGameFile("Apocalypse")` + `setDefaultsToCurrentValues()`, y `loadGameFile` no
    resetea: aplica la tabla del archivo sólo en las claves que trae. La pantalla de partida, la de servidor y el panel
    de admin arman cada preset con `new()`/`resetToDefault()` (= Apocalipsis) y después `loadGameFile(preset)`. O sea:

        base        = default de Java ⊕ Apocalypse.lua       (el "Default" del juego y de un servidor nuevo)
        preset      = base ⊕ archivo del preset
        values      = {clave: preset[clave]} donde preset[clave] != default de Java

    Así la página arma `Java ⊕ values` y obtiene justo lo que carga el juego, también en Seis meses después, que trae
    sólo 119 claves y deja el resto en Apocalipsis (guardar la diferencia del archivo contra Java perdía 25 valores).
    Un valor fuera de rango no pisa (como `setValue`): queda el anterior. `Version`/`VERSION` y las claves que Java ya
    no tiene (XpMultiplier, LootRespawn del formato viejo) no entran; se cuentan en el informe.

    Devuelve (presets, version, baseline); baseline = {clave: valor} de Apocalipsis completo, que es el "Default"
    efectivo del juego (no el de `options[].default`, que es el del constructor de Java).
    """
    with open(PRESETS_LUA, encoding="utf-8", errors="replace") as f:
        listed = re.findall(r'addPresetToList\(\s*"(\w+)"\s*,\s*getText\(\s*"(\w+)"\s*\)', f.read())
    if not listed:
        _die(f"No encontré la lista de presets (addPresetToList) en {PRESETS_LUA}.")
    if "Apocalypse" not in [n for n, _ in listed]:
        _die("El menú ya no lista Apocalypse: el juego arma la base de todos los presets con ese archivo.")
    consts = defines_consts()
    by_key = {o["key"]: o for o in opts}
    order = {o["key"]: i for i, o in enumerate(opts)}
    tables = {}
    for file_name, _ in listed + [("Apocalypse", None)]:
        path = os.path.join(PRESETS_DIR, file_name + ".lua")
        try:
            with open(path, encoding="utf-8", errors="replace") as f:
                tables[file_name] = (path, lua_table(f.read(), consts))
        except OSError:
            _die(f"El menú nombra el preset {file_name} y no encuentro {path}.")
        except ValueError as e:
            _die(f"No entendí {path}: {e}.")

    def apply(state, file_name):
        """`loadGameFile`: pisa en `state` las claves del archivo que son opciones y están en rango."""
        path, table = tables[file_name]
        unknown, out_of_range = [], []
        for k, v in table.items():
            if k in ("Version", "VERSION"):
                continue
            o = by_key.get(k)
            if o is None:
                unknown.append(k)
                continue
            v = _coerce(o, v, path)
            lo, hi = (1, len(o["values"])) if o["type"] == "enum" else (o.get("min"), o.get("max"))
            if lo is not None and not lo <= v <= hi:
                out_of_range.append(k)  # el juego la ignora y queda el valor anterior
                continue
            state[k] = v
        return unknown, out_of_range

    java = {o["key"]: o["default"] for o in opts}
    baseline = dict(java)
    apply(baseline, "Apocalypse")
    out, version = [], None
    info["presetUnknown"], info["presetOutOfRange"] = {}, {}
    for file_name, key in listed:
        name, desc = T.get(key), T.get(key + "_desc")
        if not name or not desc:
            _die(f"El preset {file_name} no tiene nombre o descripción en inglés ({key}, {key}_desc).")
        pid = _kebab(file_name)
        if file_name == "Apocalypse":
            version = tables[file_name][1].get("Version", tables[file_name][1].get("VERSION"))
        state = dict(baseline)
        unknown, out_of_range = apply(state, file_name)
        values = {k: state[k] for k in sorted(state, key=order.__getitem__) if state[k] != java[k]}
        out.append({"id": pid, "file": file_name + ".lua", "name": name, "desc": desc, "values": values})
        info["presetUnknown"][pid] = unknown
        info["presetOutOfRange"][pid] = out_of_range
    if not isinstance(version, int) or isinstance(version, bool):
        _die("No encontré `Version = <número>` en Apocalypse.lua (el formato de SandboxVars.lua que escribe el juego).")
    return out, version, baseline


# ---------------------------------------------------------------------------
# Cortes de agua y luz, y el calendario
# ---------------------------------------------------------------------------

def _switch_ranges(cp, code, method):
    """
    {opción: [desde, hasta]} de `randomWaterShut(I)I` o `randomElectricityShut(I)I`: un `tableswitch` sobre la opción
    en el que cada caso es `Rand.Next(a, b)` (de a a b − 1: `a + nextInt(b − a)`) o una constante (−1 en el default, que
    es "Instantáneo"; Integer.MAX_VALUE, "Deshabilitado").
    """
    ins = _instructions(code.get((method, "(I)I"), b""))
    sw = next((x for x in ins if x[1] == 0xaa), None)
    if sw is None:
        _die(f"No encontré el switch de SandboxOptions.{method}: el parche cambió cómo se sortea el corte.")
    lo, hi, default, targets = sw[2]
    at = {x[0]: k for k, x in enumerate(ins)}

    def case(pc):
        body = []
        for x in ins[at[pc]:]:
            if x[1] in (0xa7, 0xac):  # goto al return, o el return
                break
            body.append(x)
        nums = [_push_int(cp, x) for x in body]
        if len(body) == 1 and nums[0] is not None:
            return [nums[0], nums[0]]
        nxt = _member(cp, body[-1], 0xb8) if body else None
        if len(body) == 3 and None not in nums[:2] and nxt == ("zombie/core/random/Rand", "Next", "(II)I"):
            return [nums[0], nums[1] - 1]
        _die(f"No entendí un caso del switch de SandboxOptions.{method} (pc {pc}).")

    return {i: case(targets[i - lo] if lo <= i <= hi else default) for i in range(1, hi + 1)}


def shutoff_ranges(opts):
    """Los rangos de cada opción de WaterShut y ElecShut (1..9), de lo que sortea el juego al crear una partida."""
    cp, code = _jar_class(SANDBOX_CLASS + ".class")
    out = {}
    for field, opt_key, method in (("water", "WaterShut", "randomWaterShut"),
                                   ("elec", "ElecShut", "randomElectricityShut")):
        n = len(next(o for o in opts if o["key"] == opt_key)["values"])
        ranges = _switch_ranges(cp, code, method)
        if n != 9 or sorted(ranges) != list(range(1, n + 1)):
            _die(f"{opt_key} tiene {n} opciones y {method} cubre {sorted(ranges)}: tienen que ser las 9 de la 42.21 "
                 "(las explicaciones de la página van por opción).")
        out[field] = [ranges[i] for i in range(1, n + 1)]
        if out[field][-1] != [INT_MAX, INT_MAX]:
            _die(f"La última opción de {opt_key} ya no es 'nunca' (Integer.MAX_VALUE): leí {out[field][-1]}.")
    out["never"] = INT_MAX
    return out


def _calls(cp, code_):
    return {m[:2] for m in (_member(cp, x, 0xb6, 0xb7, 0xb8, 0xb9) for x in _instructions(code_)) if m}


def world_age_guard():
    """
    Corta si un parche cambia la cuenta de la edad del mundo, de la que depende el día del corte de agua y luz (la
    página lo explica con estas reglas):
      - `GameTime.getWorldAgeDaysSinceBegin` = horas / 24 + (TimeSinceApo − 1) × 30: `ldc2_w 24.0`, `iconst_1` y
        `bipush 30`;
      - `GameTime.getWorldAgeHours` cuenta desde las 7:00: `ldc 7.0f` y `ldc 17.0f`;
      - el agua (`IsoObject`, en un mismo método) compara esa edad con `getWaterShutModifier`, y la luz
        (`SandboxOptions.doesPowerGridExist(I)Z`) compara `IsoWorld.getWorldAgeDays` con `getElecShutModifier`.
    Devuelve las reglas del calendario: {dayStartHour, monthDays, firstYear}.
    """
    cp, code = _jar_class("zombie/GameTime.class")
    days = _instructions(code.get(("getWorldAgeDaysSinceBegin", "()D"), b""))
    hours = _instructions(code.get(("getWorldAgeHours", "()D"), b""))
    has_24 = any(_push_double(cp, x) == 24.0 and x[1] == 0x14 for x in days)
    has_1 = any(x[1] == 0x04 for x in days)
    month = [x[2] for x in days if x[1] == 0x10]
    floats = {_push_float(cp, x) for x in hours if x[1] in (0x12, 0x13)}
    if not (has_24 and has_1 and month == [30] and {7.0, 17.0} <= floats):
        _die("GameTime.getWorldAgeDaysSinceBegin / getWorldAgeHours cambiaron (busco ldc2_w 24.0, iconst_1 y bipush 30; "
             f"ldc 7.0f y 17.0f; leí bipush {month} y floats {sorted(f for f in floats if f is not None)}): el parche "
             "cambió cómo se cuenta la edad del mundo, y con eso el día del corte de agua y luz.")
    cp, code = _jar_class("zombie/iso/IsoObject.class")
    if not any({"getWorldAgeDaysSinceBegin", "getWaterShutModifier"} <= {n for _, n in _calls(cp, c)}
               for c in code.values()):
        _die("Ningún método de IsoObject compara getWorldAgeDaysSinceBegin con getWaterShutModifier: el parche cambió "
             "cómo se corta el agua.")
    cp, code = _jar_class(SANDBOX_CLASS + ".class")
    grid = _calls(cp, code.get(("doesPowerGridExist", "(I)Z"), b""))
    if not {("zombie/iso/IsoWorld", "getWorldAgeDays"), (SANDBOX_CLASS, "getElecShutModifier")} <= grid:
        _die("SandboxOptions.doesPowerGridExist(I)Z ya no compara IsoWorld.getWorldAgeDays con getElecShutModifier: "
             "el parche cambió cómo se corta la luz.")
    return {"dayStartHour": 7, "monthDays": month[0], "firstYear": first_year()}


def start_hours(opts):
    """
    La hora de arranque de cada opción de StartTime, de su etiqueta en inglés ("9 AM" → 9; "12 AM" → 0), con la misma
    regla que `game_start_minute` de extract.py.
    """
    out = []
    for v in next(o for o in opts if o["key"] == "StartTime")["values"]:
        m = re.fullmatch(r"(\d{1,2})\s*(AM|PM)", v["en"])
        if not m or not 1 <= int(m.group(1)) <= 12:
            _die(f"No entendí la hora de arranque {v['en']!r} (Sandbox_StartTime_option<i>).")
        out.append(int(m.group(1)) % 12 + (12 if m.group(2) == "PM" else 0))
    return out


def day_length_minutes(opts):
    """
    Cuántos minutos reales dura un día del juego en cada opción de DayLength, de su etiqueta en inglés ("15 Minutes",
    "1 Hour, 30 Minutes", "23 Hours"); "Real-time" es un día de verdad, 24 horas.
    """
    out = []
    for v in next(o for o in opts if o["key"] == "DayLength")["values"]:
        label = v["en"]
        if label == "Real-time":
            out.append(24 * 60)
            continue
        m = re.fullmatch(r"(?:(\d+) Hours?)?(?:, )?(?:(\d+) Minutes?)?", label)
        if not m or not (m.group(1) or m.group(2)):
            _die(f"No entendí el largo del día {label!r} (Sandbox_DayLength_option<i>).")
        out.append(int(m.group(1) or 0) * 60 + int(m.group(2) or 0))
    return out


# ---------------------------------------------------------------------------
# El .ini del servidor (zombie.network.ServerOptions)
# ---------------------------------------------------------------------------

_INI_NEW = {
    "Boolean": ("bool", "(Lzombie/network/ServerOptions;Ljava/lang/String;Z)V", "i"),
    "Integer": ("int", "(Lzombie/network/ServerOptions;Ljava/lang/String;III)V", "iii"),
    "Double": ("double", "(Lzombie/network/ServerOptions;Ljava/lang/String;DDD)V", "ddd"),
    "String": ("string", "(Lzombie/network/ServerOptions;Ljava/lang/String;Ljava/lang/String;I)V", "si"),
    "Text": ("text", "(Lzombie/network/ServerOptions;Ljava/lang/String;Ljava/lang/String;I)V", "si"),
    "Enum": ("enum", "(Lzombie/network/ServerOptions;Ljava/lang/String;II)V", "ii"),
}
_RAND_INT = ("zombie/core/random/Rand", "Next", "(I)I")
_INT_STR = ("java/lang/Integer", "toString", "(I)Ljava/lang/String;")


def _mark_random(cp, rest):
    """
    Tres opciones del .ini nacen con un valor que el servidor elige al escribir su primer .ini: `ResetID` =
    `Rand.Next(1000000000)`, `ServerPlayerID` = `Integer.toString(Rand.Next(Integer.MAX_VALUE))` y `Seed` =
    `GameServer.seed` (la semilla del mundo, que se sortea al crearlo). Esas instrucciones se cambian por el marcador
    `_RANDOM` con el tipo que dan ("i" o "s"), para leer los demás argumentos como siempre. Devuelve (argumentos, tipo
    del azar o None).
    """
    for i, x in enumerate(rest):
        f = _member(cp, x, 0xb2)
        if f and f[0] == "zombie/network/GameServer" and f[2] == "Ljava/lang/String;":
            return rest[:i] + [_RANDOM] + rest[i + 1:], "s"
    for i in range(len(rest) - 1):
        if _push_int(cp, rest[i]) is not None and _member(cp, rest[i + 1], 0xb8) == _RAND_INT:
            if i + 2 < len(rest) and _member(cp, rest[i + 2], 0xb8) == _INT_STR:
                return rest[:i] + [_RANDOM] + rest[i + 3:], "s"
            return rest[:i] + [_RANDOM] + rest[i + 2:], "i"
    return rest, None


def ini_options(T, table):
    """
    Las opciones del .ini, de `ServerOptions.<init>`: cada `new <Tipo>ServerOption(this, "Nombre", …)` con sus
    constantes. Las hojas son las de la parte INI de `SettingsTable` (nombre `UI_ServerSettingGroup_<hoja>`), sin los
    paneles sin opciones (Mods, Map…); las que el menú no muestra van a "Hidden". El juego las muestra con su nombre
    crudo (`DefaultPort`): no hay nombre traducido, sólo la ayuda `UI_ServerOption_<Nombre>_tooltip`.
    """
    try:
        cp, code = _jar_class(SERVER_CLASS + ".class")
    except (OSError, KeyError, zipfile.BadZipFile) as e:
        _die(f"No pude leer {SERVER_CLASS} de projectzomboid.jar ({e!r}).")
    opts, bad, seg = [], [], None
    for ins in _instructions(code.get(("<init>", "()V"), b"")):
        if ins[1] == 0xbb:  # new: arranca la sentencia de una opción (o de otra cosa, que no se usa)
            seg = []
            continue
        called = _member(cp, ins, 0xb7)
        m = re.fullmatch(re.escape(SERVER_CLASS) + r"\$(\w+)ServerOption", called[0]) if called else None
        if m and called[1] == "<init>":
            kind = _INI_NEW.get(m.group(1))
            args = [x for x in (seg or []) if x[1] not in (0x59, 0x2a)]  # dup, aload_0 (el ServerOptions)
            name = _ldc(cp, args[0]) if args else None
            rest, rand = _mark_random(cp, args[1:]) if kind else (args[1:], None)
            vals = _read_args(cp, rest, kind[2]) if kind and isinstance(name, str) else None
            # El azar sólo vale como default: el último entero de un Integer o el texto de un String.
            ok_rand = rand is None or (vals is not None and (
                (rand == "i" and kind[0] == "int" and vals[-1] is _RANDOM)
                or (rand == "s" and kind[0] == "string" and vals[0] is _RANDOM)))
            if vals is None or not ok_rand:
                bad.append(name if isinstance(name, str) else f"@{ins[0]}")
                seg = None
                continue
            vals = [(0 if rand == "i" else "") if v is _RANDOM else v for v in vals]
            o = {"key": name, "type": kind[0]}
            if kind[0] == "bool":
                o["default"] = bool(vals[0])
            elif kind[0] in ("int", "double"):
                conv = int if kind[0] == "int" else _tidy_double
                o["min"], o["max"], o["default"] = (conv(v) for v in vals)
            elif kind[0] == "enum":
                o["n"], o["default"] = vals
            else:
                o["default"] = vals[0]
            if rand:
                # El default lo elige el servidor la primera vez (al azar): va 0 / "" y la marca, así la página no
                # lo muestra como si fuera un valor fijo.
                o["random"] = True
            opts.append(o)
            seg = None
        elif seg is not None:
            seg.append(ins)
    if bad or len(opts) < MIN_INI:
        _die(f"Leí {len(opts)} opciones del .ini y no entendí {len(bad)} ({bad[:10]}…): el parche cambió cómo se crean.")

    by_key = {o["key"]: o for o in opts}
    pages, ordered, unknown = [], [], []
    for page, settings in table["INI"]:
        if not settings:
            continue
        name = T.get(f"UI_ServerSettingGroup_{page}")
        if not name:
            _die(f"La hoja {page} del .ini no tiene nombre en inglés (UI_ServerSettingGroup_{page}).")
        pages.append({"id": page, "name": name})
        for key, _title in settings:
            o = by_key.get(key)
            if o is None or "page" in o:
                unknown.append(key)
                continue
            o["page"] = page
            ordered.append(o)
    if unknown:
        _die(f"El menú del .ini nombra opciones que Java no tiene (o repite): {unknown}.")
    hidden = [o for o in opts if "page" not in o]
    for o in hidden:
        o["page"] = HIDDEN["id"]
    if hidden:
        pages.append(dict(HIDDEN))
    out = []
    for o in ordered + hidden:
        tip = T.get(f"UI_ServerOption_{o['key']}_tooltip")
        # El orden de las claves, fijo: key, type, default, rango, n, random, tip, page.
        e = {k: o[k] for k in ("key", "type", "default", "min", "max", "n", "random") if k in o}
        if tip:
            e["tip"] = tip
        e["page"] = o["page"]
        out.append(e)
    return pages, out


# ---------------------------------------------------------------------------
# Todo junto
# ---------------------------------------------------------------------------

_SANDBOX_KEYS = ("key", "type", "default", "min", "max", "values", "name", "tip", "page", "title")


def build(info=None):
    """
    `server.json` (ver la forma en el plan del 2026-10-01). `info`, si se pasa, se llena con lo que va al informe y no
    al archivo: claves de presets que Java no tiene, valores fuera de rango y español faltante.
    """
    info = {} if info is None else info
    if not os.path.isdir(MEDIA):
        raise SystemExit(f"No encuentro el juego en {GAME_DIR} (definí PZ_DIR)")
    T = _Texts()
    table = settings_table()
    opts = sandbox_options(T)
    pages, opts = sandbox_pages(opts, T, table)
    preset_list, version, _ = presets(opts, T, info)
    shutoff = shutoff_ranges(opts)
    rules = world_age_guard()
    ini_pages, ini = ini_options(T, table)
    info["missingEs"] = sorted(T.missing_es)
    return {
        "version": version,
        "pages": pages,
        "options": [{k: o[k] for k in _SANDBOX_KEYS if k in o} for o in opts],
        # El "Default" del juego (el de la pantalla, el de la ayuda y el de un servidor nuevo) es Apocalipsis, no
        # `options[].default`. `values` de cada preset ya viene como lo carga el juego (ver `presets`).
        "baseline": "apocalypse",
        "presets": preset_list,
        # Lo que la pantalla de servidor del juego reescribe al elegir Zombies, ZombieRespawn o ZombieMigrate: el
        # generador hace lo mismo cuando cambiás una de ésas (ver `linked_options`).
        "links": linked_options(opts),
        "iniPages": ini_pages,
        "ini": ini,
        "shutoff": shutoff,
        "rules": rules,
        "startHours": start_hours(opts),
        "dayLengthMinutes": day_length_minutes(opts),
    }


def report(data, info):
    """El informe de server.json, en renglones: cantidades, diferencias de cada preset, claves raras y rangos."""
    from collections import Counter
    opts = data["options"]
    lines = [
        f"Servidor: {len(opts)} opciones de sandbox {dict(Counter(o['type'] for o in opts).most_common())}, "
        f"{sum(1 for o in opts if 'tip' in o)} con ayuda; por hoja "
        f"{ {p['id']: sum(1 for o in opts if o['page'] == p['id']) for p in data['pages']} }",
        f"  Hidden (no están en el menú): {[o['key'] for o in opts if o['page'] == 'Hidden']}",
        f"  Presets (Version {data['version']}), como los carga el juego, lo que difiere del default de Java: "
        + ", ".join(f"{p['id']} {len(p['values'])}" for p in data["presets"]),
        "  Enlazadas: " + "; ".join(f"{k['from']} → {k['to']} {[v for _, v in k['values']]}" for k in data["links"]),
    ]
    for p in data["presets"]:
        unk, oor = info.get("presetUnknown", {}).get(p["id"]), info.get("presetOutOfRange", {}).get(p["id"])
        if unk:
            lines.append(f"  {p['id']}: {len(unk)} claves que Java no tiene (no entran): {unk}")
        if oor:
            lines.append(f"  {p['id']}: fuera de rango (el juego las ignora): {oor}")
    ini = data["ini"]
    lines += [
        f"  .ini: {len(ini)} opciones {dict(Counter(o['type'] for o in ini).most_common())}, "
        f"{sum(1 for o in ini if 'tip' in o)} con ayuda, {len(data['iniPages'])} hojas; "
        f"Hidden {sum(1 for o in ini if o['page'] == 'Hidden')}; al azar {[o['key'] for o in ini if o.get('random')]}",
        f"  Cortes (opción 1..9): agua {data['shutoff']['water']}",
        f"                        luz  {data['shutoff']['elec']}",
        f"  Calendario {data['rules']}; horas de arranque {data['startHours']}; "
        f"día de {data['dayLengthMinutes'][0]} a {data['dayLengthMinutes'][-1]} minutos",
        f"  Claves ES faltantes (Sandbox/UI): {len(info.get('missingEs', []))} {info.get('missingEs', [])[:10]}",
    ]
    return "\n".join(lines)


if __name__ == "__main__":
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="backslashreplace")
    _info = {}
    print(report(build(_info), _info))
