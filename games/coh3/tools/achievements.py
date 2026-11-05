"""
Los logros de Company of Heroes 3 (2026-11-05): `games/coh3/data/achievements.json` y sus íconos en
`site/public/coh3/a/<hash>.jpg`.

    python games/coh3/tools/achievements.py

- Nombre, descripción, ícono y si es secreto: la página pública de logros de Steam (los trae como JSON dentro del HTML).
- Porcentaje de jugadores que lo tienen: `ISteamUserStats/GetGlobalAchievementPercentagesForApp` (pública, sin clave).
- En español: los textos del juego (`raw/<tag>/locales/`, los baja `fetch.py`), buscando el inglés de Steam entre los
  textos en inglés del juego. Lo que no aparece queda en inglés.

Salida: `{generatedAt, players: null, list: [{slug, name:{en,es}, desc:{en,es}, icon, hidden, pct}]}`, ordenada de
más común a más rara.
"""
import json
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from coh3 import DATA, UA, tags_raw, write_json  # noqa: E402

APP = 1677280
PAGINA = f"https://steamcommunity.com/stats/{APP}/achievements/?l=english"
PORCENTAJES = f"https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/?gameid={APP}"
ICONO = f"https://cdn.fastly.steamstatic.com/steamcommunity/public/images/apps/{APP}/{{h}}"
DESTINO = Path(__file__).resolve().parents[3] / "site" / "public" / "coh3" / "a"
RAW = Path(__file__).resolve().parents[1] / "raw"
HASH_OK = re.compile(r"^[0-9a-f]{40}\.jpg$")


def _get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def logros_steam(html: str) -> list[dict]:
    """Los logros que la página de Steam trae en `queryData` (un JSON escrito como string dentro de otro JSON)."""
    i = html.find('"queryData":"')
    if i < 0:
        raise ValueError("la página de Steam no trae queryData")
    texto, _ = json.JSONDecoder().raw_decode(html, i + len('"queryData":'))
    for q in json.loads(texto).get("queries", []):
        d = (q.get("state") or {}).get("data")
        if isinstance(d, dict) and d.get("appid") == APP and d.get("groups"):
            return [a for g in d["groups"] for a in g.get("achievements", []) if not a.get("archived")]
    raise ValueError("la página de Steam no trae los logros")


def traductor(tag: str):
    """Del inglés del juego al español del juego (mismo id de texto). Sin textos, devuelve None."""
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


def main() -> None:
    lista = logros_steam(_get(PAGINA).decode("utf-8"))
    pct = {a["name"]: float(a["percent"]) for a in
           json.loads(_get(PORCENTAJES))["achievementpercentages"]["achievements"]}
    tags = tags_raw()
    es = traductor(tags[0]) if tags else (lambda s: None)
    out = []
    for a in lista:
        icono = a.get("icon_achieved") or ""
        out.append({
            "slug": a["api_name"].lower(),
            "name": {"en": a["name"], "es": es(a["name"]) or a["name"]},
            "desc": {"en": a.get("description") or "", "es": es(a.get("description")) or a.get("description") or ""},
            "icon": icono[:-4] if HASH_OK.match(icono) else None,
            "hidden": bool(a.get("hidden")),
            "pct": pct.get(a["api_name"]),
        })
    out.sort(key=lambda x: (-(x["pct"] or 0), x["slug"]))
    DESTINO.mkdir(parents=True, exist_ok=True)
    nuevos = 0
    for a in out:
        if a["icon"] and not (DESTINO / f"{a['icon']}.jpg").exists():
            try:
                datos = _get(ICONO.format(h=f"{a['icon']}.jpg"))
            except urllib.error.URLError as e:
                print(f"  sin ícono {a['slug']}: {e}")
                a["icon"] = None
                continue
            if datos[:3] == b"\xff\xd8\xff":
                (DESTINO / f"{a['icon']}.jpg").write_bytes(datos)
                nuevos += 1
            else:
                a["icon"] = None
            time.sleep(0.15)
    traducidos = sum(1 for a in out if a["name"]["es"] != a["name"]["en"])
    write_json(DATA / "achievements.json",
               {"generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "list": out})
    print(f"{len(out)} logros ({traducidos} con nombre en español), {nuevos} íconos nuevos")


if __name__ == "__main__":
    main()
