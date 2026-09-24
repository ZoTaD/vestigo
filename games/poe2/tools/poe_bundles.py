"""Lector mínimo de Bundles2 (PoE/PoE2 de Steam), port en Python de LibBundle3 (aianlinb/LibGGPK3).

Sólo lectura, para sacar texturas de la interfaz del juego instalado (2026-09-23).
Uso: ver extract_ui.py. Necesita OODLE_DLL apuntando a oo2core.dll.
"""
import ctypes, os, struct

# oo2core.dll viene en el zip win-x64 de LibGGPK3 (github.com/aianlinb/LibGGPK3/releases).
# No se commitea: se indica con la variable OODLE_DLL.
OODLE = ctypes.WinDLL(os.environ["OODLE_DLL"])
_dec = OODLE.OodleLZ_Decompress
_dec.restype = ctypes.c_ssize_t
_dec.argtypes = [ctypes.c_char_p, ctypes.c_ssize_t, ctypes.c_char_p, ctypes.c_ssize_t,
                 ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_void_p, ctypes.c_ssize_t,
                 ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_ssize_t, ctypes.c_int]


def oodle(buf: bytes, out_size: int) -> bytes:
    out = ctypes.create_string_buffer(out_size)
    n = _dec(buf, len(buf), out, out_size, 1, 0, 0, None, 0, None, None, None, 0, 3)
    if n != out_size:
        raise RuntimeError(f"Oodle devolvió {n}, esperaba {out_size}")
    return out.raw


class Bundle:
    def __init__(self, data_or_path):
        if isinstance(data_or_path, (bytes, bytearray)):
            self.buf = bytes(data_or_path)
        else:
            with open(data_or_path, "rb") as f:
                self.buf = f.read()
        b = self.buf
        self.usize, self.csize, self.head = struct.unpack_from("<3i", b, 0)
        (self.compressor, _u, _ul, _cl, self.count, self.chunk) = struct.unpack_from("<iiqqii", b, 12)
        self.sizes = struct.unpack_from(f"<{self.count}i", b, 12 + 48)
        self.data_start = 12 + self.head
        self.offsets = []
        o = self.data_start
        for s in self.sizes:
            self.offsets.append(o)
            o += s

    def _chunk(self, i):
        last = i == self.count - 1
        size = self.usize - self.chunk * (self.count - 1) if last else self.chunk
        o = self.offsets[i]
        return oodle(self.buf[o:o + self.sizes[i]], size)

    def read_all(self) -> bytes:
        return b"".join(self._chunk(i) for i in range(self.count))

    def read(self, offset, length) -> bytes:
        if length == 0:
            return b""
        start = offset // self.chunk
        end = (offset + length - 1) // self.chunk + 1
        data = b"".join(self._chunk(i) for i in range(start, end))
        rel = offset - start * self.chunk
        return data[rel:rel + length]


M = 0xC6A4A7935BD1E995
MASK = (1 << 64) - 1


def murmur64a(data: bytes, seed=0x1337B33F) -> int:
    if not data:
        return 0xF42A94E69CFF42FE
    if data.endswith(b"/"):
        data = data[:-1]
    h = (seed ^ (len(data) * M)) & MASK
    n8 = len(data) // 8
    for i in range(n8):
        k = struct.unpack_from("<Q", data, i * 8)[0]
        k = (k * M) & MASK
        k ^= k >> 47
        k = (k * M) & MASK
        h = ((h ^ k) * M) & MASK
    rem = data[n8 * 8:]
    if rem:
        h = ((h ^ int.from_bytes(rem, "little")) * M) & MASK
    h ^= h >> 47
    h = (h * M) & MASK
    h ^= h >> 47
    return h


class Index:
    def __init__(self, bundles_dir):
        self.dir = bundles_dir
        data = Bundle(os.path.join(bundles_dir, "_.index.bin")).read_all()
        p = 0
        (nb,) = struct.unpack_from("<i", data, p); p += 4
        self.bundles = []
        for _ in range(nb):
            (ln,) = struct.unpack_from("<i", data, p); p += 4
            name = data[p:p + ln].decode("utf-8"); p += ln
            (us,) = struct.unpack_from("<i", data, p); p += 4
            self.bundles.append(name)
        (nf,) = struct.unpack_from("<i", data, p); p += 4
        self.files = {}
        for _ in range(nf):
            h, bi, off, sz = struct.unpack_from("<Qiii", data, p); p += 20
            self.files[h] = (bi, off, sz)
        (nd,) = struct.unpack_from("<i", data, p); p += 4
        self.dirs = []
        for _ in range(nd):
            self.dirs.append(struct.unpack_from("<Qiii", data, p)); p += 20
        self.dir_bundle = data[p:]
        self._cache = {}

    def paths(self):
        """Todas las rutas, con su registro (bundle, offset, size)."""
        d = Bundle(self.dir_bundle).read_all()
        out = {}
        for (_h, off, size, _rs) in self.dirs:
            temp, base, p, end = [], False, off, off + size
            while p <= end - 4:
                (idx,) = struct.unpack_from("<i", d, p); p += 4
                if idx == 0:
                    base = not base
                    if base:
                        temp = []
                    continue
                idx -= 1
                z = d.index(b"\0", p)
                s = d[p:z]; p = z + 1
                if idx < len(temp):
                    s = temp[idx] + s
                if base:
                    temp.append(s)
                else:
                    rec = self.files.get(murmur64a(s))
                    if rec:
                        out[s.decode("utf-8", "replace")] = rec
        return out

    def read(self, rec) -> bytes:
        bi, off, sz = rec
        name = self.bundles[bi]
        b = self._cache.get(bi)
        if b is None:
            b = Bundle(os.path.join(self.dir, name + ".bundle.bin"))
            if len(self._cache) > 16:
                self._cache.clear()
            self._cache[bi] = b
        return b.read(off, sz)
