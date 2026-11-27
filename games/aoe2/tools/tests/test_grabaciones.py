"""Lo que el colector saca de las grabaciones (`grabaciones.py`): unidades por línea, APM, edades y marcas."""
import gzip
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import daily as d  # noqa: E402
import grabaciones as g  # noqa: E402
import replay  # noqa: E402
import vistas as v  # noqa: E402

FIX = Path(__file__).resolve().parent / "fixtures"
LINEA = g.lineas()


def test_lineas_agrupan_las_mejoras():
    assert LINEA[24] == LINEA[492] == 4  # ballestero y arbalestero son la línea del arquero
    assert LINEA[83] == 83


def test_por_jugador_de_una_grabacion_real():
    lec = replay.leer(gzip.open(FIX / "521948686.body.gz").read())
    datos = g.por_jugador(lec, LINEA)
    assert set(datos) == {1, 2}
    uno = datos[1]
    assert uno["units"][83] > 15  # aldeanos
    assert uno["units"][4] == 5 and uno["units"][7] == 15  # arqueros y 15 hostigadores (revisado en la grabación)
    assert uno["apm"] and 20 < uno["apm"] < 400
    assert uno["ages"][0] and 300 < uno["ages"][0] < 900


def test_marcas_ignoran_clics_imposibles():
    m = g.marcas({"apm": None, "ages": [120, None, 600], "units": {83: 30, 4: 25, 7: 3}, "fin": 3000})
    assert m == {}


def test_marcas_piden_haber_llegado_a_la_edad():
    sin_castillos = g.marcas({"apm": 50, "ages": [420, None, None], "units": {}, "fin": 3000})
    assert "feudal" not in sin_castillos and sin_castillos["apm"] == (50, None)
    assert g.marcas({"apm": None, "ages": [420, 900, None], "units": {}, "fin": 3000})["feudal"] == (420, None)
    # Imperial a 21:00 en una partida que terminó a 22:00: no llegó a investigarla.
    assert "imperial" not in g.marcas({"apm": None, "ages": [420, 900, 1260], "units": {}, "fin": 1320})
    assert g.marcas({"apm": None, "ages": [420, 900, 1260], "units": {}, "fin": 1800})["imperial"] == (1260, None)


def test_sumar_top_deja_las_mejores_y_no_repite():
    top = []
    for f in ([500, 1, 10, "a", None], [400, 2, 11, "b", None], [450, 1, 10, "a", None], [600, 3, 12, "c", None]):
        top = g.sumar_top(top, f, "feudal", tope=2)
    assert [f[0] for f in top] == [400, 500]
    assert [f[0] for f in g.sumar_top([[100, 1, 1, "a", None]], [200, 2, 2, "b", None], "apm")] == [200, 100]


def test_acumulador_suma_lo_de_la_grabacion_por_dia():
    acc = d.Acumulador({0: "armenians", 1: "aztecs"})
    lec = replay.leer(gzip.open(FIX / "521948686.body.gz").read())
    muestra = {"id": 521948686, "fecha": "2026-11-20", "band": "1800+", "jugador": 9, "js": [(1, "britons", True, 9), (2, "franks", False, 8)]}
    acc.grabacion(muestra, lec, LINEA)
    dia = acc.dias["2026-11-20"]
    assert dia["rec"] == {"1800+|britons": [1, 1], "1800+|franks": [1, 0]}
    assert dia["units"]["1800+|britons|7"] == [1, 1]
    assert "1800+|britons|4" not in dia["units"]  # 5 arqueros no es masa
    assert dia["open"]["1800+|britons|archers"] == [1, 1]
    assert dia["age"]["1800+|0"][0] == 2
    assert dia["top"]["feudal"][0][1] == 521948686


def test_sumar_dia_junta_lo_de_las_grabaciones():
    a = {**d._dia_vacio("x"), "units": {"k": [1, 1]}, "top": {"apm": [[100, 1, 1, "a", None]]}}
    b = {**d._dia_vacio("x"), "units": {"k": [2, 0]}, "top": {"apm": [[150, 2, 2, "b", None]]}}
    s = v.sumar_dia(a, b)
    assert s["units"] == {"k": [3, 1]}
    assert [f[0] for f in s["top"]["apm"]] == [150, 100]


def test_con_alias_pone_el_nombre_en_las_marcas():
    s = {"windows": {"7": {"top": {"apm": [[200, 1, 9, "franks", None]]}}, "14": {}}}
    d.con_alias(s, {9: "wR.Nicov"})
    assert s["windows"]["7"]["top"]["apm"][0][5] == "wR.Nicov"
    d.con_alias(s, {9: "otro"})  # ya lo tiene: no se duplica
    assert len(s["windows"]["7"]["top"]["apm"][0]) == 6


def test_datos_curiosos_de_la_portada():
    w = {
        "rec": {"1800+|britons": [40, 20], "<1000|franks": [40, 20]},
        "units": {"1800+|britons|4": [30, 18], "<1000|franks|38": [10, 4]},
        "apm": {"1800+": [40, 6000], "<1000": [10, 300]},
        "age": {"1800+|0": [40, 40 * 420]},
        "top": {"apm": [[120, 5, 9, "britons", None, "wR.Nicov"]], "feudal": [[400, 6, 8, "franks", None, "x"]]},
    }
    f = d.datos_curiosos(w)
    assert f["players"] == 80
    assert f["apm"] == [["1800+", 150]]  # la banda con 10 jugadores no alcanza
    assert f["feudal"] == [["1800+", 420]]
    assert f["mostMassed"]["unit"]["id"] == 4 and f["mostMassed"]["share"] == 0.375
    assert f["top"]["apm"]["alias"] == "wR.Nicov" and f["top"]["feudal"]["value"] == 400
    assert d.datos_curiosos({}) is None
