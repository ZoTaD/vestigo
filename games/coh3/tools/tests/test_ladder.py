"""El resumen de una foto del ranking (`ladder.py`): ligas, ELO, activos y países."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import ladder  # noqa: E402

DIA = 86400
NOW = 100 * DIA


def _e(lv, elo, ultima, pais="ar", w=3, l=2):
    return {"ranklevel": lv, "rating": elo, "lastmatchdate": ultima, "wins": w, "losses": l,
            "members": [{"profile_id": elo, "country": pais}]}


def test_ligas_elo_activos_y_paises():
    s = ladder.summarize([_e(4, 900, NOW - DIA), _e(20, 2600, NOW - 10 * DIA, "kr"), _e(0, 100, NOW - 40 * DIA, "")], NOW)
    assert s["n"] == 3 and s["games"] == 15
    assert s["lv"][4] == 1 and s["lv"][20] == 1 and s["lv"][0] == 1
    # 900 cae en el tramo (900-400)/50 = 10; los de afuera van a los extremos.
    assert s["elo"][10] == 1 and s["elo"][-1] == 1 and s["elo"][0] == 1
    assert s["active7"] == 1 and s["active28"] == 2
    assert dict(s["countries"]) == {"ar": 1, "kr": 1, "?": 1}


def test_ranklevel_fuera_de_rango_no_rompe():
    s = ladder.summarize([_e(99, 1500, NOW), _e(None, 1500, NOW)], NOW)
    assert s["lv"][20] == 1 and s["lv"][0] == 1
