"""
Los íconos de la interfaz de Company of Heroes 2 (2026-11-06): `UIHigh.sga` trae la interfaz en Scaleform
(`ui/bin/coh2ui.gfx`, un SWF sin comprimir) y las imágenes en hojas `.dds` grandes. El `.gfx` dice dónde está cada una:

  - tag 76 (SymbolClass): nombre de clase → id de carácter (`Icons_units_unit_soviet_conscript_01` → 11236);
  - tag 1008 (DefineSubImage): id → (imagen, x1, y1, x2, y2), el recorte dentro de una hoja;
  - tag 1009 (DefineExternalImage2): id de imagen → archivo (`CoH2UI_I276.tga`), que en el `.sga` está como
    `ui/assets/textures/coh2ui_i276.dds`.
"""
import io
import struct

from PIL import Image


class Gfx:
    def __init__(self, sga, gfx_path: str = "ui/bin/coh2ui.gfx"):
        self.sga = sga
        g = sga.read(gfx_path)
        if g[:3] not in (b"GFX", b"FWS"):
            raise ValueError("no es un .gfx sin comprimir")
        nbits = g[8] >> 3
        o = 8 + (5 + nbits * 4 + 7) // 8 + 4
        self.sym: dict[str, int] = {}
        self.sub: dict[int, tuple[int, int, int, int, int]] = {}
        self.ext: dict[int, str] = {}
        while o < len(g):
            h = struct.unpack_from("<H", g, o)[0]
            code, ln = h >> 6, h & 0x3F
            o += 2
            if ln == 0x3F:
                ln = struct.unpack_from("<I", g, o)[0]
                o += 4
            b = g[o:o + ln]
            if code == 76:
                n = struct.unpack_from("<H", b, 0)[0]
                p = 2
                for _ in range(n):
                    cid = struct.unpack_from("<H", b, p)[0]
                    e = b.index(b"\0", p + 2)
                    self.sym[b[p + 2:e].decode("latin-1")] = cid
                    p = e + 1
            elif code == 1008:
                self.sub[struct.unpack_from("<H", b, 0)[0]] = struct.unpack_from("<HHHHH", b, 2)
            elif code == 1009:
                cid = struct.unpack_from("<H", b, 0)[0]
                p = 10
                p += 1 + b[p]  # nombre exportado
                self.ext[cid] = b[p + 1:p + 1 + b[p]].decode("latin-1")
            o += ln
            if code == 0:
                break
        self._hojas: dict[str, Image.Image] = {}

    def has(self, name: str) -> bool:
        return self.sym.get(name) in self.sub

    def crop(self, name: str) -> Image.Image | None:
        cid = self.sym.get(name)
        if cid not in self.sub:
            return None
        img, x1, y1, x2, y2 = self.sub[cid]
        archivo = self.ext.get(img)
        if not archivo:
            return None
        ruta = "ui/assets/textures/" + archivo.lower().rsplit(".", 1)[0] + ".dds"
        if ruta not in self._hojas:
            if ruta not in self.sga.entries:
                return None
            self._hojas[ruta] = Image.open(io.BytesIO(self.sga.read(ruta))).convert("RGBA")
        return self._hojas[ruta].crop((x1, y1, x2, y2))
