"""
Lector de los .pack de Project Zomboid (media/texturepacks), sólo lectura.

Un .pack es una lista de páginas; cada página es una hoja PNG con muchos sprites
adentro y, antes de la imagen, la tabla de dónde está cada uno:

    [v1: 'PZPK' + versión int32]      (v0 no trae cabecera)
    int32 cantidad de páginas
    por página:
        string nombre                  (int32 largo + UTF-8)
        int32 cantidad de sprites
        int32 "tiene alfa"             (no se usa)
        por sprite: string nombre + 8 int32
                    x, y, w, h         el recorte dentro de la hoja
                    offx, offy         dónde va ese recorte en el cuadro original
                    fullw, fullh       el tamaño del cuadro original (con el margen transparente)
        v1: int32 largo + PNG
        v0: el PNG, terminado con 0xDEADBEEF (no trae largo: hay que buscar la marca)

Los sprites vienen recortados a lo visible; `offx/offy/fullw/fullh` permiten
devolverles el margen, que es lo que hace el juego al dibujarlos. Para íconos
de inventario (32×32) el margen importa: sin él, un ícono chico queda estirado
cuando el sitio lo muestra en una casilla cuadrada.

Uso:
    p = Pack(ruta)
    p.names()                     # {sprite: página}
    p.sprites({"Item_Axe", ...})  # {sprite: Image RGBA del tamaño original}

Las hojas PNG se leen recién cuando se pide un sprite de esa página: Tiles2x.pack
pesa 320 MB y de ahí sólo hacen falta unos cientos de muebles.
"""
import io, struct
from PIL import Image

MAGIC = b"PZPK"
END_V0 = b"\xef\xbe\xad\xde"  # 0xDEADBEEF en little endian


def _i32(f):
    b = f.read(4)
    if len(b) < 4:
        raise EOFError("el .pack terminó antes de tiempo")
    return struct.unpack("<i", b)[0]


def _str(f):
    return f.read(_i32(f)).decode("utf-8", "replace")


class Pack:
    def __init__(self, path):
        self.path = path
        # [(nombre de página, [(sprite, x, y, w, h, offx, offy, fullw, fullh)], offset del PNG, largo del PNG)]
        self.pages = []
        with open(path, "rb") as f:
            head = f.read(4)
            if head == MAGIC:
                self.version = _i32(f)
            else:
                self.version = 0
                f.seek(0)
            for _ in range(_i32(f)):
                name = _str(f)
                count = _i32(f)
                _i32(f)  # "tiene alfa"
                entries = []
                for _ in range(count):
                    sprite = _str(f)
                    entries.append((sprite, *struct.unpack("<8i", f.read(32))))
                if self.version >= 1:
                    size = _i32(f)
                    start = f.tell()
                    f.seek(size, 1)
                else:
                    start, size = f.tell(), self._find_end(f)
                self.pages.append((name, entries, start, size))

    @staticmethod
    def _find_end(f):
        """v0: el PNG no dice cuánto mide; se busca la marca 0xDEADBEEF que lo cierra."""
        start, read, tail = f.tell(), 0, b""
        while True:
            chunk = f.read(1 << 16)
            if not chunk:
                raise EOFError("falta la marca 0xDEADBEEF al final de una página")
            # La marca puede quedar partida entre dos lecturas: se arrastran los últimos 3 bytes.
            k = (tail + chunk).find(END_V0)
            if k >= 0:
                size = read - len(tail) + k
                f.seek(start + size + 4)
                return size
            read += len(chunk)
            tail = (tail + chunk)[-3:]

    def names(self):
        return {e[0]: page for page, entries, _, _ in self.pages for e in entries}

    def entries(self):
        for _, entries, _, _ in self.pages:
            yield from entries

    def sprites(self, wanted=None, trim=False):
        """
        {sprite: Image RGBA}. Con `trim=False` cada sprite vuelve a su cuadro
        original (con el margen transparente); con `trim=True` queda sólo el
        recorte visible, que es lo que sirve para los muebles: su cuadro es el
        de una baldosa entera (128×256) y el objeto ocupa una parte.
        """
        out = {}
        with open(self.path, "rb") as f:
            for _, entries, start, size in self.pages:
                need = [e for e in entries if wanted is None or e[0] in wanted]
                if not need:
                    continue
                f.seek(start)
                sheet = Image.open(io.BytesIO(f.read(size))).convert("RGBA")
                for name, x, y, w, h, ox, oy, fw, fh in need:
                    part = sheet.crop((x, y, x + w, y + h))
                    if trim:
                        out[name] = part
                        continue
                    im = Image.new("RGBA", (max(fw, w + ox), max(fh, h + oy)), (0, 0, 0, 0))
                    im.paste(part, (ox, oy))
                    out[name] = im
        return out
