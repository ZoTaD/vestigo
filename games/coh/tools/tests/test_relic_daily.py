"""El recolector diario de CoH1 y CoH2 (`relic_daily.py`), sin red: la API de Relic se reemplaza por respuestas armadas
con la misma forma que las reales."""
import json
import sys
from datetime import date, datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import relic_daily as rd  # noqa: E402

DIA = 86400
HOY = date(2026, 11, 6)
NOW = int(datetime(2026, 11, 6, 12, tzinfo=timezone.utc).timestamp())
AYER = NOW - DIA  # 2026-11-05 12:00 UTC


def _lb(rows):
    """Una página de getLeaderBoard2: rows = [(statgroup, profile, ranklevel, lastmatchdate)]."""
    return {
        "result": {"code": 0},
        "statGroups": [{"id": sg, "members": [{"profile_id": pid, "alias": f"p{pid}", "country": "ar"}]} for sg, pid, _, _ in rows],
        "leaderboardStats": [
            {"statgroup_id": sg, "rank": i + 1, "ranklevel": lv, "wins": 3, "losses": 2, "lastmatchdate": last}
            for i, (sg, _, lv, last) in enumerate(rows)
        ],
        "rankTotal": len(rows),
    }


def _match(mid, mt, jugadores, fin=AYER, mapa="crossroads"):
    """jugadores = [(profile, statgroup, race, team, gano, old, new)]."""
    return {
        "id": mid, "mapname": mapa, "matchtype_id": mt, "startgametime": fin - 1200, "completiontime": fin,
        "matchhistoryreportresults": [{"profile_id": p, "resulttype": int(w), "teamid": t, "race_id": r, "counters": "{}"} for p, _, r, t, w, _, _ in jugadores],
        "matchhistorymember": [
            {"profile_id": p, "statgroup_id": sg, "race_id": r, "teamid": t, "outcome": int(w), "oldrating": o, "newrating": n}
            for p, sg, r, t, w, o, n in jugadores
        ],
    }


class Relic:
    """Contesta según la URL; cuenta los historiales pedidos y puede fallar con un perfil."""

    def __init__(self, leaderboards: dict[int, list], historias: dict[int, list], falla: int | None = None):
        self.lbs, self.hist, self.falla = leaderboards, historias, falla
        self.pedidos: list[int] = []

    def __call__(self, url: str) -> dict:
        q = dict(p.split("=", 1) for p in url.split("?", 1)[1].split("&"))
        if "getLeaderBoard2" in url:
            rows = self.lbs.get(int(q["leaderboard_id"]), [])
            start = int(q["start"])
            return _lb(rows[start - 1 : start - 1 + int(q["count"])])
        pid = int(q["profile_id"])
        self.pedidos.append(pid)
        if pid == self.falla:
            raise OSError("relic caído")
        return {"result": {"code": 0}, "matchHistoryStats": self.hist.get(pid, []), "profiles": []}


def _correr(tmp_path, relic, game="coh2", **kw):
    return rd.run(game, relic, tmp_path, days=7, budget=kw.get("budget", 100), workers=1, now=NOW, sleep=lambda s: None)


def test_cubierto_no_se_pide(tmp_path):
    # Wehrmacht 1v1 de CoH2 = leaderboard 4. El ELO ya se conoce de una partida posterior a su última partida.
    (tmp_path / "elo").mkdir(parents=True)
    (tmp_path / "elo" / "4.json").write_text(json.dumps({"10": [1500, AYER + 60]}))
    relic = Relic({4: [(10, 100, 12, AYER)]}, {})
    _correr(tmp_path, relic)
    assert relic.pedidos == []


def test_partida_suma_elo_de_todos(tmp_path):
    # 2v2 (matchtype 2): Ostheer + OKW contra soviéticos + EE. UU. El historial de uno da el ELO de los cuatro.
    m = _match(1, 2, [(100, 10, 0, 0, True, 1500, 1516), (101, 11, 2, 0, True, 1400, 1415),
                      (102, 12, 1, 1, False, 1450, 1434), (103, 13, 3, 1, False, 1300, 1290)])
    relic = Relic({8: [(10, 100, 9, AYER)], 10: [(11, 101, 9, AYER)], 9: [(12, 102, 9, AYER)], 11: [(13, 103, 9, AYER)]}, {100: [m]})
    _correr(tmp_path, relic)
    assert relic.pedidos == [100]
    elo = {lb: json.loads((tmp_path / "elo" / f"{lb}.json").read_text()) for lb in (8, 9, 10, 11)}
    assert elo[8]["10"][0] == 1516 and elo[10]["11"][0] == 1415 and elo[9]["12"][0] == 1434 and elo[11]["13"][0] == 1290
    s = json.loads((tmp_path / "summary.json").read_text())
    assert s["matches"] == 1 and s["modes"]["2v2"]["axisW"] == 1
    assert s["modes"]["2v2"]["bands"]["all"]["f"]["okw"] == {"g": 1, "w": 1}
    lad = json.loads((tmp_path / "ladder.json").read_text())
    assert lad["modes"]["2v2"]["factions"]["wehrmacht"]["n"] == 1


def test_modo_raro_afuera(tmp_path):
    raras = [
        _match(1, 5, [(100, 10, 0, 0, True, 1500, 1510), (102, 12, 1, 1, False, 1400, 1390)]),  # contra la IA / equipos
        _match(2, 0, [(100, 10, 0, 0, True, 1500, 1510), (102, 12, 1, 1, False, 1400, 1390)]),  # personalizada
        _match(3, 1, [(100, 10, 9, 0, True, 1500, 1510), (102, 12, 1, 1, False, 1400, 1390)]),  # raza desconocida
    ]
    relic = Relic({4: [(10, 100, 5, AYER)]}, {100: raras})
    _correr(tmp_path, relic)
    s = json.loads((tmp_path / "summary.json").read_text())
    assert s["matches"] == 0


def test_falla_se_saltea(tmp_path):
    m = _match(1, 1, [(101, 11, 0, 0, True, 1500, 1510), (102, 12, 1, 1, False, 1400, 1390)])
    relic = Relic({4: [(10, 100, 5, AYER), (11, 101, 5, AYER - 100)]}, {101: [m]}, falla=100)
    res = _correr(tmp_path, relic)
    assert res["failed"] == 1
    assert relic.pedidos.count(100) == 3  # el pedido y dos reintentos
    assert (tmp_path / "days" / "2026-11-05.json").exists()
    assert json.loads((tmp_path / "summary.json").read_text())["matches"] == 1


def test_formato_igual_a_coh3(tmp_path):
    m = _match(1, 1, [(100, 10, 0, 0, True, 1500, 1510), (102, 12, 1, 1, False, 1400, 1390)])
    relic = Relic({4: [(10, 100, 5, AYER)], 5: [(12, 102, 5, AYER)]}, {100: [m]}, )
    _correr(tmp_path, relic)
    s = json.loads((tmp_path / "summary.json").read_text())
    assert {"matches", "modes", "from", "to", "days", "durStep", "generatedAt"} <= set(s)
    assert s["modes"]["1v1"]["fvf"]["all"]["wehrmacht>soviet"] == {"g": 1, "w": 1}
    lad = json.loads((tmp_path / "ladder.json").read_text())
    assert {"day", "generatedAt", "eloStart", "eloStep", "modes"} <= set(lad)
    f = lad["modes"]["1v1"]["factions"]["wehrmacht"]
    assert {"n", "active7", "active28", "games", "lv", "elo", "countries"} <= set(f)
    assert sum(f["elo"]) == 1  # el ELO conocido (1510) entra al histograma


def test_coh1_panzer_elite(tmp_path):
    m = _match(1, 1, [(100, 10, 3, 0, True, 1500, 1510), (102, 12, 0, 1, False, 1400, 1390)], mapa="4p_Rails and Metal")
    relic = Relic({7: [(10, 100, 5, AYER)]}, {100: [m]})
    _correr(tmp_path, relic, game="coh1")
    s = json.loads((tmp_path / "summary.json").read_text())
    assert s["modes"]["1v1"]["fvf"]["all"]["panzer_elite>american"] == {"g": 1, "w": 1}
    assert "4p_rails and metal" in s["modes"]["1v1"]["maps"]


def test_primero_los_de_arriba_del_ranking(tmp_path):
    # Con un solo pedido: va al 1.º del ranking aunque el 2.º jugó más recién (las filas de arriba son las que se ven).
    relic = Relic({4: [(10, 100, 20, AYER - 5 * DIA), (11, 101, 19, AYER)]}, {})
    rd.run("coh2", relic, tmp_path, days=7, budget=1, workers=1, now=NOW, sleep=lambda s: None)
    assert relic.pedidos == [100]


class RelicFallaRanking(Relic):
    """Como Relic, pero el leaderboard `lb` falla siempre."""

    def __init__(self, lb: int, *a, **kw):
        super().__init__(*a, **kw)
        self.lb_roto = lb

    def __call__(self, url: str) -> dict:
        if "getLeaderBoard2" in url and f"leaderboard_id={self.lb_roto}&" in url:
            raise OSError("relic caído")
        return super().__call__(url)


def test_ranking_que_falla_conserva_la_memoria(tmp_path):
    (tmp_path / "elo").mkdir(parents=True)
    (tmp_path / "elo" / "4.json").write_text(json.dumps({"10": [1500, AYER - 3 * DIA]}))
    relic = RelicFallaRanking(4, {5: [(12, 102, 5, AYER - 9 * DIA)]}, {})
    _correr(tmp_path, relic)
    assert json.loads((tmp_path / "elo" / "4.json").read_text()) == {"10": [1500, AYER - 3 * DIA]}


def test_lo_jugado_hoy_no_cubre(tmp_path):
    # El ELO que se conoció hoy (día sin resumen todavía) no alcanza: mañana se vuelve a pedir, así sus partidas de hoy
    # entran en el resumen del día.
    hoy_temprano = NOW - 3 * 3600
    (tmp_path / "elo").mkdir(parents=True)
    (tmp_path / "elo" / "4.json").write_text(json.dumps({"10": [1500, hoy_temprano]}))
    relic = Relic({4: [(10, 100, 12, hoy_temprano)]}, {})
    _correr(tmp_path, relic)
    assert relic.pedidos == [100]


def test_tope_de_tiempo(tmp_path):
    relic = Relic({4: [(10, 100, 12, AYER)]}, {})
    res = rd.run("coh2", relic, tmp_path, days=7, budget=100, workers=1, now=NOW, sleep=lambda s: None, deadline=0)
    assert relic.pedidos == [] and res["requests"] == 0
    assert (tmp_path / "summary.json").exists() and (tmp_path / "ladder.json").exists()
