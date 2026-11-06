"""El armador de la enciclopedia de CoH1 (`site_data.py`): las funciones propias de CoH1."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import site_data as sd  # noqa: E402

GARAND = {"weapon_bag": {
    "name": "M1 Garand Rifle", "ui_name": "0",
    "accuracy": {"short": 0.5, "medium": 0.4, "long": 0.3, "distant": 0.3},
    "penetration": {"short": 1.0, "medium": 1.0, "long": 1.0, "distant": 1.0},
    "damage": {"min": 10.0, "max": 10.0},
    "range": {"min": 0.0, "max": 35.0, "distance": {"short": 10.0, "medium": 20.0, "long": 30.0, "distant": 35.0}},
    "cooldown": {"duration": {"min": 1.0, "max": 1.5}},
    "reload": {"duration": {"min": 2.0, "max": 2.5}, "frequency": {"min": 8.0, "max": 8.0}},
    "target_table": {
        "tp_infantry": {"accuracy_multiplier": 1.0, "damage_multiplier": 1.0, "penetration_multiplier": 1.0, "rear_penetration_multiplier": 1.0},
        "tp_armour_allies_sherman": {"accuracy_multiplier": 1.0, "damage_multiplier": 1.0, "penetration_multiplier": 0.05, "rear_penetration_multiplier": 0.1},
        "$REF": "tables\\target_table.lua",
    },
}}


def test_es_multijugador():
    assert sd.es_multijugador("sbps/races/allies/soldiers/rifleman_squad")
    assert not sd.es_multijugador("sbps/races/allies/soldiers/rifleman_squad_sp_m01")
    assert not sd.es_multijugador("sbps/races/allies/soldiers/battle_sim_rifleman_squad_bar")
    assert not sd.es_multijugador("ebps/races/allies/buildings/hq_test_for_ronel")
    assert not sd.es_multijugador("ebps/races/allies/buildings/hq_sp_m06")
    assert not sd.es_multijugador("sbps/races/allies/soldiers/rifleman_squad_sp_tutorial")


def test_faccion():
    assert sd.FACCION["allies"] == "american" and sd.FACCION["axis_panzer_elite"] == "panzer_elite"
    assert sd.raza_de("sbps/races/allies_commonwealth/soldiers/sappers") == "allies_commonwealth"


def test_tabla_blancos():
    t = sd.tabla_blancos(GARAND["weapon_bag"])
    assert t["tp_infantry"] == [1, 1, 1, 1]
    assert t["tp_armour_allies_sherman"] == [1, 1, 0.05, 0.1]
    assert "$REF" not in t


def test_arma_coh1():
    w = sd.arma("m1_garand_rifle", GARAND, {}, {})
    assert w["acc"] == [0.5, 0.4, 0.3] and w["dist"] == [10, 20, 30] and w["pen"] == [1, 1, 1]
    assert w["dmg"] == [10, 10] and w["range"] == [0, 35]
    assert w["name"]["en"] == "M1 Garand Rifle"


def test_variantes_de_refuerzo_afuera():
    assert not sd.es_multijugador("sbps/races/allies/soldiers/heavy_machine_gun_section_reinforcement")
    assert sd.es_multijugador("sbps/races/allies/soldiers/heavy_machine_gun_section")


def test_solo_lo_que_genera():
    hab = {"ability_bag": {"action_list": {
        "a1": {"$REF": r"action\ability_action\reinforcements_action.lua", "squad_table": {"squad_01": r"sbps\races\allies\vehicles\m4_sherman_squad.lua"}},
        "a2": {"$REF": r"action\ability_action\filter_action.lua", "squad_table": {"squad_01": r"sbps\races\allies\soldiers\rifleman_squad.lua"}},
        "a3": {"$REF": r"action\ability_action\paradrop_action.lua", "squad_to_spawn": r"sbps\races\allies\soldiers\airborne_infantry.lua"},
    }}}
    assert sd.generadas(hab) == {"sbps/races/allies/vehicles/m4_sherman_squad", "sbps/races/allies/soldiers/airborne_infantry"}


def test_voss_afuera():
    assert not sd.es_multijugador("sbps/races/axis/vehicles/tiger_voss_squad")


def _ucs(p, txt):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(("﻿" + txt).encode("utf-16-le"))


def test_textos_guarda_y_recupera(tmp_path):
    base, cache = tmp_path / "juego", tmp_path / "raw"
    _ucs(base / "CoH/Engine/Locale/Spanish/RelicCOH.Spanish.ucs", "1\tHola\n")
    en, es, ok = sd.textos(base, cache)
    assert es == {1: "Hola"} and en == es and not ok
    # Steam cambia de idioma: el español desaparece de la instalación y queda la copia.
    (base / "CoH/Engine/Locale/Spanish/RelicCOH.Spanish.ucs").unlink()
    _ucs(base / "CoH/Engine/Locale/English/RelicCOH.English.ucs", "1\tHello\n")
    en, es, ok = sd.textos(base, cache)
    assert en == {1: "Hello"} and es == {1: "Hola"} and ok


def test_ruta_rango():
    assert sd.ruta_rango("american", 1) == "art/ui/textures/ranks_allies/us_01.rgt"
    assert sd.ruta_rango("british", 20) == "art/ui/textures/ranks_allies/brit_20.rgt"
    assert sd.ruta_rango("wehrmacht", 7) == "art/ui/textures/ranks_axis/heer_07.rgt"
    assert sd.ruta_rango("panzer_elite", 12) == "art/ui/textures/ranks_axis/panzer_12.rgt"
