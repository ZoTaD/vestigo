/**
 * Si el navegador puede dibujar WebGL (2026-10-01). Va aparte de `viewer3d.ts` para preguntarlo **antes** del
 * `import()`: un navegador sin WebGL no baja three para enterarse. `viewer3d.ts` lo reexporta (su contrato).
 */
export function supportsWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") ?? c.getContext("webgl");
    if (!gl) return false;
    // El de prueba no se queda con un contexto vivo hasta que pase el recolector: los navegadores tienen un tope.
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}
