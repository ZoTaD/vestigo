import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import encyclopedia as e  # noqa: E402


def test_valor_de_ataque_y_armadura_con_clase():
    # El juego guarda clase × 256 + valor; el valor puede ser negativo.
    assert e.clase_valor(21 * 256 + 1) == (21, 1)
    assert e.clase_valor(3 * 256 - 1) == (3, -1)
    assert e.clase_valor(4 * 256 + 2) == (4, 2)


def test_texto_de_ayuda_sin_etiquetas_ni_marcas():
    t = r"Create <b>Knight<b> (<cost>)\nHeavy cavalry. Strong vs. Archers.\n<GREY><i>Upgrades: attack (Blacksmith).<i><DEFAULT>\n<hp> <attack> <armor>"
    assert e.limpiar_ayuda(t) == ["Heavy cavalry. Strong vs. Archers.", "Upgrades: attack (Blacksmith)."]


def test_descripcion_de_civ_en_partes():
    t = r"Cavalry civilization\n\n• Foragers work +15% faster\n• Mill technologies free\n\n<b>Unique Unit:<b> \nThrowing Axeman (Infantry)\n\n<b>Unique Techs:<b> \n• Chivalry (Stables work +40% faster)\n\n<b>Team Bonus:<b> \nKnight-line +2 line of sight"
    p = e.partes_civ(t)
    assert p["kind"] == "Cavalry civilization"
    assert p["bonuses"] == ["Foragers work +15% faster", "Mill technologies free"]
    assert p["team"] == "Knight-line +2 line of sight"


def test_danio_del_juego():
    # Suma de (ataque − armadura) por clase que tienen los dos, mínimo 1.
    caballero = {4: 10, 15: 0}
    arquero = {4: 0, 3: 0, 15: 0}
    assert e.danio(caballero, arquero) == 10
    lancero = {4: 3, 8: 15, 30: 12}
    assert e.danio(lancero, {4: 2, 3: 2, 8: 0}) == 1 + 15
    assert e.danio({4: 1}, {4: 5}) == 1


def test_counter_a_igual_recurso():
    lancero = {"hp": 45, "attacks": {4: 3, 8: 15}, "armors": {4: 0, 3: 0, 1: 0, 27: 0}, "reload": 3.0, "accuracy": 100, "cost": 60}
    caballero = {"hp": 100, "attacks": {4: 10}, "armors": {4: 2, 3: 2, 8: 0}, "reload": 1.8, "accuracy": 100, "cost": 135}
    assert e.puntaje(lancero, caballero) > 1.5
    assert e.puntaje(caballero, lancero) < 1 / 1.5


def test_linea_de_mejora():
    nodos = [
        {"Node ID": 38, "Node Type": "Unit", "Link ID": -1, "Link Node Type": "BuildingTech", "Use Type": "Unit"},
        {"Node ID": 283, "Node Type": "UnitUpgrade", "Link ID": 38, "Link Node Type": "Unit", "Use Type": "Unit"},
        {"Node ID": 569, "Node Type": "UnitUpgrade", "Link ID": 283, "Link Node Type": "UnitUpgrade", "Use Type": "Unit"},
    ]
    assert e.lineas(nodos) == {38: [38, 283, 569], 283: [38, 283, 569], 569: [38, 283, 569]}


def test_el_alcance_da_disparos_gratis_mientras_el_otro_se_acerca():
    base = {"hp": 40, "attacks": {4: 5}, "armors": {4: 0}, "reload": 2.0, "accuracy": 100, "cost": 60, "range": 0, "speed": 1.0}
    lejos = {**base, "range": 5}
    assert e.puntaje(lejos, base) > e.puntaje({**lejos, "range": 0}, base)
    assert e.puntaje(lejos, base) * e.puntaje(base, lejos) == __import__("pytest").approx(1)


def test_diferencias_entre_dos_fotos_de_parche():
    vieja = {
        "u": {"38": {"hp": 100, "attacks": [[4, 10]], "armors": [[3, 2], [4, 2]], "cost": {"food": 60, "gold": 75}, "time": 30, "reload": 1.8, "range": 0, "speed": 1.35}},
        "t": {"67": {"cost": {"food": 150}, "time": 50}},
        "c": {"franks": {"en": ["Foragers work +15% faster", "Castles cost -15%"], "es": ["Recolectores +15%", "Castillos -15%"]}},
    }
    nueva = {
        "u": {"38": {**vieja["u"]["38"], "hp": 110, "attacks": [[4, 10], [15, 2]], "armors": [[3, 1], [4, 2]]}, "93": {"hp": 45}},
        "t": {"67": {"cost": {"food": 100}, "time": 50}},
        "c": {"franks": {"en": ["Foragers work +15% faster", "Castles cost -25%"], "es": ["Recolectores +15%", "Castillos -25%"]}},
    }
    d = e.diferencias(vieja, nueva)
    # Ataque y armadura por clase: una clase nueva no corre las demás.
    assert d["units"] == [[38, "hp", 100, 110], [38, "attacks.15", None, 2], [38, "armors.3", 2, 1]]
    assert d["new"] == [93]
    assert d["techs"] == [[67, "cost", {"food": 150}, {"food": 100}]]
    assert d["civs"] == {"franks": {"added": [{"en": "Castles cost -25%", "es": "Castillos -25%"}], "removed": [{"en": "Castles cost -15%", "es": "Castillos -15%"}]}}
