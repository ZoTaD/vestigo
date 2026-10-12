"""Lector de texturas XNB de Terraria (Texture2D, formato Color), con LZX. Uso: xnb.py <salida> <archivo.xnb>..."""
import struct
import sys
from pathlib import Path

from PIL import Image

EXTRA = []
j = 0
for i in range(0, 52, 2):
    EXTRA += [j, j]
    if i != 0 and j < 17:
        j += 1
BASE = []
j = 0
for i in range(51):
    BASE.append(j)
    j += 1 << EXTRA[i]


class Lzx:
    def __init__(self, window_bits=16):
        self.wsize = 1 << window_bits
        self.window = bytearray(b"\xdc" * self.wsize)
        self.wpos = 0
        self.R = [1, 1, 1]
        self.main_elements = 256 + (window_bits * 2) * 8
        self.header_read = False
        self.block_type = 0
        self.block_length = 0
        self.block_remaining = 0
        self.main_len = [0] * (256 + 50 * 8 + 64)
        self.length_len = [0] * (250 + 64)
        self.main_tab = self.length_tab = self.aligned_tab = None

    # --- bits
    def init_bits(self):
        self.buf = 0
        self.left = 0

    def ensure(self, n):
        while self.left < n:
            d, p = self.data, self.pos
            lo = d[p] if p < len(d) else 0
            hi = d[p + 1] if p + 1 < len(d) else 0
            self.pos = p + 2
            self.buf = ((self.buf << 16) | (hi << 8) | lo) & 0xFFFFFFFFFFFF
            self.left += 16

    def bits(self, n):
        if n == 0:
            return 0
        self.ensure(n)
        self.left -= n
        return (self.buf >> self.left) & ((1 << n) - 1)

    # --- huffman
    @staticmethod
    def table(lens, nsyms):
        mx = max(lens[:nsyms])
        if mx == 0:
            return None
        tab = [0] * (1 << mx)
        pos = 0
        for ln in range(1, mx + 1):
            span = 1 << (mx - ln)
            for sym in range(nsyms):
                if lens[sym] == ln:
                    tab[pos : pos + span] = [sym] * span
                    pos += span
        return (tab, mx, lens)

    def sym(self, t):
        tab, mx, lens = t
        self.ensure(mx)
        s = tab[(self.buf >> (self.left - mx)) & ((1 << mx) - 1)]
        self.left -= lens[s]
        return s

    def read_lengths(self, lens, first, last):
        pre = [self.bits(4) for _ in range(20)]
        pt = self.table(pre, 20)
        x = first
        while x < last:
            z = self.sym(pt)
            if z == 17:
                y = self.bits(4) + 4
                lens[x : x + y] = [0] * y
                x += y
            elif z == 18:
                y = self.bits(5) + 20
                lens[x : x + y] = [0] * y
                x += y
            elif z == 19:
                y = self.bits(1) + 4
                z = (lens[x] - self.sym(pt)) % 17
                lens[x : x + y] = [z] * y
                x += y
            else:
                lens[x] = (lens[x] - z) % 17
                x += 1

    def decompress(self, data, out_len):
        self.data = data
        self.pos = 0
        self.init_bits()
        if not self.header_read:
            if self.bits(1):
                self.bits(16)
                self.bits(16)
            self.header_read = True
        w, wsize, R = self.window, self.wsize, self.R
        togo = out_len
        while togo > 0:
            if self.block_remaining == 0:
                if self.block_type == 3:
                    if self.block_length & 1:
                        self.pos += 1
                    self.init_bits()
                self.block_type = self.bits(3)
                i = self.bits(16)
                self.block_remaining = self.block_length = (i << 8) | self.bits(8)
                if self.block_type in (1, 2):
                    if self.block_type == 2:
                        al = [self.bits(3) for _ in range(8)]
                        self.aligned_tab = self.table(al, 8)
                    self.read_lengths(self.main_len, 0, 256)
                    self.read_lengths(self.main_len, 256, self.main_elements)
                    self.main_tab = self.table(self.main_len, self.main_elements)
                    self.read_lengths(self.length_len, 0, 249)
                    self.length_tab = self.table(self.length_len, 249)
                elif self.block_type == 3:
                    self.ensure(16)
                    if self.left > 16:
                        self.pos -= 2
                    R[0], R[1], R[2] = struct.unpack_from("<III", data, self.pos)
                    self.pos += 12
                else:
                    raise ValueError("bloque LZX %d" % self.block_type)
            while self.block_remaining > 0 and togo > 0:
                run = min(self.block_remaining, togo)
                togo -= run
                self.block_remaining -= run
                self.wpos &= wsize - 1
                wp = self.wpos
                if self.block_type == 3:
                    w[wp : wp + run] = data[self.pos : self.pos + run]
                    self.pos += run
                    self.wpos = wp + run
                    continue
                aligned = self.block_type == 2
                mt, lt, at = self.main_tab, self.length_tab, self.aligned_tab
                while run > 0:
                    m = self.sym(mt)
                    if m < 256:
                        w[wp] = m
                        wp += 1
                        run -= 1
                        continue
                    m -= 256
                    ml = m & 7
                    if ml == 7:
                        ml += self.sym(lt)
                    ml += 2
                    mo = m >> 3
                    if mo > 2:
                        if not aligned:
                            mo = BASE[mo] - 2 + self.bits(EXTRA[mo]) if mo != 3 else 1
                        else:
                            ex = EXTRA[mo]
                            mo = BASE[mo] - 2
                            if ex > 3:
                                mo += self.bits(ex - 3) << 3
                                mo += self.sym(at)
                            elif ex == 3:
                                mo += self.sym(at)
                            elif ex > 0:
                                mo += self.bits(ex)
                            else:
                                mo = 1
                        R[2], R[1], R[0] = R[1], R[0], mo
                    elif mo == 0:
                        mo = R[0]
                    elif mo == 1:
                        mo = R[1]
                        R[1], R[0] = R[0], mo
                    else:
                        mo = R[2]
                        R[2], R[0] = R[0], mo
                    run -= ml
                    src = wp - mo
                    if src >= 0 and mo >= ml:
                        w[wp : wp + ml] = w[src : src + ml]
                        wp += ml
                    else:
                        for _ in range(ml):
                            w[wp] = w[src % wsize if src < 0 else src]
                            wp += 1
                            src += 1
                self.wpos = wp
        start = (self.wpos or wsize) - out_len
        return bytes(w[start : start + out_len])


def payload(b):
    """El contenido de un XNB ya descomprimido (lo que sigue a la cabecera de 10 bytes)."""
    flags = b[5]
    if not flags & 0x80:
        return b[10:]
    (total,) = struct.unpack_from("<I", b, 10)
    dec = Lzx(16)
    out = bytearray()
    pos = 14
    while pos < len(b) - 1 and len(out) < total:
        hi, lo = b[pos], b[pos + 1]
        block, frame = (hi << 8) | lo, 0x8000
        if hi == 0xFF:
            frame = (lo << 8) | b[pos + 2]
            block = (b[pos + 3] << 8) | b[pos + 4]
            pos += 5
        else:
            pos += 2
        if block == 0 or frame == 0:
            break
        out += dec.decompress(b[pos : pos + block], frame)
        pos += block
    return bytes(out[:total])


def read7(b, o):
    n = shift = 0
    while True:
        c = b[o]
        o += 1
        n |= (c & 0x7F) << shift
        if not c & 0x80:
            return n, o
        shift += 7


def texture(path):
    raw = Path(path).read_bytes()
    assert raw[:3] == b"XNB", path
    b = payload(raw)
    o = 0
    n, o = read7(b, o)
    readers = []
    for _ in range(n):
        ln, o = read7(b, o)
        readers.append(b[o : o + ln].decode())
        o += ln + 4
    _, o = read7(b, o)  # recursos compartidos
    _, o = read7(b, o)  # índice del lector
    if "Texture2DReader" not in readers[0]:
        raise ValueError(readers[0])
    fmt, w, h, mips = struct.unpack_from("<iIIi", b, o)
    o += 16
    (size,) = struct.unpack_from("<I", b, o)
    o += 4
    if fmt != 0:
        raise ValueError("formato %d" % fmt)
    return Image.frombuffer("RGBA", (w, h), b[o : o + size], "raw", "RGBA", 0, 1)


if __name__ == "__main__":
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    for f in sys.argv[2:]:
        try:
            im = texture(f)
            im.save(out / (Path(f).stem + ".png"))
            print(Path(f).stem, im.size)
        except Exception as e:  # noqa: BLE001
            print("!!", Path(f).name, repr(e))
