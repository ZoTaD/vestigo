# Terraria

Los datos de la sección Terraria de Vestigo. Diseño: `docs/superpowers/specs/2026-10-12-terraria-etapa-1-design.md`.

## Qué hay

- `tools/Dump.cs` + `tools/dump.ps1`: le piden los datos al propio `TerrariaServer.exe` por reflexión (objetos,
  recetas, grupos de receta, botín de enemigos, tiendas, bolsas y cajas, reglas de pesca, cofres y textos en inglés y
  español). Dejan todo en `cache/`.
- `tools/worlds.ps1`: genera 18 mundos con el servidor del juego (semillas fijas) para contar qué trae cada cofre.
- `tools/sources.py`: con eso arma de dónde sale cada objeto además del botín (lo usa `site_data.py`). Cómo se dice
  cada condición ("de noche", "después de Plantera") se escribe ahí, con marcas que resuelven los nombres oficiales.
- `tools/classes_data.py`: arma `data/classes.json` (Clases). La selección de armas, armadura y accesorios por etapa
  está escrita ahí a mano, por nombre en inglés; falla si un nombre no existe.
- `tools/xnb.py`: lector de las texturas `.xnb` del juego, con su descompresor LZX.
- `tools/sprites.py`: saca los sprites de objeto y el arte de la sección a `site/public/terraria`.
- `tools/og.py`: arma con ese arte la vista previa de la sección (`site/public/terraria/og.jpg`).
- `tools/site_data.py`: arma `data/` (lo que lee el sitio) a partir de `cache/`. No lee el juego.
- `tools/world_data.py`: arma `data/bosses.json` y `data/npcs.json` (Jefes y NPC). El orden de los jefes, con qué se
  invocan y qué destraban se escribe ahí a mano, con marcas (`{i:…}`, `{n:…}`, `{b:…}`, `{e:…}`) que se resuelven a
  los nombres oficiales en inglés y español: no escribir nombres propios en español a mano.
- `tools/extras_data.py`: arma `data/fishing.json` y `data/patches/` (Pesca y Parches; lee el `changelog.txt` del juego).
- `cache/`: no se versiona. `data/` y los PNG de `site/public/terraria` sí.

## Cómo regenerar en cada parche del juego

Hace falta Terraria instalado por Steam (no hace falta abrirlo nunca, ni instalar XNA: las DLL salen del instalador
que trae el juego) y Python con Pillow. Desde la raíz del repo, de a un paso por vez:

```
powershell -ExecutionPolicy Bypass -File games/terraria/tools/dump.ps1
powershell -ExecutionPolicy Bypass -File games/terraria/tools/worlds.ps1
powershell -ExecutionPolicy Bypass -File games/terraria/tools/dump.ps1
python games/terraria/tools/site_data.py
python games/terraria/tools/world_data.py
python games/terraria/tools/extras_data.py
python games/terraria/tools/classes_data.py
python games/terraria/tools/og.py
python games/terraria/tools/sprites.py
python -m unittest discover -s games/terraria/tools/tests
```

Después: actualizar `VERSION` en `site_data.py` con lo que imprime `dump.ps1` (`version: v…`).

`dump.ps1` va dos veces: la primera compila el volcador que `worlds.ps1` usa para arrancar el servidor (unos 10 minutos,
de a un mundo; si Windows pregunta por permiso de red, no hace falta darlo), y la segunda lee los cofres de esos mundos.
Si los mundos ya están en `cache/worlds`, alcanza con una.

`dump.ps1` avisa con `!!` cada bloque que falla y sigue. Tres avisos son esperables y no afectan los datos:
`Initialize_TileAndNPCData2`, `inicialización del juego` (antes de leer los mundos) y `armado de recetas` (el juego ordena al final con datos de un mundo que el servidor
suelto no tiene; para entonces las recetas ya están cargadas).

Los slugs no cambian entre corridas: `site_data.py` usa `data/site/slugs.json` como ancla.

## Cómo salen las preferencias de los NPC

En 1.4.5 a quién quiere cada NPC de vecino no está en una tabla: lo decide el código de la tienda. `Dump.cs` (bloque
"vecinos") se lo pregunta a la tienda misma: pone a un NPC solo, después con cada uno de los otros de vecino, y compara
el precio. Igual con el hacinamiento (0, 1, 2… vecinos indiferentes). `world_data.py` falla si un cociente no
corresponde a ningún gusto, así un cambio de reglas en un parche se nota al regenerar.

Dos reglas no salen del juego sino de la wiki, y están en `site/src/terraria/npcs/happiness.ts`: desde la 1.4.5 el pilón
se vende con sólo tener otro NPC cerca (ya no depende del precio; el Tabernero no vende), y en la Mazmorra, la
Corrupción y el Carmesí el precio es siempre el máximo. Cotejado el 2026-10-12 con terraria.wiki.gg.

## Cómo sale "dónde se consigue"

Nada de esto es una tabla en 1.4.5 (salvo la pesca): es código. `Dump.cs` se lo pregunta al juego.

- **Tiendas**: arma la tienda de cada NPC con el mundo recién creado y después prendiendo de a una cada condición (jefe
  vencido, bioma, hora, fase de la luna, evento, otro NPC en el pueblo), de a dos, y partiendo de todo prendido para lo
  que pide tres o más. Lo que aparece o desaparece dice de qué depende. La Zoóloga: se completa el Bestiario de a un
  bicho. El Mercader ambulante: 4.000 visitas por estado.
- **Bolsas de jefe, cajas, cofres con candado, extractor**: se abren 20.000 veces (200.000 el extractor) con un jugador
  de mentira y semilla fija, en mundo con Corrupción y con Carmesí. Las probabilidades son medidas, no exactas.
- **Cofres**: el contenido de los 6.042 cofres de los 18 mundos, por tipo de cofre.
- **Vasijas y árboles**: con cada mundo cargado, se rompe cada vasija 4 veces y se sacude cada árbol 6, sin fiestas ni
  Hardmode. Las vasijas se juntan por su dibujo (el lugar) y los árboles por la clase que les da el juego.
- **Premios del Pescador**: 5.000 entregas con cada cantidad de misiones hechas (de 1 a 51, y algunas más hasta 200),
  antes y después del Hardmode. La probabilidad que se muestra es la mejor; la frase dice desde cuándo y si mejora.
- **Pilones**: qué pilón ofrece la tienda en cada bioma con dos NPC en el pueblo.
- **Pesca**: las reglas del juego tal cual (`FishDropRuleList`).

`sources.py` falla si aparece una condición que no sabe decir o si una tienda deja de vender su objeto de siempre
(`SIGNATURE`): así un parche que cambie las reglas se nota al regenerar.

## Lo que falta sacar

- Los pilones de la superficie y del océano llevan su frase a mano (`PYLON_BY_HAND` en `sources.py`): la prueba de la
  tienda no alcanza a mostrarlos. El universal y el del Éter quedan sin fuente.
- Los árboles de lo Sagrado: los mundos generados son de antes del Hardmode y no tienen.
- El nombre propio de cada estación de crafteo (`Recipe.GetRequiredTileName` devuelve vacío sin el mapa cargado): se
  usa el nombre del objeto que la coloca, y `TILE_NAMES` en `site_data.py` para las que no coloca ninguno.
