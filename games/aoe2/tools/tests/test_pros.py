import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import pros  # noqa: E402

YAML = """\
- name: Nicov
  country: ar
  liquipedia: Nicov
  platforms:
    voobly:
      - "123807394" #
    rl:
      - "208393"
      - "1827959-hc" # bad neighbor
  aka:
    - Nico
- name: SinPais
  platforms:
    rl:
      - "5"
"""


def test_lee_pais_y_ids_de_world_edge():
    assert pros.paises(YAML) == {208393: "ar", 1827959: "ar"}
