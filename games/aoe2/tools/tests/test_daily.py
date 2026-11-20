"""El colector diario de AoE2 (`daily.py`), sin red: la API se reemplaza por respuestas armadas con la forma real."""
import json
import re
import sys
from datetime import date, datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import daily as d  # noqa: E402

RAIZ = Path(__file__).resolve().parents[4]
DIA = 86400
HOY = date(2026, 11, 20)
AYER_MEDIODIA = int(datetime(2026, 11, 19, 12, tzinfo=timezone.utc).timestamp())
CIVS = {2: "franks", 12: "mongols", 4: "teutons"}


def miembro(pid, civ, team, outcome, old=1500, new=1510):
    return {"profile_id": pid, "civilization_id": civ, "teamid": team, "outcome": outcome, "oldrating": old, "newrating": new}


def partida(mid, mt, mapa, miembros, start=AYER_MEDIODIA, dur=1800):
    return {"id": mid, "matchtype_id": mt, "mapname": mapa, "startgametime": start, "completiontime": start + dur, "matchhistorymember": miembros}


def test_band():
    assert d.band(999) == "<1000"
    assert d.band(1000) == "1000-1400"
    assert d.band(1799) == "1400-1800"
    assert d.band(1800) == "1800+"


def test_tipos_de_partida_iguales_a_los_del_sitio():
    """La tabla de `matchtype_id` es la misma que `modeOfMatchType` en `site/src/aoe2/api/wel.ts`."""
    esperado = {6: "rm1v1", 7: "rmteam", 9: "rmteam", 26: "ew1v1", 27: "ewteam", 29: "ewteam", 2: "dm1v1", 4: "dmteam", 66: "co", 0: "custom", 18: "other", 122: "other"}
    assert {t: d.mode_of(t) for t in esperado} == esperado
    ts = (RAIZ / "site" / "src" / "aoe2" / "api" / "wel.ts").read_text(encoding="utf-8")
    assert 'if (t === 6) return "rm1v1"' in ts and 'if (t >= 27 && t <= 29) return "ewteam"' in ts and 'if (t >= 66 && t <= 69) return "co"' in ts


def test_map_slug_igual_al_del_sitio():
    assert d.map_slug("Arabian Desert.rms") == "arabian-desert"
    assert d.map_slug("hideout.rms2") == "hideout"


def test_una_partida_cuenta_una_vez_aunque_aparezca_en_dos_historiales():
    acc = d.Acumulador(CIVS)
    p = partida(1, 6, "Arabia.rms", [miembro(10, 2, 0, 1), miembro(11, 12, 1, 0)])
    acc.agregar(p)
    acc.agregar(p)
    dia = acc.dias["2026-11-19"]
    assert dia["civ"]["rm1v1|1400-1800|franks"] == [1, 1]
    assert dia["civ"]["rm1v1|1400-1800|mongols"] == [1, 0]
    assert dia["games"] == 1


def test_resultado_raro_no_suma_victoria_y_civ_desconocida_queda_como_civ_id():
    acc = d.Acumulador(CIVS)
    acc.agregar(partida(2, 6, "Arabia.rms", [miembro(10, 63, 0, 4), miembro(11, 2, 1, 4)]))
    assert acc.dias == {}  # sin resultado: la partida no cuenta
    acc.agregar(partida(3, 6, "Arabia.rms", [miembro(10, 63, 0, 1), miembro(11, 2, 1, 0)]))
    assert acc.dias["2026-11-19"]["civ"]["rm1v1|1400-1800|civ_63"] == [1, 1]


def test_matchups_en_un_solo_orden_y_solo_rm_1v1():
    acc = d.Acumulador(CIVS)
    acc.agregar(partida(4, 6, "Arabia.rms", [miembro(10, 12, 0, 1), miembro(11, 2, 1, 0)]))
    acc.agregar(partida(5, 26, "Arabia.rms", [miembro(10, 12, 0, 1), miembro(11, 2, 1, 0)]))
    vs = acc.dias["2026-11-19"]["vs"]
    # franks < mongols: el par se guarda como franks|mongols con las victorias de franks.
    assert vs == {"1400-1800|franks|mongols": [1, 0]}


def test_mapa_duracion_y_parche():
    acc = d.Acumulador(CIVS)
    acc.agregar(partida(6, 7, "Arena.rms", [miembro(1, 2, 0, 1), miembro(2, 4, 0, 1), miembro(3, 12, 1, 0), miembro(4, 12, 1, 0)], dur=1200))
    dia = acc.dias["2026-11-19"]
    assert dia["map"]["rmteam|arena|franks"] == [1, 1]
    assert dia["map"]["rmteam|arena|mongols"] == [2, 0]
    assert dia["dur"]["rmteam|franks"] == [1, 1200]
    assert dia["patch"] == "188329"


def test_parche_por_fecha():
    assert d.patch_of(int(datetime(2026, 10, 27, 18, tzinfo=timezone.utc).timestamp())) == "188329"
    assert d.patch_of(int(datetime(2026, 10, 27, 12, tzinfo=timezone.utc).timestamp())) == "185872"
    assert d.patch_of(0) is None


def test_personalizadas_y_ia_afuera():
    acc = d.Acumulador(CIVS)
    acc.agregar(partida(7, 0, "Arabia.rms", [miembro(10, 2, 0, 1), miembro(11, 12, 1, 0)]))
    acc.agregar(partida(8, 6, "Arabia.rms", [miembro(10, 2, 0, 1), miembro(-1, 12, 1, 0)]))
    assert acc.dias == {}


def test_solo_dias_completos():
    acc = d.Acumulador(CIVS)
    hoy_temprano = int(datetime(2026, 11, 20, 1, tzinfo=timezone.utc).timestamp())
    acc.agregar(partida(9, 6, "Arabia.rms", [miembro(10, 2, 0, 1), miembro(11, 12, 1, 0)], start=hoy_temprano))
    assert list(acc.completos(HOY)) == []


def test_pick_players_reparte_entre_bandas():
    ladder = [(i, 2500 - i) for i in range(2000)]  # ELO 2500 … 501
    elegidos = d.pick_players(ladder, 400)
    bandas = {d.band(e) for _, e in elegidos}
    assert bandas == {"<1000", "1000-1400", "1400-1800", "1800+"}
    assert len(elegidos) == 400


def test_resumen_suma_la_ventana_y_marca_la_tendencia():
    dia = lambda c, f: {"date": f, "games": 1, "patch": "188329", "civ": {"rm1v1|1400-1800|franks": c}, "map": {}, "vs": {}, "dur": {}}
    dias = {"2026-11-19": dia([10, 6], "2026-11-19"), "2026-11-12": dia([10, 4], "2026-11-12"), "2026-10-27": dia([5, 5], "2026-10-27")}
    s = d.resumen(dias, HOY, ventanas=(7,))
    assert s["windows"]["7"]["civ"]["rm1v1|1400-1800|franks"] == [10, 6]
    assert s["prev"]["7"]["civ"]["rm1v1|1400-1800|franks"] == [10, 4]
    # El parche: desde el día siguiente al del parche (el 27/10 queda afuera: la mitad fue con el anterior).
    assert s["patch"] == {"name": "188329", "since": "2026-10-28"}
    assert s["windows"]["patch"]["civ"]["rm1v1|1400-1800|franks"] == [20, 10]


def test_ladder_snapshot_con_histograma_y_top():
    filas = [(i, 3000 - i * 10) for i in range(300)]
    snap = d.ladder_snapshot(filas, HOY, top=50)
    assert len(snap["top"]) == 50 and snap["top"][0] == [0, 3000]
    assert sum(b["count"] for b in snap["hist"]) == 300
    assert snap["date"] == "2026-11-20"


def test_ladder_snapshot_guarda_el_alias_y_la_foto_de_ayer():
    ayer = {"date": "2026-11-19", "top": [[1, 2900, "a"]]}
    snap = d.ladder_snapshot([(1, 2950, "a"), (2, 2800, "b")], HOY, top=10, prev=ayer)
    assert snap["top"][0] == [1, 2950, "a"]
    assert snap["prev"] == {"date": "2026-11-19", "top": [[1, 2900, "a"]]}


def _slot(pares):
    import base64, zlib
    txt = f"{len(pares)}," + json.dumps([{"profileInfo.id": p, "stationID": s} for p, s in pares])
    return base64.b64encode(zlib.compress(txt.encode())).decode()


def test_lugares_desde_slotinfo():
    assert d.slots_of(_slot([(10, 1), (11, 2)])) == {10: 1, 11: 2}
    assert d.slots_of("roto") == {}


def test_aperturas_por_civ_y_banda():
    acc = d.Acumulador(CIVS)
    p = partida(20, 6, "Arabia.rms", [miembro(10, 2, 0, 1), miembro(11, 12, 1, 0)])
    p["slotinfo"] = _slot([(10, 1), (11, 2)])
    acc.agregar(p)
    assert [m["id"] for m in acc.muestras] == [20]
    acc.aperturas(acc.muestras[0], {1: "scouts", 2: "drush"})
    dia = acc.dias["2026-11-19"]
    assert dia["open"] == {"1400-1800|franks|scouts": [1, 1], "1400-1800|mongols|drush": [1, 0]}


def test_solo_rm_1v1_entra_en_la_muestra_de_grabaciones():
    acc = d.Acumulador(CIVS)
    acc.agregar(partida(21, 7, "Arena.rms", [miembro(1, 2, 0, 1), miembro(2, 4, 0, 1), miembro(3, 12, 1, 0), miembro(4, 12, 1, 0)]))
    assert acc.muestras == []


def test_home_json_resume_lo_que_muestra_la_portada():
    foto = {"date": "2026-11-20", "top": [[1, 3000, "a"], [2, 2990, "b"], [3, 2950, "c"]], "prev": {"date": "2026-11-19", "top": [[1, 2990, "a"], [3, 2900, "c"]]}}
    w = {"civ": {"rm1v1|1800+|franks": [300, 180], "rm1v1|1800+|mongols": [300, 150], "rm1v1|1800+|goths": [50, 40]}, "map": {"rm1v1|arabia|franks": [100, 50], "rm1v1|arena|franks": [40, 20]}}
    h = d.home_json(foto, {"windows": {"14": w}, "patch": {"name": "188329", "since": "2026-10-28"}}, top=2)
    assert h["top"] == [[1, 3000, "a"], [2, 2990, "b"]]
    assert h["climbers"] == [[3, 2950, "c", 50], [1, 3000, "a", 10]]
    # La mejor civ de cada banda, sólo con 200 partidas o más (los godos tienen 50).
    assert h["best"] == {"1800+": ["franks", 0.6, 300]}
    assert h["maps"] == [["arabia", 50], ["arena", 20]]
    assert h["patch"] == {"name": "188329", "since": "2026-10-28"}
