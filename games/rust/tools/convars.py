"""
Rust → la referencia de convars y comandos de consola de la pestaña Servidor (2026-10-09). Plan:
docs/superpowers/plans/2026-10-09-rust-servidor.md.

Las convars no están en los datos del cliente: son atributos del código (`[ServerVar]`, `[ClientVar]`). Salen del
decompilado público github.com/MillionthOdin16/RustChangelog (rama `release`). Se clona solo, sin historia, en
`games/rust/.cache/RustChangelog` (no versionado), o se usa el que haya en `RUST_DECOMP`.

Escribe `games/rust/data/server.json`: una entrada por convar o comando, con su nombre completo (`server.hostname`),
de qué lado corre, si es variable o comando, el tipo y el valor inicial del campo (si es un literal), la ayuda del
juego (en inglés, la única que hay) y si se guarda en el `cfg` o es de admin.

Uso, desde la raíz del repo:
    python games/rust/tools/convars.py
"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
DATA = ROOT / "games" / "rust" / "data"
REPO = "https://github.com/MillionthOdin16/RustChangelog"
SRC = Path(os.environ.get("RUST_DECOMP", ROOT / "games" / "rust" / ".cache" / "RustChangelog"))

# `ReplicatedVar` es una del servidor que el cliente también ve; `ServerUserVar` y `ServerAllVar`, comandos del servidor
# que puede usar cualquier jugador.
ATTR = re.compile(r"\[(ServerVar|ClientVar|ReplicatedVar|ServerUserVar|ServerAllVar)(?:\((?P<args>[^\]]*)\))?\]")
# Los campos privados que respaldan una propiedad (`private static int _limit = 240;`): su valor es el de la convar.
BACKING = re.compile(r"private\s+static\s+(\w+)\s+_(\w+)\s*(=[^;]*;)")
MEMBER = re.compile(
    r"^\s*public\s+static\s+(?:readonly\s+)?(?P<type>[\w<>\[\],.? ]+?)\s+(?P<name>\w+)\s*(?P<rest>=[^;]*;|;|\{.*|\(.*|$)",
)
FACTORY = re.compile(r'\[Factory\("(?P<name>[^"]+)"\)\]')
CLASS = re.compile(r"^\s*(?:public|internal)?\s*(?:static\s+|abstract\s+|sealed\s+|partial\s+)*class\s+(?P<name>\w+)")
TYPES = {"bool": "bool", "int": "int", "float": "float", "string": "string", "long": "int", "uint": "int", "double": "float", "ulong": "int"}


def parse_args(args: str | None) -> dict:
    """`Help = "…", Saved = true, Name = "x"` → {"Help": "…", "Saved": True, "Name": "x"}. El texto puede traer comas."""
    out: dict = {}
    if not args:
        return out
    for m in re.finditer(r'(\w+)\s*=\s*("(?:[^"\\]|\\.)*"|true|false|[\w.]+)', args):
        k, v = m.group(1), m.group(2)
        if v.startswith('"'):
            out[k] = v[1:-1].replace('\\"', '"').replace(r"\n", " ").replace(r"\t", " ")
        elif v in ("true", "false"):
            out[k] = v == "true"
        else:
            out[k] = v
    return out


def literal(rest: str, typ: str):
    """El valor inicial de un campo, sólo si es un literal simple (`= 28015;`, `= 0.5f;`, `= "x";`, `= true;`)."""
    m = re.match(r"=\s*(.+?);\s*$", rest.strip())
    if not m:
        return None
    v = m.group(1).strip()
    if typ == "bool" and v in ("true", "false"):
        return v == "true"
    if typ == "string" and re.fullmatch(r'"(?:[^"\\]|\\.)*"', v):
        return v[1:-1]
    num = re.fullmatch(r"(-?\d+(?:\.\d+)?)(?:[fFdDuUlL]{1,2})?", v)
    if typ in ("int", "float") and num:
        x = float(num.group(1))
        return int(x) if typ == "int" or x.is_integer() else x
    return None


def parse_file(text: str, fallback_class: str) -> list[dict]:
    """Las convars de un `.cs`: cada atributo con el miembro que le sigue y el prefijo de su clase."""
    lines = text.split("\n")
    out = []
    prefix = None
    pending_factory = None
    attrs: list[tuple[str, dict]] = []
    backing = {m.group(2): m.group(3) for m in BACKING.finditer(text)}
    for line in lines:
        f = FACTORY.search(line)
        if f:
            pending_factory = f.group("name")
        c = CLASS.match(line)
        if c and prefix is None:
            prefix = pending_factory or c.group("name").lower()
        found = list(ATTR.finditer(line))
        if found:
            # Una misma propiedad puede ser convar del cliente y del servidor (`[ClientVar] [ServerVar] fps.limit`).
            attrs += [(a.group(1), parse_args(a.group("args"))) for a in found]
            line = line[found[-1].end():]  # el miembro puede venir en el mismo renglón
            if not line.strip():
                continue
        if not attrs:
            continue
        m = MEMBER.match(line)
        if not m:
            if line.strip().startswith("["):
                continue  # otro atributo (p. ej. `[Help("…")]`) entre el atributo y el miembro
            attrs = []
            continue
        raw_type = m.group("type").strip()
        rest = m.group("rest")
        is_cmd = rest.startswith("(")
        help_text = next((a["Help"] for _, a in attrs if a.get("Help")), None)
        for kind_attr, args in attrs:
            name = (args.get("Name") or m.group("name")).lower()
            typ = None if is_cmd else TYPES.get(raw_type, "other")
            entry = {
                "name": f"{(prefix or fallback_class).lower()}.{name}",
                "side": "client" if kind_attr == "ClientVar" else "server",
                "kind": "command" if is_cmd else "var",
            }
            if typ:
                entry["type"] = typ
                src = rest if rest.startswith("=") else backing.get(m.group("name"))
                d = literal(src, typ) if src else None
                if d is not None:
                    entry["default"] = d
            if help_text:
                entry["help"] = help_text.strip()
            if args.get("Saved"):
                entry["saved"] = True
            if args.get("ServerAdmin") or args.get("ClientAdmin"):
                entry["admin"] = True
            if kind_attr in ("ServerUserVar", "ServerAllVar"):
                entry["anyone"] = True
            out.append(entry)
        attrs = []
    return out


def ensure_source() -> Path:
    if not (SRC / "ConVar").exists():
        SRC.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(["git", "clone", "--depth", "1", "-q", REPO, str(SRC)], check=True)
    return SRC


def build(src: Path) -> dict:
    found: dict[str, dict] = {}
    for path in sorted(src.rglob("*.cs")):
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        if "ServerVar" not in text and "ClientVar" not in text:
            continue
        for e in parse_file(text, path.stem):
            # Una convar del cliente y del servidor a la vez (`fps.limit`) queda en una sola fila con los dos lados.
            side = e.pop("side")
            row = found.setdefault(e["name"], {**e, "sides": []})
            if side not in row["sides"]:
                row["sides"].append(side)
                row["sides"].sort(reverse=True)  # "server" antes que "client"
    rows = sorted(found.values(), key=lambda e: e["name"])
    try:
        sha, date = subprocess.run(["git", "-C", str(src), "log", "-1", "--format=%h %cs"], capture_output=True, text=True, check=True).stdout.split()
    except (subprocess.CalledProcessError, ValueError, FileNotFoundError):
        sha, date = None, None
    return {"source": {"commit": sha, "date": date}, "vars": rows}


def main():
    doc = build(ensure_source())
    with open(DATA / "server.json", "w", encoding="utf-8", newline="\n") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    n = doc["vars"]
    print(f"[rust] servidor: {len(n)} convars y comandos ({sum(1 for v in n if 'server' in v['sides'])} del servidor)")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
