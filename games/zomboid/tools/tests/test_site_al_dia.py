"""
`data/site` al día (2026-10-02): lo que escribe `site.py` sale de `data/*.json`, y nada avisaba si alguien regeneraba
los datos (extract.py, craft.py, loot.py, patches.py) y se olvidaba de correr `site.py` después. Este test lo arma de
nuevo en memoria y lo compara con lo que está en el repo, archivo por archivo, sin escribir nada.

Uso: python -m unittest discover -s games/zomboid/tools/tests -v
"""
import glob
import importlib.util
import os
import unittest

# site.py por su ruta: `import site` daría el módulo de la biblioteca estándar (ver el docstring de site.py).
_spec = importlib.util.spec_from_file_location("zomboid_site", os.path.join(os.path.dirname(__file__), "..", "site.py"))
site = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(site)


class SiteAlDia(unittest.TestCase):
    def test_data_site_es_lo_que_arma_site_py(self):
        files = site.Site().build()
        stale = []
        for name in sorted(files):
            path = os.path.join(site.OUT, *name.split("/"))
            try:
                with open(path, encoding="utf-8") as f:
                    on_disk = f.read()
            except OSError:
                on_disk = None
            if on_disk != site.dumps(files[name]):
                stale.append(name)
        extra = sorted(os.path.relpath(p, site.OUT).replace(os.sep, "/")
                       for p in glob.glob(os.path.join(site.OUT, "**", "*.json"), recursive=True))
        extra = [n for n in extra if n not in files]
        self.assertEqual((stale[:10], extra[:10]), ([], []),
                         "data/site no está al día con data/*.json: correr python games/zomboid/tools/site.py")


if __name__ == "__main__":
    unittest.main()
