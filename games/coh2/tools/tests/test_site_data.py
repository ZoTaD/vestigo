"""El armador de la enciclopedia de CoH2 (`site_data.py`): las funciones puras, con atributos armados a mano."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import site_data as sd  # noqa: E402

MOSIN = {"weapon_bag": {
    "name": "Mosin Nagant Guards", "ui_name": "0", "icon_name": "",
    "accuracy": {"near": 0.748, "mid": 0.667, "far": 0.529},
    "range": {"min": 0.0, "max": 35.0, "distance": {"near": 4.0, "mid": 20.0, "far": 35.0}},
    "damage": {"min": 16.0, "max": 16.0},
    "penetration": {"near": 1.0, "mid": 1.0, "far": 1.0},
    "cooldown": {"duration": {"min": 1.25, "max": 1.75}},
    "reload": {"duration": {"min": 2.4, "max": 3.4}, "frequency": {"min": 8.0, "max": 9.0}},
    "aim": {"fire_aim_time": {"min": 1.0, "max": 1.75}, "ready_aim_time": {"min": 1.0, "max": 1.75}},
    "burst": {"can_burst": False},
    "moving": {"accuracy_multiplier": 0.75},
    "area_effect": {"area_info": {"outer_radius": 0.0}},
}}


def test_es_multijugador():
    assert sd.es_multijugador("sbps/races/soviet/soldiers/conscript_squad/conscript_squad_mp")
    assert not sd.es_multijugador("sbps/races/soviet/campaign/m01/m01_conscript_squad_mp")
    assert not sd.es_multijugador("sbps/races/german/sp/x_mp")
    assert not sd.es_multijugador("sbps/races/aef/test/x_mp")
    assert not sd.es_multijugador("sbps/races/soviet/soldiers/conscript_squad/conscript_squad")  # sin _mp
    assert not sd.es_multijugador("sbps/races/soviet/soldiers/x/tow_x_mp")


def test_texto():
    en, es = {11006679: "Conscripts", 7: "Solo en inglés"}, {11006679: "Reclutas"}
    assert sd.texto("11006679", en, es) == {"en": "Conscripts", "es": "Reclutas"}
    assert sd.texto("$11006679", en, es) == {"en": "Conscripts", "es": "Reclutas"}
    assert sd.texto("7", en, es) == {"en": "Solo en inglés", "es": "Solo en inglés"}
    assert sd.texto("99", en, es) is None
    assert sd.texto("0", en, es) is None and sd.texto("", en, es) is None


def test_stats_escuadra():
    soldado = {"hp": 80.0, "armor": [1.0, 1.0, 1.0], "ts": 1.0, "cost": {"mp": 40.0, "mu": 0.0, "fu": 0.0, "t": 4.0},
               "pop": 1.0, "speed": 3.0, "sight": 35.0}
    s = sd.stats_escuadra([("conscript_soldier_mp", 6)], {"conscript_soldier_mp": soldado})
    assert s["models"] == 6 and s["hp"] == 80 and s["armor"] == [1, 1, 1]
    assert s["cost"] == {"mp": 240, "mu": 0, "fu": 0, "pop": 6, "t": 24}
    assert s["speed"] == 3 and s["sight"] == 35 and s["targetSize"] == 1


def test_fila_arma():
    w = sd.arma("guards_troops_mosin_nagant_rifle_mp", MOSIN, {}, {})
    assert w["acc"] == [0.748, 0.667, 0.529]
    assert w["dist"] == [4, 20, 35]
    assert w["dmg"] == [16, 16]
    assert w["pen"] == [1, 1, 1]
    assert w["range"] == [0, 35]
    assert w["cooldown"] == [1.25, 1.75] and w["reloadEvery"] == [8, 9]
    assert w["aoe"] is None and w["burst"] is None and w["moving"] == 0.75


def test_blindaje():
    # Infantería sin daño trasero: el mismo blindaje de los tres lados; un vehículo, frente y atrás (CoH2 no tiene lado).
    assert sd.blindaje({"armor": 1.0, "rear_armor": 6.6, "rear_damage_enabled": False}) == [1, 1, 1]
    assert sd.blindaje({"armor": 160.0, "rear_armor": 80.0, "rear_damage_enabled": True}) == [160, 80, 80]


def test_avion_no_es_unidad():
    assert sd.es_avion({"aircraft", "vehicle"}) and not sd.es_avion({"infantry", "soldier"})


def test_nombre_de_codigo_prolijo():
    assert sd.nombre_codigo("M1937_45mm_AT") == "M1937 45mm AT"
    assert sd.nombre_codigo("psk 40") == "Psk 40"
    assert sd.nombre_codigo("") == ""


def test_solo_lo_que_convoca():
    hab = {"ability_bag": {
        "requirements": {"required_squad": {"squad_name": "conscript_squad_mp"}},
        "modifiers": {"squad_build_time_modifier": {"target_type_name": "shock_troops_mp"}},
        "action_list": {"start_target_actions": {
            "reinforcements_action": {"squad_table": {"squad": ["guards_troops_mp", "sbps/races/soviet/x/is-2_mp.lua"]}},
            "paradrop_action": {"squad_to_spawn": "partisan_squad_mp"},
            "air_strike_action": {"aircraft_squad_name": "il-2_sturmovik_squad_mp"},
        }},
    }}
    assert sd.convocadas(hab) == {"guards_troops_mp", "is-2_mp", "partisan_squad_mp"}
