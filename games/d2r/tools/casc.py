"""
Lector mínimo del almacenamiento CASC de Diablo II: Resurrected.

Usa CascLib (github.com/ladislav-zezula/CascLib), compilada como DLL en
games/d2r/.cache/CascLib (ver README de games/d2r). Sólo LEE la instalación
del juego; no modifica nada.

    with Casc() as c:
        for name, size in c.files("*"):
            ...
        data = c.read("data:data/global/excel/runes.txt")
"""
import ctypes, os
from ctypes import wintypes

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
DLL = os.path.join(ROOT, "games", "d2r", ".cache", "CascLib", "bin", "CascLib_dll", "x64", "Release", "CascLib.dll")
GAME_DIR = r"C:\Program Files (x86)\Diablo II Resurrected"

CASC_LOCALE_ALL = 0xFFFFFFFF
MAX_PATH = 260


class FindData(ctypes.Structure):
    _fields_ = [
        ("szFileName", ctypes.c_char * MAX_PATH),
        ("CKey", ctypes.c_ubyte * 16),
        ("EKey", ctypes.c_ubyte * 16),
        ("TagBitMask", ctypes.c_ulonglong),
        ("FileSize", ctypes.c_ulonglong),
        ("szPlainName", ctypes.c_char_p),
        ("dwFileDataId", wintypes.DWORD),
        ("dwLocaleFlags", wintypes.DWORD),
        ("dwContentFlags", wintypes.DWORD),
        ("dwSpanCount", wintypes.DWORD),
        ("bFileAvailable", wintypes.DWORD),
        ("NameType", ctypes.c_int),
    ]


def _lib():
    lib = ctypes.WinDLL(DLL)
    H = wintypes.HANDLE
    lib.CascOpenStorage.argtypes = [ctypes.c_char_p, wintypes.DWORD, ctypes.POINTER(H)]
    lib.CascOpenStorage.restype = ctypes.c_bool
    lib.CascCloseStorage.argtypes = [H]
    lib.CascFindFirstFile.argtypes = [H, ctypes.c_char_p, ctypes.POINTER(FindData), ctypes.c_char_p]
    lib.CascFindFirstFile.restype = H
    lib.CascFindNextFile.argtypes = [H, ctypes.POINTER(FindData)]
    lib.CascFindNextFile.restype = ctypes.c_bool
    lib.CascFindClose.argtypes = [H]
    lib.CascOpenFile.argtypes = [H, ctypes.c_char_p, wintypes.DWORD, wintypes.DWORD, ctypes.POINTER(H)]
    lib.CascOpenFile.restype = ctypes.c_bool
    lib.CascGetFileSize64.argtypes = [H, ctypes.POINTER(ctypes.c_ulonglong)]
    lib.CascGetFileSize64.restype = ctypes.c_bool
    lib.CascReadFile.argtypes = [H, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(wintypes.DWORD)]
    lib.CascReadFile.restype = ctypes.c_bool
    lib.CascCloseFile.argtypes = [H]
    return lib


class Casc:
    def __init__(self, game_dir=GAME_DIR):
        self.lib = _lib()
        self.h = wintypes.HANDLE()
        if not self.lib.CascOpenStorage(game_dir.encode("mbcs"), CASC_LOCALE_ALL, ctypes.byref(self.h)):
            raise OSError(f"CascLib no pudo abrir {game_dir} (error {ctypes.GetLastError()})")

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.lib.CascCloseStorage(self.h)

    def files(self, mask="*"):
        """(nombre, tamaño) de cada archivo que coincide con la máscara."""
        fd = FindData()
        hf = self.lib.CascFindFirstFile(self.h, mask.encode(), ctypes.byref(fd), None)
        if not hf or hf == wintypes.HANDLE(-1).value:
            return
        try:
            while True:
                yield fd.szFileName.decode("utf-8", "replace"), fd.FileSize
                if not self.lib.CascFindNextFile(hf, ctypes.byref(fd)):
                    break
        finally:
            self.lib.CascFindClose(hf)

    def read(self, name):
        hf = wintypes.HANDLE()
        if not self.lib.CascOpenFile(self.h, name.encode(), 0, 0, ctypes.byref(hf)):
            raise FileNotFoundError(name)
        try:
            size = ctypes.c_ulonglong()
            self.lib.CascGetFileSize64(hf, ctypes.byref(size))
            buf = ctypes.create_string_buffer(size.value)
            got = wintypes.DWORD()
            if not self.lib.CascReadFile(hf, buf, size.value, ctypes.byref(got)):
                raise OSError(f"no se pudo leer {name}")
            return buf.raw[: got.value]
        finally:
            self.lib.CascCloseFile(hf)
