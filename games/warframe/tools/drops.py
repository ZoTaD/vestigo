"""Lectura de la tabla oficial de drops (games/warframe/raw/drops.html), sólo como texto."""
import re
from functools import lru_cache
from html.parser import HTMLParser

import wf

_CHANCE = re.compile(r"^(.*?)\s*\((\d+(?:\.\d+)?)%\)\s*$")
_BOTINES = {
    "cetusRewards": "Cetus",
    "solarisRewards": "Orb Vallis",
    "deimosRewards": "Cambion Drift",
    "zarimanRewards": "Zariman",
    "entratiLabRewards": "Albrecht's Laboratories",
    "hexRewards": "Hex",
}


class _Tablas(HTMLParser):
    """Parte el HTML en secciones (`<h3 id>`) y cada una en filas {"th": [...], "td": [...], "pad": bool}."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.secciones: dict[str, list[dict]] = {}
        self._filas = None
        self._fila = None
        self._celda = None  # (tag, [texto])

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        clase = a.get("class") or ""
        if tag == "h3" and a.get("id"):
            self._filas = self.secciones.setdefault(a["id"], [])
        elif tag == "tr" and self._filas is not None:
            self._fila = {"th": [], "td": [], "pad": False, "blank": False}
        elif tag in ("td", "th") and self._fila is not None:
            if "blank-row" in clase:
                self._fila["blank"] = True
            if tag == "td" and "pad-cell" in clase:
                self._fila["pad"] = True
            self._celda = (tag, [])

    def handle_data(self, data):
        if self._celda is not None:
            self._celda[1].append(data)

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self._celda is not None and self._fila is not None:
            txt = " ".join("".join(self._celda[1]).split())
            self._fila[self._celda[0]].append(txt)
            self._celda = None
        elif tag == "tr" and self._fila is not None:
            if not self._fila["blank"]:
                self._filas.append(self._fila)
            self._fila = None


@lru_cache(maxsize=None)
def _secciones() -> dict[str, list[dict]]:
    p = _Tablas()
    p.feed((wf.RAW / "drops.html").read_text(encoding="utf-8", errors="replace"))
    return p.secciones


def _chance(txt: str) -> tuple[str, float]:
    m = _CHANCE.match(txt)
    if not m:
        raise ValueError(f"Chance ilegible: {txt!r}")
    return m.group(1), float(m.group(2))


def _rot(txt: str) -> str:
    return txt.split()[-1]


def _tabla(seccion: str) -> list[dict]:
    """Misiones, llaves, dinámicos y sorties: encabezado, `Rotation X` y pares ítem/chance."""
    out, donde, rot = [], None, None
    for f in _secciones()[seccion]:
        if f["th"]:
            t = f["th"][0]
            if t.startswith("Rotation"):
                rot = _rot(t)
            else:
                donde, rot = t, None
        elif len(f["td"]) == 2:
            _, ch = _chance(f["td"][1])
            out.append({"where": donde, "rot": rot, "item": f["td"][0], "chance": ch})
    return out


def missions() -> list[dict]:
    return _tabla("missionRewards")


def keys() -> list[dict]:
    return _tabla("keyRewards")


def transient() -> list[dict]:
    return _tabla("transientRewards")


def sorties() -> list[dict]:
    return _tabla("sortieRewards")


def bounties() -> list[dict]:
    out = []
    for sec, lugar in _BOTINES.items():
        tier = rot = stage = None
        for f in _secciones()[sec]:
            if f["th"]:
                t = f["th"][0]
                if f["pad"]:
                    stage = t
                elif t.startswith("Rotation"):
                    rot, stage = _rot(t), None
                else:
                    tier, rot, stage = t, None, None
            elif len(f["td"]) == 3:  # celda vacía de relleno, ítem y chance
                _, ch = _chance(f["td"][2])
                out.append({"where": lugar, "tier": tier, "stage": stage, "rot": rot,
                            "item": f["td"][1], "chance": ch})
    return out


@lru_cache(maxsize=None)
def relics() -> dict[str, dict[str, list[tuple[str, str, float]]]]:
    out: dict = {}
    actual = None
    for f in _secciones()["relicRewards"]:
        if f["th"]:
            m = re.match(r"^(.*?) Relic \((\w+)\)$", f["th"][0])
            if not m:
                raise ValueError(f"Encabezado de reliquia ilegible: {f['th'][0]!r}")
            actual = out.setdefault(m.group(1), {}).setdefault(m.group(2), [])
        elif len(f["td"]) == 2:
            rar, ch = _chance(f["td"][1])
            actual.append((f["td"][0], rar, ch))
    return out


@lru_cache(maxsize=None)
def by_drop(section: str) -> dict[str, list[dict]]:
    out: dict = {}
    item = None
    for f in _secciones()[section]:
        if f["th"]:
            if len(f["th"]) == 1:
                item = f["th"][0]
                out.setdefault(item, [])
        elif len(f["td"]) == 3:
            drop = float(f["td"][1].rstrip("%").replace(",", ""))
            _, ch = _chance(f["td"][2])
            out[item].append({"who": f["td"][0], "drop": drop, "chance": ch,
                              "eff": round(drop * ch / 100, 4)})
    return out


@lru_cache(maxsize=None)
def relic_sources() -> dict[str, list[dict]]:
    """Dónde cae cada reliquia ("Lith A1"), en misiones, botines, llaves y recompensas dinámicas."""
    out: dict = {}
    for fuente in (missions(), bounties(), keys(), transient()):
        for x in fuente:
            if x["item"].endswith(" Relic"):
                out.setdefault(x["item"][: -len(" Relic")], []).append(x)
    return out


def vaulted(relic: str) -> bool:
    return not relic_sources().get(relic)
