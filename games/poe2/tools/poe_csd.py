"""Descripciones de estadísticas del juego (`data/statdescriptions/*.csd`).

Son las plantillas con las que el juego escribe cada línea de un objeto o de una
gema ("Deals {0} to {1} Physical Damage"), en todos los idiomas a la vez. Sirven
para dos cosas:

- `render(ids, values, lang)`: escribir la línea en español a partir de los ids
  de estadística y sus valores (lo que trae RePoE por nivel de gema).
- `translate(line)`: pasar al español una línea ya escrita en inglés (los
  modificadores de los únicos que trae la economía), reconociendo la plantilla
  por su forma con los números cambiados por "#".

Formato: bloques `description`, cada uno con los ids, las variantes en inglés
(condiciones sobre los valores + texto + transformaciones) y después un bloque
`lang "X"` por idioma con sus propias variantes.
"""
import re

_TOKEN = re.compile(r'"((?:[^"\\]|\\.)*)"|(\S+)', re.S)
_NOARG = {"canonical_line"}
_KEYWORDS = {"description", "no_description", "include", "lang", "no_identifiers"}
_PH = re.compile(r"\{(\d*)(?::([+-]?)d?)?\}")
_NUM = re.compile(r"[+-]?\(-?[\d.]+[-–]-?[\d.]+\)|[+-]?\d+(?:\.\d+)?")


def clean(text: str) -> str:
    """El marcado de palabras clave del juego: "[Totem|tótem]" → "tótem"."""
    text = re.sub(r"\[([^\]|]*)\|([^\]]*)\]", r"\2", text)
    return re.sub(r"\[([^\]]*)\]", r"\1", text).replace("\\n", "\n").replace("\r", "")


def _cond_ok(cond: str, v) -> bool:
    if cond == "#":
        return True
    neg = cond.startswith("!")
    if neg:
        cond = cond[1:]
    if "|" in cond:
        lo, hi = cond.split("|", 1)
        ok = (lo == "#" or v >= float(lo)) and (hi == "#" or v <= float(hi))
    else:
        ok = v == float(cond)
    return ok != neg


def _num(v) -> str:
    if isinstance(v, float) and not v.is_integer():
        return f"{v:.2f}".rstrip("0").rstrip(".")
    return str(int(v))


def _apply(handler: str, v):
    if v is None:
        return v
    h = handler
    if h == "negate":
        return -v
    if h == "double":
        return v * 2
    if h == "negate_and_double":
        return -v * 2
    if h == "add_one":
        return v + 1
    if h == "subtract_one":
        return v - 1
    if h == "times_twenty":
        return v * 20
    if h == "plus_two_hundred":
        return v + 200
    if h.startswith("per_minute_to_per_second"):
        r = v / 60
    elif h.startswith("milliseconds_to_seconds"):
        r = v / 1000
    elif h.startswith("deciseconds_to_seconds"):
        r = v / 10
    elif h.startswith("divide_by_one_hundred"):
        r = v / 100
        if "negate" in h:
            r = -r
    elif h.startswith("divide_by_ten"):
        r = v / 10
    elif h.startswith("divide_by_two"):
        r = v / 2
    elif h.startswith("divide_by_three"):
        r = v / 3
    elif h.startswith("divide_by_four"):
        r = v / 4
    elif h.startswith("divide_by_five"):
        r = v / 5
    elif h.startswith("divide_by_fifteen"):
        r = v / 15
    elif h.startswith("divide_by_fifty"):
        r = v / 50
    elif h.startswith("divide_by_twenty_then_double"):
        r = round(v / 20) * 2
    else:
        return v
    m = re.search(r"(\d)dp", h)
    if m:
        r = round(r, int(m.group(1)))
    else:
        r = round(r, 2)
    return int(r) if float(r).is_integer() else r


class Variant:
    __slots__ = ("conds", "text", "handlers")

    def __init__(self, conds, text, handlers):
        self.conds, self.text, self.handlers = conds, text, handlers

    def matches(self, values) -> bool:
        return all(_cond_ok(c, v if v is not None else 0) for c, v in zip(self.conds, values))

    def fill(self, values) -> str:
        vals = list(values)
        for h, i in self.handlers:
            if i is not None and 0 <= i - 1 < len(vals):
                vals[i - 1] = _apply(h, vals[i - 1])
        seq = iter(range(len(vals)))

        def rep(m):
            idx = int(m.group(1)) if m.group(1) else next(seq, 0)
            v = vals[idx] if idx < len(vals) and vals[idx] is not None else 0
            s = _num(v)
            if m.group(2) == "+" and v >= 0:
                s = "+" + s
            return s

        return clean(_PH.sub(rep, self.text))


class Block:
    __slots__ = ("ids", "langs")

    def __init__(self, ids):
        self.ids = ids
        self.langs = {}


def parse(text: str):
    toks = [(m.group(1), True) if m.group(1) is not None else (m.group(2), False) for m in _TOKEN.finditer(text)]
    blocks, i, n = [], 0, len(toks)

    def variants(i, nids):
        (count, _), i = toks[i], i + 1
        out = []
        for _ in range(int(count)):
            conds = [toks[i + k][0] for k in range(nids)]
            i += nids
            txt, isq = toks[i]
            i += 1
            if not isq:
                raise ValueError(f"esperaba texto, vino {txt!r}")
            handlers = []
            while i < n and not toks[i][1] and re.match(r"^[A-Za-z_%][\w%]*$", toks[i][0]) and toks[i][0] not in _KEYWORDS:
                h = toks[i][0]
                i += 1
                if h in _NOARG:
                    handlers.append((h, None))
                elif h == "reminderstring":
                    i += 1
                elif i < n and toks[i][0].isdigit():
                    handlers.append((h, int(toks[i][0])))
                    i += 1
            out.append(Variant(conds, txt, handlers))
        return out, i

    while i < n:
        w, isq = toks[i]
        w = w.lstrip("﻿")
        if isq:
            i += 1
            continue
        if w == "include":
            i += 2
        elif w == "no_description":
            i += 2
        elif w == "description":
            i += 1
            # Algunas llevan un nombre: `description nombre`, antes de los ids.
            if not toks[i][0].isdigit():
                i += 1
            nids = int(toks[i][0])
            ids = tuple(toks[i + 1 + k][0] for k in range(nids))
            i += 1 + nids
            b = Block(ids)
            try:
                b.langs["English"], i = variants(i, nids)
                while i < n and toks[i][0] == "lang":
                    lang = toks[i + 1][0]
                    b.langs[lang], i = variants(i + 2, nids)
            except (ValueError, IndexError):
                # Un bloque raro no tira el resto: se saltea hasta el próximo.
                while i < n and toks[i][0] not in ("description", "no_description"):
                    i += 1
                continue
            blocks.append(b)
        else:
            i += 1
    return blocks


def _shape(text: str) -> str:
    return re.sub(r"\s+", " ", _NUM.sub("#", clean(text))).strip().lower()


class Descriptions:
    """Todas las plantillas de uno o varios .csd."""

    def __init__(self, texts):
        self.by_ids = {}
        self.by_shape = {}
        for text in texts:
            for b in parse(text):
                self.by_ids.setdefault(b.ids, b)
                en = b.langs.get("English", [])
                for k, v in enumerate(en):
                    shape = _shape(_PH.sub("0", v.text))
                    self.by_shape.setdefault(shape, (b, k))

    def render(self, ids, values, lang="English"):
        b = self.by_ids.get(tuple(ids))
        if not b:
            return None
        en = b.langs.get("English", [])
        vs = b.langs.get(lang) or en
        # Se elige la variante por las condiciones sobre los valores crudos,
        # en el idioma pedido (el español a veces separa singular y plural).
        for v in vs:
            if v.matches(values):
                return v.fill(values)
        return None

    def translate(self, line: str, lang="Spanish"):
        """Una línea ya escrita en inglés → el idioma pedido, o None si no se reconoce."""
        hit = self.by_shape.get(_shape(line))
        if not hit:
            return None
        b, k = hit
        en = b.langs["English"][k]
        tr = b.langs.get(lang)
        if not tr:
            return None
        t = tr[k] if len(tr) == len(b.langs["English"]) else next((v for v in tr if v.conds == en.conds), None)
        if t is None:
            return None
        # Los números de la línea inglesa, en el orden de los marcadores ingleses,
        # se ponen en los marcadores del otro idioma por índice.
        nums = _NUM.findall(clean(line))
        order = [m.group(1) for m in _PH.finditer(en.text)]
        by_idx = {}
        seq = 0
        for tok, key in zip(nums, order):
            if key == "":
                key = str(seq)
                seq += 1
            by_idx[key] = tok
        seq = 0

        def rep(m):
            nonlocal seq
            key = m.group(1)
            if key == "":
                key = str(seq)
                seq += 1
            return by_idx.get(key, "#")

        # Si la plantilla ya pone el "+" y el número vino con signo, queda uno solo.
        return clean(_PH.sub(rep, t.text)).replace("++", "+").replace("+-", "-")
