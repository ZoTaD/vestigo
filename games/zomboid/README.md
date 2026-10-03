# Project Zomboid

Datos e íconos de la sección `/project-zomboid` (en inglés `/en/project-zomboid`, en
español `/es/project-zomboid`; nunca `/zomboid`: esa carpeta es la de los assets y
no puede ser una página), sacados del juego instalado (Build 42).
El mapa tiene su propio extractor y su carpeta `data/map/`; esto es todo lo demás.

## Dependencias

- Python 3 (se probó con 3.14) y **Pillow** (`pip install Pillow`, trae WebP).
  Es lo único que hace falta: `map.py` lee los XML con `xml.etree.ElementTree` (biblioteca
  estándar; alcanzó para `worldmap.xml` y `streets.xml`, así que ya no pide `lxml`).
- **numpy**, sólo para `model3d.py` (la piel de los modelos y los afiches); el resto de los extractores no lo usa.
- El juego instalado, sólo para leer. No hay `requirements.txt`.

## En cada parche

0. Si desde la última extracción cambió `extract.py` (o algo que lee, como `server.py`): correlo **antes** de
   actualizar el juego y commiteá la foto rehecha (`Parches: foto rehecha <id>`). Así el diff del parche compara dos
   fotos hechas con el mismo extractor, y lo que arregló el extractor no sale como "cambios del parche".
1. Actualizar el juego en Steam, en la rama estable (con una beta, `extract.py` corta).
2. `python games/zomboid/tools/extract.py` (~5 s, o ~1 min si cambian muchos
   íconos). Si el juego no está en la ruta de Steam por defecto:
   `PZ_DIR=D:/ruta/ProjectZomboid python games/zomboid/tools/extract.py`.
   Al final arma solo los datos del sitio (`site.py`, ver abajo); para rehacer sólo esos,
   sin leer el juego: `python games/zomboid/tools/site.py` (~1 s).
   Antes de escribir, `extract.py` guarda la foto de la versión y el diff contra la anterior (`patches.py`, ver "Qué
   escribe"); el informe lo dice en la línea `Parches: foto nueva|igual|rehecha <id>`. Si corta por un cambio masivo,
   revisá `git diff` y, si es un parche de verdad,
   `PZ_ACEPTO_CAMBIOS_MASIVOS=1 python games/zomboid/tools/extract.py`. `python games/zomboid/tools/patches.py` lista
   las fotos y los diffs; `patches.py rebuild` rehace los diffs desde las fotos (si cambia cómo se compara;
   ojo, el de una foto rehecha compararía dos extractores).
3. Leer el informe que imprime: ítems sin ícono, claves en español que faltan,
   claves de ítem nuevas que no están clasificadas (van a `STATS` o `IGNORED`
   en `extract.py`) y tags de receta que no son estación.
4. `python games/zomboid/tools/map.py` para el mapa (las teselas tardan unos
   minutos; con `--sin-teselas` sólo rehace los JSON y los sellos).
5. `python games/zomboid/tools/loot.py` para el botín (~2 s; necesita lo que escriben `extract.py` y `map.py`, en ese
   orden). Imprime los pesos y avisa de los nombres de las tablas que no existen y de los muebles, vehículos o
   atuendos sin nombre en `loot_names.py`. `python games/zomboid/tools/loot.py --check` imprime el inventario (cuartos,
   listas, vehículos, atuendos…) sin escribir nada.
   Al final, `loot.py` vuelve a correr `craft.py` (~1 s): el grafo de fabricación (`data/craft.json`) lo arma
   `extract.py`, y Fabricación usa dónde se encuentra cada cosa para saber qué se junta y qué se fabrica. Para
   rehacer sólo eso, `python games/zomboid/tools/craft.py`.
6. `python games/zomboid/tools/model3d.py` para el sobreviviente en 3D del Planificador (~2 min; necesita lo que
   escribe `extract.py`). Ver "Modelo 3D".
7. `git diff --stat games/zomboid/data site/public/zomboid`. `extractedAt` en
   `data/meta.json`, `data/map/meta.json` y `data/loot/meta.json` sólo cambia si cambió algún dato
   (en el mapa y el botín, algún JSON; en el resto, algún JSON o algún ícono).
8. La Crónica de parches (`data/patches/chronicle/`, ver "Qué escribe"):
   1. `python games/zomboid/tools/patches.py news`: baja los anuncios de Steam (una sola petición; un 429 o un 5xx
      corta, y `--offline` usa la última bajada), escribe `chronicle/<slug>.todo.json` para cada versión sin entrada
      (fecha, rama, hotfixes y fuentes ya puestos, textos vacíos) e imprime los hotfixes y las fuentes que les faltan
      a las entradas que ya existen.
   2. Escribir el resumen en/es a partir del `.todo.json`, leyendo los anuncios de sus fuentes
      (`data/patches/.cache/<gid>.txt`), guardarlo como `chronicle/<slug>.json` y borrar el `.todo.json`. Reglas:
      título = el tema de la versión en una frase corta nuestra (no el título del anuncio); resumen de 2 a 4
      oraciones con lo que cambia para quien juega; de 3 a 6 highlights, uno por tema; una oración por hotfix;
      `updated` con la fecha del día. Nada de frases del anuncio, ni traducidas palabra por palabra (las notas son
      de The Indie Stone); sólo lo que dice la fuente; cifras y nombres del juego tal cual (en español, los de
      `index.json`); voseo cuando se le habla a quien lee. Nunca nada de PZwiki.
   3. `python games/zomboid/tools/patches.py check`: sale con 1 si una entrada tiene un idioma vacío, una fecha que
      no es `YYYY-MM-DD`, una fuente que no es `https://` de Steam o TIS, o 8 palabras seguidas iguales a uno de sus
      anuncios (hasta los nombres propios pueden cortar: dos desafíos nombrados en el mismo orden que el anuncio ya
      suman 8; se cambia el orden o la frase). También lista los `.todo.json` pendientes.
   4. `python games/zomboid/tools/site.py`.

   Sin resumen, la página de la versión sale igual, con el diff y una línea automática.

Sólo lee la instalación: no toca nada del juego.

## Cuándo corta

`extract.py` prefiere no extraer a extraer mal, y corta **antes de escribir nada**, con
un mensaje y código de salida distinto de 0, si:

- no puede leer la versión del juego (no está `projectzomboid.jar`, o el parche cambió
  cómo se arma `GameVersion`). No se conserva la versión anterior: datos de un parche
  rotulados con el número del anterior son peores que no extraer;
- lee menos de 20 moodles (la 42.21 trae 26) del bytecode de `MoodleTextureSet`;
- no puede leer del bytecode la tabla de XP de las habilidades (`PerkFactory.init` y `AddPerk`), los multiplicadores
  de bonificación y los de los rasgos (`IsoGameCharacter$XP.AddXP`) o el nivel inicial y el tope de bonificación
  (`IsoGameCharacter.applyTraits`): ver "Habilidades" abajo;
- no encuentra qué habilidad sube cada código de los VHS en `ISRadioInteractions.lua`, ningún medio en
  `recorded_media.lua`, o ninguno que dé XP;
- no encuentra ningún libro de habilidad en `XPSystem_SkillBook.lua`;
- dos íconos de una misma carpeta se llaman igual salvo por las mayúsculas (en Windows
  serían un archivo y uno pisaría al otro; en Netlify, una página pediría un ícono que
  no está);
- dos fichas de una sección de `index.json` quedan con la misma dirección, o una tiene un
  nombre en inglés sin letras ni números;
- `server.py` (la pestaña Servidor, ver "Servidor" abajo) no entiende algo del juego: lee menos de 250 opciones de
  sandbox o de 120 del `.ini`, una llamada `new*Option` / `new <Tipo>ServerOption` no tiene la forma conocida, a una
  opción le falta el nombre o una etiqueta en inglés, el menú (`SettingsTable`) nombra una opción que Java no tiene, un
  preset trae algo que no es una tabla de valores (`lua_table`), el `switch` de los cortes de agua o luz no cubre las 9
  opciones o tiene un caso desconocido, cambió la cuenta de la edad del mundo (`world_age_guard`), o no se entiende una
  hora de arranque o un largo del día;
- la foto de la versión (`patches.py`) cambia demasiado contra la anterior: un mismo campo cambia en 200 entidades de
  un tipo o más y son al menos la mitad de las que lo tenían (`Cambian 300 objetos en stats.weight…`), o se van (o
  llegan) 200 o más y son al menos la mitad del tipo. Un parche de verdad casi nunca hace eso; un cambio de
  `extract.py` que ahora normaliza distinto un stat (o que empieza a incluir los objetos de debug), sí, y no puede
  publicarse como "cambios del parche". Si es un parche de verdad:
  `PZ_ACEPTO_CAMBIOS_MASIVOS=1 python games/zomboid/tools/extract.py`;
- el juego está en una rama beta de Steam (`BetaKey` en `steamapps/appmanifest_108600.acf`): Vestigo sigue sólo la
  estable, y una foto de la beta quedaría como un parche que nunca salió. Volver a la estable (Propiedades → Betas →
  Ninguna) o, si de verdad se quiere la beta, `PZ_ACEPTO_RAMA_BETA=1`;
- la última foto es de otro `format` que el que arma `patches.py`, o el índice de fotos nombra un `.json.gz` que no
  está, o se volvió a un build que ya tiene foto y no es la última.

Las primeras lecturas dependen del formato interno del juego: si un parche lo cambia,
se adapta `game_version()`, `moodle_textures()`, `perk_factory()`, `xp_boost_rules()`,
`xp_trait_multipliers()`, `start_levels()`, `radio_codes()`/`build_media()`, `skillbook_perks()` o `server.py`. Las otras dos se
resuelven en `Icons` o en `site_index()`.

Sí avisa sin cortar si falta `LevelForMediaXPCutoff` en el preset Apocalypse (`mediaXpCutoff` queda en `null`).

El build de Steam no corta: si no está el `appmanifest_108600.acf` (una copia del juego
fuera de Steam es válida), avisa por stderr y `build` queda en `null` en `meta.json`.

`loot.py` también corta antes de escribir si: falta un `.lua` de botín o alguno de los JSON que escriben `extract.py` y
`map.py`; el lector de Lua (`luatable.py`) encuentra algo que no entiende; una tabla apunta a un nombre que no existe y
no es uno de los conocidos de la 42.21 (`KNOWN_MISSING_LISTS`, `KNOWN_DANGLING_LISTS`, `KNOWN_NIL_FIELDS`); lee menos de
300 cuartos, 1.000 listas procedurales, 50 grupos de vehículo o 100 atuendos; un cuarto trae `all` y otros muebles; una
lista trae dos condiciones de forzado; o un `HashMap` de listas junta 8 nombres en un bucket (Java lo haría árbol y el
orden del sorteo dejaría de ser el que emula).

## Qué escribe

- `data/items.json`: índice de ítems (id, nombre en/es, tipo, categoría, ícono,
  peso) y el nombre de cada categoría.
- `data/items/<tipo>.json`: la ficha completa por tipo (`weapon`, `clothing`,
  `food`, `literature`…) con `stats` normalizadas (la clave del script con
  minúscula inicial: `MinDamage` → `minDamage`), `tags`, `tooltip`, `teaches`
  (recetas que enseña al leerlo), `research` (recetas que se aprenden
  investigándolo) y `opens` (receta de doble clic).
- `data/recipes.json`: `craftRecipe` (`kind: "craft"`) y construcciones de
  entities (`kind: "build"`), con entradas, salidas, `itemMapper`, estación,
  habilidad, XP y `learn` (libros, investigación, rasgos, profesiones,
  autoaprendizaje por nivel y `meta`). Arriba, los nombres de categorías,
  estaciones y líquidos.
- `data/evolved.json`, `data/fixing.json`, `data/traits.json`,
  `data/professions.json`, `data/moodles.json`,
  `data/tags.json` (qué ítems tiene cada tag, para `tags[base:saw]`).
- `data/skills.json`: las 35 habilidades, por id del juego (`Woodwork`), en el orden de la pantalla de
  habilidades: `{ en, es, cat: {id, en, es}, xp: [10], start?, boost? }`. Ver "Habilidades".
- `data/media.json`: los VHS que dan XP (62 en la 42.21) y las emisiones de TV que dan XP (24, `kind: "tv"`),
  `[{ id, name: {en, es}, kind, xp: {Habilidad: n}, shared?, day?, start?, end?, beforeStart? }]`. `shared: true` (2 en
  la 42.21) avisa que `xp` es un máximo: ver "Medios grabados". `day`/`start`/`end` (minutos desde la medianoche) y
  `beforeStart` son sólo de la TV: ver "Programas de TV".
- `data/index.json`: las fichas del sitio, `{ sec, id, en, es, ref }`, de donde salen
  las direcciones, el sitemap y los slugs en español (`site/src/esSlugs.ts`). `id` es
  el slug del nombre en inglés (el mismo `slugify` que `site/src/route.ts`); `ref`, los
  ids del juego. Los objetos van **uno por nombre en inglés** (3.826 fichas para 4.880
  objetos: los 55 "Paperback" son una); recetas, rasgos, profesiones, habilidades y
  moodles, uno por cada uno; y las dos subpáginas de Servidor (`sec: "server"`, `ref: []`): "Sandbox Presets" /
  "Presets de sandbox" y "Water and Power Shutoff" / "Cortes de agua y luz", texto nuestro en `SERVER_PAGES`.
  Dos con el mismo slug llevan las dos `-<slug del id>`.
  Sin español, va el inglés. Los moodles no tienen nombre propio en el juego (sólo sus
  niveles): el suyo es texto nuestro, en inglés y en español, en `MOODLE_NAMES`
  (`extract.py`); uno nuevo de un parche va con el tipo partido en palabras
  (`HasACold` → "Has A Cold") y sin español hasta que se sume a la tabla.
- `data/server.json` (`server.py`): la pestaña Servidor. Ver "Servidor".
- `data/meta.json`: versión (del `.jar`), build de Steam (`null` fuera de Steam),
  fecha y cantidades; y tres reglas del juego que valen para todas las habilidades: `boostMultipliers`
  (`{"0": 0.25, "1": 1, "2": 1.33, "3": 1.66}` en la 42.21), `boostCap` (3: el nivel de bonificación más alto que guarda
  el juego, y por eso el "3" de `boostMultipliers` vale para "3 o más"), `mediaXpCutoff` (3) y `gameStartMinute` (540:
  la hora de arranque por defecto de una partida nueva, 9:00; `null` si no se pudo leer). Entran en el hash: si un
  parche cambia un multiplicador, `extractedAt` se mueve.
- `data/site/**` (`site.py`, que `extract.py` llama al final): lo que bajan las pestañas Objetos, Recetas, Rasgos,
  Personaje, Habilidades y Moodles, armado con los JSON de arriba (y `data/map/spawns.json`) sin leer el juego.
  - `items-list.json` y `recipes-list.json`: una fila por ficha (nombre en/es, categoría, ícono; en objetos
    también peso, tipo y cuántas variantes junta) y las categorías con su nombre y cuántas fichas tienen. Sin stats:
    son para buscar y navegar.
  - `items/<NN>.json` y `recipes/<NN>.json`: las fichas, `{ slug: ficha }`, repartidas en 100 archivos por pestaña
    con FNV-1a del slug módulo 100 (`shard()` en `site.py`, `pzShard()` en `site/src/zomboid/shard.ts`: tienen que dar
    lo mismo). Cada página baja uno solo (~10 KB con gzip). Son 100 y no 64 porque con 64 tres archivos de objetos
    pasaban los 120 KB (los cuchillos y martillos son herramienta en cientos de recetas); si un parche hace pasar uno,
    se sube en los dos lados.
  - Las relaciones van resueltas: qué recetas hacen (`makes`), gastan (`uses`) o usan de herramienta (`tools`) cada
    objeto, con las etiquetas (`base:saw`) ya abiertas en sus objetos; con qué se repara y qué repara; qué enseña
    (`teaches`) y qué se aprende investigándolo (`research`). En la receta: entradas con sus opciones, resultados (el
    `itemMapper` como `choices`: qué da con cada ingrediente), estaciones y cómo se aprende (`learn: null` si se sabe
    desde el principio, es decir si no tiene `NeedToBeLearn`). Todo enlace lleva el slug de la ficha, no el id del
    juego.
  - `patches/index.json` y `patches/<slug>.json` (la pestaña Parches): una página por versión de la Crónica y por
    foto, con la Crónica y, si hay diff, lo agregado, quitado y cambiado con el slug de la ficha de hoy. `recorded`
    dice si los datos de esa versión están registrados (foto propia o anotada en el `seen` de otra): con `diff`, lo
    que cambió; con `first`, la primera foto (cuántos ids del juego había de cada tipo, no fichas); sin ninguno de
    los dos, la comparamos y no cambió ningún dato. Sin `recorded`, es anterior a la primera foto (42.21). Las fichas
    que cambiaron en las últimas 5 comparaciones (en total, no por ficha) llevan `changes`.
  - `traits.json`, `professions.json`, `skills.json` y `moodles.json`: las fichas de Rasgos, Personaje, Habilidades y
    Moodles, enteras (no repartidas: son pocas y el planificador las necesita todas), en el orden del índice salvo las
    habilidades, que van en el del juego. Los `Ref` tienen la forma de Objetos y Recetas (`{id, en, es, icon?}`, con el
    slug de la ficha).
    - Rasgo: `desc?` (13 no traen descripción: el juego muestra las habilidades que suben), `cost`, `positive`
      (costo > 0, como la lista de buenos del juego; los de costo 0 sólo vienen con una profesión), `professionOnly`,
      `exclusive`, `xpBoosts: {skill: Ref, lvl}[]`, `xpMult?: {mult, skills: id[]}[]` (sólo los cuatro que
      multiplican la XP: ver "Habilidades"; las habilidades van por el slug de su ficha, en el orden del juego),
      `recipes`, `grants` (rasgos que trae: Metabolismo lento trae Sobrepeso), `icon` y `grantedBy` (las profesiones que
      lo dan). En `data/traits.json` el rasgo trae el mismo `xpMult` pero con el id del juego (`Woodwork`).
    - Profesión: `desc?`, `cost`, `xpBoosts`, `traits`, `recipes`, `icon` y `spawnTowns?` (de `data/map/spawns.json`,
      sin distinguir mayúsculas: los spawnpoints dicen `fitnessInstructor` y la profesión `fitnessinstructor`).
    - Habilidad: `cat`, `xp`, `start?`, `boost` (la tabla de multiplicadores ya resuelta), `books` (`{item, from, to,
      mult}`: `to` es `lvlSkillTrained + numLevelsTrained - 1`, el `getMaxLevelTrained()` del juego), `magazines`
      (las revistas cuyas recetas piden o suben esa habilidad: el juego no le pone tema a una revista; las que enseñan
      un saber que no es receta, como cultivos o mecánica de autos, quedan sin habilidad), `media` (los VHS y la TV de
      `media.json` con la XP de esa habilidad, y `shared: true` si es un máximo), `traits` y `professions` (los que la cambian al crear el personaje, con
      su `lvl`; puede ser negativo: Enclenque es Fuerza −5).
    - Moodle: `icon` y `levels: {level, name, desc}[]`.
- `data/craft.json` (`craft.py`, que `extract.py` llama después de `site.py` y `loot.py` al terminar): el grafo de
  fabricación entero para el planificador de Fabricación (forma en `CraftData`, `site/src/zomboid/crafting/data.ts`): las recetas reducidas a
  líneas de slugs (las mismas opciones y el mismo orden que su ficha), qué recetas da cada objeto (`makes`), las
  estaciones con las construcciones que las dan, cómo se aprende cada receta y, con el botín, si cada objeto se
  encuentra (mejor chance ≥ 0,5 %) y dónde es más fácil. `x` marca las que el planificador no elige solas para un paso
  intermedio: abrir cajas (`pack`), reparar (`repair`), las que dan lo que gastan (`self`) y las que deshacen a otra
  (`undo`: desarmar, desatar, desapilar).
- `data/map/*.json` (`map.py`): teselas, mapa de papel, calles, textos, zonas,
  spawns, edificios y escondites; y `data/map/meta.json` con `{ extractedAt,
  dataHash }`: el hash de todos esos JSON y la fecha, que sólo se mueve si el hash
  cambia. Es el `lastmod` de la pestaña Mapa en el sitemap. No cubre los píxeles de
  las teselas (`tiles.json` sólo guarda límites y zooms).
- `data/loot/**` (`loot.py`): el botín, con la chance de que un mueble (o un zombi, una parte de vehículo, un bolso)
  traiga al menos uno con el botín en "Normal" (ver "Decisiones"), redondeada a 5 decimales.
  - `items/<NN>.json` (100, con `shard(slug)` como las fichas): `{ slug: { rooms, nRooms, stash?, zombie?, vehicles?,
    nVehicles?, bags? } }`, sólo las fichas que aparecen en algún lado. `rooms`: hasta 10 `[tabla, mueble, p, fuerza?]`,
    por habitación su mejor mueble (una fila sin fuerza le gana a una forzada), ordenadas por `p`; `_all` es "en
    cualquier lugar sin tabla propia". `stash`: hasta 5 escondites. `zombie`: `m` y `f` (hombre y mujer) y hasta 8
    atuendos (combinados con la tabla del sexo si el atuendo trae `defaultInventoryLoot`). `vehicles`: hasta 5 grupos,
    cada uno con su mejor parte. `bags`: hasta 5 bolsos o cajas (como `Ref`) que lo traen al encontrarlos. Una ficha
    que junta varios ids del juego toma la mayor chance entre ellos.
  - `rooms/<NN>.json` (32, con `shard(nombre, 32)`): `{ items, conts, rooms }`. `rooms` va por el nombre de habitación
    del mapa tal cual (`garage`, `Bathroom`) para las que tienen tabla (exacta o por alias), más `_all`: `{ t: la tabla
    (mechanic para garage), n: cuántas fichas pueden salir, top: hasta 30 [slug, mueble, p, fuerza?] }`. `items` y
    `conts` traen los nombres en/es (y el ícono) de lo que nombra ese archivo, para que la hoja del edificio no baje
    nada más.
  - `common.json`: los nombres en/es de muebles, partes, vehículos, atuendos, escondites y zonas que nombran los
    archivos (escritos a mano en `loot_names.py`: los del juego son ambiguos o no existen), `aliases` (tabla → otros
    nombres de habitación que la usan) y `spots` (por tabla, cuántas habitaciones del mapa la usan y un edificio de
    ejemplo: el más cercano a Muldraugh).
  - `meta.json`: versión, `extractedAt` (sólo se mueve si cambia `dataHash`), `ref` (el botín de referencia), el
    inventario de `--check` y los nombres de las tablas que no existen como objeto (no salen, como en el juego).
- `data/patches/snapshots/` (`patches.py`, que `extract.py` llama antes de escribir): `index.json` (`[{id, version,
  build, recordedAt, seen?}]`, de la más vieja a la más nueva; `seen` son los otros `{version, build}` que se vieron
  con los mismos datos) y una foto por versión, `<id>.json.gz` (~320 KB la 42.21): por
  objeto, receta, rasgo, profesión, habilidad, moodle y opción de sandbox, `{n: {en, es}, f: {campo aplanado: valor}}`.
  `f` lleva lo que muestra la ficha (stats, tags, peso, ingredientes como renglones `1× Base.Plank`, costo, XP…), con
  los textos en su inglés (una traducción corregida no es un cambio del juego) y sin íconos, tooltips ni modelos. El gzip
  es determinista (sin fecha adentro): el mismo dato da los mismos bytes. El id es la versión (`42.21`); un parche que
  no cambia el número, `<versión>-b<build>`. Si los datos son los de la última foto no escribe la foto, pero si el
  build (o la versión) es otro lo anota en `seen`: un hotfix sin cambios de datos, o un parche sólo de Java. Si los
  datos cambian con una versión y un build ya vistos en la última foto, es un cambio del extractor: avisa y reemplaza
  sólo esa foto, con su fecha original, sin tocar ningún diff guardado (cada uno compara fotos de un mismo extractor;
  rehacerlo contra la anterior publicaría el arreglo del extractor como parche). Empieza en la 42.21.
- `data/patches/diffs/<slug>.json` (`42-22.json`): cada foto contra la anterior, `{from, to, kinds: {tipo: {added,
  removed, changed: {id: [{f, b?, a?} | {f, add?, rem?}]}}}, counts, names}`. `b`/`a` son antes/después (falta `b`: el
  campo es nuevo; falta `a`: se fue); las listas sin orden (tags, ingredientes, exclusiones…) dicen `add`/`rem`. Un
  tipo sin cambios no aparece, y uno que falta en una de las dos fotos (el sandbox antes de que existiera) no se
  compara.
- `data/patches/chronicle/<slug>.json` (a mano, desde los borradores de `patches.py news`): la Crónica, una entrada
  por versión del Build 42 estable desde la 42.20, con nuestro resumen en/es. `{slug, version, branch, date,
  unstableDate?, title, summary, highlights: [{en, es}] (0 a 8), hotfixes?: [{version, date, summary, sources}],
  sources: [{kind: "steam", url, gid} | {kind: "notes", url}], updated}`. `branch` dice dónde salió `date` (`stable`, o
  `unstable` si todavía no llegó a estable); `updated` es la última edición y va al `lastmod` del sitemap. Las versiones
  salen de los títulos de Steam con su rama (`42.20.4 STABLE & 42.19.2 UNSTABLE` → sólo la que es ≥ 42.20); un
  `x.y.z` es hotfix de `x.y`. `data/patches/.cache/` (fuera de git) guarda `news.json` y el texto de cada anuncio,
  `<gid>.txt`, que usa `check`.
- `../../site/public/zomboid/{items,build,traits,professions,moodles}/*.webp`:
  sólo los íconos que usa algún dato, sin pérdida. Los muebles usan el sprite de
  su baldosa achicado a 64×64; el resto, 32×32 como en el juego. Netlify distingue
  mayúsculas y Windows no: si un parche le cambia las mayúsculas al nombre de un
  ícono, el extractor borra el archivo con el nombre viejo antes de escribir el nuevo.
- `../../site/public/zomboid/map/{sat,forest,stamps}` (`map.py`): teselas y sellos.

## Decisiones

- Español: `Translate/ES_MX` (Latinoamérica, el mismo criterio que Diablo II) y,
  sólo donde falta o está vacío, `Translate/ES`. Si falta en los dos, `es` queda
  `""` para completarlo a mano: nunca se copia el inglés.
- Afuera: ítems de prueba (nombre con "debug" o `Test…`), los `hidden = true`
  y la categoría `Hidden` (heridas, vendas puestas, maquillaje: capas del
  cuerpo), la plantilla `Base.Moveable` y las recetas de categoría `Debug`.
  La lista queda en `meta.json` → `excluded`.
- Lo que el script no declara queda ausente (p. ej. la ropa sin `Weight`): el
  valor por defecto lo pone el juego y no se inventa.
- Los scripts del juego se leen sin los comentarios `/* … */` ni los `// …`, sean de
  línea entera o al final de un valor (cuando el `//` va precedido de espacio y fuera
  de comillas: una URL no se corta).
- El botín muestra la chance de que **un mueble traiga al menos uno, con el botín en "Normal"** (todos los
  multiplicadores en 1, sin efecto de la población de zombis, día 1), en porcentaje y en palabra (muy común a muy
  raro). El número absoluto depende de la partida (cada preset y la configuración de botín lo suben o lo bajan, y baja
  con los días), pero el orden entre lugares para un mismo objeto no: el multiplicador depende de la categoría del
  objeto, no del lugar. La cuenta (`loot.py`, leída del bytecode de `ItemPickerJava` de la 42.21):
  - qué tabla tira un mueble: la del cuarto (con los alias), si no `other`, si no la `all` del cuarto; y si nada, la
    general (`all.<mueble>` o `all.other`), salvo los muebles que nunca caen en `other` (`NO_GENERIC`);
  - un mueble procedural elige **una** lista de su `procList`: las forzadas por zona, baldosa, cuarto u objeto ganan si
    se cumple la condición (el sitio las marca aparte); las demás compiten con el sorteo del juego, que recorre un
    `HashMap` de Java y no es proporcional al peso (la primera gana 1, la última pierde 1, y con dos de peso 1 la segunda
    no sale nunca). En un cuarto se mira como en su primer mueble procedural (prioridad de `min == 1`, tope de `max`);
  - cada entrada sale por su cuenta en cada tirada con `⌈peso × 100⌉ / 10.000` (× 1,4 en la junk), y
    P(≥ 1) = 1 − Π (1 − p)^tiradas.
  No se modela que el mueble se llene ni lo que cambia después de que ya salió una lista en el cuarto.

## Habilidades

Los números de las habilidades no están en ningún script: están en el código Java. `extract.py` los lee del bytecode de
`projectzomboid.jar` (sin Java: un lector chico de `.class` en Python), buscando patrones cortos, y corta si no los
encuentra. Para mirar el código a mano: `javap -c -p -constants -cp projectzomboid.jar <clase>` (del JDK).

- **XP por nivel** (`perk_factory()`): `zombie.characters.skills.PerkFactory.init()` llama a
  `AddPerk(Perks.X, "Traducción", Perks.Padre, 10 enteros[, pasiva])` por cada habilidad, y el `AddPerk` completo guarda
  `xpN = (int)(argN * 1.5f)` (`PERK_XP_REQ_MULTIPLIER`). `xp[i]` es la XP para pasar del nivel i al i+1: 75, 150, 300,
  750, 1.500, 3.000, 4.500, 6.000, 7.500 y 9.000 en todas, salvo Fuerza y Estado físico (1.500 … 150.000). El padre es la
  categoría (`cat`) y "Traducción" la clave `IGUI_perks_<…>` del nombre.
- **Multiplicadores de bonificación** (`xp_boost_rules()`): `zombie.characters.IsoGameCharacter$XP.AddXP(Perk, float,
  boolean×4)` multiplica la XP según la bonificación de profesión + rasgos en esa habilidad: 0 → ×0,25, 1 → ×1,
  2 → ×1,33, 3 o más → ×1,66. Excepciones, de `isSkillExcludedFromSpeedReduction/Increase` y del mismo método: Carrera
  sin el ×0,25 y ×1,25 con 1; Fuerza y Estado físico, ×1 siempre. La general va a `meta.json`; la de cada excepción, a su
  habilidad (`boost`).
  - **Las etiquetas "+75 %", "+100 %" y "+125 %" no se usan.** La pantalla de creación del personaje las muestra
    escritas a mano (`CharacterCreationProfession.lua:944-949`, `drawXpBoostMap`: "+ 75%", y "+ 100%" con nivel 2 y
    "+ 125%" con 3 o más) y la barra de la habilidad también (`ISSkillProgressBar.lua:83-91`: "75%", "100%", "125%").
    No son una cuenta: son textos, y no coinciden con lo que multiplica `AddXP`. Los números del código los confirma el
    antitrampas del servidor, `zombie/network/anticheats/AntiCheatXPUpdate.getMaxPerkXpBoostMultiplier`, que lleva las
    mismas constantes (1,0 / 1,33 / 1,66 / 0,25, y 1,3 dos veces, las de los rasgos). Vale la del código.
- **Multiplicadores de rasgos** (`xp_trait_multipliers()`): en el mismo `AddXP`, justo después de la cadena de la
  bonificación y antes de aplicar el resultado, el juego multiplica el acumulador (la variable local 10, que ya trae el
  ×0,25…×1,66) por cada rasgo que tenga el personaje: `characterTraits.get(CharacterTrait.X)` y, si lo tiene, una
  condición sobre la habilidad y `× constante`. Son cuatro bloques (42.21):
  - Aprendiz rápido (`fastlearner`): ×1,3 en todas menos las de `isSkillExcludedFromSpeedIncrease` (Estado físico y
    Fuerza): 33;
  - Aprendiz lento (`slowlearner`): ×0,7 en todas menos las de `isSkillExcludedFromSpeedReduction` (Carrera, Estado
    físico y Fuerza): 32;
  - Pacifista (`pacifist`, en el sitio "Reluctant Fighter"): ×0,75 en los seis de cuerpo a cuerpo (Hacha, Contundente
    largo y corto, Filo largo y corto, Lanza) y en Puntería; no en Recarga ni en Mantenimiento: 7;
  - Ingenioso (`crafty`): ×1,3 en toda habilidad cuyo padre es la categoría Elaboración (Crafting): 12.

  Se extrae como `xpMult: [{mult, skills}]` en cada uno de esos rasgos, con las habilidades ya abiertas en ids
  concretos y en el orden de `skills.json`. Es siempre una lista, para que quien lo lea tenga un solo camino; hoy cada
  rasgo tiene un solo elemento. La cuenta para el planificador: XP ganada = XP base × `boost[min(boostCap, nivel de
  bonificación)]` × el `mult` de cada rasgo del personaje que incluya esa habilidad (se multiplican entre sí, y no
  reemplazan a la bonificación). Cada bloque se lee así: el rasgo es el `CharacterTrait.X` de la instrucción anterior
  al `get` (FAST_LEARNER → `fastlearner`), y adentro se juntan los `Perks.X` que se comparan, las excluidas
  (`isSkillExcluded…` seguido de `ifne`), la categoría (`Perk.getParent`) y la constante que multiplica. El extractor
  corta, en vez de adivinar, si el rasgo no está en `traits.json`, si hay una instrucción desconocida en un bloque (un
  `ifeq` donde iría un `ifne`, por ejemplo), si un bloque tiene dos multiplicadores distintos o si dos bloques
  multiplican la misma habilidad.
- **Nivel inicial y tope** (`start_levels()`): `zombie.characters.IsoGameCharacter.applyTraits(List)` arranca con
  Fuerza y Estado físico en 5, suma profesión y rasgos, recorta a 0–10 y guarda como bonificación `Math.min(3, nivel)`.
  Ese 3 se lee de ahí (el `iconst_3` antes del `Math.min`) y va a `meta.json` como `boostCap`.

## Servidor

`server.py` arma `data/server.json` (lo llama `extract.py`; solo, `python games/zomboid/tools/server.py` imprime el
informe sin escribir nada). Nada de esto está en un archivo de datos del juego:

- **Opciones de sandbox** (269 en la 42.21): el constructor de `zombie.SandboxOptions` y de sus clases internas
  (`ZombieLore`, `ZombieConfig`, `MultiplierConfig`, `Map`, `Basement`, en el orden en que el constructor las crea)
  llama a `newBooleanOption`, `newDoubleOption`, `newIntegerOption`, `newEnumOption` y `newStringOption` con
  constantes, y a veces a `setTranslation` / `setValueTranslation`. Se juntan esas constantes. Los dos enum "fuertes"
  (`InjurySeverity`, `DamageToPlayerFromHitByACar`) toman la cantidad y el orden de su `enum` (`<clinit>`).
  - Textos de `Translate/*/Sandbox.json`: nombre `Sandbox_<traducción o nombre corto>`, ayuda `…_tooltip` (las
    numéricas de `ZombieConfig`, `…_help`, como en el juego) y etiquetas `Sandbox_<traducción de valores o
    traducción o nombre corto>_option<i>`. StartYear (desde `getFirstYear()`, 1993) y StartDay no tienen etiquetas:
    se escribe el número. El `\n` escrito en el JSON, el `<LINE>` y el `<br>` pasan a salto de renglón.
  - `default` es el del constructor de Java. Ojo: el constructor termina con `loadGameFile("Apocalypse")` y
    `setDefaultsToCurrentValues()`, así que en el juego el "Default" de una opción es el de Apocalipsis (ver
    `presets[0].values`).
  - Hojas: `SettingsTable` de `media/lua/client/OptionScreens/ServerSettingsScreen.lua` (parte `Sandbox`), leída por
    profundidad de llaves. Las 12 que Java tiene y el menú no muestra van a `Hidden` (nombre nuestro).
- **Presets**: los cinco de `SandboxOptionsScreen:loadPresets` (`media/lua/shared/Sandbox/*.lua`), leídos con
  `lua_table`, un lector que acepta sólo tablas de valores (y `tonumber(A.B)` de las constantes de `defines.lua`): no
  se ejecuta Lua. `values` es el preset como lo carga el juego, menos lo que coincide con el default de Java: el
  juego arma cada preset sobre Apocalipsis (`new()`/`resetToDefault()` + `loadGameFile`, que no resetea), así que
  `preset = (Java ⊕ Apocalypse.lua) ⊕ archivo`. La página arma `Java ⊕ values`. Cantidades: 45 / 88 / 78 / 70 / 61.
  `baseline: "apocalypse"` dice cuál es el "Default" efectivo. Un valor fuera de rango no pisa (como `setValue`).
  `SixMonthsLater.lua` es del formato viejo (`VERSION = 5`, `XpMultiplier` y `LootRespawn`, que ya no existen y no entran).
- **`.ini`** (144): el constructor de `zombie.network.ServerOptions`, cada `new <Tipo>ServerOption(this, "Nombre",
  …)`. Hojas de la parte `INI` de `SettingsTable` (los paneles sin opciones no cuentan; el resto va a `Hidden`) y ayuda
  de `UI_ServerOption_<Nombre>_tooltip`. `ResetID`, `ServerPlayerID` y `Seed` nacen con un valor que el servidor sortea
  la primera vez: llevan `random: true` y un default vacío (0 / "").
- **Cortes de agua y luz**: `shutoff` sale del `tableswitch` de `SandboxOptions.randomWaterShut` y
  `randomElectricityShut` (cada caso es `Rand.Next(a, b)`, de a a b − 1, o una constante). Sólo se sortean al crear una
  partida de un jugador; en un servidor manda `WaterShutModifier` / `ElecShutModifier`. `rules` (`dayStartHour` 7,
  `monthDays` 30, `firstYear` 1993) lo vigila `world_age_guard()`: si un parche cambia la cuenta de la edad del mundo
  (`GameTime.getWorldAgeDaysSinceBegin` / `getWorldAgeHours`) o qué compara el agua (`IsoObject`) o la luz
  (`doesPowerGridExist`), corta. `startHours` y `dayLengthMinutes` salen de las etiquetas en inglés de `StartTime` y
  `DayLength`.

Tests: todos los de Python viven en `tools/tests/` y corren juntos con
`python -m unittest discover -s games/zomboid/tools/tests -v` (los que leen el juego se saltean si no está instalado).

## Medios grabados

`media.json` sale de `media/lua/shared/RecordedMedia/recorded_media.lua` (cada VHS o CD con sus líneas y los códigos de
cada línea) y de `Translate/*/Recorded_Media.json` (el nombre). Qué código sube qué habilidad y cuánto lo dice
`media/lua/shared/RadioCom/ISRadioInteractions.lua`: `Interactions.CRP = … doSkill(…, Perks.Woodwork)` (33 códigos de
habilidad; uno, `CMB`, apunta a `Perks.Combat`, que es una categoría y no una habilidad, y ningún medio lo usa), y
`doSkill` da `50 × puntos` de XP. Sólo cuentan los puntos positivos, y es la XP base: después pasa por los
multiplicadores, y desde el nivel `mediaXpCutoff` (3, del preset Apocalypse) no da nada.

Cada línea cuenta una vez, **por jugador y por clave de texto, en todos los medios juntos**, no por cinta: `checkPlayer`
anota la clave (`addKnownMediaLine`) y, si ya la tenía, no hace nada. Hay dos claves con código de habilidad que están
también en otra cinta:

- `RM_e7cb35a9…` (`CRP+1`, Carpintería): la da "VHS: Woodcraft E3" y está en las otras seis cintas de Woodcraft (E1, E2
  y E4 a E7), donde sólo baja el aburrimiento. Si se mira una de ésas primero, E3 da 200 y no 250.
- `RM_6f6e503c…` (`MTL+1`, Soldadura): la da "Home VHS: no 9" y está en "Home VHS: nof vid", que a esa línea le pone una
  receta. Si se mira "nof vid" primero, "no 9" da 350 y no 400.

Esas cintas llevan `shared: true` en `media.json` y en las filas `media` de la habilidad: su `xp` es un máximo ("hasta"),
no un valor fijo. Se detecta mirando las claves de todos los medios (una clave con código de XP en esta cinta que
también está en otra), no con ids escritos a mano.

Los códigos se leen como los lee el juego: se parte por `,` sin recortar espacios, y cada uno son tres letras, el signo
(`-`, `+` o `=`) y al menos un carácter de cantidad. Con un espacio de más (" CRP+1") el juego lee el código " CR" y no
hace nada, así que el extractor tampoco.

### Programas de TV

Life and Living TV (`media/radio/RadioData.xml`) da XP de cocina, carpintería, pesca, rebuscar, trampas y agricultura
con los mismos códigos (`build_tv` en `extract.py`): 24 emisiones en los días 1 a 9 de la 42.21, en `media.json` con
`kind: "tv"`. Una emisión es sólo un canal, un día y un horario, sin nombre de programa (sacarlo del diálogo, "Welcome
back to the Cook Show", sería inventarlo): la ficha la nombra por canal, día y horario. Cada una sale una sola vez.
`beforeStart` marca la del día 1 que termina antes de la hora de arranque por defecto (`gameStartMinute`, 9:00): con
esa hora no se ve (se ve si la partida arranca antes), y la ficha la muestra con su aviso y sin sumarla al total.

Afuera, a propósito:

- Los CD: en la 42.21 sólo bajan el aburrimiento; ninguno da XP.
- Las recetas que enseñan algunos VHS (`RCP=MakeFishingRod`, las cercas de metal) y los códigos de ánimo (aburrimiento,
  estrés, pánico, cansancio).

## Modelo 3D

```
python games/zomboid/tools/model3d.py           # escribe (sólo lo que cambió)
python games/zomboid/tools/model3d.py --check   # inventario y tamaños, sin escribir nada
```

Va después de `extract.py`: necesita `data/index.json`, `data/items.json`, `data/meta.json` y
`data/professions.json` (si falta alguno, corta y dice qué correr). Tarda ~2 min (los 50 afiches). Escribe:

- `data/outfits.json`: el contrato con el sitio. Por profesión y sexo, la textura de la piel (`skin`), las piezas con
  modelo (`pieces`: `.glb` + textura, y `bone` si va colgada de un hueso), el pelo (`hair`), el afiche (`poster`) y lo
  que lleva puesto (`wear`, de la cabeza a los pies, con el nombre en/es de `items.json` y el `slug` de la ficha si
  tiene). Las rutas son relativas a `/zomboid/3d/`. ~46 KB, ~3,6 KB gzip.
- `site/public/zomboid/3d/`: `body-{m,f}.glb` (cuerpo + esqueleto + idle), `piece/<.x en minúsculas>.glb` (sólo las
  que usa algún atuendo, pelo incluido), `tex/<8 hex del SHA-1>.webp` (por contenido: los atuendos iguales comparten
  archivo; Desempleado, Ranchero, Herrero y Sastre comparten todo) y `poster/<prof>-<m|f>.webp` (360×480, fondo
  transparente). Lo que ya no sale se borra; lo que no cambió no se toca.

El atuendo de cada profesión: de `default.<Sexo>`, lo que no tiene `chance`; de la profesión (`<Sexo>`, o `Female`
si no lo define), todo, pisando el lugar del default; siempre el primer ítem de cada lista; sin rasgos. Se respetan
`setExclusive` (una prenda saca a la otra) y `setHideModel` de `BodyLocations.lua` (la corbata del ingeniero se lleva
puesta, sale en `wear`, pero bajo el chaleco no se dibuja). El pelo es `Short` (hombre) o `Bob` (mujer) en castaño,
y bajo un sombrero la variante que pide su `m_HatCategory` (gorras y gorros → `Hat`; el barbijo, `nobeard`, no lo
aplasta). Las prendas que el juego tiñe al azar llevan un color fijo (`TINTS` en `model3d.py`): una prenda teñible
nueva sin color ahí corta el programa. Los presupuestos de peso (cuerpo ≤ 90 KB, pieza ≤ 25 KB, textura ≤ 30 KB,
afiche ≤ 25 KB, primera vista 3D ≤ 180 KB) se controlan antes de escribir; si un parche los rompe, corta.

`tools/tests/test_model3d.py`: `AtuendoTest` (lee el juego) fija los atuendos y el afiche; `SalidaTest` revisa
`outfits.json` contra los archivos y los presupuestos.

## Modelo 3D — lo medido

Medido el 1/10 contra la 42.21 con un prototipo (`.x` → `.glb` del cuerpo, el esqueleto, el idle y el atuendo de
Bombero hombre), antes de escribir el conversor (`xfile.py`, `gltf.py`, `model3d.py`). Lo que sigue es lo que esas
piezas dan por hecho; `tools/tests/test_model3d.py` (`InventarioTest`) vigila lo que un parche puede romper.

**Formato.** Los 743 `.x` de `models_X/Skinned` y los 431 de `models_X/Static` son texto (`xof 0303txt 0032`); también
`anims_X` (2.209). Las matrices del `.x` (16 números, vector fila, traslación en 12–14) tienen el mismo orden en
memoria que la `matrix` de glTF; lo único que cambia es la mano: se espeja Z (`S·M·S` con `S = diag(1, 1, −1)`, la
posición y la normal con `z → −z`, y se da vuelta el sentido de las caras). Las UV van tal cual (las dos tienen el
origen arriba a la izquierda). Con eso el cuerpo queda parado (Y arriba), mirando a +Z, la remera se lee al derecho y
`Bip01_R_Hand` queda a la izquierda de quien lo mira de frente (x = −0,150).

- Las claves `R` de las animaciones son `(w, x, y, z)` **conjugadas** respecto de la matriz: comparadas con los
  `FrameTransformMatrix` de `Bob_Idle.x` (que son el cuadro 0), el cuaternión directo erra hasta 2,0 y el conjugado
  1,7·10⁻⁶. Con el espejo, la clave `(w, x, y, z)` del `.x` es `(x, y, −z, w)` en glTF; la `T` es `(x, y, −z)`. Las
  `S` son todas 1.
- Los `FrameTransformMatrix` de `MaleBody.x` **no** son la pose de unión (`offset × mundo` da hasta 1,5 lejos de la
  identidad): son un cuadro de una animación. La pose de unión está sólo en el `matrixOffset` de cada `SkinWeights`, y
  eso es lo que va a `inverseBindMatrices`. Como reposo de los nodos se usa el cuadro 0 del idle.
- Un `.x` puede traer más de una malla: `Bob_Trousers.x` trae `Bob_Trousers` (186 vértices) y `Bob_LongShorts` (106).
  El juego elige como `ProcessedAiScene.findMesh` sin nombre: **la primera malla con huesos** (si no hay, la primera).
- En el cuerpo, las caras de normales son las mismas que las de vértices y hay una UV por vértice (617 / 617 / 617):
  no hace falta separar vértices. 916 triángulos, hasta 3 pesos por vértice, 28 huesos con peso.

**1. Máscaras.** `CharacterMask$Part` (`<clinit>`) declara `Torso` (1) y `Pelvis` (2) **con subdivisiones**: `Chest`
(12) y `Waist` (13) tienen de padre a `Torso`; `Belt` (14) y `Crotch` (15), a `Pelvis`. `setPartVisible` de una parte
con subdivisiones se aplica a sus hijas y `forEachVisible` recorre sólo las hojas (las 14 que tienen PNG en
`textures/Body/Masks`; `Mask.png` no se usa acá). O sea: `Torso` = `Chest` + `Waist`, `Pelvis` = `Belt` + `Crotch`.
La máscara **borra**: `ModelInstanceTextureCreator.applyCharacterTexture` dibuja la piel en una textura limpia sólo a
través de las hojas visibles (`SmartTexture.addMaskedTexture` → shader `bodyMask`: alfa de la piel × alfa de la
máscara, mezcla `SRC_ALPHA, ONE_MINUS_SRC_ALPHA`), así que lo tapado queda con alfa 0, y `basicEffect.frag` descarta
el píxel si el alfa es < 0,01: el cuerpo tiene un agujero donde va el pantalón. En glTF: `alphaMode: "MASK"`,
`alphaCutoff: 0.01`. En los PNG de máscara (modo `P`), el índice 0 es transparente y el resto opaco. La textura de
un sombrero (`m_MasksFolder` con `Clothes/Hat/Masks`) no se recorta: `addClothingItem` le pone la máscara entera.

**2. Orden y tinte.** `WornItems.setItem` inserta cada prenda ordenada por `BodyLocationGroup.indexOf`, que es el orden
de `group:getOrCreateLocation` en `media/lua/shared/NPCs/BodyLocations.lua` (Belt 4, Hat 18, Tshirt 26, Socks 46,
Shoes 48, Pants 55…). `ModelInstanceTextureCreator.init` recorre las prendas de la última a la primera acumulando las
`m_Masks` (`getClothingItemCombinedMask`): cada prenda se dibuja sólo donde no la tapa ninguna de las que van
**después** en ese orden, y la piel, donde no tapa ninguna. `render` las pinta de la primera a la última, cada una
encima de la anterior (misma mezcla). El tinte **multiplica**: `SmartTexture.addTint` usa el shader `hueChange`
(`col.rgb *= (R, G, B)`), y las piezas con modelo lo llevan en `TintColour` de `basicEffect.frag`.

**3. Colores por defecto.** No hay uno fijo en el juego:

- Prenda con `m_AllowRandomTint`: `ItemVisual.getTint` sortea (`OutfitRNG.randomImmutableColor`: HSB con H al azar,
  S de 0 a 0,6 y B de 0,1 a 0,9; 0,2 con "sin ropa negra") la primera vez que se pide, y la pantalla de creación
  muestra eso (`CharacterCreationMain:updateColorButton`). Sin `m_AllowRandomTint`, blanco (la textura tal cual). El
  sitio fija una constante por prenda (Task 3).
- Piel: `HumanVisual.getSkinTexture` = `MaleBody0<índice+1>` / `FemaleBody0<índice+1>` + `a` en el hombre si tiene
  pelo en el pecho (`bodyHair ≥ 0`). La pantalla arranca con un sobreviviente al azar (`SurvivorFactory.CreateSurvivor`);
  sus cinco muestras de piel (`skinColors`) son los índices 0–4 y el pelo en el pecho viene apagado. `MaleBody02a`
  es sólo el material escrito en `MaleBody.x`. El sitio usa `MaleBody01` y `FemaleBody01` (la primera muestra, sin
  pelo en el pecho).

**4. Esqueleto de las piezas.** Los `matrixOffset` de las piezas coinciden con los del cuerpo: de las 22 piezas con
modelo del atuendo de cada profesión, hombre hasta 0,0025 (`Bob_HighVisVest`) y mujer hasta 0,0038
(`Kate_HighVisVest`), salvo `Bob_Tie` en la mujer (0,051, es el modelo de hombre). Los `FrameTransformMatrix` no
coinciden (cada archivo guarda otra pose), y no importan. Cada pieza va con **sus** `inverseBindMatrices` y los
huesos del cuerpo por nombre, que es lo exacto. Las piezas de `Static` sin `SkinWeights` (gorras, anteojos) están en el
espacio del hueso de `m_AttachBone`, con el `Frame` en identidad: van como hijas de ese nodo, tal cual
(`M_BaseballCap` queda bien sobre la cabeza). `M_Necklace_Dogtags`, aunque está en `Static`, trae piel.

**5. Idle.** `AnimSets/player/idle/Idle.xml`: `Bob_Idle` con `m_SpeedScale` 0,48 y la mezcla `Bob_Idle` con 0,80.
`m_Scalar IdleSpeed` es la posición de la mezcla, no la velocidad (`IsoGameCharacter.calculateIdleSpeed` = 0,01 + 0,25
por nivel de cansancio: descansado queda en `Bob_Idle`). 21 claves cada 160 ticks a 4.800 por segundo = 0,667 s; a
0,48 × 0,8 son **1,74 s por vuelta**. Se mueven 21 canales (columna, cabeza, clavículas, brazos, piernas) y ningún
vértice se mueve más de 1 cm: respira, no se balancea. La mujer usa la misma `Bob_Idle` (no hay `Kate_*` en
`AnimSets/player`); con las `T` del hombre, sus brazos se estiran hasta 1,3 cm, así que en la mujer se toman las
rotaciones y la traslación de `Bip01`, y el largo de los huesos es el del cuerpo.

**Tamaños del prototipo** (`float32`, sin comprimir): cuerpo + esqueleto + idle 58 KB; `Bob_Trousers` 15 KB;
`M_BaseballCap` 4,6 KB; textura compuesta del bombero 21,5 KB en WebP sin pérdida (el pantalón 23,7 KB, la gorra
5,1 KB). La primera vista del bombero suma ~128 KB.
