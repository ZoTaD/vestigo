"""
Las aperturas de AoE2 (2026-11-20): de las acciones de la grabación (`replay.py`) a una etiqueta por jugador. Las mismas
reglas están en `site/src/aoe2/api/openings.ts`. Tiempos en segundos de juego.

- **drush**: 2 o más milicias encoladas antes de pedir la Edad Feudal (y **drush_fc** si después va directo a Castillo).
- **fc**: pide Castillo sin sacar ejército en Feudal (y **boom** si después levanta 2 o más centros urbanos rápido).
- **tower**: 2 o más torres de vigilancia en los primeros 5 minutos de Feudal.
- **scouts** / **archers** / **maa**: la primera unidad militar de la Feudal (exploradores o águilas, arqueros, milicias
  con la mejora a Hombre de armas). Hostigadores y piqueros no definen: son respuesta.
- **other**: lo que no encaja (o la partida no llegó a Feudal).
"""
from replay import Accion  # noqa: F401  (los tests lo usan desde acá)

FEUDAL, CASTLE = 101, 102
MAA_UPGRADE = 222
MILITIA, SCOUT, EAGLE, ARCHER = 74, 448, 751, 4
TOWER, TOWN_CENTER = 79, 109
#: Militares que no definen la apertura (respuesta): hostigador, piquero.
RESPUESTA = {7, 93}
MILITARES = {MILITIA, SCOUT, EAGLE, ARCHER, 5, 24, 39, 93, 7}


def classify(acciones: list, jugador: int) -> str:
    mias = sorted((a for a in acciones if a.player == jugador), key=lambda a: a.t)
    feudal = next((a.t for a in mias if a.kind == "research" and a.id == FEUDAL), None)
    if feudal is None:
        return "other"
    castillo = next((a.t for a in mias if a.kind == "research" and a.id == CASTLE), None)
    drush = sum(1 for a in mias if a.kind == "queue" and a.id == MILITIA and a.t < feudal) >= 2
    fin_feudal = castillo if castillo is not None else feudal + 600
    ejercito = [a for a in mias if a.kind == "queue" and a.id in MILITARES and a.id not in RESPUESTA and feudal <= a.t < fin_feudal]
    if drush:
        return "drush_fc" if castillo is not None and not ejercito else "drush"
    torres = [a for a in mias if a.kind == "build" and a.id == TOWER and feudal <= a.t < feudal + 300]
    if len(torres) >= 2:
        return "tower"
    if castillo is not None and not ejercito:
        centros = [a for a in mias if a.kind == "build" and a.id == TOWN_CENTER and castillo <= a.t < castillo + 400]
        return "boom" if len(centros) >= 2 else "fc"
    if not ejercito:
        return "other"
    primero = ejercito[0].id
    if primero in (SCOUT, EAGLE):
        return "scouts"
    if primero == ARCHER:
        return "archers"
    if primero == MILITIA:
        mejora = any(a.kind == "research" and a.id == MAA_UPGRADE and a.t < fin_feudal for a in mias)
        return "maa" if mejora else "other"
    return "other"


def openings(acciones: list) -> dict[int, str]:
    """La apertura de cada jugador que aparece en las acciones."""
    return {j: classify(acciones, j) for j in sorted({a.player for a in acciones if a.player > 0})}
