"""Los logros de Steam (`achievements.py`): la lista embebida en la página y el armado en/es de CoH2."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import achievements as ach  # noqa: E402


def _pagina(app: int, lang: str, logros: list[dict]) -> str:
    data = {"queries": [
        {"queryKey": ["achievements", app, "schema_v2"], "state": {"data": {"appid": app, "language": lang, "groups": [{"achievements": logros}]}}},
        {"queryKey": ["achievements", app, "globalpercentages"], "state": {"data": {"percentages": {"7": 12.5}}}},
    ]}
    return '<script>window.x = {"queryData":' + json.dumps(json.dumps(data)) + ',"otra":1}</script>'


def _logro(nombre, desc, icono="a" * 40 + ".jpg", api="win_1", key=7, archivado=False):
    return {"internal_key": key, "api_name": api, "name": nombre, "description": desc, "icon_achieved": icono, "hidden": False, "archived": archivado}


def test_lista_de_la_pagina():
    html = _pagina(231430, "english", [_logro("Victory", "Win a game"), _logro("Old", "x", api="old", archivado=True)])
    lista = ach.logros_steam(html, 231430)
    assert [a["api_name"] for a in lista] == ["win_1"]
    assert ach.porcentajes_pagina(html, 231430) == {7: 12.5}


def test_combinar_ingles_y_espanol():
    en = [_logro("Victory", "Win a game")]
    es = [_logro("Victoria", "Ganá una partida")]
    out = ach.combinar(en, es, {"win_1": 42.0})
    assert out == [{"slug": "win_1", "name": {"en": "Victory", "es": "Victoria"}, "desc": {"en": "Win a game", "es": "Ganá una partida"},
                    "icon": "a" * 40, "hidden": False, "pct": 42.0}]


def test_sin_espanol_ni_icono():
    out = ach.combinar([_logro("Victory", "Win", icono="raro.png")], [], {})
    assert out[0]["name"]["es"] == "Victory" and out[0]["icon"] is None and out[0]["pct"] is None
