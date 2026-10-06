# Optimización del sitio antes de Rust

Fecha: 2026-10-06 · Pedido por ZoTaD: que todo el sitio cargue rápido, que
Netlify construya rápido y que quede limpio para los próximos juegos.

Rama: `claude/deadlock-patch-tweet-ebd02e`. No se mergea a `main` sin que
ZoTaD lo pida.

## Medido antes de empezar (producción, 2026-10-06)

| Página | Pedidos | `<img>` | Nodos DOM | Hasta quedar quieta |
|---|---|---|---|---|
| Zomboid · Recetas | 982 (944 imágenes) | 1.133 | ~4.000 | 23,5 s |
| Zomboid · Objetos | 117 | 3.823 | ~16.000 | 4 s |
| Zomboid · Fabricación | 62 | 10 | 266 | 1,5 s |

- Datos: Zomboid 619 JSON (31 MB), PoE2 9,4 MB, Valheim 5,7 MB, Deadlock
  2,6 MB, D2R 1,6 MB. Todo entra al bundle por `import`/`import.meta.glob`.
- `public/`: 20.454 archivos (Zomboid 73 MB, 3.459 íconos sueltos).
- Ninguna lista usa virtualización ni render diferido. 70 de 158 `<img>` no
  llevan `loading`, 156 no llevan `decoding="async"`, 33 sin tamaño.
- Build local (4 núcleos): `tsc -b` 26 s + `vite build` 149 s, pico de
  **5,8 GB de RAM** (el tope en Netlify es 6 GB). Del build: prerender de
  22.222 rutas 76 s, imágenes OG 18 s. `dist/`: 587 MB y 44.145 archivos, de
  los que 22.224 son HTML (345 MB).
- **Cada deploy cambia los 22 mil HTML**: todos apuntan al `index-<hash>.js`,
  y ese hash cambia con cualquier dato. Netlify sube sólo lo que cambió, así que
  hoy sube ~345 MB en cada publicación automática.

## Pasos

Cada paso: medir antes y después, tests + `tsc -b` + `vite build`, commit y
push a la rama.

1. [x] **Script de medición** (`site/scripts/perf.mjs`): recorre las páginas
   pesadas de cada juego con Playwright contra `vite preview` y anota pedidos,
   imágenes, nodos y tiempo. Sirve de antes/después y de base para CI.
2. [x] **Render diferido de listas largas** (`src/LazyRows.tsx`): un componente que monta cada
   bloque (categoría) recién cuando se acerca a la pantalla, con alto
   reservado. Primero Zomboid Objetos y Recetas; después D2R (Únicos, Bases,
   Sets, Palabras rúnicas), PoE2 Enciclopedia, Valheim, Deadlock Objetos.
3. [x] **Imágenes**: `loading="lazy"`, `decoding="async"` y tamaño en todos
   los `<img>` de listas.
4. [x] **Build**: medido (ver arriba). Pendiente: que un deploy de datos no
   cambie el HTML de los otros juegos (entrada con nombre fijo o similar;
   primero medir cuántos HTML cambian con un cambio de datos), bajar la RAM y
   ver si el prerender se puede acelerar.
5. [—] **Datos fuera del bundle** (descartado por ahora: con `json.stringify` el
   build bajó a 93 s y 2,3 GB, y los datos ya bajan por pestaña. Revisar si
   un juego nuevo vuelve a subir la memoria) (el cambio grande, por juego, empezando por
   Zomboid): los JSON pasan a archivos estáticos con nombre con hash y se piden
   con `fetch`. Un deploy de sólo datos deja de recompilar el JS.
6. [—] **Íconos**: sprites descartados: con `LazyRows` ninguna página medida
   pasa de ~160 pedidos.
7. [x] **Presupuesto** (local, `npm run perf`; no en CI por los minutos): el script del paso 1 falla si una página pasa de
   N pedidos o N nodos. Así Rust entra con límites.

## Bitácora

- 2026-10-06: plan escrito, medición base de producción.
- 2026-10-06: `scripts/perf.mjs` y base local en `perf-2026-10-06-antes.json`.
- 2026-10-06: `LazyRows` en Zomboid Objetos y Recetas, Valheim (tablas) y D2R
  Únicos. Medido en local:
  - Objetos: 6.167 ms, 3.147 pedidos, 15.967 nodos → 1.537 ms, 144, 1.235.
  - Recetas: 1.920 ms, 909 pedidos, 4.006 nodos → 922 ms, 113, 684.
  - Bajando hasta el final se dibujan todas las filas; el alto estimado erra
    1,3–1,5 %. En el prerender dibuja todo (test `lazyRows.test.ts`).
  - Falta medir el alto de fila real de Valheim (`VH_ROW`) y D2R (`D2_CARD`).
- 2026-10-06: `decoding="async"` en todos los `<img loading="lazy">`.
- Ya fallaba antes de empezar, no es de este plan:
  `test/deadlockBuilds.test.ts` ("no publican ningún héroe que no exista",
  39 > 38).
- 2026-10-06: medido con dos publicaciones reales seguidas de la tier list
  (`62c32ae2` → `ebb42db7`): cambian 22.221 de 22.222 HTML; sin contar los
  hashes, 485 (Deadlock y la raíz). Assets nuevos: 40 JS, ningún CSS.
  Arreglo: el HTML carga `/app.js` (nombre fijo) con la entrada y los
  `modulepreload` de cada pestaña; la pestaña va en `<html data-pre>`.
- 2026-10-06: `app.js` verificado: con el mismo par de publicaciones cambian
  485 HTML (antes 22.221). Todas las páginas cargan sin errores; cuesta un
  pedido más (`app.js`, 10 KB, se revalida).
- 2026-10-06: `json: { stringify: true }` en Vite. `vite build` 149 s → 93 s,
  pico de RAM 5,8 GB → 2,3 GB, prerender 76 s → 55 s. Los JS comprimidos
  pesan un 1 % más (8,49 → 8,59 MB en 913 archivos).
- 2026-10-06: `npm run perf` (presupuesto de `CLAUDE.md`): todas las páginas
  medidas dentro del presupuesto. No va en CI por los minutos de Actions.
