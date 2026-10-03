"""
Un lector del pedacito de Lua con que Project Zomboid escribe sus tablas de botín (2026-10-01).

Las tablas de botín (Distributions.lua, ProceduralDistributions.lua, VehicleDistributions.lua y los Distribution_*.lua
de la "junk") son, casi enteras, constructores de tablas: `{ rolls = 4, items = { "Bowl", 10, … } }`, con nombres que
apuntan a otras tablas (`junk = ClutterTables.BinJunk`) y algún `x = x or {}`. Para leerlas no hace falta un intérprete
de Lua (ni lupa, ni el JDK): alcanza con este lector, que entiende sólo eso y **nunca ejecuta nada**.

Qué entiende:
  - sentencias: `local nombre = expr`, `nombre.con.puntos = expr` (local si la raíz es un local del archivo, global si
    no), `function … end` y `local function … end` (se saltean enteras), llamadas sueltas como
    `table.insert(…)` o `Events.X.Add(…)` (se saltean) y `;` sueltos;
  - expresiones: `{…}`, strings ('…', "…" y [[…]]), números, `-número`, `true`/`false`/`nil`, nombres con punto y
    `a or b`;
  - comentarios `--` y `--[[ … ]]`.

Lo que no entiende (`..`, aritmética, `and`/`not`, llamadas dentro de una expresión, un `if` suelto…) levanta
LuaError con el archivo y la línea: se prefiere cortar a leer mal una tabla de botín y publicar chances inventadas.

Cómo quedan los valores en Python:
  - una tabla con sólo elementos sin clave es una `list`; con claves, un `dict` (si mezcla, los sin clave van en
    `"__arr"`); `{}` es `{}`;
  - los números son siempre `float` (en Lua 5.1, el de Kahlua, no hay enteros);
  - un campo que vale `nil` no se guarda, como en Lua: `Bakery = BakeryMisc` (un nombre que todavía no existe) no deja
    la clave `Bakery`. Lo mismo un elemento sin clave que vale nil (en Lua dejaría un hueco; en las tablas de botín
    nunca pasa con los objetos, que son textos y números literales);
  - un nombre que apunta a otra tabla devuelve **la misma** tabla (no una copia), como en Lua: dos muebles que
    comparten `ClutterTables.BinJunk` comparten el objeto.
"""
import re

__all__ = ["LuaError", "run_lua"]


class LuaError(Exception):
    """Algo del archivo que el lector no entiende (o que en Lua fallaría, como indexar nil)."""


KEYWORDS = frozenset("and break do else elseif end false for function goto if in local nil not or repeat return "
                     "then true until while".split())

# Un solo regex con un grupo por clase de token, en el orden en que hay que probarlos: los comentarios largos antes
# que los de línea, y los strings largos ([[…]], [==[…]==]) antes que el corchete suelto.
_TOKEN = re.compile(r"""
    (?P<ws>[ \t\r\f\v]+|\n)
  | (?P<lcomment>--\[(?P<lceq>=*)\[.*?\](?P=lceq)\])
  | (?P<comment>--[^\n]*)
  | (?P<lstring>\[(?P<lseq>=*)\[.*?\](?P=lseq)\])
  | (?P<string>"(?:[^"\\\n]|\\.|\\\n)*"|'(?:[^'\\\n]|\\.|\\\n)*')
  | (?P<number>0[xX][0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)
  | (?P<name>[A-Za-z_][A-Za-z_0-9]*)
  | (?P<op>\.\.\.|\.\.|==|~=|<=|>=|::|[-+*/%^\#<>=(){}\[\];:,.])
""", re.S | re.X)

_ESCAPES = {"n": "\n", "t": "\t", "r": "\r", "a": "\a", "b": "\b", "f": "\f", "v": "\v",
            "\\": "\\", '"': '"', "'": "'", "\n": "\n"}


def _unescape(body, file, line):
    """El contenido de un string '…' o "…" con sus escapes resueltos (\\n, \\", \\ddd…)."""
    out, i = [], 0
    while i < len(body):
        ch = body[i]
        if ch != "\\":
            out.append(ch)
            i += 1
            continue
        nxt = body[i + 1]
        if nxt in _ESCAPES:
            out.append(_ESCAPES[nxt])
            i += 2
        elif nxt.isdigit():
            m = re.match(r"\d{1,3}", body[i + 1:])
            out.append(chr(int(m.group())))
            i += 1 + len(m.group())
        else:
            raise LuaError(f"{file}:{line}: escape desconocido \\{nxt}")
    return "".join(out)


def _tokens(src, file):
    """[(clase, valor, línea)]: sin espacios ni comentarios, con la línea de cada token para los errores."""
    out, pos, line = [], 0, 1
    while pos < len(src):
        m = _TOKEN.match(src, pos)
        if not m:
            raise LuaError(f"{file}:{line}: no entiendo {src[pos:pos + 20]!r}")
        kind = m.lastgroup
        text = m.group()
        if kind in ("lceq", "lseq"):  # los grupos internos de los largos: la clase es la de afuera
            kind = "lcomment" if text.startswith("--") else "lstring"
        if kind == "name" and text in KEYWORDS:
            out.append(("kw", text, line))
        elif kind == "name":
            out.append(("name", text, line))
        elif kind == "number":
            out.append(("number", float(int(text, 16)) if text[:2] in ("0x", "0X") else float(text), line))
        elif kind == "string":
            out.append(("string", _unescape(text[1:-1], file, line), line))
        elif kind == "lstring":
            eq = len(m.group("lseq"))
            body = text[2 + eq:-2 - eq]
            out.append(("string", body[1:] if body.startswith("\n") else body, line))  # Lua saltea el primer \n
        elif kind == "op":
            out.append(("op", text, line))
        line += text.count("\n")
        pos = m.end()
    out.append(("eof", None, line))
    return out


class _Reader:
    def __init__(self, src, env, file, nils=None):
        self.nils = nils
        self.toks = _tokens(src, file)
        self.i = 0
        self.env = env
        self.file = file
        self.locals = {}
        self.nil_name = None  # el nombre que dio nil en la última expresión (None si no vino de un nombre)

    # --- utilidades -------------------------------------------------------------------------------------------------

    def peek(self, k=0):
        return self.toks[min(self.i + k, len(self.toks) - 1)]

    def next(self):
        t = self.toks[self.i]
        self.i += 1
        return t

    def is_(self, kind, value=None, k=0):
        t = self.peek(k)
        return t[0] == kind and (value is None or t[1] == value)

    def dropped(self, key, tok):
        """Anota un campo que no se guarda porque un nombre dio nil (`Bakery = BakeryMisc`), si se pidió."""
        if self.nils is not None and self.nil_name is not None:
            self.nils.append((self.file, tok[2], key, self.nil_name))

    def fail(self, msg, tok=None):
        tok = tok or self.peek()
        raise LuaError(f"{self.file}:{tok[2]}: {msg} (cerca de {tok[1]!r})")

    def expect(self, kind, value=None):
        if not self.is_(kind, value):
            self.fail(f"esperaba {value or kind}")
        return self.next()

    # --- sentencias -------------------------------------------------------------------------------------------------

    def run(self):
        while not self.is_("eof"):
            self.statement()
        return self.locals

    def statement(self):
        t = self.peek()
        if t[0] == "op" and t[1] == ";":
            self.next()
        elif t[0] == "kw" and t[1] == "local":
            self.next()
            if self.is_("kw", "function"):
                self.skip_block()
                return
            tok = self.expect("name")
            name = tok[1]
            if self.is_("op", ","):
                self.fail("no leo varios locales en una línea")
            value = None
            if self.is_("op", "="):
                self.next()
                value = self.expr()
                if value is None:
                    # `local t = NombreQueNoExiste` también es un nil por un nombre: se anota como los campos, así la
                    # guardia de "nil nuevo" de loot.py lo ve (un `local x` sin valor no, ahí el nil es a propósito).
                    self.dropped(name, tok)
            self.locals[name] = value  # se declara aunque valga nil: tapa a un global con el mismo nombre
        elif t[0] == "kw" and t[1] == "function":
            self.skip_block()
        elif t[0] == "name":
            start = self.i
            path = self.dotted()
            if self.is_("op", "="):
                self.next()
                value = self.expr()
                if value is None:
                    self.dropped(".".join(path), self.toks[start])
                self.assign(path, value, self.toks[start])
            elif self.is_("op", "(") or self.is_("op", ":"):
                self.skip_call()
            else:
                self.fail("sentencia que no entiendo")
        else:
            self.fail("sentencia que no entiendo")

    def dotted(self):
        """nombre(.nombre)* → [partes]."""
        parts = [self.expect("name")[1]]
        while self.is_("op", "."):
            self.next()
            parts.append(self.expect("name")[1])
        if self.is_("op", "["):
            self.fail("no leo índices entre corchetes")
        return parts

    def skip_block(self):
        """
        Saltea `function … end` contando los bloques que abren (`function`, `if`, `do` — este último cubre `for … do`
        y `while … do`) contra los `end`. Adentro de una función puede haber cualquier Lua: no se lee, sólo se cuenta.
        """
        first = self.next()  # function
        depth = 1
        while depth:
            t = self.next()
            if t[0] == "eof":
                self.fail("falta el end de una función", first)
            if t[0] == "kw":
                if t[1] in ("function", "if", "do"):
                    depth += 1
                elif t[1] == "end":
                    depth -= 1

    def skip_call(self):
        """Saltea `f(…)` o `obj:m(…)` balanceando paréntesis: no hace falta saber qué hace la llamada."""
        if self.is_("op", ":"):
            self.next()
            self.expect("name")
        open_tok = self.expect("op", "(")
        depth = 1
        while depth:
            t = self.next()
            if t[0] == "eof":
                self.fail("falta cerrar un paréntesis", open_tok)
            if t[0] == "op" and t[1] == "(":
                depth += 1
            elif t[0] == "op" and t[1] == ")":
                depth -= 1
        if self.is_("op", "(") or self.is_("op", ".") or self.is_("op", ":") or self.is_("op", "["):
            self.fail("no leo llamadas encadenadas")

    def assign(self, path, value, tok):
        root = path[0]
        scope = self.locals if root in self.locals else self.env
        if len(path) == 1:
            target, key = scope, root
        else:
            target = scope.get(root)
            for part in path[1:-1]:
                if not isinstance(target, dict):
                    self.fail(f"{'.'.join(path)}: se indexa algo que no es una tabla", tok)
                target = target.get(part)
            if not isinstance(target, dict):
                self.fail(f"{'.'.join(path)}: se indexa algo que no es una tabla", tok)
            key = path[-1]
        if value is None:
            target.pop(key, None)
        else:
            target[key] = value

    # --- expresiones ------------------------------------------------------------------------------------------------

    def expr(self):
        self.nil_name = None
        value, name = self.primary()
        while self.is_("kw", "or"):
            self.next()
            rhs, rhs_name = self.primary()  # se lee igual (puede no usarse): no tiene efectos
            if value is None or value is False:
                value, name = rhs, rhs_name
        self.nil_name = name if value is None else None
        if self.peek()[0] == "op" and self.peek()[1] not in (",", ";", "}", ")", "]") or self.is_("kw", "and"):
            self.fail("expresión que no entiendo (operador)")
        return value

    def primary(self):
        """(valor, nombre con punto si salió de buscar un nombre; si no, None)."""
        t = self.peek()
        kind, val = t[0], t[1]
        if kind == "op" and val == "{":
            return self.table(), None
        if kind in ("string", "number"):
            self.next()
            return val, None
        if kind == "op" and val == "-":
            self.next()
            if not self.is_("number"):
                self.fail("sólo leo el menos delante de un número")
            return -self.next()[1], None
        if kind == "kw" and val in ("true", "false", "nil"):
            self.next()
            return {"true": True, "false": False, "nil": None}[val], None
        if kind == "name":
            path = self.dotted()
            if self.is_("op", "(") or self.is_("op", ":") or self.is_("string") or self.is_("op", "{"):
                self.fail("no leo llamadas adentro de una expresión")
            return self.lookup(path, t), ".".join(path)
        self.fail("expresión que no entiendo")

    def lookup(self, path, tok):
        root = path[0]
        value = self.locals[root] if root in self.locals else self.env.get(root)
        for part in path[1:]:
            if value is None:
                self.fail(f"{'.'.join(path)}: se indexa nil", tok)  # en Lua, un error
            if not isinstance(value, dict):
                self.fail(f"{'.'.join(path)}: se indexa algo que no es una tabla", tok)
            value = value.get(part)
        return value

    def table(self):
        self.expect("op", "{")
        arr, keyed = [], {}
        while not self.is_("op", "}"):
            tok = self.peek()
            if self.is_("name") and self.is_("op", "=", 1):
                key = self.next()[1]
                self.next()
                value = self.expr()
                if value is None:
                    self.dropped(key, tok)
                self.put(keyed, key, value)
            elif self.is_("op", "["):
                self.next()
                key = self.expr()
                if not isinstance(key, (str, float)):
                    self.fail("clave entre corchetes que no es texto ni número")
                self.expect("op", "]")
                self.expect("op", "=")
                value = self.expr()
                if value is None:
                    self.dropped(key, tok)
                self.put(keyed, key, value)
            else:
                value = self.expr()
                if value is None:
                    self.dropped(None, tok)
                else:
                    arr.append(value)
            if self.is_("op", ",") or self.is_("op", ";"):
                self.next()
            elif not self.is_("op", "}"):
                self.fail("esperaba , o } en una tabla")
        self.next()
        if keyed and arr:
            keyed["__arr"] = arr
            return keyed
        return keyed if keyed or not arr else arr

    @staticmethod
    def put(keyed, key, value):
        if value is None:
            keyed.pop(key, None)  # { a = 1, a = nil } deja a sin valor, como en Lua
        else:
            keyed[key] = value  # una clave repetida se queda con la última, como en Lua


def run_lua(src, env, file="?", nils=None):
    """
    Lee `src` como si el juego lo ejecutara: los globales que asigna quedan en `env` (con los nombres con punto ya
    armados: `ClutterTables.BinJunk = …` → env["ClutterTables"]["BinJunk"]) y devuelve los `local` del archivo.
    Los globales que lee también salen de `env`, así que varios archivos se leen en orden con el mismo `env`.

    Si se pasa `nils` (una lista), se le agrega (archivo, línea, clave, nombre) por cada campo o asignación que no se
    guardó porque un nombre dio nil (`Bakery = BakeryMisc` → ("…", 2475, "Bakery", "BakeryMisc"); la clave es None
    para un elemento sin clave). Un `nil` escrito a mano no se anota: es a propósito.
    """
    return _Reader(src, env, file, nils).run()
