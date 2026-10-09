# Rust — etapa 2: Electricidad, Granjas, Monumentos, Parches y Servidor (2026-10-09)

Sigue a `docs/design/2026-10-05-rust.md` (etapa 1, publicada el 8/10). Misma estética A "Inventario", mismas reglas
de la casa y las 8 reglas de rendimiento de `CLAUDE.md`.

**Público:** inglés primero; español a la par, sin venderlo ("en español") en la UI, títulos ni SEO. Arreglo de paso:
el encabezado de la Portada en ES deja de decir "Guía de Rust en español" y pasa a "Guía de Rust".

**Datos de partida:** la caché del cliente en `games/rust/cache/` (no versionada; ver su README) del build
25797961. El juego ya no está instalado. Lo que el cliente no trae sale del código decompilado público
(github.com/MillionthOdin16/RustChangelog, el que ya usa `world.py`) y se anota a mano en archivos aparte, con
fuente en un comentario.

## Sub-proyectos y orden

Cada uno tiene su plan, se conecta en localhost apenas anda y se publica en cuanto está verde y medido.

| # | Sub-proyecto | Pista |
|---|---|---|
| 1 | Electricidad: editor y simulador (herramienta estrella) | A |
| 2 | Granjas + calculadora de genética | B |
| 3 | Parches | B |
| 4 | Monumentos (incluye la red de Power Trip) | B |
| 5 | Servidor | B |
| 6 | Agua en el editor | A |
| 7 | Industrial en el editor | A |

Pista A y pista B corren en paralelo (máximo 2 agentes), cada una en su worktree desde `feat/rust`.

## Direcciones nuevas

| Pestaña | EN | ES |
|---|---|---|
| electricidad (editor) | `/en/rust/electricity` | `/es/rust/electricidad` |
| circuito listo | `/en/rust/electricity/<slug>` | `/es/rust/electricidad/<slug-es>` |
| granjas | `/en/rust/farming` | `/es/rust/granjas` |
| genética | `/en/rust/farming/genetics` | `/es/rust/granjas/genetica` |
| planta | `/en/rust/farming/<planta>` | `/es/rust/granjas/<planta-es>` |
| monumentos | `/en/rust/monuments` | `/es/rust/monumentos` |
| monumento | `/en/rust/monuments/<slug>` | `/es/rust/monumentos/<slug-es>` |
| parches | `/en/rust/patches` | `/es/rust/parches` |
| servidor | `/en/rust/server` | `/es/rust/servidor` |

---

## 1. Electricidad (decidido con ZoTaD el 8-9/10)

**Decisiones:** editor libre completo (no sólo biblioteca); guardado en link + navegador (galería pública quizás
más adelante); motor pensado para las tres redes pero se publica electricidad primero; simulación en tiempo real por
ticks con modo "explicar"; estilo A+B (casilleros de inventario, nombres de enchufe al seleccionar o pasar el
mouse); en el celular sólo mirar y probar; lienzo con React Flow (`@xyflow/react`, MIT).

### Piezas

1. **Datos** — `games/rust/tools/electricity.py` lee la caché y escribe `games/rust/data/electricity.json`: cada
   componente colocable de electricidad con shortname, nombre en/es, ícono, clase del juego, enchufes (nombre
   `niceName`, tipo, lado, índice), consumo, generación, capacidad, salida máxima, parámetros configurables con su
   rango (temporizador, sensor sísmico, contador, HBHF…). Lo que el juego calcula en código va en
   `games/rust/tools/electricity_overrides.py` con la fuente. Test: ningún componente sin consumo o generación
   definida; los números conocidos (panel solar 20, molino 150, rueda de agua 30, generador 40, baterías
   15/50/100 de salida y 400/9.000/24.000 rWm) se verifican.
2. **Motor** — `site/src/rust/electric/engine/`, TypeScript puro sin React:
   - modelo: `Circuit { parts, wires }`, cada parte con tipo de componente, posición y configuración; cada cable
     de enchufe de salida a enchufe de entrada, con tipo de red (eléctrica ahora; agua e industrial después).
   - un comportamiento por clase del juego (`behaviors/`), copiando la lógica del decompilado: cómo calcula sus
     salidas a partir de sus entradas, cuánto consume, cómo reparte, cómo carga/descarga, sus estados internos
     (temporizador, memoria, contador). El reparto de energía sigue al juego tal cual (no se asume "tira" ni
     "empuja": lo dice el código).
   - `tick(state, dt)` al ritmo de actualización de IO del juego; hora del día para el solar y viento para el
     molino, con valores por defecto fijos y ajustables.
   - `explain(state, partId | wireId)` devuelve el porqué en frases armadas con datos (EN/ES), no texto libre.
   - validación: casos de prueba tomados de circuitos conocidos (wiki, videos, decompilado) con el resultado
     esperado; cada comportamiento con sus tests.
3. **Editor** — `site/src/rust/electric/editor/`: React Flow con nodos casillero propios; paleta por categoría con
   buscador; inspector a la derecha con datos, configuración editable y "explicar"; barra con play/pausa, x1/x5/x20,
   hora del día; deshacer/rehacer propio; borrar, duplicar, seleccionar varios; avisos de errores (enchufe de tipo
   distinto, ciclo sin sentido, consumidor sin energía) como texto en el inspector y tinte en el casillero (sin
   bordes de color). Lista de materiales del circuito (componentes + cables) con costo usando las recetas de
   Objetos. En el celular: sólo lectura (abrir, tocar interruptores, play, inspector).
4. **Guardado** — `codec.ts`: versión + partes + cables en binario compacto, comprimido (`CompressionStream`
   deflate-raw) y en base64url dentro del `#hash` (no viaja al servidor). Autoguardado en `localStorage` con
   try/catch. Un link de versión vieja sigue abriendo.
5. **Circuitos listos** — `site/src/rust/electric/circuits.ts` (o JSON): 12-20 circuitos con slug en/es, título,
   explicación corta en/es y el circuito codificado. Mínimo: torreta con batería solar, SAM, puerta con lector y
   botón, trampa con HBHF, luces con temporizador día/noche, sistema con respaldo de batería, compuertas AND/OR/XOR
   de ejemplo, celda de memoria, contador, sensor sísmico de alarma, generador a combustible con interruptor
   inteligente. Cada uno tiene página prerenderizada (título "Rust <circuito> circuit" / "Circuito de <…> en Rust")
   que abre el editor con ese circuito cargado.
6. **Fichas de Objetos** — las fichas de componentes eléctricos suman un bloque "Electricidad" (enchufes, consumo,
   generación) con enlace "Probar en el editor".

### Rendimiento
React Flow y el motor sólo se cargan en la pestaña Electricidad (`import()`); medir con `npm run perf` la página del
editor vacío y la de un circuito listo grande.

---

## 2. Granjas + Genética

- **Granjas** (`/farming`): las 14 plantas con ficha: 8 etapas con duración y rendimiento, agua, luz, temperatura
  óptima, calidad, qué cosecha y semilla/clon; jardineras, aspersor, calefactor, compost (cuánto abono da cada
  objeto), gallinero, colmena, vacas/ovejas y caballos (10 razas) en secciones.
- **Calculadora de genética** (`/farming/genetics`): elegís una planta central y hasta 8 vecinas con sus genes
  (G, Y, H, W, X) y da el resultado de la cruza con probabilidades, usando los pesos del juego (cruza 1/1/0,6/0,6/0,6
  para W, X, G, Y, H según el orden que confirme el decompilado). Modo "buscador": dado un clon objetivo (p. ej.
  GGGYYY) y los clones que tenés, sugiere qué cruzar. Los genes se escriben como en el juego (letras) y se guardan
  en el link.
- El orden de los genes y la regla de empates salen del decompilado; tests con cruzas conocidas.

## 3. Parches

Como la Crónica de Valheim: notas oficiales de Steam (app 252490) por parche mensual y hotfix, en inglés tal cual y
en español cargado a mano; lo nuevo enlaza a las fichas de Objetos/Monumentos cuando el nombre coincide. Publicación
automática del inglés con el workflow existente de parches si encaja; si no, script manual.

## 4. Monumentos

- Lista (sólo los que ve el jugador; afuera los de desarrollo y piezas) y ficha por monumento: foto (cuadros del
  menú cuando hay), tier, tamaño mínimo de mapa, zona segura, tarjetas y fusibles del puzzle con su recorrido,
  recicladoras, tiendas de NPC, radiación, cajas y NPC si se pueden saber, etapa de Power Trip en que se prende.
- **Red de Power Trip:** sección propia: 4 etapas (1/4/10/18 fusibles), Heavy Fuse, qué monumento prende en cada
  etapa, piezas que mantienen los jugadores.
- Apartment Complex y tiendas alquilables con sus datos.
- Botín por monumento y costos de alquiler/mantenimiento sólo están en el servidor dedicado (SteamCMD app 258550):
  quedan para un paso aparte con el OK de ZoTaD para bajarlo. Sin mapa procedural en esta etapa.

## 5. Servidor

- Referencia de comandos de consola y convars del servidor (del decompilado: `[ServerVar]`/`[ClientVar]`), con
  descripción, valor por defecto y buscador; los de admin de objetos ya están en las fichas.
- Calendario de wipes forzados (primer jueves del mes) — reusar `wipe.ts`.
- Generador de línea de arranque / `server.cfg` con las convars más usadas.

## 6-7. Agua e Industrial

Mismo motor y editor, nuevas redes: bombas, tanques, purificador, aspersor, combinadores de agua; cintas, crafteador
industrial, filtros y splitters industriales. Datos ya en la caché (`io/`, tipos de enchufe fluido e industrial).

---

## Reglas de la casa (recordatorio)

Sin bordes de color en tarjetas; las palabras no se cortan; no explicar de dónde salen los datos en la UI (sí
créditos y no afiliación); sitemap de Rust con lastmod real; títulos que empiezan por lo que se busca; cada página
nueva a `PAGES` de `perf.mjs`; datos por `import()`; `games/rust/data` ya está en el `ignore` de Netlify.

## Pruebas

- Python: tests de cada extractor nuevo contra la caché (detrás de una variable como `RUST_CACHE=1` si leen la caché
  grande); tests de forma sobre los JSON versionados sin variable.
- Sitio: vitest para motor, codec, genética y rutas; prerender y sitemap con las URLs nuevas; perf por página.
