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
- Build: ver "Build" abajo.

## Pasos

Cada paso: medir antes y después, tests + `tsc -b` + `vite build`, commit y
push a la rama.

1. [ ] **Script de medición** (`site/scripts/perf.mjs`): recorre las páginas
   pesadas de cada juego con Playwright contra `vite preview` y anota pedidos,
   imágenes, nodos y tiempo. Sirve de antes/después y de base para CI.
2. [ ] **Render diferido de listas largas**: un componente que monta cada
   bloque (categoría) recién cuando se acerca a la pantalla, con alto
   reservado. Primero Zomboid Objetos y Recetas; después D2R (Únicos, Bases,
   Sets, Palabras rúnicas), PoE2 Enciclopedia, Valheim, Deadlock Objetos.
3. [ ] **Imágenes**: `loading="lazy"`, `decoding="async"` y tamaño en todos
   los `<img>` de listas.
4. [ ] **Build**: medir qué parte tarda (transformación, prerender, imágenes
   OG, sitemap) y recortar lo que sobre.
5. [ ] **Datos fuera del bundle** (el cambio grande, por juego, empezando por
   Zomboid): los JSON pasan a archivos estáticos con nombre con hash y se piden
   con `fetch`. Un deploy de sólo datos deja de recompilar el JS.
6. [ ] **Íconos**: evaluar sprites por categoría para Zomboid (3.459 archivos).
7. [ ] **Presupuesto en CI**: el script del paso 1 falla si una página pasa de
   N pedidos o N nodos. Así Rust entra con límites.

## Bitácora

- 2026-10-06: plan escrito, medición base de producción.
