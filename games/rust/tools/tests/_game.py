"""
Condición común de los tests que leen los archivos del juego.

Cargar los bundles con UnityPy ocupa varios GB de RAM y no se sueltan solos: dos corridas a la vez llenaron 64 GB.
Por eso estos tests son opcionales: corren sólo con `RUST_GAME=1` y con el juego instalado, de a un archivo por vez.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import extract  # noqa: E402

MOTIVO = "lee los archivos del juego (RUST_GAME=1 para correrlo)"
INSTALADO = all((extract.BUNDLES / "shared" / b).exists()
                for b in ("items.preload.bundle", "content.bundle", "assetscenes.bundle"))
GAME_TESTS = os.environ.get("RUST_GAME") == "1" and INSTALADO

solo_con_juego = unittest.skipUnless(GAME_TESTS, MOTIVO)
