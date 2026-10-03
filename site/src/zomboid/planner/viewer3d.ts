/**
 * El visor 3D del sobreviviente del Planificador de Project Zomboid (2026-10-01). Sólo navegador: `Survivor.tsx` lo pide
 * con `import()` cuando tocás "Ver en 3D", y three.js viaja en su propio chunk (`manualChunks` en vite.config.ts). Nadie
 * más lo importa: ni la cáscara, ni vendor, ni el chunk del Planificador.
 *
 * **Cómo se arma.** El cuerpo de cada sexo trae el esqueleto y el idle. Cada pieza de ropa es un `.glb` aparte:
 * - las que se deforman con el cuerpo (pantalones, camisas, el pelo) traen su propio esqueleto con los mismos nombres de
 *   huesos; acá se les da el del cuerpo, hueso por hueso por nombre, con sus propias matrices de bind. Es la misma cuenta
 *   que hace el afiche (`raster.py`), así el 3D y la imagen coinciden;
 * - las fijas (anteojos, gorras) se cuelgan del hueso que dice `bone`.
 * Los materiales vienen sin textura: la textura se carga aparte (la misma prenda puede ir con otra según la profesión) y
 * se le pone a mano, con `flipY = false` (glTF) y en sRGB, al más cercano para que se vea pixelado como en el juego.
 *
 * **Lo bajado queda.** Cada `.glb` y cada textura se piden una vez por ruta (`Map`): cambiar de profesión o de sexo con
 * el 3D abierto baja sólo lo que falta y cambia la ropa sin rearmar la escena.
 *
 * **La cámara** es la del afiche en perspectiva: de frente con la misma vuelta (20°), encuadrando la caja del cuerpo
 * (no la de la ropa: así no salta al cambiar de profesión). Arrastrar gira sólo alrededor del eje vertical; sin zoom ni
 * paneo. En el celular, arrastrar para arriba o abajo mueve la página (`touch-action: pan-y`).
 *
 * **Limpieza.** El bucle se para cuando el canvas sale de la pantalla o la pestaña se oculta; `dispose()` libera todo y
 * suelta el contexto WebGL (los navegadores tienen un tope de contextos vivos).
 */
import {
  AnimationMixer,
  Box3,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  NearestFilter,
  Object3D,
  PerspectiveCamera,
  Scene,
  Skeleton,
  SkinnedMesh,
  SRGBColorSpace,
  TextureLoader,
  Timer,
  Vector3,
  WebGLRenderer,
  type Bone,
  type Material,
  type MeshStandardMaterial,
  type Texture,
} from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { bodyFor, type Outfit, type Sex } from "./outfit";

export interface ViewerHandle {
  /** Cambia la ropa (y el cuerpo, si cambia el sexo) bajando sólo lo que falta. */
  setOutfit(o: Outfit, sex: Sex): Promise<void>;
  /** Gira al sobreviviente `deg` grados; positivo, para que mire más a la izquierda de quien lo ve. */
  turn(deg: number): void;
  /** Vuelve a la vista del principio (la del afiche). */
  reset(): void;
  dispose(): void;
}

/** Si el navegador puede dibujar WebGL: vive en `webgl.ts`, que `Survivor` pregunta antes de bajar three. */
export { supportsWebGL } from "./webgl";

/** Lo mínimo de una malla para liberarla (así `freeMeshes` se prueba sin WebGL). */
interface Freeable {
  geometry: { dispose(): void };
  material: { dispose(): void } | { dispose(): void }[];
}

/**
 * Libera las geometrías y los materiales de `meshes`, cada uno una sola vez (una malla puede aparecer por dos caminos:
 * su escena y la caché de piezas). Devuelve cuántos liberó de cada cosa.
 */
export function freeMeshes(meshes: Iterable<Freeable>): { geometries: number; materials: number } {
  const done = new Set<{ dispose(): void }>();
  let geometries = 0;
  let materials = 0;
  for (const m of meshes) {
    if (!done.has(m.geometry)) {
      done.add(m.geometry);
      m.geometry.dispose();
      geometries++;
    }
    for (const mat of Array.isArray(m.material) ? m.material : [m.material])
      if (!done.has(mat)) {
        done.add(mat);
        mat.dispose();
        materials++;
      }
  }
  return { geometries, materials };
}

/** La vuelta de la vista de entrada, la misma que el afiche (`POSTER_YAW = -20` en model3d.py, el cuerpo girado). */
const FRONT = (20 * Math.PI) / 180;
/** Apenas desde arriba: el ángulo polar queda fijo, sólo se gira de costado. */
const POLAR = Math.PI / 2 - 0.1;
const FOV = 30;
/**
 * El encuadre del afiche (`raster.render`, margen 0,08): el alto visible es 1,2 veces el del cuerpo y el centro queda
 * 0,02 del alto por encima del de la caja (más aire arriba, por los sombreros). Así, al pasar del afiche al 3D, el
 * sobreviviente queda del mismo tamaño y en el mismo lugar.
 */
const VIEW_H = 1.2;
const LIFT = 0.02;
/**
 * La luz del afiche (`raster.py`: 0,55 de ambiente + 0,45 difusa desde arriba a la izquierda, del lado de quien mira).
 * three divide la difusa por π (Lambert), así que las intensidades van por π para dar lo mismo.
 */
const AMBIENT = 0.55 * Math.PI;
const DIFFUSE = 0.45 * Math.PI;
const LIGHT_DIR = new Vector3(-0.35, 0.45, 0.82);

/** Una malla de un `.glb` de ropa, lista para colgarse del cuerpo. */
interface Part {
  mesh: Mesh;
  /** Para las que se deforman: los nombres de sus huesos y sus propios huesos (si el cuerpo no tiene uno, se usa ése, quieto). */
  names?: string[];
  own?: Bone[];
  inverses?: Skeleton["boneInverses"];
  /** El esqueleto armado acá con los huesos del cuerpo (se libera al rearmarlo). */
  skel?: Skeleton;
}

interface Body {
  root: Object3D;
  mesh: SkinnedMesh;
  bones: Map<string, Bone>;
  mixer: AnimationMixer;
  box: Box3;
}

export async function mountViewer(
  canvas: HTMLCanvasElement,
  o: Outfit,
  sex: Sex,
  opts: { reducedMotion: boolean; onReady(): void; onError(e: unknown): void },
): Promise<ViewerHandle> {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 3 / 4, 0.05, 50);
  scene.add(new HemisphereLight(0xffffff, 0xffffff, AMBIENT));
  // La difusa va pegada a la cámara: al girar, la luz sigue viniendo del lado de quien mira, como en el afiche.
  const sun = new DirectionalLight(0xffffff, DIFFUSE);
  sun.position.copy(LIGHT_DIR);
  camera.add(sun, sun.target);
  scene.add(camera);

  const controls = new OrbitControls(camera, canvas);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.enableDamping = false;
  controls.minPolarAngle = controls.maxPolarAngle = POLAR;
  // OrbitControls pone `none`: con `pan-y`, arrastrar de costado gira y arrastrar para arriba o abajo mueve la página.
  canvas.style.touchAction = "pan-y";

  const loader = new GLTFLoader();
  const texLoader = new TextureLoader();
  const gltfs = new Map<string, Promise<GLTF>>();
  const textures = new Map<string, Promise<Texture>>();
  const bodies = new Map<Sex, Promise<Body>>();
  const parts = new Map<string, Promise<Part[]>>();
  /** Todo lo que se cargó, resuelto, para liberarlo al final. */
  const loaded: GLTF[] = [];
  const loadedTex: Texture[] = [];
  /**
   * Todas las piezas preparadas. Una prenda que te sacaste al cambiar de profesión queda fuera de todo grafo (ya no está
   * en su escena ni en el cuerpo): sólo se la encuentra acá para liberarla.
   */
  const allParts: Part[] = [];

  const gltf = (url: string): Promise<GLTF> => {
    let p = gltfs.get(url);
    if (!p) {
      p = loader.loadAsync(url).then((g) => (loaded.push(g), g));
      // Si falla (la red), que el próximo intento lo vuelva a pedir.
      p.catch(() => gltfs.delete(url));
      gltfs.set(url, p);
    }
    return p;
  };
  const texture = (url: string): Promise<Texture> => {
    let p = textures.get(url);
    if (!p) {
      p = texLoader.loadAsync(url).then((t) => {
        t.flipY = false;
        t.colorSpace = SRGBColorSpace;
        t.magFilter = NearestFilter;
        t.needsUpdate = true;
        loadedTex.push(t);
        return t;
      });
      p.catch(() => textures.delete(url));
      textures.set(url, p);
    }
    return p;
  };

  const body = (s: Sex): Promise<Body> => {
    let p = bodies.get(s);
    if (!p) {
      p = gltf(bodyFor(s)).then((g) => {
        const root = g.scene;
        const bones = new Map<string, Bone>();
        let mesh: SkinnedMesh | null = null;
        root.traverse((x) => {
          if ((x as Bone).isBone) bones.set(x.name, x as Bone);
          if ((x as SkinnedMesh).isSkinnedMesh && !mesh) mesh = x as SkinnedMesh;
          x.frustumCulled = false;
        });
        if (!mesh) throw new Error(`sin malla en ${bodyFor(s)}`);
        // La caja en reposo, antes de que el idle mueva nada: con ella se encuadra.
        root.updateMatrixWorld(true);
        const box = new Box3().setFromObject(root);
        const mixer = new AnimationMixer(root);
        if (g.animations[0]) mixer.clipAction(g.animations[0]).play();
        // Con movimiento reducido queda quieto en el primer cuadro del idle.
        mixer.update(0);
        return { root, mesh, bones, mixer, box };
      });
      p.catch(() => bodies.delete(s));
      bodies.set(s, p);
    }
    return p;
  };

  const part = (url: string): Promise<Part[]> => {
    let p = parts.get(url);
    if (!p) {
      p = gltf(url).then((g) => {
        g.scene.updateMatrixWorld(true);
        const out: Part[] = [];
        g.scene.traverse((x) => {
          if (!(x as Mesh).isMesh) return;
          const mesh = x as Mesh;
          mesh.frustumCulled = false;
          if ((mesh as SkinnedMesh).isSkinnedMesh) {
            const sm = mesh as SkinnedMesh;
            out.push({ mesh, names: sm.skeleton.bones.map((b) => b.name), own: sm.skeleton.bones.slice(), inverses: sm.skeleton.boneInverses });
          } else out.push({ mesh });
        });
        allParts.push(...out);
        return out;
      });
      p.catch(() => parts.delete(url));
      parts.set(url, p);
    }
    return p;
  };

  let current: Body | null = null;
  /** Si la cámara ya se puso en su lugar (la primera vez va a la vuelta del afiche; después conserva la que tenga). */
  let framed = false;
  let worn: Part[] = [];
  let seq = 0;
  let disposed = false;

  /** Cámara a la distancia que encuadra la caja del cuerpo, conservando la vuelta que tenga. */
  const frame = (box: Box3) => {
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    const h = size.y * VIEW_H;
    const w = Math.max(size.x, size.z) * VIEW_H;
    const t = Math.tan(((FOV / 2) * Math.PI) / 180);
    const d = Math.max(h / 2 / t, w / 2 / (t * camera.aspect));
    const theta = framed ? controls.getAzimuthalAngle() : FRONT;
    framed = true;
    controls.target.set(center.x, center.y + size.y * LIFT, center.z);
    camera.position.set(
      controls.target.x + d * Math.sin(POLAR) * Math.sin(theta),
      controls.target.y + d * Math.cos(POLAR),
      controls.target.z + d * Math.sin(POLAR) * Math.cos(theta),
    );
    controls.update();
  };

  const dress = (b: Body, list: { piece: Outfit["pieces"][number]; parts: Part[]; tex: Texture }[], skin: Texture) => {
    for (const p of worn) p.mesh.removeFromParent();
    worn = [];
    if (current !== b) {
      current?.root.removeFromParent();
      scene.add(b.root);
      current = b;
      // El otro sexo tiene otra caja: se vuelve a encuadrar sin perder la vuelta.
      frame(b.box);
    }
    setMap(b.mesh.material, skin);
    for (const { piece, parts: ps, tex } of list)
      for (const p of ps) {
        setMap(p.mesh.material, tex);
        if (p.names && p.own && p.inverses) {
          const bones = p.names.map((n, i) => b.bones.get(n) ?? p.own![i]);
          p.skel?.dispose();
          p.skel = new Skeleton(bones, p.inverses);
          (p.mesh as SkinnedMesh).bind(p.skel, (p.mesh as SkinnedMesh).bindMatrix);
          b.root.add(p.mesh);
        } else (piece.bone ? (b.bones.get(piece.bone) ?? b.root) : b.root).add(p.mesh);
        worn.push(p);
      }
  };

  const setOutfit = async (next: Outfit, s: Sex): Promise<void> => {
    const my = ++seq;
    const wanted = [...next.pieces, ...(next.hair ? [next.hair] : [])];
    const [b, skin, list] = await Promise.all([
      body(s),
      texture(next.skin),
      Promise.all(wanted.map(async (piece) => ({ piece, parts: await part(piece.glb), tex: await texture(piece.tex) }))),
    ]);
    // Otro cambio llegó mientras se bajaba éste: gana el último.
    if (my !== seq || disposed) return;
    dress(b, list, skin);
  };

  // ---------- El bucle ----------

  const timer = new Timer();
  const draw = (time: number) => {
    timer.update(time);
    const dt = Math.min(timer.getDelta(), 0.1);
    if (!opts.reducedMotion) current?.mixer.update(dt);
    renderer.render(scene, camera);
  };
  let onScreen = true;
  let running = false;
  const sync = () => {
    const run = !disposed && onScreen && !document.hidden;
    if (run === running) return;
    running = run;
    if (run) timer.reset(); // que el idle no salte lo que estuvo parado
    renderer.setAnimationLoop(run ? draw : null);
  };
  const io = new IntersectionObserver((es) => {
    onScreen = es.some((e) => e.isIntersecting);
    sync();
  });
  io.observe(canvas);
  document.addEventListener("visibilitychange", sync);

  const box = canvas.parentElement ?? canvas;
  const resize = () => {
    const w = box.clientWidth;
    const h = box.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (current) frame(current.box);
    if (!running && current) renderer.render(scene, camera);
  };
  const ro = new ResizeObserver(resize);
  ro.observe(box);

  /** Si el contexto se perdió mientras se armaba: el armado corta con error en vez de avisar que está listo. */
  let lostCtx = false;
  const lost = (e: Event) => {
    e.preventDefault();
    lostCtx = true;
    if (!disposed) opts.onError(new Error("se perdió el contexto WebGL"));
  };
  canvas.addEventListener("webglcontextlost", lost);

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    renderer.setAnimationLoop(null);
    io.disconnect();
    ro.disconnect();
    document.removeEventListener("visibilitychange", sync);
    canvas.removeEventListener("webglcontextlost", lost);
    controls.dispose();
    for (const b of bodies.values()) b.then((x) => x.mixer.stopAllAction()).catch(() => undefined);
    for (const p of parts.values()) p.then((ps) => ps.forEach((x) => x.skel?.dispose())).catch(() => undefined);
    // Las mallas de cada escena cargada (el cuerpo, con lo puesto) y las de todas las piezas, también las que te sacaste.
    const meshes: Mesh[] = allParts.map((x) => x.mesh);
    for (const g of loaded) g.scene.traverse((x) => (x as Mesh).isMesh && meshes.push(x as Mesh));
    freeMeshes(meshes);
    for (const t of loadedTex) t.dispose();
    timer.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  };

  try {
    resize();
    await setOutfit(o, sex);
    if (lostCtx) throw new Error("se perdió el contexto WebGL mientras se armaba");
    resize();
    renderer.render(scene, camera);
    sync();
    opts.onReady();
  } catch (e) {
    dispose();
    throw e;
  }

  function handle(): ViewerHandle {
    return {
      setOutfit,
      turn(deg) {
        // Girar el cuerpo para un lado es llevar la cámara para el otro: `rotateLeft` resta del ángulo de la cámara.
        controls.rotateLeft((deg * Math.PI) / 180);
        controls.update();
      },
      reset() {
        controls.rotateLeft(controls.getAzimuthalAngle() - FRONT);
        controls.update();
      },
      dispose,
    };
  }
  return handle();
}

/** Le pone la textura al material (los `.glb` vienen sin ella) y avisa que cambió. */
function setMap(material: Material | Material[], tex: Texture) {
  for (const m of Array.isArray(material) ? material : [material]) {
    const std = m as MeshStandardMaterial;
    if (std.map === tex) continue;
    std.map = tex;
    std.needsUpdate = true;
  }
}
