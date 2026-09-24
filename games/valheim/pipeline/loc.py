"""
Las traducciones oficiales del juego.

Valheim trae su tabla en `resources.assets` como TextAssets `localization`,
`localization_deepnorth`, `localization_witch`… (CSV, 36 idiomas; medido el
2026-09-24: 5.744 filas en la principal). La primera columna es el token sin
`$`; el objeto dice `$item_gold` y la tabla `item_gold`.
"""
import csv
import io


def parse_localization(text: str) -> dict[str, dict]:
    rows = list(csv.reader(io.StringIO(text.lstrip("﻿"))))
    if not rows:
        return {}
    head = [h.strip().strip('"').lstrip("﻿") for h in rows[0]]
    en = head.index("English")
    es = head.index("Spanish") if "Spanish" in head else None
    out: dict[str, dict] = {}
    for r in rows[1:]:
        if len(r) <= en or not r[0].strip():
            continue
        e = {"en": r[en]}
        if es is not None and len(r) > es and r[es]:
            e["es"] = r[es]
        out[r[0].strip()] = e
    return out


class Loc:
    def __init__(self, table: dict[str, dict]):
        self.table = table

    def t(self, token: str | None) -> dict | None:
        """`{en, es}` de un token (`$item_x` o `item_x`); sin español, el inglés."""
        if not token:
            return None
        e = self.table.get(token.lstrip("$"))
        if not e:
            return None
        return {"en": e["en"], "es": e.get("es") or e["en"]}
