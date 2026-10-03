/**
 * Un intento de armar el 3D del sobreviviente (2026-10-01), aparte de `Survivor.tsx` para poder probarlo sin navegador
 * (`test/zomboidSurvivor.test.ts`, con un visor de mentira).
 *
 * **Cada intento es dueño de su visor.** Si el contexto WebGL se pierde mientras se arma (`onError` antes de que
 * `mountViewer` vuelva), o si el panel se fue, o si empezó otro intento, el visor que termina de armarse se libera solo
 * y nunca pone el modo en "3d": si no, quedaba un renderer con su bucle andando sobre un canvas vacío.
 */
import type { Outfit, Sex } from "./outfit";
import type { ViewerHandle } from "./viewer3d";

export type Mode = "poster" | "loading" | "3d" | "failed" | "nowebgl";

export interface Start3d {
  /** `() => import("./viewer3d")`. */
  load: () => Promise<{ mountViewer: typeof import("./viewer3d").mountViewer }>;
  canvas: () => HTMLCanvasElement | null;
  /** El atuendo y el sexo de ahora (pueden cambiar mientras se arma). */
  want: () => { outfit: Outfit; sex: Sex };
  /** Si este intento sigue siendo el que vale: el panel montado y ningún intento más nuevo. */
  current: () => boolean;
  reducedMotion: boolean;
  setMode: (m: Mode) => void;
  /** El visor ya armado y válido. */
  adopt: (h: ViewerHandle) => void;
  /** Lo que falló después de adoptado (un cambio de ropa, el contexto perdido): el panel lo libera y vuelve al afiche. */
  fail: () => void;
}

export async function start3d(o: Start3d): Promise<void> {
  let dead = false;
  let adopted = false;
  const die = () => {
    if (dead) return;
    dead = true;
    // Un intento adoptado que ya no vale (empezó otro, o el panel se fue) no toca nada: su visor ya lo soltó quien
    // empezó el nuevo, y `fail` tumbaría el de ahora.
    if (adopted) {
      if (o.current()) o.fail();
    } else if (o.current()) o.setMode("failed");
  };
  try {
    const v = await o.load();
    const el = o.canvas();
    if (!o.current() || !el) return;
    const start = o.want();
    const h = await v.mountViewer(el, start.outfit, start.sex, {
      reducedMotion: o.reducedMotion,
      onReady: () => {
        if (!dead && o.current()) o.setMode("3d");
      },
      onError: die,
    });
    if (dead || !o.current()) return h.dispose();
    adopted = true;
    o.adopt(h);
    // Si cambiaste de profesión o de sexo mientras se armaba, se viste con lo de ahora.
    const now = o.want();
    if (now.outfit.poster !== start.outfit.poster) h.setOutfit(now.outfit, now.sex).catch(die);
  } catch {
    die();
  }
}
