"""
Anota las visitas de Baro Ki'Teer en `games/warframe/data/baro/history.json`.

    python games/warframe/tools/baro.py

Lee la API de warframestat (en y es); si Baro está y su visita no está anotada, la suma
y escribe el archivo. Imprime `nueva` o `igual`.

Lo bajado es dato no confiable: sólo se lee con json.loads.
"""
import json
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

AQUI = Path(__file__).resolve().parent
DATA = AQUI.parent / "data"
HISTORIAL = DATA / "baro" / "history.json"
URL = "https://api.warframestat.us/pc/voidTrader?language={lang}"


def get(lang: str) -> dict:
    req = urllib.request.Request(URL.format(lang=lang), headers={"User-Agent": "vestigo-baro"})
    with urllib.request.urlopen(req, timeout=30) as r:
        datos = json.loads(r.read().decode("utf-8"))
    if not isinstance(datos, dict):
        raise ValueError(f"voidTrader {lang}: respuesta inesperada")
    return datos


def refs_from_lists(data_dir: Path) -> dict:
    """{nombre inglés en casefold: {tab, slug, slugEs, img}} del Arsenal y de Mods."""
    refs = {}
    for tab in ("arsenal", "mods"):
        ruta = data_dir / tab / "list.json"
        if not ruta.exists():
            continue
        for fila in json.loads(ruta.read_text(encoding="utf-8")):
            refs.setdefault(
                fila["name"][0].casefold(),
                {"tab": tab, "slug": fila["slug"], "slugEs": fila["slugEs"], "img": fila["img"]},
            )
    return refs


def _fecha(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def parse_visit(en: dict, es: dict, refs: dict, now: datetime) -> dict | None:
    """La visita de ahora, o None si Baro no está (fuera de fechas o sin inventario)."""
    try:
        if not (_fecha(en["activation"]) <= now < _fecha(en["expiry"])):
            return None
    except (KeyError, ValueError, TypeError):
        return None
    inv_es = {i.get("uniqueName"): i.get("item") for i in (es.get("inventory") or [])}
    items = []
    for i in en.get("inventory") or []:
        nombre = i["item"]
        items.append({
            "unique": i["uniqueName"],
            "name": [nombre, inv_es.get(i["uniqueName"]) or nombre],
            "ducats": int(i.get("ducats") or 0),
            "credits": int(i.get("credits") or 0),
            "ref": refs.get(nombre.casefold()),
        })
    if not items:
        return None
    return {
        "start": en["activation"],
        "end": en["expiry"],
        "location": [en.get("location", ""), es.get("location") or en.get("location", "")],
        "items": items,
    }


def merge(history: dict, visit: dict) -> tuple[dict, bool]:
    """Suma la visita (la más nueva primero) salvo que su `start` ya esté."""
    visitas = history.get("visits", [])
    if any(v["start"] == visit["start"] for v in visitas):
        return history, False
    return {**history, "visits": sorted([visit, *visitas], key=lambda v: v["start"], reverse=True)}, True


def main() -> int:
    visita = parse_visit(get("en"), get("es"), refs_from_lists(DATA), datetime.now(timezone.utc))
    if visita is None:
        print("igual")
        return 0
    historial = json.loads(HISTORIAL.read_text(encoding="utf-8")) if HISTORIAL.exists() else {"visits": []}
    historial, nueva = merge(historial, visita)
    if not nueva:
        print("igual")
        return 0
    HISTORIAL.parent.mkdir(parents=True, exist_ok=True)
    HISTORIAL.write_text(json.dumps(historial, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print("nueva")
    return 0


if __name__ == "__main__":
    sys.exit(main())
