import unittest
from pipeline.unity import external_cab

class TestExternal(unittest.TestCase):
    def test_cab_de_bundle(self):
        self.assertEqual(external_cab("archive:/CAB-f78add41ea118a2fa5f83cc81e6280d1/CAB-f78add41ea118a2fa5f83cc81e6280d1"),
                         "cab-f78add41ea118a2fa5f83cc81e6280d1")

    def test_archivo_suelto(self):
        self.assertEqual(external_cab("resources.assets"), "resources.assets")

if __name__ == "__main__":
    unittest.main()
