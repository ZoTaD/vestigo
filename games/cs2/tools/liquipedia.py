"""
El cliente de la API de Liquipedia para CS2 (2026-11-03, etapa 6): sólo `api.php` y archivos de imagen, nunca páginas
HTML. Cumple sus términos (liquipedia.net/api-terms-of-use): User-Agent propio, gzip, 1 pedido cada 2 s y `parse` 1
cada 30 s. Lo que trae es dato no confiable: se lee como texto, nunca se ejecuta.
"""
import gzip
import json
import time
import urllib.parse
import urllib.request

API = "https://liquipedia.net/counterstrike/api.php"
UA = "VestigoBot/1.0 (https://vestigo.gg)"
# Segundos entre pedidos: `parse` va aparte, el resto (query, archivos) junto.
WAIT = {"parse": 30.0, "other": 2.0}


class Liquipedia:
    def __init__(self, clock=time.monotonic, sleep=time.sleep, opener=urllib.request.urlopen):
        self.clock, self.sleep, self.opener = clock, sleep, opener
        self.last: dict[str, float] = {}

    def _get(self, url: str, kind: str) -> bytes:
        prev = self.last.get(kind)
        if prev is not None:
            falta = WAIT[kind] - (self.clock() - prev)
            if falta > 0:
                self.sleep(falta)
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "gzip"})
        try:
            with self.opener(req, timeout=60) as r:
                raw = r.read()
                if r.headers.get("Content-Encoding") == "gzip":
                    raw = gzip.decompress(raw)
                return raw
        finally:
            self.last[kind] = self.clock()

    def parse(self, page: str) -> str:
        """El HTML de una página (`action=parse`)."""
        url = API + "?" + urllib.parse.urlencode({"action": "parse", "page": page, "prop": "text", "format": "json"})
        return json.loads(self._get(url, "parse"))["parse"]["text"]["*"]

    def query(self, **params) -> dict:
        url = API + "?" + urllib.parse.urlencode({**params, "format": "json"})
        return json.loads(self._get(url, "other"))

    def file(self, url: str) -> bytes:
        """Un archivo (un logo); cuenta como pedido común."""
        return self._get(url, "other")
