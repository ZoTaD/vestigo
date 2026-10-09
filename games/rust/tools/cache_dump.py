"""
Volcado crudo del juego a la caché local `games/rust/cache/` (2026-10-08), para armar las pestañas que faltan
(Monumentos, Electricidad, Granjas) sin tener Rust instalado. La caché no se publica ni se versiona (`.gitignore`);
lo que se versiona son estos scripts, para rehacerla en el próximo parche.

Este módulo es la base que usan `extract_world.py`, `extract_io.py`, `extract_farming.py` y `extract_media.py`:
  - `Dumper` abre los tres bundles de `world.World` (assetscenes, content, items.preload) y pasa cada MonoBehaviour a un
    JSON plano: el typetree entero, con cada referencia (`{m_FileID, m_PathID}`) reemplazada por un resumen de a qué
    apunta (tipo, clase, nombre y ruta del asset) y cada `GameObjectRef` (`{guid}`) con la ruta del prefab, sacada del
    `GameManifest`;
  - cada instancia lleva su contexto: el GameObject, la raíz (en una escena de monumento, el prefab del monumento; en la
    escena de prefabs, el prefab mismo), la posición en el mundo de la escena y el archivo.

Memoria: abrir `World` pide ~10-12 GB (content.bundle pesa 4,6 GB). Un script por vez, nunca dos en paralelo
(ver `games/rust/README.md`).
"""
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from world import World, prefab_paths  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
CACHE = ROOT / "games" / "rust" / "cache"

# Campos que no aportan nada para el sitio y engordan cada volcado (sonidos, efectos, materiales, render). Se sacan
# sólo si son referencias o listas de referencias: un número con uno de estos nombres queda.
NOISE = ("sound", "Sound", "effect", "Effect", "Fx", "FX", "material", "Material", "renderer", "Renderer", "animator",
         "Animator", "mesh", "Mesh", "Gib", "gib", "debris", "Debris", "Light", "light")


def rss_gb():
    try:
        import psutil
        return round(psutil.Process().memory_info().rss / 2**30, 1)
    except Exception:  # noqa: BLE001
        return None


def write_json(rel, data):
    path = CACHE / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1, default=str) + "\n", encoding="utf-8")
    print(f"[cache] {rel}: {path.stat().st_size // 1024} KB", flush=True)
    return path


def _qmul(a, b):
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return (aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx,
            aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz)


def _qrot(q, v):
    x, y, z, w = q
    vx, vy, vz = v
    # v' = v + 2w(q×v) + 2 q×(q×v)
    cx, cy, cz = y * vz - z * vy, z * vx - x * vz, x * vy - y * vx
    cx2, cy2, cz2 = y * cz - z * cy, z * cx - x * cz, x * cy - y * cx
    return (vx + 2 * (w * cx + cx2), vy + 2 * (w * cy + cy2), vz + 2 * (w * cz + cz2))


def _v(d):
    return (d.x, d.y, d.z) if hasattr(d, "x") else (d["x"], d["y"], d["z"])


class Dumper:
    def __init__(self, w=None):
        self.w = w or World()
        self.paths = prefab_paths(self.w)
        self.container = {}  # (archivo, path_id) → ruta del asset en el bundle
        for path, ptr in self.w.env.container.items():
            # En UnityPy 1.25 el container da PPtr (m_FileID relativo al archivo que lo trae).
            self.container[(self.w.file_of(ptr.assetsfile, ptr.m_FileID), ptr.m_PathID)] = path
        self.tr_memo = {}
        self.go_memo = {}
        self.ref_memo = {}

    # --- referencias ---
    def mono_class(self, o):
        r = o.reader
        r.Position = o.byte_start + 16
        fid, pid = r.read_int(), r.read_long()
        af = o.assets_file
        if not 0 <= fid <= len(af.externals):
            return None
        return self.w.scripts.get((self.w.file_of(af, fid), pid))

    def describe(self, x):
        key = (x.assets_file.name, x.path_id)
        if key in self.ref_memo:
            return self.ref_memo[key]
        t = x.type.name
        d = {"type": t}
        try:
            if t == "MonoBehaviour":
                d["class"] = self.mono_class(x)
                name = x.peek_name()
                if name:
                    d["name"] = name
                else:
                    go = self.w.obj(x, self.w.tree(x)["m_GameObject"]) if d["class"] else None
                    if go is not None:
                        d["go"] = go.peek_name()
            elif t in ("GameObject", "Sprite", "Texture2D", "Material", "Mesh", "AudioClip", "TextAsset", "Transform"):
                if t != "Transform":
                    d["name"] = x.peek_name()
            else:
                n = x.peek_name()
                if n:
                    d["name"] = n
        except Exception as e:  # noqa: BLE001
            d["error"] = str(e)[:80]
        c = self.container.get(key)
        if c:
            d["asset"] = c
        d["ref"] = f"{x.assets_file.name}#{x.path_id}"
        self.ref_memo[key] = d
        return d

    def plain(self, owner, v, key=""):
        if isinstance(v, dict):
            if set(v) == {"m_FileID", "m_PathID"}:
                if not v["m_PathID"]:
                    return None
                x = self.w.obj(owner, v)
                if x is not None:
                    return self.describe(x)
                # Un archivo que no está en estos tres bundles (las texturas y sprites viven en los
                # `textures.N.bundle`): se anota el CAB para buscarlo después (`extract_sprites.py`).
                try:
                    cab = self.w.file_of(owner.assets_file, v["m_FileID"])
                except IndexError:
                    cab = f"?{v['m_FileID']}"
                return {"unresolved": f"{cab}#{v['m_PathID']}"}
            if set(v) == {"guid"}:
                return {"guid": v["guid"], "prefab": self.paths.get(v["guid"])} if v["guid"] else None
            out = {}
            for k, val in v.items():
                if k in ("m_Script", "m_Enabled"):
                    continue
                pv = self.plain(owner, val, k)
                if any(n in k for n in NOISE) and _is_refs(pv):
                    continue
                out[k] = pv
            return out
        if isinstance(v, (list, tuple)):
            return [self.plain(owner, x, key) for x in v]
        if isinstance(v, float):
            if math.isnan(v) or math.isinf(v):
                return str(v)
            return round(v, 5)
        if isinstance(v, bytes):
            return v.hex() if len(v) <= 64 else f"<{len(v)} bytes>"
        return v

    # --- contexto ---
    def transform_of(self, go_obj):
        key = (go_obj.assets_file.name, go_obj.path_id)
        if key in self.go_memo:
            return self.go_memo[key]
        go = go_obj.read()
        tr = None
        for c in go.m_Components:
            comp = getattr(c, "component", c)
            try:
                co = comp.deref()
            except Exception:  # noqa: BLE001
                continue
            if co.type.name in ("Transform", "RectTransform"):
                tr = co
                break
        self.go_memo[key] = (go.m_Name, tr)
        return self.go_memo[key]

    def world_of(self, tr_obj):
        """(nombre de la raíz, posición, rotación, escala) en la escena, con memo por Transform."""
        key = (tr_obj.assets_file.name, tr_obj.path_id)
        if key in self.tr_memo:
            return self.tr_memo[key]
        tr = tr_obj.read()
        p, q, s = _v(tr.m_LocalPosition), (tr.m_LocalRotation.x, tr.m_LocalRotation.y, tr.m_LocalRotation.z,
                                             tr.m_LocalRotation.w), _v(tr.m_LocalScale)
        father = tr.m_Father
        if father and father.m_PathID:
            rn, P, Q, S = self.world_of(father.deref())
            sp = (S[0] * p[0], S[1] * p[1], S[2] * p[2])
            rp = _qrot(Q, sp)
            res = (rn, (P[0] + rp[0], P[1] + rp[1], P[2] + rp[2]), _qmul(Q, q), (S[0] * s[0], S[1] * s[1], S[2] * s[2]))
        else:
            res = (tr.m_GameObject.deref().peek_name(), p, q, s)
        self.tr_memo[key] = res
        return res

    def context(self, o, tt):
        go = self.w.obj(o, tt["m_GameObject"])
        ctx = {"file": o.assets_file.name, "pid": o.path_id}
        if go is None:
            return ctx
        name, tr = self.transform_of(go)
        ctx["go"] = name
        if tr is not None:
            root, pos, rot, _ = self.world_of(tr)
            ctx["root"] = root
            ctx["pos"] = [round(c, 2) for c in pos]
            if root != name:
                # La posición relativa a la raíz (el monumento), sin rotar: alcanza para ubicar algo dentro.
                rtr = self.root_transform(tr)
                if rtr is not None:
                    _, rpos, rrot, _ = self.world_of(rtr)
                    inv = (-rrot[0], -rrot[1], -rrot[2], rrot[3])
                    rel = _qrot(inv, (pos[0] - rpos[0], pos[1] - rpos[1], pos[2] - rpos[2]))
                    ctx["local"] = [round(c, 2) for c in rel]
        return ctx

    def root_transform(self, tr_obj):
        cur = tr_obj
        for _ in range(200):
            t = cur.read()
            if not (t.m_Father and t.m_Father.m_PathID):
                return cur
            cur = t.m_Father.deref()
        return None

    # --- volcado ---
    def instances(self, classes, where=None):
        """[(objeto, typetree, clase)] de esas clases; `where(o)` filtra por archivo antes de leer el typetree."""
        for o, tt, cls in self.w.behaviours(set(classes)):
            if where is None or where(o):
                yield o, tt, cls

    def dump(self, classes, where=None, with_context=True):
        """{clase: [{"ctx": ..., "data": ...}]}"""
        out = {}
        for o, tt, cls in self.instances(classes, where):
            entry = {"ctx": self.context(o, tt) if with_context else {"file": o.assets_file.name, "pid": o.path_id},
                     "data": self.plain(o, tt)}
            out.setdefault(cls, []).append(entry)
        return out

    def siblings(self, o, tt):
        """Las clases de los otros MonoBehaviour del mismo GameObject (para ver qué más tiene un prefab)."""
        go = self.w.obj(o, tt["m_GameObject"])
        if go is None:
            return []
        res = []
        for c in go.read().m_Components:
            comp = getattr(c, "component", c)
            try:
                co = comp.deref()
            except Exception:  # noqa: BLE001
                continue
            if co.type.name == "MonoBehaviour":
                res.append(self.mono_class(co))
        return res


def _is_refs(v):
    if isinstance(v, dict):
        return "ref" in v or "unresolved" in v or "guid" in v
    if isinstance(v, list):
        return all(_is_refs(x) or x is None for x in v) and len(v) > 0
    return v is None
