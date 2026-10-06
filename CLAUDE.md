# Vestigo

Sitio de datos de juegos (https://vestigo.gg): Vite + React en `site/`, datos de
cada juego en `games/<juego>/data`, publicado en Netlify desde `main`.
Se escribe en español (código, comentarios, commits y docs).

## Rendimiento: reglas para cada página y cada juego nuevo

Salen del plan `docs/plans/2026-10-06-optimizacion-sitio.md`, medido en
producción. Antes de publicar un juego o una pestaña nueva:

1. **Medir.** Sumar las páginas nuevas a `PAGES` en `site/scripts/perf.mjs` y
   correrlo contra `vite preview`. Presupuesto por página al abrir, en frío:
   - ≤ 250 pedidos y ≤ 200 imágenes pedidas.
   - ≤ 3.000 nodos de DOM.
   - Sin errores de JS ni respuestas 4xx/5xx.
2. **Listas largas con `LazyRows`** (`site/src/LazyRows.tsx`). Toda lista o
   tabla que pueda pasar de ~150 filas se dibuja de a tandas: `tag="li"` en una
   `<ul>`, `tag="tr"` en un `<tbody>` y `div` en una grilla. `rowHeight` es el
   alto real de la fila, medido en el navegador. `eager` va sólo en la primera
   lista de la página. En el prerender dibuja todo, así que el SEO no cambia.
3. **Imágenes de lista**: `loading="lazy"`, `decoding="async"` y tamaño fijo
   (`width`/`height` o una caja de tamaño fijo), así no corren la página al
   llegar. Sólo la imagen principal de arriba de una ficha va sin `lazy`.
4. **Datos**: nunca en el chunk de entrada. Cada pestaña importa los suyos con
   `import()`; los archivos grandes van partidos (como las fichas de Zomboid en
   `store.ts`) para que una ficha baje sólo su pedazo.
5. **Netlify**: sumar `games/<juego>/data` al `ignore` de `netlify.toml`, si
   no, las publicaciones automáticas no reconstruyen el sitio.
6. **Build**: el tope de memoria en Netlify es 6 GB (`NODE_OPTIONS` en
   `netlify.toml`). Medir el pico de RAM y el tiempo de `npm run build` antes y
   después de sumar un juego, y anotarlo en el plan del juego.
