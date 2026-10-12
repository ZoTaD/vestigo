# Terraria — etapa 1: Portada, Objetos y Árbol de crafteo (2026-10-12)

Juego nuevo de Vestigo, en la categoría Survival & sandbox. Sigue las reglas de la casa y las 8 reglas de
rendimiento de `CLAUDE.md`.

**Para qué:** Terraria tiene 37 mil jugadores de promedio y un solo sitio grande, la wiki. No hay sitio de
herramientas. La etapa 1 pone la base (todos los objetos, con ficha) y la herramienta que la wiki no tiene: el árbol
de crafteo completo de cualquier objeto, hasta los materiales base.

**Público:** inglés primero; español a la par, sin venderlo ("en español") en la UI, títulos ni SEO.

**Éxito de la etapa:** las tres pestañas publicadas, dentro del presupuesto de rendimiento, con cada ficha
prerenderizada en los dos idiomas y en el sitemap.

## Alcance

| Entra | No entra (etapas 2 y 3, o aparte) |
|---|---|
| Portada | Bosses (checklist de progresión) y NPCs (felicidad, pilones): etapa 2 |
| Objetos: lista y ficha | Classes, Fishing y Patches: etapa 3 |
| Árbol de crafteo | Visor de mundos (subir el archivo del mundo): proyecto aparte |
| Extractor de datos y de sprites | Fichas de enemigos y de NPC |

En la Portada, las pestañas de las etapas 2 y 3 se ven apagadas ("Soon"), como en Rust y Zomboid.

## Datos de partida

Terraria 1.4.5.8 (build de Steam 24893155), instalado en `C:\Program Files (x86)\Steam\steamapps\common\Terraria`.
Probado el 12/10 con una sonda:

- **Stats y recetas:** se le piden al propio `TerrariaServer.exe` por reflexión, sin descompilar. Devuelve 6.195
  objetos con todos sus campos (`Item.SetDefaults`) y 3.603 recetas (`Recipe.SetupRecipeGroups` +
  `Recipe.SetupRecipes`): 3.214 objetos fabricables y 325 recetas con grupos ("cualquier madera").
- **Textos oficiales:** recursos embebidos `Terraria.Localization.Content.{en-US,es-ES}.*.json` (7.070 nombres de
  objeto en español, más descripciones).
- **Sprites:** `Content/Images/*.xnb`, comprimidos con LZX. 6.134 de objetos, más interfaz, fondos y caras de jefes.
- **Sin resolver:** `ContentSamples.Initialize()` falla en `Projectile.SetDefaults`; le falta inicialización de
  `Main`. De eso dependen los drops de enemigos (`ItemDropDatabase`), las tiendas de NPC y el nombre de cada
  estación (`Recipe.GetRequiredTileName`).

**Decisión de ZoTaD (12/10):** la etapa 1 se publica aunque los drops y las tiendas no se destraben; "De dónde sale"
se completa después.

## Extractor (`games/terraria/`)

Tres piezas, cada una con una sola tarea:

1. **`tools/Dump.cs`** — programa de consola en C# (x86, .NET Framework 4, compilado con el `csc.exe` de Windows).
   Carga `TerrariaServer.exe`, resuelve XNA y las DLL embebidas con `AssemblyResolve`, y escribe en
   `games/terraria/cache/`: `items.json`, `recipes.json`, `groups.json` (grupos de receta), `tiles.json` (estación →
   objeto que la coloca y su nombre), los JSON de textos y, si se destraba, `drops.json` y `shops.json`.
   - Antes de tocar `Main`: `Program.SavePath` a una carpeta propia dentro de la caché (no toca las partidas del
     usuario) y `Main.dedServ = true`.
   - XNA no hace falta instalarlo: las DLL se extraen del `xnafx40_redist.msi` de la carpeta del juego con
     `msiexec /a` a la caché.
   - Cada bloque (objetos, recetas, drops…) va en su propio `try`: si uno falla, lo dice y los demás salen igual.
2. **`tools/xnb.py`** — lector de texturas XNB con descompresor LZX propio (no hay paquete de Python). Saca a PNG los
   sprites de objeto recortados a su primer cuadro (la cantidad de cuadros de los animados sale de `Dump.cs`), y el
   arte de la sección: logo, fondos de cada capa, casilleros, caras de jefes.
3. **`tools/site_data.py`** — arma lo que lee el sitio en `games/terraria/data/` a partir de la caché. No lee el
   juego: se puede volver a correr sin tenerlo instalado.

`games/terraria/cache/` no se versiona (como la de Rust) y lleva un README con cómo regenerarla. El orden de
trabajo en cada parche del juego es `Dump.exe` → `xnb.py` → `site_data.py`, anotado en `games/terraria/README.md`.

### Qué objetos entran

Todos los que tienen nombre y no están marcados como obsoletos (`ItemID.Sets.Deprecated`). Sin recortes por
"interés": estandartes, cuadros y bloques también se buscan.

### Slugs

- En inglés, del nombre oficial (`terra-blade`); en español, del nombre oficial en español (`espada-terra`).
- Si dos objetos comparten nombre, el segundo lleva el id (`music-box-1601`).
- Estables entre parches: `site_data.py` usa el `slugs.json` anterior como ancla, igual que Rust.

## Datos del sitio (`games/terraria/data/`)

| Archivo | Para qué |
|---|---|
| `meta.json` | Versión del juego, cantidades (objetos, recetas, fabricables). Lo lee la portada del sitio. |
| `site/list.json` | Índice liviano: id, slug, nombres EN/ES, tipo, rareza, sprite y las dos o tres cifras de la fila. Lista y buscador. |
| `site/slugs-es.json` | Slug en español → slug en inglés. |
| `site/items/<n>.json` | Las fichas, partidas en pedazos por id (como las de Zomboid en `store.ts`). |
| `site/recipes.json` | Todas las recetas en forma compacta, para el árbol. Lo importa sólo la pestaña de crafteo y la ficha. |
| `home.json` | Los "más buscados" y los atajos de la portada, elegidos a mano. |

Cada pestaña importa lo suyo con `import()`; nada entra al chunk de entrada. Los JSON se importan enteros.

Los sprites van como PNG sueltos en `site/public/terraria/items/<id>.png` (pesan unos cientos de bytes cada uno),
con `loading="lazy"`, `decoding="async"` y caja fija. No hace falta armar hojas de sprites: las listas se dibujan por
tandas y sólo piden lo que se ve. (En el chat había dicho "hojas agrupadas"; al mirar cómo lo resuelve Rust, los
sueltos son más simples y cumplen igual el presupuesto.)

## Direcciones

| Página | EN | ES |
|---|---|---|
| Portada | `/en/terraria` | `/es/terraria` |
| Objetos | `/en/terraria/items` | `/es/terraria/objetos` |
| Ficha | `/en/terraria/items/<slug>` | `/es/terraria/objetos/<slug-es>` |
| Árbol de crafteo | `/en/terraria/crafting` | `/es/terraria/crafteo` |

El objeto elegido en el árbol viaja en el `#hash` (`/en/terraria/crafting#zenith`): es una herramienta, no una
página por objeto, y así no se duplican las ~12 mil fichas en el prerender.

## Pestañas

### Portada

La maqueta C aprobada (`.superpowers/brainstorm/terraria-2026-10-12/maq/c.html`): cielo con el logo, título y
buscador; debajo, las capas con las herramientas, los objetos más buscados y las cifras de `meta.json`. La franja de
progresión por jefes de la maqueta no entra todavía (es de la etapa 2): su lugar lo ocupan los atajos por tipo de
objeto.

### Objetos

- **Lista** con buscador y filtros por tipo (armas cuerpo a cuerpo, a distancia, mágicas, de invocación, armaduras,
  accesorios, herramientas, consumibles, materiales, bloques y muebles, vanidad, otros) y por rareza. El tipo se
  deriva de los campos del juego (`melee`, `ranged`, `magic`, `summon`, `accessory`, `headSlot`, `pick`,
  `createTile`, `consumable`, `vanity`…). Filas con `LazyRows`.
- **Ficha:**
  - nombre en su color de rareza, sprite y descripción oficial;
  - stats como las muestra el tooltip del juego: daño y clase, golpe crítico, velocidad y retroceso en palabras
    (con la cifra al lado), defensa, poder de pico/hacha/martillo, maná, curación, precio de venta en monedas;
  - **receta:** ingredientes, cantidad que sale y estación, más las condiciones (agua, miel, lava, cementerio,
    nieve); si hay varias, todas;
  - **se usa en:** las recetas donde es ingrediente, incluidas las que lo aceptan por grupo;
  - **de dónde sale:** crafteo siempre; drops y tiendas cuando el extractor los dé. Si no hay nada que mostrar, el
    bloque no se dibuja;
  - enlace "ver el árbol completo" a la pestaña de crafteo.
- El H1 es el nombre del objeto y el título lleva lo que se busca ("Terra Blade — recipe, stats and uses").

### Árbol de crafteo

- Se elige un objeto fabricable (buscador propio, o llegando desde una ficha) y se despliega el árbol hasta los
  materiales base.
- **Materiales base:** lo que no tiene receta, o lo que cerraría un ciclo (hay recetas de ida y vuelta, como
  plataformas ↔ madera): el árbol nunca vuelve a expandir un objeto que ya está en su propia rama.
- **Varias recetas:** se usa la primera y cada nodo deja cambiarla.
- **Grupos** ("cualquier lingote de hierro"): una sola casilla con el nombre del grupo; al abrirla se ven las
  opciones.
- **Resumen:** total de cada material base para la cantidad pedida (con selector de cantidad) y la lista de
  estaciones necesarias.
- La lógica del árbol (expansión, ciclos, totales) va en un módulo sin React, con tests propios.
- En teléfono el árbol es una lista con sangría que se pliega, no un diagrama.

## Estética

La C "World slice": la página es un corte del mundo.

- **Capas:** cielo (portada), superficie, subsuelo de tierra (Objetos), caverna de piedra (Árbol de crafteo),
  inframundo (reservado para lo de Hardmode de las etapas siguientes). Cada pestaña usa el fondo de su capa, con el
  arte del juego.
- **Regla de profundidad** fija a la izquierda: es la navegación entre pestañas. En teléfono pasa a una fila arriba.
- **Tarjetas:** huecos oscuros cavados en el bloque, con filo negro. Sin bordes ni barras de color.
- **Texto del juego:** Comic Neue 700 con filo negro para títulos y nombres (la tipografía original, Andy Bold, es
  comercial). El cuerpo sigue en la tipografía del sitio.
- **Rareza:** el color del nombre, con los doce colores del juego.
- **Píxeles:** todo el arte con `image-rendering: pixelated` y en múltiplos enteros de su tamaño.
- Las palabras no se cortan: los títulos largos se achican con container queries.

## Integración con el sitio

- `route.ts`: vista `terraria` y sus secciones (`home`, `items`, `crafting`), con los nombres de ruta en ES.
- `areas.ts` y `areaFiles.ts`: `src/Terraria.tsx`; la portada y cada pestaña en su propio `import()`.
- Barra y portada del sitio: Terraria se suma a `gameGroups.ts` (Survival & sandbox) y a los mapas de `Nav.tsx`, y
  recibe su panel en `Home.tsx`. **Depende del PR de categorías (ZoTaD/vestigo#4):** tiene que estar en `main`
  antes de conectar esta parte.
- `navSearch.ts`: el buscador de la barra busca fichas de Terraria.
- `vite.config.ts`: alias `@terraria`, sitemap `sitemaps/terraria.xml` con `lastmod` real, y las fichas en
  `sitemapPaths` para el prerender.
- `netlify.toml`: `games/terraria/data` en el `ignore`, caché larga para `/terraria/items/*`, y `/terraria` →
  `/en/terraria`.
- Pie de la sección: aviso de no afiliación con Re-Logic. Nada sobre de dónde salen los datos.

## Rendimiento

- Las páginas nuevas van a `PAGES` de `site/scripts/perf.mjs` (portada, lista, una ficha, el árbol con Zenith
  cargado) y tienen que pasar el presupuesto.
- **Riesgo principal: el build.** Son unas 12 mil páginas más sobre 24.542 (+50 %). Se mide el pico de RAM y el
  tiempo de `npm run build` antes y después; el tope en Netlify es 6 GB y hoy está en 2,3 GB / 93 s. Si no entra,
  la salida es prerenderizar sólo los objetos con receta o con uso (unos 4 mil) y dejar el resto para la SPA, y se
  consulta antes de hacerlo.

## Errores y casos borde

- Un objeto sin sprite (hay 61 ids más que texturas) usa un casillero vacío, no una imagen rota.
- Un slug que no existe da el 404 real del sitio.
- Un `#hash` del árbol que no corresponde a ningún objeto fabricable muestra el buscador vacío con un aviso.
- Las recetas con `requiredTile` sin objeto conocido muestran "a mano" sólo si el valor es −1; cualquier otro caso
  sin nombre hace fallar `site_data.py`, para enterarse en el extractor y no en la página.

## Pruebas

- **Python** (`games/terraria/tools/tests/`): slugs únicos y estables; toda receta apunta a objetos que existen;
  todo objeto de `list.json` tiene su pedazo de ficha; los grupos se resuelven; la Zenith tiene sus 10 ingredientes
  y la Terra Blade sus 3 (valores verificados con la sonda).
- **Vitest** (`site/test/`): el módulo del árbol (ciclos, cambio de receta, totales con cantidad, grupos); las rutas
  EN/ES ida y vuelta; `areas.test.ts` con la vista nueva.
- **`check:links`** sobre el build completo y `npm run perf`.

## Orden de trabajo

1. Extractor: `Dump.cs` completo, `xnb.py` para los sprites y el arte, `site_data.py`, con sus tests. Intento
   acotado de destrabar drops y tiendas; si no sale, se sigue.
2. Base de la sección: ruta, área, estética (capas, regla de profundidad, casilleros) y Portada, conectada en
   localhost.
3. Objetos: lista y ficha.
4. Árbol de crafteo.
5. Integración (barra, portada del sitio, buscador, sitemap, Netlify), medición de build y de rendimiento, y a
   `main` por PR.

Cada paso se conecta en localhost apenas funciona. Máximo dos agentes a la vez; el extractor no corre en paralelo
con otro proceso pesado.
