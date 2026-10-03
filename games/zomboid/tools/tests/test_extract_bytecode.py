"""
Tests de los lectores de bytecode de `extract.py` (2026-10-02): ante un .jar que no se entiende (un parche cambió la
clase, o el archivo llegó cortado) no tiran un traceback crudo sino que devuelven "no pude" y `main()` corta con su
mensaje: `game_version()` da None y `moodle_textures()` da {} (build_moodles pide un piso).

Uso: python -m unittest discover -s games/zomboid/tools/tests -v
"""
import os
import sys
import tempfile
import unittest
import zipfile
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import extract  # noqa: E402

# Una cabecera de .class válida y un constant pool que anuncia 5 entradas y se corta en la primera.
CUT = b"\xca\xfe\xba\xbe\x00\x00\x00\x41\x00\x05\x01\x00"


class BytecodeQueNoSeEntiende(unittest.TestCase):
    def jar(self, folder, entries):
        with zipfile.ZipFile(os.path.join(folder, "projectzomboid.jar"), "w") as z:
            for name, data in entries.items():
                z.writestr(name, data)

    def test_version_con_la_clase_cortada_da_none(self):
        with tempfile.TemporaryDirectory() as folder:
            self.jar(folder, {"zombie/core/Core.class": CUT})
            with mock.patch.object(extract, "GAME_DIR", folder):
                self.assertIsNone(extract.game_version())

    def test_version_sin_jar_da_none(self):
        with tempfile.TemporaryDirectory() as folder, mock.patch.object(extract, "GAME_DIR", folder):
            self.assertIsNone(extract.game_version())

    def test_moodles_con_la_clase_cortada_dan_vacio(self):
        with tempfile.TemporaryDirectory() as folder:
            self.jar(folder, {"zombie/ui/MoodleTextureSet.class": CUT})
            with mock.patch.object(extract, "GAME_DIR", folder):
                self.assertEqual(extract.moodle_textures(), {})

    def test_moodles_sin_la_clase_dan_vacio(self):
        with tempfile.TemporaryDirectory() as folder:
            self.jar(folder, {"otra.class": b""})
            with mock.patch.object(extract, "GAME_DIR", folder):
                self.assertEqual(extract.moodle_textures(), {})


if __name__ == "__main__":
    unittest.main()
