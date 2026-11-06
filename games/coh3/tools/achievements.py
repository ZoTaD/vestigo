"""
Los logros de Company of Heroes 3 (2026-11-05) y de Company of Heroes 2 (2026-11-06): `games/<juego>/data/achievements.json`
y sus íconos en `site/public/<juego>/a/<hash>.jpg`. El CoH1 relanzado (228200) no tiene logros en Steam.

    python games/coh3/tools/achievements.py [--game coh3|coh2]

- Nombre, descripción, ícono y si es secreto: la página pública de logros de Steam (los trae como JSON dentro del HTML).
- Porcentaje de jugadores que lo tienen: `ISteamUserStats/GetGlobalAchievementPercentagesForApp` (pública, sin clave);
  si no contesta, el que trae la misma página.
- En español:
  - CoH3: los textos del juego (`raw/<tag>/locales/`, los baja `fetch.py`), buscando el inglés de Steam entre los
    textos en inglés del juego. Lo que no aparece queda en inglés.
  - CoH2: la misma página de Steam en español (`?l=spanish`), unida por `api_name`.

Salida: `{generatedAt, list: [{slug, name:{en,es}, desc:{en,es}, icon, hidden, pct}]}`, de más común a más rara.
"""
import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from coh3 import UA, tags_raw, write_json  # noqa: E402

RAIZ = Path(__file__).resolve().parents[3]
APPS = {"coh3": 1677280, "coh2": 231430}
PAGINA = "https://steamcommunity.com/achievements/{app}?l={lang}"
PORCENTAJES = "https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/?gameid={app}"
ICONO = "https://cdn.fastly.steamstatic.com/steamcommunity/public/images/apps/{app}/{h}"
RAW = Path(__file__).resolve().parents[1] / "raw"
HASH_OK = re.compile(r"^[0-9a-f]{40}\.jpg$")


def _get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def _consultas(html: str) -> list[dict]:
    """Las consultas que la página de Steam trae en `queryData` (un JSON escrito como string dentro de otro JSON)."""
    i = html.find('"queryData":"')
    if i < 0:
        raise ValueError("la página de Steam no trae queryData")
    texto, _ = json.JSONDecoder().raw_decode(html, i + len('"queryData":'))
    return json.loads(texto).get("queries", [])


def logros_steam(html: str, app: int = APPS["coh3"]) -> list[dict]:
    for q in _consultas(html):
        d = (q.get("state") or {}).get("data")
        if isinstance(d, dict) and d.get("appid") == app and d.get("groups"):
            return [a for g in d["groups"] for a in g.get("achievements", []) if not a.get("archived")]
    raise ValueError("la página de Steam no trae los logros")


def porcentajes_pagina(html: str, app: int) -> dict[int, float]:
    """`{internal_key: porcentaje}` de la consulta `globalpercentages` de la página."""
    for q in _consultas(html):
        k = q.get("queryKey") or []
        d = (q.get("state") or {}).get("data")
        if len(k) == 3 and k[1] == app and k[2] == "globalpercentages" and isinstance(d, dict):
            return {int(x): float(v) for x, v in (d.get("percentages") or {}).items()}
    return {}


def combinar(en: list[dict], es: list[dict], pct: dict[str, float]) -> list[dict]:
    """Los logros en inglés con su español (mismo `api_name`) y su porcentaje; de más común a más raro."""
    por_api = {a["api_name"]: a for a in es}
    out = []
    for a in en:
        e = por_api.get(a["api_name"], {})
        icono = a.get("icon_achieved") or ""
        out.append({
            "slug": a["api_name"].lower(),
            "name": {"en": a["name"], "es": e.get("name") or a["name"]},
            "desc": {"en": a.get("description") or "", "es": e.get("description") or a.get("description") or ""},
            "icon": icono[:-4] if HASH_OK.match(icono) else None,
            "hidden": bool(a.get("hidden")),
            "pct": pct.get(a["api_name"]),
        })
    out.sort(key=lambda x: (-(x["pct"] or 0), x["slug"]))
    return out


def traductor(tag: str):
    """CoH3: del inglés del juego al español del juego (mismo id de texto). Sin textos, devuelve None."""
    en_f, es_f = RAW / tag / "locales" / "en-locstring.json", RAW / tag / "locales" / "es-locstring.json"
    if not en_f.exists() or not es_f.exists():
        return lambda s: None
    en = json.loads(en_f.read_text(encoding="utf-8"))
    es = json.loads(es_f.read_text(encoding="utf-8"))
    por_texto: dict = {}
    for k, v in en.items():
        if isinstance(v, str):
            por_texto.setdefault(v.strip().lower(), k)
    del en
    return lambda s: (es.get(por_texto.get((s or "").strip().lower(), "")) or None)


def main(argv: list[str]) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--game", default="coh3", choices=sorted(APPS))
    a = ap.parse_args(argv)
    app = APPS[a.game]
    html_en = _get(PAGINA.format(app=app, lang="english")).decode("utf-8")
    lista = logros_steam(html_en, app)
    try:
        pct = {x["name"]: float(x["percent"]) for x in json.loads(_get(PORCENTAJES.format(app=app)))["achievementpercentages"]["achievements"]}
    except (KeyError, ValueError, urllib.error.URLError):
        pct = {}
    if not pct:
        por_clave = porcentajes_pagina(html_en, app)
        pct = {x["api_name"]: por_clave[x["internal_key"]] for x in lista if x.get("internal_key") in por_clave}
    if a.game == "coh2":
        es = logros_steam(_get(PAGINA.format(app=app, lang="spanish")).decode("utf-8"), app)
    else:
        tags = tags_raw()
        tr = traductor(tags[0]) if tags else (lambda s: None)
        es = [{**x, "name": tr(x["name"]), "description": tr(x.get("description"))} for x in lista]
    out = combinar(lista, es, pct)
    destino = RAIZ / "site" / "public" / a.game / "a"
    destino.mkdir(parents=True, exist_ok=True)
    nuevos = 0
    for x in out:
        if x["icon"] and not (destino / f"{x['icon']}.jpg").exists():
            try:
                datos = _get(ICONO.format(app=app, h=f"{x['icon']}.jpg"))
            except urllib.error.URLError as e:
                print(f"  sin ícono {x['slug']}: {e}")
                x["icon"] = None
                continue
            if datos[:3] == b"\xff\xd8\xff":
                (destino / f"{x['icon']}.jpg").write_bytes(datos)
                nuevos += 1
            else:
                x["icon"] = None
            time.sleep(0.15)
    traducidos = sum(1 for x in out if x["name"]["es"] != x["name"]["en"])
    write_json(RAIZ / "games" / a.game / "data" / "achievements.json",
               {"generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "list": out})
    print(f"{a.game}: {len(out)} logros ({traducidos} con nombre en español), {nuevos} íconos nuevos")


if __name__ == "__main__":
    main(sys.argv[1:])
