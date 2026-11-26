"""
El índice de nombres de Age of Empires II: DE (2026-11-26): para buscar un jugador por parte de su nombre, sin
mayúsculas ni acentos. La API de World's Edge sólo busca por nombre exacto, así que el índice se arma con lo que el
colector diario ya baja: los rankings enteros (todos los jugadores con puesto) y los perfiles de los historiales.

    python games/aoe2/tools/names.py            # baja sólo los rankings y rehace el índice (la primera vez)

Formato: `stats/names/<clave>.json`, una lista de `[perfil, alias, país, elo]` ordenada por ELO. `elo` es el mejor de
los rankings redondeado a la centena (para ordenar sin que el archivo cambie todos los días; el número exacto se pide
en vivo). Un jugador va en el archivo de cada palabra de su nombre: la clave son las 2 primeras letras de la palabra
(`wR.Lucho` → `wr` por "wrlucho" y `lu` por "lucho"). Lo que no es a-z ni 0-9 cuenta como `_`.

El cliente repite `palabras()` en `site/src/aoe2/players/names.ts`: si se cambia acá, cambiarla allá.
Nadie sale del índice: quien deja de jugar sigue apareciendo con su último ELO conocido.
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

AQUI = Path(__file__).resolve().parent
NOMBRES = AQUI.parents[2] / "games" / "aoe2" / "stats" / "names"
_SEP = re.compile(r"[\W_]+", re.UNICODE)
_CAMEL = re.compile(r"(?<=[a-z])(?=[A-Z])")


def _plano(s: str) -> str:
    """Sin acentos (NFKD sin marcas)."""
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def palabras(alias: str) -> set[str]:
    """Las palabras por las que se encuentra un nombre, en minúscula: el nombre entero sin separadores, cada parte
    separada por símbolos y cada parte de un camelCase (`TheViper` → "theviper", "the", "viper")."""
    plano = _plano(alias)
    partes = [p for p in _SEP.split(plano) if p]
    out = {"".join(partes).lower()} if partes else set()
    for p in partes:
        out.add(p.lower())
        out.update(x.lower() for x in _CAMEL.split(p) if x)
    return {x for x in out if x}


def clave(palabra: str) -> str:
    c = "".join(ch if ("a" <= ch <= "z" or "0" <= ch <= "9") else "_" for ch in palabra[:2])
    return c.ljust(2, "_")


def leer() -> dict[int, list]:
    """Lo ya indexado: perfil → `[alias, país, elo]`."""
    out: dict[int, list] = {}
    if NOMBRES.exists():
        for r in NOMBRES.glob("*.json"):
            try:
                for pid, alias, pais, elo in json.loads(r.read_text(encoding="utf-8")):
                    out[pid] = [alias, pais, elo]
            except Exception:
                continue
    return out


def actualizar(viejo: dict[int, list], del_ranking: dict[int, tuple[str, str, float]], de_historiales: dict[int, tuple[str, str]]) -> dict[int, list]:
    """Suma lo de hoy a lo indexado. El ranking manda en alias, país y ELO; un perfil visto sólo en un historial
    actualiza alias y país y se queda con su ELO anterior (o 0)."""
    nuevo = {k: list(v) for k, v in viejo.items()}
    for pid, (alias, pais) in de_historiales.items():
        if pid <= 0 or not alias:
            continue
        previo = nuevo.get(pid)
        nuevo[pid] = [alias, pais or (previo[1] if previo else ""), previo[2] if previo else 0]
    for pid, (alias, pais, elo) in del_ranking.items():
        if pid <= 0 or not alias:
            continue
        nuevo[pid] = [alias, pais or "", int(elo // 100 * 100)]
    return nuevo


def escribir(indice: dict[int, list]) -> int:
    """Reescribe `stats/names/` entero; devuelve cuántos archivos quedaron. Una fila por línea, para que el diff de
    cada día sea chico."""
    grupos: dict[str, list] = {}
    for pid, (alias, pais, elo) in indice.items():
        for k in {clave(p) for p in palabras(alias)}:
            grupos.setdefault(k, []).append([pid, alias, pais, elo])
    NOMBRES.mkdir(parents=True, exist_ok=True)
    for r in NOMBRES.glob("*.json"):
        if r.stem not in grupos:
            r.unlink()
    for k, filas in grupos.items():
        filas.sort(key=lambda f: (-f[3], f[1].lower(), f[0]))
        texto = "[\n" + ",\n".join(json.dumps(f, ensure_ascii=False, separators=(",", ":")) for f in filas) + "\n]\n"
        ruta = NOMBRES / f"{k}.json"
        if not ruta.exists() or ruta.read_text(encoding="utf-8") != texto:
            ruta.write_text(texto, encoding="utf-8")
    return len(grupos)


def main() -> None:
    sys.path.insert(0, str(AQUI))
    from daily import LEADERBOARDS, bajar_ranking  # noqa: E402

    hoy: dict[int, tuple[str, str, float]] = {}
    for lb in LEADERBOARDS:
        filas = bajar_ranking(lb, 4)
        print(f"ranking {lb}: {len(filas)} filas", flush=True)
        for pid, elo, _u, alias, pais in filas:
            if pid not in hoy or elo > hoy[pid][2]:
                hoy[pid] = (alias, pais, elo)
    indice = actualizar(leer(), hoy, {})
    print(f"jugadores: {len(indice)}; archivos: {escribir(indice)}", flush=True)


if __name__ == "__main__":
    main()
