"""
Lo común de las herramientas de Company of Heroes 3 (2026-11-04): dónde está lo crudo, qué tag se usa, cómo se lee un
archivo grande sin trabar la PC y en qué archivo va cada ficha. Spec: docs/superpowers/specs/2026-11-04-coh3-design.md.
"""
import gc
import json
from pathlib import Path

AQUI = Path(__file__).resolve().parent
JUEGO = AQUI.parent
RAW = JUEGO / "raw"
DATA = JUEGO / "data"

# coh3-data (MIT) por tag. `fetch.py` baja el actual y el anterior con cambios de datos a `raw/<tag>/`.
URL = "https://data.coh3stats.com/cohstats/coh3-data/{tag}/data/{path}"
API_TAGS = "https://api.github.com/repos/cohstats/coh3-data/tags?per_page=100"
API_COMMIT = "https://api.github.com/repos/cohstats/coh3-data/commits/{tag}"
API_DIR = "https://api.github.com/repos/cohstats/coh3-data/contents/data/{path}?ref={tag}"
UA = "Mozilla/5.0 (compatible; vestigo-data)"

# Las razas de coh3-data → la clave del sitio. `british_africa` es el ejército británico del multijugador (los
# Británicos de `british` son los de la campaña de Italia y comparten casi todo); se lee igual y se queda la unidad que
# sea jugable.
RACES = ("american", "british", "british_africa", "german", "afrika_korps")
FACTION = {"american": "american", "british": "british", "british_africa": "british", "german": "german", "afrika_korps": "dak"}
FACTIONS = ("american", "british", "german", "dak")

# En cuántos archivos se reparten las fichas de cada pestaña: `pzShardOf(slug, COH3_SHARDS)` de `site/src/zomboid/shard.ts`.
CHUNKS = 32


def tags_info() -> list[dict]:
    """Los tags bajados con cambios de stats, del más nuevo al más viejo: [{tag, date}] (`raw/tags.json`, de fetch.py)."""
    f = RAW / "tags.json"
    if not f.exists():
        raise SystemExit(f"falta {f}: corré games/coh3/tools/fetch.py")
    return [t if isinstance(t, dict) else {"tag": t, "date": None} for t in json.loads(f.read_text(encoding="utf-8"))]


def tags_raw() -> list[str]:
    return [t["tag"] for t in tags_info()]


def load(tag: str, path: str):
    """Un JSON de `raw/<tag>/`. Quien lo usa lo suelta (`del`) antes de cargar el siguiente: `free()`."""
    f = RAW / tag / path
    if not f.exists():
        raise SystemExit(f"falta {f}: corré games/coh3/tools/fetch.py")
    with f.open(encoding="utf-8") as fh:
        return json.load(fh)


def free() -> None:
    gc.collect()


def fnv1a(s: str) -> int:
    """FNV-1a de 32 bits sobre los bytes UTF-8: `pzHash` de `site/src/zomboid/shard.ts`."""
    h = 0x811C9DC5
    for b in s.encode("utf-8"):
        h = ((h ^ b) * 0x01000193) & 0xFFFFFFFF
    return h


def shard(slug: str) -> int:
    """En qué archivo va un slug: `pzShardOf(slug, CHUNKS)` (el archivo se llama con dos dígitos)."""
    return fnv1a(slug) % CHUNKS


def write_json(path: Path, data) -> bool:
    """Escribe compacto y sólo si cambió; devuelve si escribió."""
    txt = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    if path.exists() and path.read_text(encoding="utf-8") == txt:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(txt, encoding="utf-8", newline="\n")
    return True


def peak_mb() -> float | None:
    """El pico de memoria del proceso en MB (Windows: PeakWorkingSetSize; si no, ru_maxrss). None si no se puede."""
    try:
        import ctypes
        from ctypes import wintypes

        class PMC(ctypes.Structure):
            _fields_ = [("cb", wintypes.DWORD), ("PageFaultCount", wintypes.DWORD),
                        ("PeakWorkingSetSize", ctypes.c_size_t), ("WorkingSetSize", ctypes.c_size_t),
                        ("QuotaPeakPagedPoolUsage", ctypes.c_size_t), ("QuotaPagedPoolUsage", ctypes.c_size_t),
                        ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t), ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
                        ("PagefileUsage", ctypes.c_size_t), ("PeakPagefileUsage", ctypes.c_size_t)]

        pmc = PMC()
        pmc.cb = ctypes.sizeof(PMC)
        k32 = ctypes.WinDLL("kernel32")
        psapi = ctypes.WinDLL("psapi")
        k32.GetCurrentProcess.restype = wintypes.HANDLE
        psapi.GetProcessMemoryInfo.argtypes = [wintypes.HANDLE, ctypes.POINTER(PMC), wintypes.DWORD]
        if psapi.GetProcessMemoryInfo(k32.GetCurrentProcess(), ctypes.byref(pmc), pmc.cb):
            return pmc.PeakWorkingSetSize / 2**20
    except (OSError, AttributeError):
        pass
    try:
        import resource
        return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024
    except ImportError:
        return None
