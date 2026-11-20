"""El lector de grabaciones y las reglas de apertura de AoE2 (`replay.py`, `openings.py`), con dos grabaciones reales
recortadas a 25 minutos (`fixtures/<id>.body.gz`, partidas del 20/11 de wR.Lucho) y secuencias armadas a mano."""
import gzip
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import openings as op  # noqa: E402
import replay  # noqa: E402

FIX = Path(__file__).resolve().parent / "fixtures"
leer = lambda n: replay.read_actions(gzip.open(FIX / f"{n}.body.gz").read())


def test_lee_las_acciones_de_una_grabacion_real():
    acc = leer("522237014")
    p1 = [a for a in acc if a.player == 1]
    assert any(a.kind == "research" and a.id == op.FEUDAL and 380 <= a.t <= 420 for a in p1)
    assert any(a.kind == "queue" and a.id == op.MILITIA for a in p1)
    assert max(a.t for a in acc) <= 25 * 60


def test_aperturas_de_las_grabaciones_reales():
    """Revisadas mirando la secuencia: MAA los dos en la primera; arqueros y drush en la segunda."""
    assert op.openings(leer("522237014")) == {1: "maa", 2: "maa"}
    assert op.openings(leer("521948686")) == {1: "archers", 2: "drush"}


A = op.Accion


def test_scouts():
    acc = [A(500, "research", op.FEUDAL, 1), A(640, "queue", op.SCOUT, 1), A(700, "queue", op.SCOUT, 1)]
    assert op.classify(acc, 1) == "scouts"


def test_drush_y_drush_fc():
    base = [A(200, "queue", op.MILITIA, 1), A(230, "queue", op.MILITIA, 1), A(400, "research", op.FEUDAL, 1)]
    assert op.classify(base + [A(600, "queue", op.ARCHER, 1)], 1) == "drush"
    assert op.classify(base + [A(560, "research", op.CASTLE, 1)], 1) == "drush_fc"


def test_fast_castle_y_boom():
    fc = [A(500, "research", op.FEUDAL, 1), A(700, "research", op.CASTLE, 1)]
    assert op.classify(fc, 1) == "fc"
    assert op.classify(fc + [A(900, "build", op.TOWN_CENTER, 1), A(950, "build", op.TOWN_CENTER, 1)], 1) == "boom"


def test_torres():
    acc = [A(500, "research", op.FEUDAL, 1), A(560, "build", op.TOWER, 1), A(600, "build", op.TOWER, 1)]
    assert op.classify(acc, 1) == "tower"


def test_sin_feudal_o_sin_datos_es_otra():
    assert op.classify([], 1) == "other"
    assert op.classify([A(100, "queue", 83, 1)], 1) == "other"


def test_solo_cuentan_las_acciones_del_jugador():
    acc = [A(500, "research", op.FEUDAL, 1), A(600, "queue", op.SCOUT, 2), A(650, "queue", op.ARCHER, 1)]
    assert op.classify(acc, 1) == "archers"
