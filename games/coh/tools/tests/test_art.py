"""Los emblemas de CoH1 (`art.emblema`): el juego no trae emblemas de facción sueltos, se dibujan las insignias de época."""
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import art  # noqa: E402


def test_emblemas_coh1():
    vistos = set()
    for f in ("american", "british", "wehrmacht", "panzer_elite"):
        svg = art.emblema(f)
        raiz = ET.fromstring(svg)
        assert raiz.get("viewBox") == "0 0 48 48"
        assert "<text" not in svg  # nada de siglas
        vistos.add(svg)
    assert len(vistos) == 4
