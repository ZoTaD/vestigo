import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import dat  # noqa: E402

DAT = Path("C:/Program Files (x86)/Steam/steamapps/common/AoE2DE/resources/_common/dat/empires2_x2_p1.dat")


@pytest.mark.skipif(not DAT.exists(), reason="AoE2 DE no está instalado")
def test_lee_el_dat_del_juego_con_cifras_conocidas():
    d = dat.leer(DAT)
    assert d.version in ("VER 8.8", "VER 8.9")
    caballero = d.civs[2].unidades[38]
    assert (caballero.vida, caballero.ataques[4], caballero.armaduras[4], caballero.armaduras[3]) == (100, 10, 2, 2)
    assert caballero.costo == {0: 60, 3: 75} and caballero.tiempo == 30 and caballero.edificio == 101
    arquero = d.civs[2].unidades[4]
    assert (arquero.alcance, arquero.recarga, arquero.precision) == (4.0, 2.0, 80)
    telar = d.techs[22]
    assert telar.nombre == "Loom" and telar.costo == {3: 50} and telar.edificio == 109
