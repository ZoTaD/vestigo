"""
Lo que el colector de AoE2 saca de cada grabación además de la apertura (2026-11-26): unidades entrenadas por línea, APM
y clics de edad de cada jugador, y las marcas para los datos curiosos. Las mismas reglas que `site/src/aoe2/api/
analysis.ts` (la ficha de partida): APM = todas las acciones por minuto de juego; edad = el último clic; unidades = lo
encolado, con cantidad.

Por día (`stats/days/<fecha>.json`), todo `[n, suma]` o `[partidas, victorias]` como el resto:
- `rec["<banda>|<civ>"]`: jugadores con grabación leída (la base de las unidades).
- `units["<banda>|<civ>|<línea>"]`: partidas en que el jugador entrenó `MASA` o más de esa línea, y cuántas ganó.
- `apm["<banda>"]`, `age["<banda>|<0 feudal, 1 castillos, 2 imperial>"]`: `[jugadores, suma]`, para los promedios.
- `top["<marca>"]`: las `TOPE` mejores del día, `[valor, partida, perfil, civ, extra]` (ver `MARCAS`).
"""
import json
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
#: Desde cuántas unidades de una línea cuenta como "la usó en serio" (no un par sueltas para defenderse).
MASA = 10
TOPE = 5
ALDEANO = 83
#: Aldeanos, barcos pesqueros, de transporte y comerciales y carros de comercio: no son ejército.
ECONOMICAS = {83, 13, 17, 128, 545}
EDADES = (101, 102, 103)
#: Las marcas de los datos curiosos y si gana el valor más chico (tiempos) o el más grande.
MARCAS = {"feudal": "min", "imperial": "min", "apm": "max", "villagers": "max", "army": "max"}
#: Pisos para las marcas: clics más tempranos aparecen en mapas con comida de más o partidas raras, y una marca que
#: parece mentira no sirve como dato curioso (26/11: un Feudal a 5:31 que no se pudo verificar).
PISO = {"feudal": 390, "imperial": 900}
#: Una partida tiene que durar esto (segundos de juego) para que su APM cuente (las de 3 minutos dan cualquier cosa).
MIN_APM = 10 * 60


def lineas() -> dict[int, int]:
    """Unidad → primera de su línea (Arquero, Ballestero y Arbalestero son la línea del Arquero), de la enciclopedia."""
    u = json.loads((RAIZ / "data" / "encyclopedia" / "units.json").read_text(encoding="utf-8"))["units"]
    return {x["id"]: (x.get("line") or [x["id"]])[0] for x in u}


def por_jugador(lectura, linea: dict[int, int]) -> dict[int, dict]:
    """Lugar → `{apm, ages: [feudal, castillos, imperial], units: {línea: cuántas}}` (segundos de juego)."""
    minutos = lectura.fin / 60
    out: dict[int, dict] = {}
    jugadores = {j for j in lectura.cuenta if j > 0} | {a.player for a in lectura.acciones if a.player > 0}
    for j in jugadores:
        mias = [a for a in lectura.acciones if a.player == j]
        ages = []
        for e in EDADES:
            clics = [a.t for a in mias if a.kind == "research" and a.id == e]
            ages.append(round(clics[-1]) if clics else None)
        units: dict[int, int] = {}
        for a in mias:
            if a.kind == "queue":
                k = linea.get(a.id, a.id)
                units[k] = units.get(k, 0) + a.amount
        apm = round(lectura.cuenta.get(j, 0) / minutos) if lectura.fin >= MIN_APM else None
        out[j] = {"apm": apm, "ages": ages, "units": units}
    return out


def marcas(datos: dict) -> dict[str, tuple[int, int | None]]:
    """Las marcas de un jugador en una partida: `{marca: (valor, extra)}` (extra = la línea, en `army`)."""
    out: dict[str, tuple[int, int | None]] = {}
    if datos["ages"][0] is not None and datos["ages"][0] >= PISO["feudal"]:
        out["feudal"] = (datos["ages"][0], None)
    if datos["ages"][2] is not None and datos["ages"][2] >= PISO["imperial"]:
        out["imperial"] = (datos["ages"][2], None)
    if datos["apm"] is not None:
        out["apm"] = (datos["apm"], None)
    if datos["units"].get(ALDEANO):
        out["villagers"] = (datos["units"][ALDEANO], None)
    militares = [(n, k) for k, n in datos["units"].items() if k not in ECONOMICAS]
    if militares:
        n, k = max(militares)
        out["army"] = (n, k)
    return out


def sumar_top(lista: list, fila: list, marca: str, tope: int = TOPE) -> list:
    """Agrega `fila` (`[valor, partida, perfil, civ, extra]`) a las mejores de `marca` y deja las `tope` mejores (una por
    partida y jugador)."""
    menor = MARCAS[marca] == "min"
    vistas = {(f[1], f[2]) for f in lista}
    if (fila[1], fila[2]) in vistas:
        return lista
    out = sorted([*lista, fila], key=lambda f: f[0] if menor else -f[0])
    return out[:tope]
