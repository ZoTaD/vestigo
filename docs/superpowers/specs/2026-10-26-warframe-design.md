# Warframe en Vestigo — diseño (etapa 1)

2026-10-26. Rama `feat/warframe`, worktree `.claude/worktrees/warframe`. ZoTaD eligió la estética **A "Arsenal"**
(maquetas en `warframe-maquetas` del launch.json, puerto 5234) y pidió arrancar por la etapa 1.

## Para qué

Warframe tiene ~56 mil jugadores de promedio en Steam (octubre de 2026) y una comunidad que vive en herramientas
externas. Lo que más se busca es **dónde farmear cada cosa** ("where to farm neural sensors", "cómo conseguir
telurio") y **reliquias** (qué traen, dónde caen, si están en el Vault). Hoy eso está repartido: la wiki oficial
(tablas largas), overframe.gg (builds, ~5-6 M visitas/mes), warframe.market (mercado, ~7 M), browse.wf (estado en vivo)
y Warframe Reliquary. Ninguno junta ficha + dónde se consigue cada parte + reliquias + recursos en una vista, y el
español es flojo. Público en inglés primero; español a la par.

Éxito: que una búsqueda de "dónde farmear X", "X Prime relics" o "X build parts" caiga en una ficha nuestra que lo
responde arriba, sin scroll, con las tasas oficiales.

## Fuentes (todas oficiales de Digital Extremes, verificadas el 26/10)

- **Public Export**: índice `https://origin.warframe.com/PublicExport/index_{en,es}.txt.lzma` (LZMA "alone" sin marca de
  fin: se descomprime en modo RAW con las props de la cabecera) → 15 JSON por idioma en
  `http://content.warframe.com/PublicExport/Manifest/<archivo!hash>`. Trae 127 suits (119 Warframes, 5 Archwings, 2
  Necramechs), 841 armas (+143 de Railjack), 34 compañeros, 1.603 mods, 3.201 reliquias (4 refinamientos de ~800),
  168 arcanos, 1.885 recetas, 3.552 recursos y 269 nodos, con español oficial.
- **ExportManifest**: el ícono de cada `uniqueName` (PNG 512 px con transparencia) en
  `https://content.warframe.com/PublicExport<textureLocation>` (con el `!hash`).
- **Tabla oficial de drops**: `https://www.warframe.com/droptables` (HTML de 4,4 MB): misiones por rotación, reliquias,
  recompensas de llaves, botines de Cetus/Valle/Cambion/Zariman/Albrecht/Hex, incursiones, y drops por enemigo de
  mods, planos, recursos y reliquias, con porcentajes.
- **Estado en vivo**: `api.warframe.com/cdn/worldState.php` no tiene CORS. `api.warframestat.us/pc/` sí (`*`): fisuras,
  Baro, incursión, arbitraje. Los ciclos de Cetus, el Valle del Orbe y la Deriva Cambion se calculan sin red.
- **Política** (warframe.com/en/contentpolicy): anuncios pasivos permitidos; prohibido vender o cobrar acceso; los
  logos de Warframe y DE necesitan permiso escrito (no van). El Public Export no tiene licencia escrita: lo usa todo el
  ecosistema. Pie de página: aviso de no afiliación y "Warframe es marca de Digital Extremes".

## Etapa 1: pestañas

1. **Portada** (`/en/warframe`): el estado en vivo arriba (ciclos con cuenta regresiva, Baro, fisuras activas por era,
   incursión del día) y la entrada a cada pestaña con un buscador.
2. **Arsenal** (`/arsenal`, ES `/arsenal`): grilla de Warframes, armas (primarias, secundarias, cuerpo a cuerpo,
   Archwing) y compañeros, con filtros por tipo y "Prime / no Prime". **Ficha** como la maqueta A: ícono grande,
   estadísticas, habilidades (Warframes) o estadísticas de daño (armas), maestría, y **dónde se consigue cada parte**:
   - partes Prime → las reliquias que las tienen, con rareza y si la reliquia está en el Vault;
   - partes no Prime y planos → misiones/jefes/botines de la tabla de drops con su %;
   - la receta: qué partes y recursos lleva, con crédito y tiempo de fabricación.
3. **Reliquias** (`/relics`, ES `/reliquias`): las ~800 reliquias por era (Lith, Meso, Neo, Axi, Réquiem) con filtro
   "sin Vault". **Ficha**: las 6 recompensas con su probabilidad en cada refinamiento (Intacta, Excepcional, Impecable,
   Radiante) y dónde cae la reliquia (misión, rotación, %).
4. **Dónde farmear** (`/farming`, ES `/donde-farmear`): los recursos que piden las recetas, con buscador. **Ficha**: los
   planetas donde aparece, los enemigos que lo sueltan (%), las misiones y botines que lo dan, y qué recetas lo usan.
5. **Mods y arcanos** (`/mods`, ES `/mods`): grilla con filtros (tipo, rareza, polaridad, compatibilidad). **Ficha**:
   efecto por rango, drenaje, rangos, quién lo suelta (%), y para arcanos sus niveles.

## Reglas para leer los datos

- **Vault**: una reliquia está en el Vault si no aparece en ninguna tabla de recompensas de la tabla de drops
  (misiones, botines, llaves, incursiones). Es lo único que dice "Vault"; no hay otra fuente.
- **Partes**: las recetas (`ExportRecipes`) unen el resultado con sus ingredientes; las recompensas de reliquias y la
  tabla de drops nombran las partes por `uniqueName` (reliquias) o por nombre en inglés (drops). El cruce por nombre se
  prueba con un test que falla si una parte de la tabla de drops no se resuelve.
- Si una parte o un plano **no aparece en ninguna fuente**, la ficha no inventa (nada de "se compra en el Mercado"):
  dice "no cae en misiones" y nada más.
- Textos del juego con marcas (`|DAMAGE|`, `<DT_SLASH_COLOR>`): se limpian a texto con el nombre del tipo de daño.
- Tipos de daño de `damagePerShot` (20 posiciones): el orden se fija con un test contra 3 armas conocidas.

## Datos e imágenes

- `games/warframe/tools/`: `fetch.py` baja export + drops a `games/warframe/raw/` (ignorada); `site_data.py` arma
  `games/warframe/data/` (lista liviana por pestaña + fichas partidas por hash del slug, como Stardew); `images.py` baja
  los íconos que se usan y escribe WebP de 128 px (listas) y 256 px (fichas de Arsenal) en `site/public/warframe/`.
  Medido: ~5 KB y ~14 KB por ícono; la etapa 1 suma ~3.300 íconos chicos y ~1.000 grandes, unos 30 MB.
- **Tamaño medido (2026-10-27)**: `games/warframe/data` 9,4 MB (819 fichas de Arsenal, 799 reliquias, 237 recursos, 1.750 mods y arcanos, 32 archivos por pestaña, el más grande de ~140 KB) y `site/public/warframe` 32 MB (2.509 íconos de 128 px y 802 de 256 px).
- Las reliquias Requiem Eterna (y la "Requiem" suelta) no tienen ficha: la tabla de drops sólo trae su Intacta. Sus fuentes se nombran sin página.
- Slugs en inglés; español con su slug propio (como Stardew).
- **Actualización**: una Action semanal (y a mano) compara el hash del índice del export y el sha256 de la tabla de drops;
  si ninguno cambió, termina sin compilar. Si cambió alguno, regenera y hace commit a `main` (el repo no deja que
  Actions abra PRs; mismo patrón que `publish-poe2`) y `deploy.yml` publica. Los minutos de Actions están contados.

## Estética A "Arsenal"

Azul noche con un resplandor radial, paneles de vidrio (fondos translúcidos, **sin bordes de color**), letra
condensada en mayúsculas para títulos y rótulos (Rajdhani) y Barlow para el texto, ambas en `@fontsource`
(self-hosted, sin Google Fonts). Acento cian `#6fd3ff`; las rarezas por texto en su color (común bronce, poco común
plata, rara oro). El ícono del Warframe o arma grande a la izquierda en la ficha. Sin logos de DE.

## Reglas del sitio (CLAUDE.md)

- `LazyRows` en las grillas (Arsenal ~1.000, Mods ~1.600, Reliquias ~800); imágenes `lazy`, `decoding="async"`, tamaño
  fijo; datos fuera del chunk de entrada, cada pestaña con su `import()`; fichas partidas.
- `games/warframe/data` en `paths` de `deploy.yml` y en el `ignore` de `netlify.toml`; caché de `/warframe/*`; el origen
  `api.warframestat.us` a la CSP (`connect-src`).
- Juego nuevo en `gameGroups.ts` (categoría ARPG), el menú "Games" con su logo monocromo, `areaFiles.ts`, sitemap por
  juego con `lastmod` real, `navSearch.ts`, OG propia, `perf.mjs` con la portada, una lista y una ficha por pestaña en
  los dos idiomas. Medir RAM y tiempo del build antes y después (~7.000 páginas nuevas).

## Fuera de la etapa 1

Mapa estelar, maestría para tildar, Prime Vault/Baro con historial (etapa 2); armador de builds, Rivens y precios de
warframe.market (etapa 3, revisar sus condiciones).

## Detalles resueltos (revisión del 26/10)

- **Direcciones**: pestañas `arsenal`, `relics`/`reliquias`, `farming`/`donde-farmear`, `mods` (mods y arcanos juntos);
  fichas `/<pestaña>/<slug>`. El slug inglés sale del nombre en inglés y el español del nombre oficial en español; si
  dos chocan se desambigua con el tipo (como `_slugs_unicos` de Stardew). Una ficha por reliquia (`lith-a1`), con los
  cuatro refinamientos adentro.
- **Cruce de partes**: el test falla si una parte de la tabla de drops no se resuelve y no está en una lista de
  excepciones a mano en `tools/` (cada excepción con su motivo). Lo nuevo de un parche rompe el test, no la página.
- **Vault**: el rótulo dice lo que se sabe: "Vault · no cae en misiones" cuando la reliquia no aparece en ninguna tabla
  de recompensas. Las reliquias de la Resurgencia Prime (Varzia) no figuran en la tabla oficial, así que no se nombran.
- **Imágenes**: los WebP se commitean en `site/public/warframe/` (como los sprites de Stardew); la Action los regenera
  sólo cuando cambia el manifiesto.
- **En vivo**: si `api.warframestat.us` no responde, el bloque se oculta (la portada prerenderizada no lo trae). Los
  ciclos se calculan con las épocas y duraciones del código abierto de warframestat (MIT), comprobadas contra su API el
  día que se escriben. Nombres en español: nodos de `ExportRegions_es`, el resto con `?language=es` de la API.
- **Action semanal**: publica sola sin correr `perf`; la medición se hace a mano cuando se suma una pestaña.
- **Logo del menú**: un ícono monocromo propio (no el de DE ni el del Lotus).

## Decisiones mías (para revisar)

- Una sola pestaña "Mods y arcanos" en vez de dos.
- Recursos: sólo los que piden las recetas o aparecen en la tabla de drops (no los ~3.500 del export, que incluyen
  decoraciones y objetos internos).
- Imágenes propias en WebP en vez de enlazar el CDN de DE (no dependemos de ellos ni de su CORS/caché).

## Etapa 2 (27/10): Mapa estelar, Maestría, Prime Vault y Baro

Rama `claude/warframe-etapa-2-e2c579`. ZoTaD dijo "mandale nomás": las decisiones son mías y quedan anotadas acá.
Maquetas del mapa en `warframe-mapa-maquetas` del launch.json (puerto 5237); servidor de la rama `vestigo-warframe-2`
(puerto 5236).

### Pestañas y direcciones

| Pestaña | EN | ES | Fichas |
|---|---|---|---|
| Mapa estelar | `/star-chart` | `/mapa-estelar` | una por nodo (`/star-chart/hydron`) |
| Maestría | `/mastery` | `/maestria` | no (cada fila enlaza a su ficha del Arsenal) |
| Prime Vault | `/prime-vault` | `/prime-vault` | no (cada fila enlaza a su ficha del Arsenal) |
| Baro Ki'Teer | `/baro` | `/baro` | no |

Prime Vault y Baro van en **dos pestañas** y no en una: se buscan por separado ("prime vault", "baro ki'teer").

### Mapa estelar

- **Maqueta elegida: A "Órbitas"** con la tabla de la C abajo. El dibujo (SVG) pone los 12 planetas en sus órbitas
  alrededor del sol, las lunas (Lua, Fobos, Deimos, Europa) al lado de su planeta y los lugares fuera de órbita (Vacío,
  Fortaleza Kuva, Zariman, Duviri, Höllvania, Oscuridad Refractaria) en botones. Tocar un planeta filtra la tabla
  (`?planet=sedna`); sin filtro la tabla trae los 269 nodos agrupados por planeta, con `LazyRows`.
- **Datos**: los 269 nodos de `ExportRegions` (en y es) con planeta, tipo de misión, facción, niveles, maestría que
  pide y si es sector oscuro (`nodeType` 4). El export da el tipo y la facción como índice: la tabla índice → nombre
  está en `site_data.py` (`MISSION_TYPES`, `FACTIONS`), fijada cruzando con los tipos que escribe la tabla de drops
  ("Mercury/Apollodorus (Survival)") y con `solNodes.json` de warframe-worldstate-data (MIT); un test falla si un nodo
  trae un índice que la tabla no conoce. Los nombres en español de tipos y facciones salen de
  warframe-worldstate-data (`data/es/missionTypes.json`, `factionsData.json`), copiados a `warframeCopy.ts`.
- **Ficha de nodo**: planeta, tipo, facción, nivel, maestría, sector oscuro; las recompensas por rotación (A/B/C, o una
  sola tabla) con su %, cada objeto enlazado a su ficha si la tiene (reliquias, mods, recursos, partes); y los recursos
  del planeta (los de Dónde farmear cuya línea "Ubicación" nombra el planeta). 209 nodos tienen tabla; los otros 60
  (Exterminio, Defensa móvil, Sabotaje sin cachés…) dicen "no tiene tabla de recompensas propia" (sin inventar recompensas) y muestran igual los recursos del planeta.
- **Cruce**: las fuentes `mission` de las fichas de la etapa 1 ("Sedna/Hydron (Defense)") enlazan a la ficha del nodo.
- Fuera: los nodos de Railjack (Proxima), los eventos y Duviri sin fin, que no están en `ExportRegions`.

### Maestría

- Todo lo del Arsenal que da maestría: Warframes, armas primarias, secundarias, cuerpo a cuerpo, de Archwing y de
  compañero, compañeros, Archwings y Necramechs. Afuera las armas exaltadas (no dan maestría) y lo que el Arsenal no
  tiene (Amps, Zaw, Kitguns, K-drives, nodos e intrínsecos; quedan para más adelante).
- Puntos: 200 por rango a Warframes, compañeros, Archwings y Necramechs; 100 por rango a las armas. Rango máximo 30, o
  `maxLevelCap` del export (40 en Kuva, Tenet, Coda y Paracesis); los Necramechs llegan a 40 aunque el export no lo
  diga (`MechSuits`). El rango de maestría que alcanza el total: 2.500·n² hasta MR 30 y 147.500 más por cada rango
  Legendario.
- Lo tildado se guarda en `localStorage` (`vestigo:wf:mastery`, la lista de slugs) con try/catch: sin almacenamiento
  la página anda igual, sin recordar. Filtros por tipo, "ocultar lo tildado" y buscador; `LazyRows` (≈1.000 filas).

### Prime Vault

- Un objeto Prime está **disponible** si cada una de sus partes cae de al menos una reliquia que no está en el Vault;
  **en el Vault** si ninguna parte cae de una reliquia abierta; **parcial** si algunas sí y otras no; y **sin
  reliquias** si ninguna parte aparece en reliquias (los Prime de fundador). Es la regla de Vault de la etapa 1, nada
  más: la Resurgencia de Varzia no está en la tabla oficial y no se nombra.
- **Historial**: `site_data.py` compara con el `prime-vault/list.json` anterior y suma a `prime-vault/history.json` cada objeto
  que cambió de estado, con la fecha. Arranca vacío el 27/10/2026 y crece con la Action semanal.

### Baro Ki'Teer

- **En vivo** desde `api.warframestat.us/pc/voidTrader?language=…`: si está, su inventario (nombre, ducados,
  créditos) y cuándo se va; si no, dónde y cuándo llega. Si la API cae, el bloque se oculta.
- **Historial: sí, en el repo.** `tools/baro.py` lee la API (en y es) y, si Baro está y la visita no está anotada,
  la suma a `data/baro/history.json` (fecha, relé, objetos con ducados y créditos, y el enlace a su ficha si el nombre
  inglés coincide con una del Arsenal o de Mods). Lo corre `publish-baro.yml` los sábados a las 14:00 UTC (Baro llega
  los viernes a las 13:00 UTC y se queda 48 h): ~15 s cuando no hay nada, y commit directo a `main` cuando hay visita
  nueva. Ese commit **no** dispara `deploy.yml`: lo empuja el `GITHUB_TOKEN` (que no dispara workflows) y
  `publish-baro` **no** se suma a `workflow_run` (excepción a la regla 5 de CLAUDE.md, a propósito). Sale con la
  próxima publicación, que en la práctica es al otro día (precios de PoE2). Así una visita cada dos semanas y las
  corridas vacías de los otros sábados no gastan un build.
  En la página la visita en curso viene de la API; el historial, del archivo.

### Datos (lo que suma `site_data.py`)

`star-chart/list.json` + `f/NN.json` + `es/NN.json` (como las otras fichas), `mastery/list.json`,
`prime-vault/list.json`, `prime-vault/history.json`; `baro/history.json` lo escribe `baro.py`. Cada carpeta se llama
como la pestaña (la clave de la pestaña es su segmento inglés, como en la etapa 1). Sin íconos nuevos: los planetas se dibujan y las filas
usan los íconos del Arsenal que ya están.

## Mediciones de la etapa 1 (27/10)

`npm run build` (tsc + vite build + check-links), uno detrás del otro, pico de RAM sumando los procesos node/esbuild nuevos:

| | `main` (sin Warframe) | `feat/warframe` |
|---|---|---|
| Total | 141,9 s | 164,7 s |
| `vite build` | 1 min 44 s | 2 min |
| Prerender | 39.038 rutas en 67,7 s | 46.258 rutas en 82,0 s |
| Pico de RAM | 2,86 GB | 3,45 GB |
| `check-links` | 0 sin destino | 0 sin destino |

Perf contra `vite preview` (frío, 1400×900), dentro del presupuesto:

| Página | pedidos | imágenes | nodos |
|---|---|---|---|
| `/en/warframe` | 23 | 4 | 250 |
| `/es/warframe` | 23 | 4 | 251 |
| `/en/warframe/arsenal` | 74 | 48 | 357 |
| `/en/warframe/arsenal/excalibur` | 31 | 6 | 323 |
| `/es/warframe/reliquias/lith-a1` | 32 | 6 | 255 |
| `/en/warframe/farming/neural-sensors` | 110 | 85 | 520 |
| `/es/warframe/mods` | 76 | 50 | 832 |
| `/en/warframe/mods/serration` | 26 | 1 | 586 |

## Mediciones de la etapa 2 (27/10)

`npm run build` en la rama de la etapa 2 (el `main` de hoy ya trae la etapa 1: la referencia es la columna
`feat/warframe` de arriba):

| | etapa 1 | etapa 2 |
|---|---|---|
| Total | 164,7 s | 167,4 s |
| `vite build` | 2 min | 2 min 4 s |
| Prerender | 46.258 rutas en 82,0 s | 46.804 rutas en 86,2 s |
| Pico de RAM | 3,45 GB | 3,3 GB |
| `check-links` | 0 sin destino | 0 sin destino |

Suma 546 rutas (269 nodos × 2 idiomas + las 4 pestañas × 2). Después de los arreglos de la revisión final se repitió:
173,1 s, 2 min 10 s de `vite build`, prerender en 83,7 s, pico de 3,29 GB, 0 sin destino, y perf con las mismas cifras. Perf contra `vite preview` (frío, 1400×900), todas dentro
del presupuesto; con el Chrome del sistema (`PW_CHROMIUM`), porque el Chromium de Playwright no arrancó en esta máquina:

| Página | pedidos | imágenes | nodos |
|---|---|---|---|
| `/en/warframe` | 28 | 8 | 314 |
| `/en/warframe/star-chart` | 25 | 0 | 1.106 |
| `/es/warframe/mapa-estelar?planet=sedna` | 25 | 0 | 698 |
| `/es/warframe/mapa-estelar/hidron` | 51 | 24 | 500 |
| `/en/warframe/mastery` | 86 | 60 | 703 |
| `/es/warframe/maestria` | 86 | 60 | 705 |
| `/en/warframe/prime-vault` | 74 | 48 | 404 |
| `/es/warframe/prime-vault` | 74 | 48 | 405 |
| `/en/warframe/baro` | 25 | 0 | 187 |
| `/es/warframe/baro` | 25 | 0 | 188 |

Pendiente de ZoTaD: el nombre oficial en español de Rush, Void Armageddon, Shrine Defense, The Perita Rebellion, The
Murmur y Anarchs (hoy salen en inglés en la versión ES: no hay fuente a mano y no se inventa).

## Etapa 3 (27/10): Armador de builds, Rivens y precios

Rama `claude/warframe-etapa-3-f06981`. Servidor de la rama `vestigo-warframe-3` (puerto 5239) y maquetas del armador
en `warframe-armador-maquetas` (puerto 5238), los dos en el `launch.json` del checkout principal.

### Precios de warframe.market: no entran en esta etapa

Relevado el 27/10/2026. La web y la documentación están detrás de un desafío de Cloudflare (403 a `curl` y al
navegador sin resolver el captcha), así que los textos se leyeron de la copia de la Wayback Machine:

- **Términos del sitio, sección API** (`https://warframe.market/tos`, copia del 03/10/2026): *"API data, unless for
  personal use or educational purposes, may only be used to provide additional features not available on the Site."* y
  *"Site staff should be contacted prior to making applications using the API public."* Límite: *"Requests may not be
  made at a rate faster than 3 per second for listings or 10 per minute for contracts."* Y *"Applications using the API
  may be blocked at the discretion of the Site developers"*.
- **Reglas para desarrolladores** (`https://docs.warframe.market/docs/rules/overview/`, copia del 10/08/2026): pide un
  `User-Agent` propio con contacto; prohíbe clonar el sitio (*"We may restrict applications that are primarily website
  clones, data mirrors, or traffic offloading layers."*); pide caché y nada de sondeo seguido; límite general de 3
  pedidos por segundo; las consultas de desarrollo van a su Discord.
- **robots.txt** (copia del 04/10/2026): `Disallow: /contacts` y nada más.
- **API**: `api.warframe.market/v2/items` responde sin token (versión 0.25.0), pero **sin cabeceras CORS**: desde el
  navegador no se puede pedir; haría falta una Action que guarde los precios en el repo (con `User-Agent` propio, a
  menos de 3 pedidos por segundo). La v1 (`/v1/items/<slug>/statistics`) también responde.
- **Anuncios y atribución**: no dicen nada de anuncios ni piden atribución. Sí piden avisar antes de publicar.

**Decisión:** no se integran en este PR. Mostrar el precio en la ficha de un Prime es un "agregado" que el sitio de
ellos no tiene en esa forma (ficha + reliquias + precio), pero la condición de contactar al staff antes de publicar no
se puede saltear, y eso lo tiene que hacer ZoTaD (Discord de warframe.market). Con su visto bueno, el diseño queda así:
`tools/market.py` en una Action diaria que pide `/v2/items` y las estadísticas de los ~600 Prime/partes/mods que tenemos
con ficha (a 2 pedidos por segundo: ~5 min), guarda `data/market/prices.json` (mediana de 48 h, volumen y fecha) y la
ficha lo muestra con "Precios: warframe.market" enlazado.

### Pestañas y direcciones

| Pestaña | EN | ES | Fichas |
|---|---|---|---|
| Armador | `/builder` | `/armador` | no: la build va en la dirección (`?i=braton&m=…`) |
| Rivens | `/rivens` | `/rivens` | no: el arma va en `?w=braton` |

Sin una página por objeto: una ficha de armador vacía por cada arma serían ~1.800 páginas finas para Google. La ficha
del Arsenal (Warframes y armas primarias, secundarias y cuerpo a cuerpo) enlaza "Armar build" → `/builder?i=<slug>`.

### Armador

- **Maqueta elegida (27/10): B "Hoja técnica"** con las cifras grandes "base → build" de la C arriba y su "Fijar como
  referencia" (compara la build con otra variante). Maquetas en `warframe-armador-maquetas` (puerto 5238). La B gana en
  el teléfono: los casilleros van en lista y el buscador de mods se abre en el casillero que tocaste; la A (grilla con
  el arte de cada mod) es la más linda pero en 375 px es la más larga.
- **Qué se arma**: Warframes (`Suits`) y armas primarias, secundarias y cuerpo a cuerpo (`LongGuns`, `Pistols`,
  `Melee`). Fuera: Archwing, armas de Archwing, compañeros, Necramechs, Amps, Zaw y Kitguns (quedan para más adelante).
- **Casilleros**: 8 + aura (Warframe) o postura (cuerpo a cuerpo) + exilio. El export no trae las polaridades de
  fábrica de cada casillero: arrancan sin polaridad y cada polaridad que pone el usuario cuenta como una Forma (el
  contador es "Formas que pusiste", no las que tiene el objeto en el juego). Exilio: sólo mods con `isUtility`.
- **Mods**: por `uniqueName` (hay nombres repetidos: Serration con 3, 5 y 10 rangos), compatibles por `type` y
  `compatName`. El efecto sale de `levelStats` leyendo el texto con una tabla de patrones (`+165% Damage` → daño base
  +165 %); lo que no se reconoce o es condicional ("On Kill", "al hacer…") se muestra como texto y no suma.
- **Fórmulas**: las de `docs/superpowers/specs/2026-10-27-warframe-formulas.md` (relevadas el 27/10 contra la wiki y
  las notas de parche, 53 de 53 casos coinciden). Se muestra sólo lo verificado: daño base, físicos, elementos y su
  combinación (orden de los mods, innatos al final, cuantización a 1/32), multidisparo, crítico, multiplicador, estado
  (por perdigón, como el Arsenal), cadencia (arcos ×2), cargador, recarga; Warframes a rango 30 (regla del Update 34.0:
  +100 salud, +100 escudo, +50 energía y las excepciones de la wiki), fuerza, duración, eficiencia (tope 175 %) y rango.
  **No se muestran**: DPS ni "ráfaga" (dependen de supuestos), topes mínimos de duración, rango y fuerza, ni los
  redondeos exactos del Arsenal (se muestran dos decimales).
- **Capacidad**: rango 30 (o `maxLevelCap`), ×2 con potenciador/catalizador. Drenaje = `baseDrain` + rango; polaridad
  igual: mitad hacia arriba; distinta: ×1,25 al más cercano (franjas de la wiki; en drenajes 5, 9, 13 y 17 la wiki se
  contradice y no está probado contra el juego). Aura y postura suman `|baseDrain|` + rango (Steel Charge rango 5 = 9),
  ×2 con su polaridad y ×0,8 hacia abajo con otra. Sin Umbra en casilleros comunes (no verificado).
- **La build en la dirección**: `?i=<slug del Arsenal>&m=<casillero>.<slug del mod>.<rango>,…&p=<polaridades>&o=1`
  (potenciador). Se lee con tolerancia: un mod que no existe o no entra en ese casillero se descarta sin romper.

### Rivens

- **El Hotfix 44.1.3 (22/10/2026) eliminó la disposición**: *"Removed Riven Dispositions."* y *"All Rivens now use the
  same multiplier for their possible value ranges"* (https://www.warframe.com/patch-notes/pc/44-1-3). El export bajado
  ya trae `omegaAttenuation` = 1,2 en las 676 armas que aceptan Riven. La calculadora no muestra puntos de disposición:
  dice que hoy todas valen lo mismo (1,2) y lo toma del export, así que si DE la vuelve a poner, la página la sigue.
- **Rangos**: `valor = value × 10 × (rango + 1) × D × L × W` con `value` de `upgradeEntries` del Riven de cada tipo
  (rifle, escopeta, pistola, cuerpo a cuerpo, arma de Archwing, Kitgun, Zaw), L según positivos/negativo (2: 0,99;
  2+neg: 1,2375 y −0,495; 3: 0,75; 3+neg: 0,9375 y −0,75) y W entre 0,9 y 1,1. Se muestra a rango 8 (los extremos de
  la wiki coinciden: 40 de 40); a rangos intermedios no está verificado y no se ofrece.
- **Qué hace**: elegir arma (o tipo) → tabla de cada stat posible con mín–máx en las 4 combinaciones; y "¿qué tan bueno
  salió mi Riven?": escribir el valor de un stat da el % dentro de su rango.
