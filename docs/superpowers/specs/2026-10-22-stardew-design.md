# Stardew Valley en Vestigo — diseño

2026-10-22. Juego 1.6.15 instalado en la PC de ZoTaD. Rama `feat/stardew`,
worktree `Desktop/vestigo-stardew`.

## Para qué

Pedido de ZoTaD: una wiki **explorable, intuitiva y gráfica**, más
**herramientas que los otros no tienen o que hacemos mejor**, en inglés y
español por igual. La idea es competir, no traducir.

La competencia (relevada el 22/10):

- **stardewvalleywiki.com** domina con ~32 M de visitas por mes. Es MediaWiki:
  texto denso, tablas fijas, sin filtros ni cruces. Licencia CC BY-NC-SA, así
  que **no se copia texto**. Los datos salen del juego.
- **stardew.app**: lee la partida y lleva la cuenta de la perfección. Es el
  rival directo del lector de partidas.
- **Stardew Checkup / Predictor** (MouseyPounds): funcionan, pero son técnicos y
  viejos de interfaz.
- Planificadores de granja y calculadoras de cultivos: varios y dispersos, ninguno
  con todo junto.

## Qué hay en los datos (medido)

`games/stardew/tools/dump.sh` le pide al propio juego que lea sus XNB y deja
313 JSON en `games/stardew/raw/` (ignorada por git): 807 objetos, 50 cultivos,
8 frutales, 48 aldeanos, gustos de regalos, 31 paquetes, 150 recetas de
fabricación más las de cocina, 74 peces, 91 lugares (con lo que se pesca y se
encuentra en cada uno), 77 tiendas, 39 máquinas con sus reglas de producción,
67 armas, 51 monstruos con su botín y 25 edificios. Los textos vienen en inglés
y en español oficial (`Strings/*.es-ES`). `textures.py` pasa el arte a PNG.

## Pestañas, por etapas

Cada etapa se publica sola. Las fichas se cruzan entre sí: un objeto dice a quién
le gusta, en qué paquete va, qué máquina lo procesa, dónde se consigue y con qué
receta se usa.

**Etapa 1: la base**
1. **Portada**: buscador, el día de hoy en el valle (cumpleaños, festival,
   temporada) y la entrada a cada pestaña.
2. **Objetos**: grilla filtrable por categoría, temporada y fuente, y una ficha
   por objeto con precio por calidad (y con las profesiones), de dónde sale y
   para qué sirve.
3. **Aldeanos**: retratos, cumpleaños y una tabla de regalos que se lee al
   revés también (qué hago con este objeto: a quién le encanta).
4. **Centro Comunitario**: los paquetes con checklist guardado en el navegador,
   lo que falta y dónde conseguirlo esta temporada.

**Etapa 2: el día a día**
5. **Cultivos + calculadora de ganancias**: oro por día de cada cultivo según
   la temporada, el día en que se planta, el fertilizante, la profesión y si se
   vende o se procesa (barril, jarra, deshidratador). Es lo que hoy está
   repartido en varias herramientas viejas.
6. **Pesca**: los 74 peces con un filtro de "qué puedo pescar ahora" (lugar,
   temporada, clima y hora), más estanques y cangrejeras.
7. **Recetas y máquinas**: fabricación, cocina y las cadenas de artesanía
   (qué entra y qué sale de cada máquina).
8. **Calendario**: cumpleaños, festivales, peces y cosechas en una sola vista.

**Etapa 3: las herramientas que nos diferencian**
9. **Lector de partida**: subir el archivo de la partida y ver, 100 % en el
   navegador (no se sube a ningún servidor), qué falta para la perfección, los
   paquetes, los regalos de la semana por aldeano y "qué conviene hacer hoy".
   Compite con stardew.app; la diferencia es que se cruza con todas las fichas.
10. **Minas y combate**: armas, monstruos y su botín, pisos.

**Después (proyectos aparte):** planificador de granja en grilla (aspersores,
espantapájaros, compartible por URL) y predictor (geodas, clima, pisos
infestados), que obliga a replicar el generador aleatorio de la 1.6.

## Reglas que se aplican (de `CLAUDE.md` y la memoria)

- Rendimiento por página (`npm run perf`), `LazyRows` en listas largas,
  imágenes `lazy` con tamaño fijo, datos fuera del chunk de entrada y las fichas
  partidas en pedazos (`pzShardOf`).
- `games/stardew/data` en los `paths` de `deploy.yml` y en el `ignore` de
  `netlify.toml`.
- Medir RAM y tiempo del build antes y después.
- SEO: sitemap propio con lastmod, títulos con lo que se busca.
- Sin "sacado de los archivos del juego" en la interfaz; sí créditos y aviso de
  no afiliación.

## Lo que decide ZoTaD

- **La estética** (hay maquetas para elegir).
- **Sprites del juego con publicidad.** ConcernedApe no tiene una política
  escrita para sitios de fans con anuncios; la guía del foro para merch pide no
  usar sus assets. Los demás juegos del sitio usan su arte. Mientras el sitio
  no tenga anuncios, el riesgo es bajo; antes de ponerlos, conviene
  preguntarle por correo.

## Decisiones mías (ZoTaD puede cambiarlas)

- Arrancar por la etapa 1 y dejar el lector de partida para la 3: necesita las
  fichas para valer más que stardew.app.
- La calculadora de cultivos usa las reglas de precio del juego (calidad,
  profesiones Labrador/Artesano, multiplicadores de máquinas) leídas de los
  datos, no de la wiki.

## Mediciones del build (etapa 1, 2026-10-22)

`npm run build` completo (`tsc -b`, `vite build` con el prerender y `check-links`), con
`NODE_OPTIONS=--max-old-space-size=6144` como en Actions, en la PC de ZoTaD. El pico de RAM es la suma del working
set de los procesos `node` del build, muestreada cada medio segundo desde PowerShell (en Git Bash no hay
`/usr/bin/time`).

| | `main` (88a31d4c, sin Stardew) | `feat/stardew` |
|---|---|---|
| Páginas prerenderizadas | 37.082 | 38.934 (+1.852) |
| Prerender | 64,8 s | 71,3 s |
| `vite build` | 1 min 48 s | 1 min 58 s |
| `npm run build` entero | 144,6 s | 157,5 s |
| Pico de RAM (suma de procesos) | 2,70 GB | 2,80 GB |
| Pico de un solo proceso | 2,59 GB | 2,69 GB |
| `check-links` | 0 sin destino | 0 sin destino |

Las 1.852 páginas nuevas: (888 objetos + 34 aldeanos + portada + 3 pestañas) × 2 idiomas. Lejos del tope de 6 GB.

`npm run perf -- --only stardew --budget` contra `vite preview` (Chromium headless shell), en frío:

| Página | Pedidos | Imágenes | Nodos |
|---|---|---|---|
| `/en/stardew-valley` | 48 | 25 | 251 |
| `/en/stardew-valley/items` | 152 | 123 | 621 |
| `/en/stardew-valley/items/melon` | 57 | 28 | 308 |
| `/es/stardew-valley/objetos/pastel-rosa` | 71 | 41 | 316 |
| `/en/stardew-valley/villagers` | 65 | 37 | 355 |
| `/es/stardew-valley/aldeanos/abigail` | 127 | 97 | 421 |
| `/en/stardew-valley/bundles` | 179 | 151 | 1.490 |
| `/es/stardew-valley/centro-comunitario` | 179 | 151 | 1.491 |

Todas dentro del presupuesto (≤ 250 pedidos, ≤ 200 imágenes, ≤ 3.000 nodos, sin errores).

## Mediciones del build (etapa 2, 2026-10-23)

Igual que en la etapa 1 (`npm run build` entero, pico de RAM sumando los procesos `node` y `esbuild` nuevos cada medio
segundo desde PowerShell), pero sin `NODE_OPTIONS`: el heap por defecto alcanzó. El "antes" es la base de la rama
(93618582, `main` con la etapa 1), compilada en un worktree temporal; cada lado se corrió dos veces, uno detrás del otro.

| | 93618582 (etapa 1) | `feat/stardew-etapa-2` |
|---|---|---|
| Páginas prerenderizadas | 38.934 | 38.942 (+8) |
| Prerender | 66,5 s / 61,2 s | 54,4 s / 55,4 s |
| `vite build` | 1 min 36 s / 1 min 36 s | 1 min 30 s / 1 min 30 s |
| `npm run build` entero | 129,3 s / 125,9 s | 119,9 s / 120,5 s |
| Pico de RAM (suma de procesos) | 3,43 GB / 2,69 GB | 2,76 GB / 2,76 GB |
| Pico de un solo proceso | 3,32 GB / 2,57 GB | 2,65 GB / 2,65 GB |
| `check-links` | 0 sin destino | 0 sin destino |

Las 8 páginas nuevas son las cuatro pestañas en los dos idiomas: no tienen fichas propias. El build no cambia de
escala; las diferencias de tiempo y el 3,43 GB de la primera corrida del "antes" (con la caché fría) son ruido de la
máquina. Lejos del tope de 6 GB.

`npm run perf -- --only stardew --budget` contra `vite preview` (Chromium headless shell), en frío:

| Página | Pedidos | Imágenes | Nodos |
|---|---|---|---|
| `/en/stardew-valley` | 52 | 29 | 287 |
| `/en/stardew-valley/items` | 94 | 65 | 387 |
| `/en/stardew-valley/items/melon` | 59 | 30 | 313 |
| `/es/stardew-valley/objetos/pastel-rosa` | 73 | 43 | 321 |
| `/en/stardew-valley/villagers` | 67 | 39 | 360 |
| `/es/stardew-valley/aldeanos/abigail` | 129 | 99 | 227 |
| `/en/stardew-valley/bundles` | 181 | 153 | 1.495 |
| `/es/stardew-valley/centro-comunitario` | 181 | 153 | 1.496 |
| `/en/stardew-valley/crops` | 65 | 38 | 864 |
| `/es/stardew-valley/cultivos` | 65 | 38 | 865 |
| `/en/stardew-valley/fishing` | 108 | 79 | 1.600 |
| `/es/stardew-valley/pesca` | 108 | 79 | 1.601 |
| `/en/stardew-valley/recipes` | 91 | 63 | 647 |
| `/es/stardew-valley/recetas` | 100 | 72 | 642 |
| `/en/stardew-valley/recipes?view=machines` | 133 | 105 | 2.517 |
| `/en/stardew-valley/calendar` | 42 | 12 | 236 |
| `/es/stardew-valley/calendario` | 42 | 12 | 237 |

Todas dentro del presupuesto, sin errores. La más cerca del tope es la vista Máquinas de Recetas (2.517 de 3.000
nodos): si se le suman máquinas o filas visibles por máquina, volver a medirla.

## Mediciones del build (etapa 3, 2026-10-23)

Mismo método que en la etapa 2 (`npm run build` entero, sin `NODE_OPTIONS`, pico de RAM sumando los procesos `node` y
`esbuild` nuevos cada medio segundo desde PowerShell, un lado detrás del otro). El "antes" es `main` con la etapa 2
(9e05b13f), compilado en un worktree temporal con su propio `npm ci`; el "después" es `claude/stardew-etapa-3-803b08`.
Dos corridas por lado y una tercera del "después" para ver el ruido.

| | 9e05b13f (etapa 2) | etapa 3 |
|---|---|---|
| Páginas prerenderizadas | 38.942 | 39.032 (+90) |
| Prerender | 70,2 s / 70,8 s | 94,1 s / 80,9 s / 77,2 s |
| `vite build` | 1 min 46 s / 1 min 50 s | 2 min 25 s / 2 min 11 s / 2 min 3 s |
| `npm run build` entero | 141,5 s / 148,9 s | 237,6 s / 174,5 s / 162,3 s |
| Pico de RAM (suma de procesos) | 3,15 GB / 3,14 GB | 2,66 GB / 2,68 GB / 2,64 GB |
| Pico de un solo proceso | 3,03 GB / 3,04 GB | 2,55 GB / 2,57 GB / 2,52 GB |
| `check-links` | 0 sin destino | 0 sin destino |

Las 90 páginas nuevas: las pestañas Minas y combate (`/mines`, `/minas`) y Lector de partida (`/save`, `/partida`) en los
dos idiomas, más una ficha por cada uno de los 43 monstruos en cada idioma (`/mines/<slug>`, `/minas/<slug-es>`):
(43 + 2) × 2. El Lector no tiene fichas. La RAM no sube (la medición del "antes" con la caché fría salió más alta);
el tiempo sí subió entre 15 y 30 s sobre unos 145 s, más que las 90 páginas (el prerender tardó entre 7 y 24 s más): la
primera corrida del "después" (237 s) coincidió con el disco ocupado. Lejos del tope de 6 GB; si el build sigue
creciendo, volver a medir el tiempo.

`npm run perf -- --only stardew --budget` contra `vite preview` (Chromium headless shell), en frío, páginas nuevas de la
etapa 3 (las de las etapas 1 y 2 quedaron como estaban, entre 35 y 181 pedidos y hasta 2.519 nodos):

| Página | Pedidos | Imágenes | Nodos |
|---|---|---|---|
| `/en/stardew-valley/mines` | 123 | 96 | 801 |
| `/en/stardew-valley/mines/green-slime` | 40 | 13 | 213 |
| `/es/stardew-valley/minas/baba-verde` | 40 | 13 | 214 |
| `/en/stardew-valley/mines?v=monsters` | 174 | 147 | 1.994 |
| `/en/stardew-valley/mines?v=weapons` | 159 | 132 | 1.256 |
| `/en/stardew-valley/save` | 35 | 5 | 142 |
| `/es/stardew-valley/partida` | 35 | 5 | 143 |

Todas dentro del presupuesto, sin errores. La más pesada de las nuevas es la grilla de monstruos de Minas (1.994 de
3.000 nodos, 174 de 250 pedidos).

El Lector con una partida real cargada (6,5 MB de XML, la de ZoTaD; no se copia al repo), medido con Playwright subiendo
el archivo a la página servida por `vite preview`: la lectura y el dibujo de las cajas tardan entre 0,34 y 0,38 s
(dos corridas por idioma). Nodos de DOM: 142 antes de subir el archivo, 1.897 con la partida recién leída, 2.944 después
de recorrer la página entera (las listas largas se dibujan de a tandas con `LazyRows`) y 3.202 con todas las cajas
desplegadas a la vez, 202 sobre los 3.000. Ese último caso no es el de abrir en frío (el presupuesto es de la página
vacía), y quien despliega todo ve una página larga; si se le suman cajas al Lector, volver a medirlo.
