"""
El juego instalado, leído con UnityPy.

**Todo vive en bundles que se refieren unos a otros.** Una receta del bundle
grande (`c4210710`) apunta a un objeto con `m_FileID: 2`, que es el segundo
archivo externo de SU archivo, no un índice global. Por eso toda referencia se
resuelve contra el archivo del componente que la contiene (`ref`) y se guarda
como clave global `(nombre del archivo en minúsculas, path_id)`.

Medido el 2026-09-24 (Unity 6000.0.75f1): los 797 bundles útiles cargan en
~25 s y la clase de cada MonoBehaviour se resuelve en ~7 s más. Los scripts
(MonoScript) viven en `86c3d76e` y los tipos se generan desde los DLL del
juego con TypeTreeGeneratorAPI.
"""
import os
from dataclasses import dataclass
import UnityPy
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator

GAME_ROOT = r"C:\Program Files (x86)\Steam\steamapps\common\Valheim"
SKIP_BUNDLES = {"f9285044", "61c598bb"}   # videos y audio: 3 GB que no hacen falta
LOOSE = ["globalgamemanagers", "globalgamemanagers.assets", "resources.assets", "sharedassets0.assets"]


def external_cab(path: str) -> str:
    return os.path.basename(path.replace("\\", "/")).lower()


@dataclass
class Comp:
    cls: str
    key: tuple
    tree: dict
    file: object
    go: tuple | None
    obj: object


class Game:
    def __init__(self, root: str = GAME_ROOT):
        data = os.path.join(root, "valheim_Data")
        bundles = os.path.join(data, "StreamingAssets", "SoftRef", "Bundles")
        files = [os.path.join(bundles, f) for f in os.listdir(bundles) if f not in SKIP_BUNDLES]
        files += [os.path.join(data, f) for f in LOOSE]
        self.env = UnityPy.load(*files)
        self.unity_version = self.env.objects[0].assets_file.unity_version
        gen = TypeTreeGenerator(self.unity_version)
        gen.load_local_game(root)
        self.env.typetree_generator = gen
        self._objs: dict[tuple, object] = {}
        self._by_cls: dict[str, list[Comp]] = {}
        self._by_go: dict[tuple, list[Comp]] = {}
        self._names: dict[tuple, str | None] = {}
        for o in self.env.objects:
            if o.type.name in ("MonoBehaviour", "GameObject", "Sprite", "TextAsset"):
                self._objs[(o.assets_file.name.lower(), o.path_id)] = o

    def ref(self, file, pptr: dict | None) -> tuple | None:
        if not pptr or not pptr.get("m_PathID"):
            return None
        fid = pptr.get("m_FileID", 0)
        if fid == 0:
            return (file.name.lower(), pptr["m_PathID"])
        ext = file.externals[fid - 1]
        return (external_cab(ext.path), pptr["m_PathID"])

    def _class(self, o) -> str | None:
        try:
            return o.parse_as_object().m_Script.deref_parse_as_object().m_ClassName
        except Exception:
            return None

    def index(self, classes: set[str]) -> None:
        """Lee los typetrees de las clases pedidas (una sola pasada)."""
        for key, o in self._objs.items():
            if o.type.name != "MonoBehaviour":
                continue
            c = self._class(o)
            if c not in classes:
                continue
            tree = o.read_typetree()
            go = self.ref(o.assets_file, tree.get("m_GameObject"))
            comp = Comp(c, key, tree, o.assets_file, go, o)
            self._by_cls.setdefault(c, []).append(comp)
            if go:
                self._by_go.setdefault(go, []).append(comp)

    def components(self, cls: str) -> list[Comp]:
        return self._by_cls.get(cls, [])

    def comps_on(self, go_key: tuple | None) -> list[Comp]:
        return self._by_go.get(go_key, []) if go_key else []

    def prefab(self, key: tuple | None) -> str | None:
        if not key:
            return None
        if key in self._names:
            return self._names[key]
        o = self._objs.get(key)
        name = None
        if o is not None:
            if o.type.name == "GameObject":
                name = o.peek_name()
            elif o.type.name == "MonoBehaviour":
                go = self.ref(o.assets_file, o.read_typetree().get("m_GameObject"))
                g = self._objs.get(go)
                name = g.peek_name() if g is not None else None
        self._names[key] = name
        return name

    def name_of_in(self, file):
        return lambda pptr: self.prefab(self.ref(file, pptr))

    def _sprite(self, file, pptr):
        o = self._objs.get(self.ref(file, pptr))
        return o.read() if o is not None and o.type.name == "Sprite" else None

    def sprite_name(self, file, pptr) -> str | None:
        s = self._sprite(file, pptr)
        return s.m_Name if s else None

    def sprite_image(self, file, pptr):
        s = self._sprite(file, pptr)
        return s.image if s else None

    def localization_texts(self) -> list[str]:
        out = []
        for o in self._objs.values():
            if o.type.name != "TextAsset":
                continue
            t = o.read()
            if t.m_Name.startswith("localization"):
                raw = t.m_Script
                out.append(raw if isinstance(raw, str) else raw.decode("utf-8", "replace"))
        return out

    def ui_sprites(self, bundle_cab_prefix: str | None = None):
        """Todos los Sprites cargados, por nombre (para la interfaz)."""
        for o in self._objs.values():
            if o.type.name == "Sprite":
                yield o
