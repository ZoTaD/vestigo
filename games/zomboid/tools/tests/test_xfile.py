"""Tests de xfile.py y gltf.py: el lector de .x y el escritor de .glb (2026-10-01).
Los que leen el juego se saltean si no está (PZ_DIR). Correr desde la raíz del worktree:
    python -m unittest discover -s games/zomboid/tools/tests -v
"""
import atexit, glob, json, math, os, shutil, struct, sys, tempfile, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import xfile, gltf  # noqa: E402
from extract import MEDIA  # noqa: E402

SK = os.path.join(MEDIA, "models_X", "Skinned")
ST = os.path.join(MEDIA, "models_X", "Static")
HAY_JUEGO = os.path.isdir(SK)
SPEED = 0.48 * 0.8  # Idle.xml: m_SpeedScale del nodo × el de la mezcla Bob_Idle

CHICO = '''xof 0303txt 0032
template Frame { <3d82ab46-62da-11cf-ab39-0020af71e433> [...] }
Frame Raiz {
 FrameTransformMatrix { 1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1;; }
 Mesh Cuad {
  4; 0;0;0;, 1;0;0;, 1;1;0;, 0;1;0;;
  1; 4;0,1,2,3;;
  MeshNormals { 1; 0;0;-1;; 1; 4;0,0,0,0;; }
  MeshTextureCoords { 4; 0;1;, 1;1;, 1;0;, 0;0;; }
 }
}
'''

# Un cubo a medias: dos caras que comparten la arista 1–2 con normales distintas (como una arista dura).
ARISTA = '''xof 0303txt 0032
Frame Raiz {
 Mesh Dos {
  4; 0;0;0;, 1;0;0;, 1;1;0;, 1;1;1;;
  2; 3;0,1,2;, 3;1,3,2;;
  MeshNormals { 2; 0;0;-1;, 1;0;0;; 2; 3;0,0,0;, 3;1,1,1;; }
  MeshTextureCoords { 4; 0;0;, 1;0;, 1;1;, 0;1;; }
 }
}
'''


def leer_glb(path):
    with open(path, "rb") as h:
        data = h.read()
    magic, version, length = struct.unpack_from("<4sII", data, 0)
    clen, ctype = struct.unpack_from("<I4s", data, 12)
    return magic, version, length, len(data), ctype, json.loads(data[20:20 + clen])


def accesor(path, js, i):
    """Lee un accessor del BIN (sólo float y enteros chicos, sin byteStride: lo que escribe gltf.py)."""
    with open(path, "rb") as h:
        data = h.read()
    clen, = struct.unpack_from("<I", data, 12)
    binc = data[20 + clen + 8:]
    a = js["accessors"][i]
    v = js["bufferViews"][a["bufferView"]]
    n = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}[a["type"]]
    fmt = {5126: "f", 5123: "H", 5121: "B"}[a["componentType"]]
    vals = struct.unpack_from("<%d%s" % (a["count"] * n, fmt), binc, v.get("byteOffset", 0))
    return [vals[k:k + n] for k in range(0, len(vals), n)]


def escribir(texto, nombre):
    d = tempfile.mkdtemp()
    atexit.register(shutil.rmtree, d, True)  # sin esto, cada corrida dejaba carpetas en %TEMP%
    p = os.path.join(d, nombre)
    with open(p, "w") as h:
        h.write(texto)
    return p


class LectorTest(unittest.TestCase):
    def test_cuadrilatero_a_mano(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "cuad.x")
            with open(p, "w") as h:
                h.write(CHICO)
            x = xfile.read_x(p)
        m = x.root[0].meshes[0]
        self.assertEqual(len(m.positions), 4)
        self.assertEqual(m.faces, [(0, 1, 2, 3)])
        self.assertEqual(m.uvs[0], (0.0, 1.0))

    def test_error_dice_archivo_y_linea(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "roto.x")
            with open(p, "w") as h:
                h.write("xof 0303txt 0032\nFrame A {\n FrameTransformMatrix { 1,0;; }\n}\n")
            with self.assertRaisesRegex(xfile.XError, r"roto\.x:3"):
                xfile.read_x(p)

    def test_binario_no(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "bin.x")
            with open(p, "wb") as h:
                h.write(b"xof 0303bin 0032\x00\x01")
            with self.assertRaisesRegex(xfile.XError, r"bin\.x:1"):
                xfile.read_x(p)

    def test_los_comentarios_son_separadores(self):
        texto = CHICO.replace("Frame Raiz {", "// un comentario\nFrame Raiz { # otro\n", 1)
        x = xfile.read_x(escribir(texto, "comentado.x"))
        self.assertEqual([f.name for f in xfile.walk_frames(x)], ["Raiz"])

    def test_un_archivo_cortado_dice_donde(self):
        with self.assertRaisesRegex(xfile.XError, r"cortado\.x:2"):
            xfile.read_x(escribir("xof 0303txt 0032\nFrame A", "cortado.x"))

    def test_lo_desconocido_se_anota(self):
        x = xfile.read_x(escribir("xof 0303txt 0032\nRaro { 1; }\n" + CHICO.split("\n", 1)[1], "raro.x"))
        self.assertEqual(x.skipped, ["Raro"])
        self.assertEqual([f.name for f in xfile.walk_frames(x)], ["Raiz"])


class ConvencionTest(unittest.TestCase):
    def test_espejo_de_una_traslacion(self):
        m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.1, 0.2, 0.3, 1]
        self.assertEqual(gltf.to_rh_matrix(m)[12:15], [0.1, 0.2, -0.3])

    def test_descomponer_y_volver(self):
        m = [-0.087155, 0.982405, -0.165183, 0, -0.000001, 0.165814, 0.986157, 0,
             0.996195, 0.085949, -0.014450, 0, -0.01, -0.012284, 0.490453, 1]  # Bip01 de MaleBody.x
        t, r, s = gltf.decompose(gltf.to_rh_matrix(m))
        for a, b in zip(gltf.compose(t, r, s), gltf.to_rh_matrix(m)):
            self.assertAlmostEqual(a, b, places=5)

    def test_cuaternion_y_matriz(self):
        # 90° alrededor de Y: x → −z en mano derecha.
        q = (0.0, math.sin(math.pi / 4), 0.0, math.cos(math.pi / 4))
        m = gltf.quat_matrix(q)
        self.assertAlmostEqual(m[2], -1.0)  # columna 0 = imagen de x
        t, r, s = gltf.decompose(m)
        for a, b in zip(r, q):
            self.assertAlmostEqual(a, b)


class EscritorChicoTest(unittest.TestCase):
    def test_cuadrilatero_en_dos_triangulos_espejados(self):
        x = xfile.read_x(escribir(CHICO, "cuad.x"))
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "cuad.glb")
            st = gltf.write_glb(p, frames=x.root, mesh=x.root[0].meshes[0], skin_root=None, animation=None)
            _, _, _, _, _, js = leer_glb(p)
            prim = js["meshes"][0]["primitives"][0]
            tris = accesor(p, js, prim["indices"])
            nrm = accesor(p, js, prim["attributes"]["NORMAL"])
            pos = accesor(p, js, prim["attributes"]["POSITION"])
        self.assertEqual((st["vertices"], st["triangles"]), (4, 2))
        self.assertEqual([t[0] for t in tris], [0, 2, 1, 0, 3, 2])  # (0,2,1) y (0,3,2): el espejo da vuelta el giro
        self.assertEqual(nrm[0], (0.0, 0.0, 1.0))  # la normal −z del .x mira a +z en glTF
        self.assertEqual(pos[1], (1.0, 0.0, 0.0))
        mat = js["materials"][0]
        self.assertEqual((mat["alphaMode"], mat["alphaCutoff"]), ("MASK", 0.01))
        self.assertNotIn("images", js)  # la textura la pone el sitio

    def test_vertice_con_dos_normales_se_parte(self):
        x = xfile.read_x(escribir(ARISTA, "arista.x"))
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "a.glb")
            st = gltf.write_glb(p, frames=x.root, mesh=x.root[0].meshes[0], skin_root=None, animation=None)
            _, _, _, _, _, js = leer_glb(p)
            prim = js["meshes"][0]["primitives"][0]
            uv = accesor(p, js, prim["attributes"]["TEXCOORD_0"])
        # 1 y 2 tienen dos normales: 4 + 2 vértices; los nuevos copian su UV.
        self.assertEqual(st["vertices"], 6)
        self.assertEqual(uv[4:], [(1.0, 0.0), (1.0, 1.0)])


@unittest.skipUnless(HAY_JUEGO, "sin el juego instalado")
class JuegoTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.body = xfile.read_x(os.path.join(SK, "MaleBody.x"))
        cls.female = xfile.read_x(os.path.join(SK, "FemaleBody.x"))
        cls.idle = xfile.read_x(os.path.join(MEDIA, "anims_X", "Bob", "Bob_Idle.x"))

    def _mesh(self, x):
        out = []
        def walk(f):
            out.extend(f.meshes)
            for c in f.children:
                walk(c)
        for f in x.root:
            walk(f)
        return out

    def test_cuerpo_de_hombre(self):
        (m,) = self._mesh(self.body)
        self.assertEqual(len(m.positions), 617)
        self.assertEqual(len(m.faces), 916)
        self.assertEqual(len(m.uvs), 617)
        # 28 bloques SkinWeights, como dice XSkinMeshHeader (nBones). El 31 del plan salía de `grep -c SkinWeights`,
        # que también cuenta tres líneas de las plantillas.
        self.assertEqual(len(m.skins), 28)
        # Cada vértice suma 1 entre todos sus huesos y tiene a lo sumo 3 (XSkinMeshHeader).
        suma, cuantos = [0.0] * 617, [0] * 617
        for s in m.skins:
            for i, w in zip(s.indices, s.weights):
                suma[i] += w
                cuantos[i] += 1
        self.assertTrue(all(abs(x - 1) < 1e-3 for x in suma))
        self.assertLessEqual(max(cuantos), 3)

    def test_idle(self):
        (a,) = self.idle.animations
        self.assertEqual(a.name, "Bob_Idle")
        self.assertEqual(a.ticks_per_second, 4800)
        self.assertEqual(len(a.tracks), 45)
        self.assertEqual(max(k.times[-1] for ks in a.tracks.values() for k in ks), 3200)

    def test_el_cuaternion_es_la_matriz(self):
        # Bip01_Head en Bob_Idle.x: la clave t=0 y el FrameTransformMatrix son la misma rotación (0,0389 rad en Y).
        (a,) = self.idle.animations
        rot = next(k for k in a.tracks["Bip01_Head"] if k.kind == 0)
        self.assertEqual(rot.values[0], (0.999811, -0.0, -0.019464, 0.0))
        de_cuaternion = gltf.quat_matrix(gltf.to_rh_quat(rot.values[0]))
        frame = xfile.find_frame(self.idle, "Bip01_Head")
        de_matriz = gltf.to_rh_matrix(frame.matrix)
        for i in (0, 1, 2, 4, 5, 6, 8, 9, 10):
            self.assertAlmostEqual(de_cuaternion[i], de_matriz[i], delta=1e-3)

    def test_glb_del_cuerpo(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "body.glb")
            st = gltf.write_glb(p, frames=self.body.root, mesh=self._mesh(self.body)[0], skin_root="Bip01",
                                animation=self.idle.animations[0], speed=0.48 * 0.8)
            magic, version, length, real, ctype, js = leer_glb(p)
            with open(p, "rb") as h:
                primero = h.read()
            gltf.write_glb(p, frames=self.body.root, mesh=self._mesh(self.body)[0], skin_root="Bip01",
                           animation=self.idle.animations[0], speed=0.48 * 0.8)
            with open(p, "rb") as h:
                self.assertEqual(h.read(), primero)  # mismos bytes: git no ve cambios
        self.assertEqual((magic, version, ctype), (b"glTF", 2, b"JSON"))
        self.assertEqual(length, real)
        self.assertEqual(st["triangles"], 916)  # 916 caras de 3 índices: 916 triángulos
        self.assertGreaterEqual(st["vertices"], 617)
        self.assertEqual(len(js["skins"]), 1)
        self.assertEqual(len(js["animations"]), 1)
        dur = max(js["accessors"][c["input"]]["max"][0]
                  for c in js["animations"][0]["samplers"])
        self.assertAlmostEqual(dur, 3200 / 4800 / (0.48 * 0.8), places=3)  # 1,736 s
        self.assertLessEqual(st["bytes"], 90_000)  # presupuesto del cuerpo
        # Y arriba: el punto más alto del cuerpo ya convertido está en +Y.
        pos = js["accessors"][js["meshes"][0]["primitives"][0]["attributes"]["POSITION"]]
        self.assertGreater(pos["max"][1], 0.9)

    def test_mujer_solo_rotaciones(self):
        # Con las T del hombre los brazos de la mujer se estiran: de la animación van las rotaciones y la
        # traslación de la raíz (Bip01 y lo de arriba); el largo de cada hueso es el de FemaleBody.x.
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "f.glb")
            st = gltf.write_glb(p, frames=self.female.root, mesh=xfile.main_mesh(self.female), skin_root="Bip01",
                                animation=self.idle.animations[0], speed=SPEED, rotations_only=True)
            _, _, _, _, _, js = leer_glb(p)
        nodos = js["nodes"]
        movidos = {nodos[c["target"]["node"]]["name"] for c in js["animations"][0]["channels"]
                   if c["target"]["path"] == "translation"}
        self.assertLessEqual(movidos, {"Dummy01", "Bip01"})
        brazo = next(n for n in nodos if n["name"] == "Bip01_L_Forearm")
        t, _, _ = gltf.decompose(gltf.to_rh_matrix(xfile.find_frame(self.female, "Bip01_L_Forearm").matrix))
        for a, b in zip(brazo["translation"], t):
            self.assertAlmostEqual(a, b, places=5)
        self.assertLessEqual(st["bytes"], 90_000)

    def test_dos_mallas_toma_la_primera_con_huesos(self):
        x = xfile.read_x(os.path.join(SK, "Clothes", "Bob_Trousers.x"))
        self.assertEqual(len(self._mesh(x)), 2)
        self.assertEqual(xfile.main_mesh(x).name, "Bob_Trousers")

    def test_pieza_con_piel(self):
        # Cada pieza lleva SUS matrices inversas sobre los huesos del cuerpo, por nombre.
        x = xfile.read_x(os.path.join(SK, "Clothes", "Bob_Trousers.x"))
        m = xfile.main_mesh(x)
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "t.glb")
            st = gltf.write_glb(p, frames=x.root, mesh=m, skin_root="Bip01", animation=None)
            _, _, _, _, _, js = leer_glb(p)
            ibm = accesor(p, js, js["skins"][0]["inverseBindMatrices"])
        nombres = [js["nodes"][j]["name"] for j in js["skins"][0]["joints"]]
        cuerpo = {f.name for f in xfile.walk_frames(self.body)}
        self.assertLessEqual(set(nombres), cuerpo)
        pelvis = next(s for s in m.skins if s.bone == "Bip01_Pelvis")
        for a, b in zip(ibm[nombres.index("Bip01_Pelvis")], gltf.to_rh_matrix(pelvis.offset)):
            self.assertAlmostEqual(a, b, places=5)
        self.assertNotIn("animations", js)
        self.assertLessEqual(st["bytes"], 25_000)

    def test_pieza_solo_con_sus_huesos(self):
        # M_Hair_Short.x trae Frames que el cuerpo no tiene (Bip01_HeadNub…): el sitio no podría cambiarlos por los
        # del cuerpo. La pieza lleva sólo lo que pesa (la cabeza) y el camino hasta Bip01.
        x = xfile.read_x(os.path.join(SK, "Hair", "M_Hair_Short.x"))
        self.assertIsNotNone(xfile.find_frame(x, "Bip01_HeadNub"))
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "h.glb")
            st = gltf.write_glb(p, frames=x.root, mesh=xfile.main_mesh(x), skin_root="Bip01", animation=None)
            _, _, _, _, _, js = leer_glb(p)
        nombres = [js["nodes"][j]["name"] for j in js["skins"][0]["joints"]]
        self.assertEqual(nombres, ["Bip01", "Bip01_Pelvis", "Bip01_Spine", "Bip01_Spine1", "Bip01_Neck", "Bip01_Head"])
        self.assertEqual(st["joints"], 6)

    def test_pieza_fija(self):
        x = xfile.read_x(os.path.join(ST, "Clothes", "M_BaseballCap.x"))
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "g.glb")
            st = gltf.write_glb(p, frames=x.root, mesh=xfile.main_mesh(x), skin_root=None, animation=None,
                                static_bone="Bip01_Head")
            _, _, _, _, _, js = leer_glb(p)
        self.assertNotIn("skins", js)
        self.assertEqual(js["nodes"][js["scenes"][0]["nodes"][0]]["extras"], {"bone": "Bip01_Head"})
        self.assertEqual(st["joints"], 0)
        self.assertLessEqual(st["bytes"], 25_000)

    def test_lee_todos(self):
        # Los 1.174 .x de Skinned y Static: cero errores (si un parche trae algo nuevo, que salte acá).
        files = sorted(glob.glob(os.path.join(SK, "**", "*.x"), recursive=True)
                       + glob.glob(os.path.join(ST, "**", "*.x"), recursive=True))
        self.assertGreater(len(files), 1000)
        errores = []
        for f in files:
            try:
                xfile.read_x(f)
            except xfile.XError as e:
                errores.append(str(e))
        self.assertEqual(errores, [])


if __name__ == "__main__":
    unittest.main()
